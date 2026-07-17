// ==UserScript==
// @name         DeepOverlay X Likes Sync
// @namespace    https://github.com/deepoverlay
// @version      1.0.0
// @description  Scroll X/Twitter Likes, collect new posts until your DeepOverlay sync boundary, export JSON for merge import.
// @match        https://x.com/*/likes*
// @match        https://twitter.com/*/likes*
// @grant        GM_addStyle
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  const FORMAT = 'deepoverlay-likes-v1';
  const SCROLL_PAUSE_MS = 1400;
  const SCAN_INTERVAL_MS = 600;

  /** @type {Map<string, { tweetId: string; text: string; fullText: string; postUrl: string; tcoLinks: string[] }>} */
  const collected = new Map();
  let boundaryId = '';
  let scrolling = false;
  let stopAtBoundary = true;
  let scrollTimer = null;

  GM_addStyle(`
    #do-x-sync-panel {
      position: fixed;
      right: 16px;
      bottom: 16px;
      z-index: 999999;
      width: 300px;
      font: 12px/1.4 system-ui, sans-serif;
      color: #e7e9ea;
      background: rgba(22, 24, 28, 0.96);
      border: 1px solid #38444d;
      border-radius: 10px;
      box-shadow: 0 8px 28px rgba(0,0,0,.45);
      padding: 12px;
    }
    #do-x-sync-panel h3 { margin: 0 0 8px; font-size: 13px; }
    #do-x-sync-panel label { display: block; margin: 8px 0 4px; color: #8b98a5; }
    #do-x-sync-panel input[type=text] {
      width: 100%; box-sizing: border-box; padding: 6px 8px;
      border-radius: 6px; border: 1px solid #38444d; background: #0f1419; color: #e7e9ea;
    }
    #do-x-sync-panel .do-row { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 8px; }
    #do-x-sync-panel button {
      flex: 1; min-width: 88px; padding: 7px 8px; border-radius: 6px; border: 1px solid #38444d;
      background: #1d9bf0; color: #fff; cursor: pointer; font-size: 11px;
    }
    #do-x-sync-panel button.secondary { background: #22303c; color: #e7e9ea; }
    #do-x-sync-panel button.danger { background: #6b1d1d; }
    #do-x-sync-panel .do-stat { margin-top: 8px; color: #8b98a5; font-size: 11px; white-space: pre-wrap; }
    #do-x-sync-panel .do-check { display: flex; align-items: center; gap: 6px; margin-top: 8px; color: #c9d1d9; }
  `);

  function status(msg) {
    const el = document.getElementById('do-x-sync-stat');
    if (el) el.textContent = msg;
  }

  function tweetIdFromHref(href) {
    const m = String(href || '').match(/status\/(\d+)/);
    return m ? m[1] : '';
  }

  function scanVisibleTweets() {
    const articles = document.querySelectorAll(
      '[data-testid="primaryColumn"] article[data-testid="tweet"], main article[data-testid="tweet"], article[data-testid="tweet"]'
    );
    let hitBoundary = false;
    let foundOnPage = 0;
    let added = 0;

    for (const article of articles) {
      const link =
        article.querySelector('a[href*="/status/"][role="link"]') ||
        article.querySelector('a[href*="/status/"]');
      if (!link) continue;

      const tweetId = tweetIdFromHref(link.href);
      if (!tweetId) continue;

      foundOnPage++;

      if (stopAtBoundary && boundaryId && tweetId === boundaryId) {
        hitBoundary = true;
        break;
      }

      if (collected.has(tweetId)) continue;

      const textEl = article.querySelector('[data-testid="tweetText"]');
      const fullText = (textEl?.innerText || '').trim();
      const tcoLinks = [...fullText.matchAll(/https:\/\/t\.co\/\S+/g)].map((m) => m[0]);
      const text = fullText.replace(/https:\/\/t\.co\/\S+/g, '').trim();

      collected.set(tweetId, {
        tweetId,
        text,
        fullText,
        postUrl: `https://x.com/i/status/${tweetId}`,
        tcoLinks,
      });
      added++;
    }

    const lines = [
      `On page: ${foundOnPage} tweets`,
      `+${added} new · ${collected.size} total collected`,
    ];
    if (boundaryId) lines.push(`Boundary: ${boundaryId}`);
    if (hitBoundary) lines.push('Reached boundary.');
    else if (!boundaryId) lines.push('No boundary — load sync file or paste tweet id.');
    status(lines.join('\n'));

    return hitBoundary;
  }

  function setScrollBtnLabel() {
    const btn = document.getElementById('do-x-scroll-btn');
    if (btn) btn.textContent = scrolling ? 'Stop scroll' : 'Auto scroll';
  }

  function stopScroll() {
    scrolling = false;
    if (scrollTimer) {
      clearTimeout(scrollTimer);
      scrollTimer = null;
    }
    setScrollBtnLabel();
  }

  function scrollStep() {
    if (!scrolling) return;
    const hit = scanVisibleTweets();
    if (hit) {
      stopScroll();
      return;
    }
    window.scrollBy(0, Math.max(400, window.innerHeight * 0.85));
    scrollTimer = setTimeout(scrollStep, SCROLL_PAUSE_MS);
  }

  function startScroll() {
    scanVisibleTweets();
    scrolling = true;
    setScrollBtnLabel();
    scrollStep();
  }

  function loadBoundaryFile(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(String(reader.result || ''));
        boundaryId = data?.newest?.tweetId || data?.tweetIds?.[0] || '';
        if (!boundaryId) {
          status('Sync file has no newest tweet id.');
          return;
        }
        document.getElementById('do-x-boundary-input').value = boundaryId;
        status(`Boundary loaded: ${boundaryId}\nClick Scan page or Auto scroll.`);
      } catch (e) {
        status('Failed to parse sync JSON: ' + e.message);
      }
    };
    reader.readAsText(file);
  }

  function exportJson() {
    scanVisibleTweets();
    const entries = [...collected.values()];
    const payload = {
      format: FORMAT,
      exportedAt: Date.now(),
      count: entries.length,
      source: 'tampermonkey-x-likes-sync',
      newest: entries[0] || null,
      tweetIds: entries.map((e) => e.tweetId),
      entries,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `x_likes_sync_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    status(`Exported ${entries.length} new likes.\nImport in DeepOverlay with merge checked.`);
  }

  function buildPanel() {
    if (document.getElementById('do-x-sync-panel')) return;

    const panel = document.createElement('div');
    panel.id = 'do-x-sync-panel';
    panel.innerHTML = `
      <h3>DeepOverlay Likes Sync</h3>
      <label>1. Load extension sync file</label>
      <input type="file" id="do-x-sync-file" accept=".json,application/json" />
      <label>2. Newest like in library (stop here)</label>
      <input type="text" id="do-x-boundary-input" placeholder="tweet id from export" />
      <label class="do-check"><input type="checkbox" id="do-x-stop-boundary" checked /> Stop at boundary</label>
      <div class="do-row">
        <button type="button" id="do-x-scan-btn" class="secondary" title="Collect tweets already loaded on the page (scroll manually, then scan)">Scan page</button>
        <button type="button" id="do-x-scroll-btn">Auto scroll</button>
      </div>
      <div class="do-row">
        <button type="button" id="do-x-export-btn">Export JSON</button>
        <button type="button" id="do-x-clear-btn" class="danger secondary">Clear</button>
      </div>
      <div class="do-stat" id="do-x-sync-stat">Load sync file from DeepOverlay first.</div>
    `;
    document.body.appendChild(panel);

    document.getElementById('do-x-sync-file').addEventListener('change', (e) => {
      const file = e.target.files?.[0];
      if (file) loadBoundaryFile(file);
      e.target.value = '';
    });

    document.getElementById('do-x-boundary-input').addEventListener('change', (e) => {
      boundaryId = e.target.value.trim();
      status(boundaryId ? `Boundary set: ${boundaryId}` : 'Boundary cleared.');
    });

    document.getElementById('do-x-stop-boundary').addEventListener('change', (e) => {
      stopAtBoundary = e.target.checked;
    });

    document.getElementById('do-x-scan-btn').addEventListener('click', scanVisibleTweets);
    document.getElementById('do-x-scroll-btn').addEventListener('click', () => {
      if (scrolling) stopScroll();
      else startScroll();
    });
    document.getElementById('do-x-export-btn').addEventListener('click', exportJson);
    document.getElementById('do-x-clear-btn').addEventListener('click', () => {
      collected.clear();
      status('Cleared collected likes.');
    });

    setInterval(() => {
      if (scrolling) scanVisibleTweets();
    }, SCAN_INTERVAL_MS);
  }

  buildPanel();
})();
