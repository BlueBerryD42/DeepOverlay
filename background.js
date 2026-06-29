import {
  migrateStorageSnapshot,
  SCHEMA_VERSION_KEY,
  CURRENT_SCHEMA_VERSION,
} from './lib/site-adapters.mjs';
import { resolveTweetMedia } from './lib/tweet-syndication.mjs';
import {
  getThumbsMap,
  getThumbsNeedingResolve,
  putThumbsBatch,
} from './lib/likes-db.mjs';

const RESOLVE_CONCURRENCY = 3;
const RESOLVE_DELAY_MS = 200;

/** @type {Array<{ tweetId: string; resolve: (v: unknown) => void }>} */
const resolveQueue = [];
let resolveActive = 0;

function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function pumpResolveQueue() {
  while (resolveActive < RESOLVE_CONCURRENCY && resolveQueue.length > 0) {
    const job = resolveQueue.shift();
    if (!job) break;
    resolveActive += 1;
    (async () => {
      try {
        await delay(RESOLVE_DELAY_MS);
        const result = await resolveTweetMedia(job.tweetId);
        job.resolve(result);
      } catch {
        job.resolve(null);
      } finally {
        resolveActive -= 1;
        pumpResolveQueue();
      }
    })();
  }
}

function enqueueResolve(tweetId) {
  return new Promise((resolve) => {
    resolveQueue.push({ tweetId, resolve });
    pumpResolveQueue();
  });
}

async function resolveTweetMediaBatch(tweetIds) {
  const unique = [...new Set((tweetIds || []).map(String).filter(Boolean))];
  if (unique.length === 0) return {};

  const toFetch = await getThumbsNeedingResolve(unique);
  const updates = {};

  await Promise.all(
    toFetch.map(async (id) => {
      const media = await enqueueResolve(id);
      if (media) {
        updates[id] = { ...media, resolvedAt: Date.now() };
      } else {
        updates[id] = { mediaType: 'none', resolvedAt: Date.now() };
      }
    })
  );

  if (Object.keys(updates).length > 0) {
    await putThumbsBatch(updates);
  }

  return getThumbsMap(unique);
}

function runStorageMigration() {
  chrome.storage.local.get([SCHEMA_VERSION_KEY], (r) => {
    if ((r[SCHEMA_VERSION_KEY] ?? 0) >= CURRENT_SCHEMA_VERSION) return;
    chrome.storage.local.get(null, (all) => {
      const { set, remove } = migrateStorageSnapshot(all || {});
      if (Object.keys(set).length === 0 && (!remove || remove.length === 0)) return;
      chrome.storage.local.set(set, () => {
        if (remove && remove.length) chrome.storage.local.remove(remove);
      });
    });
  });
}

runStorageMigration();

// Shortcuts
chrome.commands.onCommand.addListener((command) => {
  if (command === "toggle-overlay") {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) toggleOverlay(tabs[0].id);
    });
  }
});

// Messages from Popup or Content
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "OPEN_OPTIONS") {
    chrome.runtime.openOptionsPage();
  }
  if (request.action === "TOGGLE_OVERLAY") {
    // Called from Popup usually
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) toggleOverlay(tabs[0].id);
    });
  }
  if (request.action === "CAPTURE_VISIBLE_TAB") {
    chrome.tabs.captureVisibleTab(null, { format: "png" }, (dataUrl) => {
      if (chrome.runtime.lastError) {
        sendResponse({ error: chrome.runtime.lastError.message });
      } else {
        sendResponse({ dataUrl: dataUrl });
      }
    });
    return true; // Keep channel open for async response
  }
  if (request.action === "RESOLVE_TWEET_MEDIA") {
    resolveTweetMediaBatch(request.tweetIds || [])
      .then((cache) => sendResponse({ cache }))
      .catch(() => sendResponse({ cache: {} }));
    return true;
  }
});

chrome.runtime.onInstalled.addListener(() => {
  runStorageMigration();
  chrome.action.setPopup({ popup: "popup.html" });
});

async function toggleOverlay(tabId) {
  try {
    // Script is auto-injected, just toggle.
    await chrome.tabs.sendMessage(tabId, { action: "TOGGLE" });
  } catch (error) {
    // Script might not be ready or page is restricted (e.g. chrome://)
    console.log("DeepOverlay: Toggle failed (page might be restricted).");
  }
}
