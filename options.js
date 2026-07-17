function createBoxEditor(storageKey, imageSelector, boxIndex, boxData, onUpdate, opts = {}) {
  const compact = opts.compact === true;
  const container = document.createElement("div");
  container.className = compact ? "box-editor box-editor-compact" : "box-editor";
  const editor = document.createElement("textarea");
  editor.className = "note-editor";
  editor.value = boxData.note || "";
  editor.placeholder = compact ? "Note…" : `Box ${boxIndex + 1} - Empty note...`;
  editor.dataset.storageKey = storageKey;
  editor.dataset.imageSelector = imageSelector;
  editor.dataset.boxIndex = boxIndex;
  const info = document.createElement("div");
  info.className = "box-info";
  info.textContent = `Box ${boxIndex + 1}`;
  const deleteBtn = document.createElement("button");
  deleteBtn.className = compact ? "box-delete-btn box-delete-btn-compact" : "box-delete-btn";
  deleteBtn.innerHTML = "×";
  deleteBtn.title = "Delete this box";
  deleteBtn.onclick = (e) => {
    e.stopPropagation();
    if (confirm("Delete this box?")) {
      onUpdate(storageKey, imageSelector, boxIndex, null);
    }
  };
  const editorWrapper = document.createElement("div");
  editorWrapper.className = compact ? "box-editor-wrapper box-editor-wrapper-compact" : "box-editor-wrapper";
  editorWrapper.style.position = "relative";
  let timeout;
  editor.addEventListener("input", (e) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => {
      onUpdate(storageKey, imageSelector, boxIndex, e.target.value);
    }, 500);
  });
  editor.onclick = (e) => e.stopPropagation();
  if (compact) {
    info.className = "box-info box-info-compact";
    const row = document.createElement("div");
    row.className = "box-editor-compact-toolbar";
    row.appendChild(info);
    row.appendChild(deleteBtn);
    editorWrapper.appendChild(editor);
    container.appendChild(row);
    container.appendChild(editorWrapper);
  } else {
    editorWrapper.appendChild(editor);
    editorWrapper.appendChild(deleteBtn);
    container.appendChild(info);
    container.appendChild(editorWrapper);
  }
  return container;
}
function formatDateShort(timestamp) {
  if (!timestamp) return "—";
  const date = new Date(timestamp);
  return date.toLocaleDateString(void 0, { year: "numeric", month: "short", day: "numeric" });
}
function truncateText(text, maxLength = 50) {
  if (!text) return "";
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + "...";
}
const SITE_BADGE_CLASS = {
  "e-hentai": "site-badge-ehentai",
  "x": "site-badge-x",
  "pixiv": "site-badge-pixiv",
  "generic": "site-badge-other",
  "other": "site-badge-other"
};
const SITE_BADGE_LABEL = {
  "e-hentai": "E-H",
  "x": "X",
  "pixiv": "Pixiv",
  "generic": "Web",
  "other": "Other"
};
function getSiteBadgeClass(site) {
  return SITE_BADGE_CLASS[site] || SITE_BADGE_CLASS.other;
}
function createSiteBadgeElement(site) {
  const span = document.createElement("span");
  span.className = `site-badge ${getSiteBadgeClass(site)}`;
  span.textContent = SITE_BADGE_LABEL[site] || SITE_BADGE_LABEL.other;
  return span;
}
function getWorkDisplayLabel(workEntry) {
  if (!workEntry || workEntry.workId === void 0) return "N/A";
  const custom = (workEntry.metadata?.displayName || "").trim();
  if (custom) return custom;
  return String(workEntry.workId);
}
function hostChipFromUrl(pageUrl) {
  if (!pageUrl) return "";
  try {
    const h = new URL(pageUrl).hostname.replace(/^www\./, "");
    return h.length > 28 ? `${h.slice(0, 26)}…` : h;
  } catch {
    return "";
  }
}
function formatPageUrl(pageUrl, site) {
  if (!pageUrl) return "Unknown page";
  try {
    const url = new URL(pageUrl);
    if (site === "e-hentai") {
      const match = url.pathname.match(/-(\d+)$/);
      if (match) return `Page ${match[1]}`;
    } else if (site === "x") {
      const match = url.pathname.match(/\/photo\/(\d+)$/);
      if (match) return `Photo ${match[1]}`;
    } else if (site === "pixiv") {
      const hash = url.hash.match(/#(\d+)$/);
      if (hash) return `Image ${hash[1]}`;
    }
    return url.pathname.split("/").pop() || "Page";
  } catch (e) {
    return pageUrl;
  }
}
function formatBytes(bytes) {
  if (bytes < 1024) return bytes + " B";
  else if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  else return (bytes / (1024 * 1024)).toFixed(2) + " MB";
}
function getExpandedState(key) {
  const state = localStorage.getItem(`expanded_${key}`);
  return state === "true";
}
function setExpandedState(key, expanded) {
  localStorage.setItem(`expanded_${key}`, expanded.toString());
}
const INDEX_KEY$1 = "_index";
const SCHEMA_VERSION_KEY$1 = "_schemaVersion";
function isDashboardMetaKey(storageKey) {
  if (!storageKey || typeof storageKey !== "string") return true;
  if (storageKey.startsWith("work:")) return false;
  if (storageKey === INDEX_KEY$1 || storageKey === SCHEMA_VERSION_KEY$1) return true;
  if (storageKey === "theme" || storageKey === "settings") return true;
  if (storageKey.startsWith("overlay_")) return true;
  if (storageKey.startsWith("workimg:")) return true;
  if (storageKey === "likes:thumbCache") return true;
  return false;
}
const INDEX_KEY = "_index";
const SCHEMA_VERSION_KEY = "_schemaVersion";
const CURRENT_SCHEMA_VERSION = 4;
function djb2Hex(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = (h << 5) + h + str.charCodeAt(i);
  return (h >>> 0).toString(16);
}
function makeWorkImgKey(storageKey, imageKey) {
  const parts = String(storageKey || "").split(":");
  const site = parts[1] || "generic";
  const workId = parts.slice(2).join(":") || "";
  return `workimg:${site}:${workId}:${djb2Hex(String(imageKey || ""))}`;
}
const EHentai = {
  name: "e-hentai",
  match: (url) => {
    try {
      const u = new URL(url);
      if (!/e-hentai\.org|exhentai\.org/i.test(u.hostname)) return false;
      return /\/s\/[^/]+\/\d+-\d+/.test(u.pathname);
    } catch {
      return false;
    }
  },
  extract: (url) => {
    const u = new URL(url);
    const m = u.pathname.match(/\/s\/[^/]+\/(\d+)-\d+/);
    if (!m) return null;
    const basePath = u.pathname.split("-")[0];
    return {
      site: "e-hentai",
      workId: m[1],
      normalizedUrl: u.origin + basePath
    };
  },
  storageKey: (url) => {
    const e = EHentai.extract(url);
    return e ? `work:${e.site}:${e.workId}` : null;
  }
};
const Pixiv = {
  name: "pixiv",
  match: (url) => {
    try {
      const u = new URL(url);
      return u.hostname.includes("pixiv.net") && /\/artworks\/\d+/.test(u.pathname);
    } catch {
      return false;
    }
  },
  extract: (url) => {
    const u = new URL(url);
    const m = u.pathname.match(/\/artworks\/(\d+)/);
    if (!m) return null;
    return {
      site: "pixiv",
      workId: m[1],
      normalizedUrl: u.origin + u.pathname.split("#")[0]
    };
  },
  storageKey: (url) => {
    const e = Pixiv.extract(url);
    return e ? `work:${e.site}:${e.workId}` : null;
  }
};
const Twitter = {
  name: "x",
  match: (url) => {
    try {
      const u = new URL(url);
      return (u.hostname.includes("x.com") || u.hostname.includes("twitter.com")) && /\/status\/\d+/.test(u.pathname);
    } catch {
      return false;
    }
  },
  extract: (url) => {
    const u = new URL(url);
    const m = u.pathname.match(/\/status\/(\d+)/);
    if (!m) return null;
    const base = u.pathname.split("/photo/")[0];
    return {
      site: "x",
      workId: m[1],
      normalizedUrl: u.origin + base
    };
  },
  storageKey: (url) => {
    const e = Twitter.extract(url);
    return e ? `work:${e.site}:${e.workId}` : null;
  }
};
const Generic = {
  name: "generic",
  match: () => true,
  extract: (url) => {
    try {
      const u = new URL(url);
      const normalizedUrl = u.origin + u.pathname;
      return {
        site: "generic",
        workId: djb2Hex(normalizedUrl),
        normalizedUrl
      };
    } catch {
      const normalizedUrl = String(url).split("?")[0].split("#")[0];
      return {
        site: "generic",
        workId: djb2Hex(normalizedUrl),
        normalizedUrl
      };
    }
  },
  storageKey: (url) => {
    const e = Generic.extract(url);
    return `work:${e.site}:${e.workId}`;
  }
};
const adapters = [EHentai, Pixiv, Twitter, Generic];
function getAdapter(url) {
  for (let i = 0; i < adapters.length - 1; i++) {
    if (adapters[i].match(url)) return adapters[i];
  }
  return Generic;
}
function extractWorkMeta(url) {
  return getAdapter(url).extract(url);
}
function getStorageKey(url) {
  return getAdapter(url).storageKey(url);
}
const IMAGE_ENTRY_SEP = "";
function makeImageStorageKey(pageUrl, cssSelector) {
  return pageUrl + IMAGE_ENTRY_SEP + cssSelector;
}
function parseImageStorageKey(key) {
  const i = key.indexOf(IMAGE_ENTRY_SEP);
  if (i === -1) {
    return { pageUrl: null, cssSelector: key, legacy: true };
  }
  return {
    pageUrl: key.slice(0, i),
    cssSelector: key.slice(i + IMAGE_ENTRY_SEP.length),
    legacy: false
  };
}
function migrateImageKeysInWorkEntry(workEntry) {
  if (!workEntry?.images || typeof workEntry.images !== "object") return false;
  const images = workEntry.images;
  const keys = Object.keys(images);
  let changed = false;
  const next = { ...images };
  for (const key of keys) {
    if (key.indexOf(IMAGE_ENTRY_SEP) !== -1) continue;
    const data = images[key];
    if (!data || typeof data !== "object" || !data.pageUrl) continue;
    const nk = makeImageStorageKey(data.pageUrl, key);
    if (nk === key) continue;
    if (next[nk] !== void 0) {
      delete next[key];
      changed = true;
      continue;
    }
    next[nk] = data;
    delete next[key];
    changed = true;
  }
  if (changed) workEntry.images = next;
  return changed;
}
function isWorkKey(key) {
  return typeof key === "string" && key.startsWith("work:");
}
function isReservedKey(key) {
  if (typeof key !== "string") return true;
  if (key === INDEX_KEY || key === SCHEMA_VERSION_KEY) return true;
  if (key === "theme" || key === "ocr_quota") return true;
  if (key.startsWith("overlay_")) return true;
  if (key === "settings") return true;
  return false;
}
function legacySiteWorkKeyToNew(key) {
  if (key.startsWith("work:")) return key;
  const parts = key.split(":");
  if (parts.length === 2 && parts[0] !== "http" && parts[0] !== "https" && !key.includes("/")) {
    return `work:${parts[0]}:${parts[1]}`;
  }
  return null;
}
function upsertIndexEntry(index, storageKey, workEntry) {
  const row = {
    key: storageKey,
    site: workEntry.site || "generic",
    workId: workEntry.workId != null ? String(workEntry.workId) : "",
    lastUpdated: workEntry.metadata?.lastUpdated || Date.now(),
    baseUrl: workEntry.baseUrl || ""
  };
  const i = index.findIndex((e) => e.key === storageKey);
  if (i >= 0) index[i] = row;
  else index.push(row);
  index.sort((a, b) => (b.lastUpdated || 0) - (a.lastUpdated || 0));
}
function migrateStorageSnapshot(all) {
  const set = {};
  const remove = [];
  const ver = all[SCHEMA_VERSION_KEY];
  if (ver >= CURRENT_SCHEMA_VERSION) {
    return { set, remove };
  }
  const index = Array.isArray(all[INDEX_KEY]) ? [...all[INDEX_KEY]] : [];
  const processedWorkKeys = /* @__PURE__ */ new Set();
  for (const key of Object.keys(all)) {
    if (key === SCHEMA_VERSION_KEY || key === INDEX_KEY) continue;
    if (key === "ocr_quota") continue;
    if (isReservedKey(key) && !isWorkKey(key)) continue;
    const val = all[key];
    if (Array.isArray(val)) {
      const newKey = getStorageKey(key);
      if (processedWorkKeys.has(newKey)) continue;
      const meta = extractWorkMeta(key);
      const ts = Date.now();
      const workEntry = {
        workId: meta.workId,
        site: meta.site,
        baseUrl: meta.normalizedUrl,
        images: {},
        legacyFlatBoxes: val,
        metadata: {
          firstSeen: ts,
          lastUpdated: ts,
          urlVariants: [key]
        }
      };
      set[newKey] = workEntry;
      upsertIndexEntry(index, newKey, workEntry);
      processedWorkKeys.add(newKey);
      if (key !== newKey) remove.push(key);
      continue;
    }
    if (val && typeof val === "object" && "images" in val) {
      let newKey = key;
      if (!key.startsWith("work:")) {
        const tryK = legacySiteWorkKeyToNew(key);
        if (tryK) newKey = tryK;
        else if (/^https?:\/\//i.test(key)) newKey = getStorageKey(key);
        else continue;
      }
      if (processedWorkKeys.has(newKey)) continue;
      const we = { ...val };
      normalizeWorkEntryFields(we, newKey);
      migrateImageKeysInWorkEntry(we);
      if (we.images && typeof we.images === "object") {
        const nextImages = { ...we.images };
        for (const imageKey of Object.keys(nextImages)) {
          const img = nextImages[imageKey];
          if (!img || typeof img !== "object") continue;
          if (img.refKey) continue;
          if (!Array.isArray(img.boxes)) continue;
          const refKey = makeWorkImgKey(newKey, imageKey);
          set[refKey] = {
            pageUrl: img.pageUrl || null,
            selector: img.selector || parseImageStorageKey(imageKey).cssSelector,
            src: img.src || "",
            boxes: img.boxes || []
          };
          const allNotes = (img.boxes || []).map((b) => (b?.note || "").trim()).filter(Boolean).join("\n");
          const notePreview = allNotes.length > 180 ? `${allNotes.slice(0, 180)}…` : allNotes;
          nextImages[imageKey] = {
            refKey,
            pageUrl: img.pageUrl || null,
            selector: img.selector || parseImageStorageKey(imageKey).cssSelector,
            src: img.src || "",
            boxCount: (img.boxes || []).length,
            notePreview
          };
        }
        we.images = nextImages;
      }
      upsertIndexEntry(index, newKey, we);
      processedWorkKeys.add(newKey);
      set[newKey] = we;
      if (newKey !== key) remove.push(key);
    }
  }
  set[INDEX_KEY] = index;
  set[SCHEMA_VERSION_KEY] = CURRENT_SCHEMA_VERSION;
  return { set, remove };
}
function normalizeWorkEntryFields(workEntry, storageKey) {
  const parts = storageKey.split(":");
  if (parts[0] === "work" && parts.length >= 3) {
    workEntry.site = parts[1];
    workEntry.workId = parts.slice(2).join(":");
  }
  if (!workEntry.metadata) {
    workEntry.metadata = { firstSeen: Date.now(), lastUpdated: Date.now(), urlVariants: [] };
  }
}
function rebuildIndexFromWorks(all) {
  const index = [];
  for (const key of Object.keys(all)) {
    if (!isWorkKey(key)) continue;
    const val = all[key];
    if (val && typeof val === "object" && val.images) {
      upsertIndexEntry(index, key, val);
    }
  }
  return index;
}
const DB_NAME = "deepoverlay";
const DB_VERSION = 2;
const STORES = {
  LIKES_META: "likes_meta",
  LIKES: "likes",
  LIKE_THUMBS: "like_thumbs",
  WORKS: "works",
  WORK_IMAGES: "work_images",
  APP_META: "app_meta"
};
function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB open failed"));
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORES.LIKES_META)) {
        db.createObjectStore(STORES.LIKES_META, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(STORES.LIKES)) {
        const likes = db.createObjectStore(STORES.LIKES, { keyPath: "tweetId" });
        likes.createIndex("sortOrder", "sortOrder", { unique: false });
        likes.createIndex("hidden", "hidden", { unique: false });
      }
      if (!db.objectStoreNames.contains(STORES.LIKE_THUMBS)) {
        db.createObjectStore(STORES.LIKE_THUMBS, { keyPath: "tweetId" });
      }
      if (!db.objectStoreNames.contains(STORES.WORKS)) {
        const works = db.createObjectStore(STORES.WORKS, { keyPath: "storageKey" });
        works.createIndex("site", "site", { unique: false });
        works.createIndex("lastUpdated", "lastUpdated", { unique: false });
      }
      if (!db.objectStoreNames.contains(STORES.WORK_IMAGES)) {
        const imgs = db.createObjectStore(STORES.WORK_IMAGES, { keyPath: "refKey" });
        imgs.createIndex("storageKey", "storageKey", { unique: false });
      }
      if (!db.objectStoreNames.contains(STORES.APP_META)) {
        db.createObjectStore(STORES.APP_META, { keyPath: "id" });
      }
    };
  });
}
function store(db, storeName, mode = "readonly") {
  return db.transaction(storeName, mode).objectStore(storeName);
}
function getOne(os, key) {
  return new Promise((resolve, reject) => {
    const req = os.get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
function getAll(os) {
  return new Promise((resolve, reject) => {
    const req = os.getAll();
    req.onsuccess = () => resolve(req.result ?? []);
    req.onerror = () => reject(req.error);
  });
}
function putOne(os, value) {
  return new Promise((resolve, reject) => {
    const req = os.put(value);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}
function putMany(os, values) {
  if (!values.length) return Promise.resolve();
  return Promise.all(values.map((value) => putOne(os, value)));
}
function deleteMany(os, keys) {
  if (!keys.length) return Promise.resolve();
  return Promise.all(keys.map((key) => deleteOne(os, key)));
}
function deleteOne(os, key) {
  return new Promise((resolve, reject) => {
    const req = os.delete(key);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}
function clearStore(os) {
  return new Promise((resolve, reject) => {
    const req = os.clear();
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}
const OVERLAY_BC = "deepoverlay-overlay-storage";
function broadcastOverlayChange(keys) {
  try {
    const ch = new BroadcastChannel(OVERLAY_BC);
    ch.postMessage({ type: "overlay-updated", keys: keys || [] });
    ch.close();
  } catch {
  }
}
function subscribeOverlayChanges(handler) {
  try {
    const ch = new BroadcastChannel(OVERLAY_BC);
    ch.onmessage = (e) => {
      if (e.data?.type === "overlay-updated") handler(e.data);
    };
    return () => ch.close();
  } catch {
    return () => {
    };
  }
}
const X_WORK_PREFIX = "work:x:";
function tweetIdFromXWorkKey(storageKey) {
  if (!storageKey?.startsWith(X_WORK_PREFIX)) return null;
  const id = storageKey.slice(X_WORK_PREFIX.length);
  return id || null;
}
function countBoxesInWorkEntry(workEntry) {
  if (!workEntry || typeof workEntry !== "object") return 0;
  if (Array.isArray(workEntry.legacyFlatBoxes)) {
    return workEntry.legacyFlatBoxes.length;
  }
  let total = 0;
  for (const img of Object.values(workEntry.images || {})) {
    if (!img || typeof img !== "object") continue;
    total += img.boxCount ?? (Array.isArray(img.boxes) ? img.boxes.length : 0);
  }
  return total;
}
const META_OVERLAY_MIGRATED = "overlay_migrated";
const META_WORKS_INDEX = "works_index";
let dbPromise$1 = null;
let migratePromise = null;
function getOverlayDb() {
  if (!dbPromise$1) dbPromise$1 = openDb();
  return dbPromise$1;
}
function workRow(storageKey, workEntry) {
  const lastUpdated = workEntry?.metadata?.lastUpdated || Date.now();
  return {
    ...workEntry,
    storageKey,
    site: workEntry?.site || "generic",
    workId: workEntry?.workId != null ? String(workEntry.workId) : "",
    lastUpdated
  };
}
function rowToWorkEntry(row) {
  if (!row) return null;
  const { storageKey, site, workId, lastUpdated, ...rest } = row;
  return {
    ...rest,
    site: site ?? rest.site,
    workId: workId ?? rest.workId
  };
}
async function getWorksIndex() {
  const db = await getOverlayDb();
  const row = await getOne(store(db, STORES.APP_META), META_WORKS_INDEX);
  return Array.isArray(row?.rows) ? row.rows : [];
}
async function setWorksIndex(rows) {
  const db = await getOverlayDb();
  await putOne(store(db, STORES.APP_META, "readwrite"), {
    id: META_WORKS_INDEX,
    rows
  });
}
async function ensureOverlayMigrated() {
  if (migratePromise) return migratePromise;
  migratePromise = (async () => {
    const db = await getOverlayDb();
    const flag = await getOne(store(db, STORES.APP_META), META_OVERLAY_MIGRATED);
    if (flag?.done) return;
    const all = await new Promise((resolve) => {
      chrome.storage?.local?.get(null, (items) => resolve(items || {}));
    });
    const { set, remove } = migrateStorageSnapshot(all);
    const merged = { ...all, ...set };
    for (const k of remove) delete merged[k];
    const workRows = [];
    const imgRows = [];
    for (const key of Object.keys(merged)) {
      const val = merged[key];
      if (key.startsWith("work:") && val && typeof val === "object" && !Array.isArray(val)) {
        workRows.push(workRow(key, val));
      }
      if (key.startsWith("workimg:") && val && typeof val === "object") {
        const parts = key.split(":");
        const storageKey = parts.length >= 3 ? `work:${parts[1]}:${parts[2]}` : "";
        imgRows.push({ refKey: key, storageKey, ...val });
      }
    }
    if (workRows.length) {
      await putMany(store(db, STORES.WORKS, "readwrite"), workRows);
    }
    if (imgRows.length) {
      await putMany(store(db, STORES.WORK_IMAGES, "readwrite"), imgRows);
    }
    let index = Array.isArray(merged[INDEX_KEY]) ? merged[INDEX_KEY] : [];
    if (!index.length) {
      const snapshot = {};
      const works = await getAll(store(db, STORES.WORKS));
      for (const w of works) snapshot[w.storageKey] = rowToWorkEntry(w);
      index = rebuildIndexFromWorks(snapshot);
    }
    await setWorksIndex(index);
    await putOne(store(db, STORES.APP_META, "readwrite"), {
      id: META_OVERLAY_MIGRATED,
      done: true,
      migratedAt: Date.now()
    });
    const keysToRemove = Object.keys(all).filter(
      (k) => k.startsWith("work:") || k.startsWith("workimg:") || k === INDEX_KEY || k === SCHEMA_VERSION_KEY
    );
    if (keysToRemove.length && chrome.storage?.local?.remove) {
      await new Promise((resolve) => chrome.storage.local.remove(keysToRemove, resolve));
    }
  })();
  return migratePromise;
}
async function getWorkImagesMap(refKeys) {
  await ensureOverlayMigrated();
  const db = await getOverlayDb();
  const os = store(db, STORES.WORK_IMAGES);
  const map = {};
  await Promise.all(
    refKeys.filter(Boolean).map(async (refKey) => {
      const row = await getOne(os, refKey);
      if (row) {
        const { refKey: _r, storageKey: _s, ...rec } = row;
        map[refKey] = rec;
      }
    })
  );
  return map;
}
async function getWorkImage(refKey) {
  const map = await getWorkImagesMap([refKey]);
  return map[refKey] || null;
}
async function saveWorkWithIndex(storageKey, workEntry) {
  const index = await getWorksIndex();
  upsertIndexEntry(index, storageKey, workEntry);
  await setWorksIndex(index);
  const db = await getOverlayDb();
  await putOne(store(db, STORES.WORKS, "readwrite"), workRow(storageKey, workEntry));
  broadcastOverlayChange([storageKey]);
}
async function saveWorkImage(refKey, record, storageKey = "") {
  await ensureOverlayMigrated();
  const db = await getOverlayDb();
  const sk = storageKey || (refKey.startsWith("workimg:") ? (() => {
    const parts = refKey.split(":");
    return parts.length >= 3 ? `work:${parts[1]}:${parts[2]}` : "";
  })() : "");
  await putOne(store(db, STORES.WORK_IMAGES, "readwrite"), { refKey, storageKey: sk, ...record });
  broadcastOverlayChange([refKey, sk]);
}
async function getWorksSnapshot() {
  await ensureOverlayMigrated();
  const db = await getOverlayDb();
  const works = await getAll(store(db, STORES.WORKS));
  const index = await getWorksIndex();
  const out = { [INDEX_KEY]: index };
  for (const row of works) {
    out[row.storageKey] = rowToWorkEntry(row);
  }
  return out;
}
async function getAnnotatedXTweetIds() {
  await ensureOverlayMigrated();
  const db = await getOverlayDb();
  const works = await getAll(store(db, STORES.WORKS));
  const ids = /* @__PURE__ */ new Set();
  for (const row of works) {
    const storageKey = row.storageKey;
    const tweetId = tweetIdFromXWorkKey(storageKey) || (row.site === "x" ? row.workId : null);
    if (!tweetId) continue;
    const entry = rowToWorkEntry(row);
    if (countBoxesInWorkEntry(entry) > 0) {
      ids.add(String(tweetId));
    }
  }
  return ids;
}
async function deleteWork(storageKey) {
  await ensureOverlayMigrated();
  const db = await getOverlayDb();
  const imgs = await getAll(store(db, STORES.WORK_IMAGES));
  const refKeys = imgs.filter((img) => img.storageKey === storageKey).map((img) => img.refKey);
  if (refKeys.length) {
    await deleteMany(store(db, STORES.WORK_IMAGES, "readwrite"), refKeys);
  }
  await deleteOne(store(db, STORES.WORKS, "readwrite"), storageKey);
  const index = (await getWorksIndex()).filter((e) => e.key !== storageKey);
  await setWorksIndex(index);
  broadcastOverlayChange([storageKey]);
}
async function deleteWorkImages(refKeys) {
  await ensureOverlayMigrated();
  const db = await getOverlayDb();
  const keys = refKeys.filter(Boolean);
  if (keys.length) {
    await deleteMany(store(db, STORES.WORK_IMAGES, "readwrite"), keys);
  }
  broadcastOverlayChange(refKeys);
}
async function clearOverlayData() {
  const db = await getOverlayDb();
  await clearStore(store(db, STORES.WORKS, "readwrite"));
  await clearStore(store(db, STORES.WORK_IMAGES, "readwrite"));
  await deleteOne(store(db, STORES.APP_META, "readwrite"), META_WORKS_INDEX);
  await putOne(store(db, STORES.APP_META, "readwrite"), {
    id: META_OVERLAY_MIGRATED,
    done: true,
    migratedAt: Date.now()
  });
  broadcastOverlayChange(["*"]);
}
async function estimateOverlayBytes() {
  const snap = await getWorksSnapshot();
  return JSON.stringify(snap).length;
}
async function getAllData() {
  await ensureOverlayMigrated();
  const overlay = await getWorksSnapshot();
  const settings = await new Promise((resolve) => {
    chrome.storage.local.get(null, (items) => resolve(items || {}));
  });
  const merged = { ...settings };
  for (const [k, v] of Object.entries(overlay)) {
    merged[k] = v;
  }
  return merged;
}
async function getStorageBytes() {
  const [chromeBytes, overlayBytes] = await Promise.all([
    new Promise((resolve) => {
      chrome.storage.local.getBytesInUse(null, (bytes) => resolve(bytes || 0));
    }),
    estimateOverlayBytes()
  ]);
  return chromeBytes + overlayBytes;
}
async function removeStorageKey(key) {
  if (key.startsWith("work:")) {
    await deleteWork(key);
    return;
  }
  return new Promise((resolve) => {
    chrome.storage.local.remove([key], () => resolve());
  });
}
function removeStorageKeys(keys) {
  const workKeys = keys.filter((k) => k.startsWith("work:"));
  const imgKeys = keys.filter((k) => k.startsWith("workimg:"));
  const other = keys.filter((k) => !k.startsWith("work:") && !k.startsWith("workimg:"));
  const tasks = [];
  if (imgKeys.length) tasks.push(deleteWorkImages(imgKeys));
  if (workKeys.length) tasks.push(Promise.all(workKeys.map((k) => deleteWork(k))));
  if (other.length) {
    tasks.push(
      new Promise((resolve) => {
        chrome.storage.local.remove(other, () => resolve());
      })
    );
  }
  return Promise.all(tasks);
}
function getWorkImgRecord(refKey) {
  if (!refKey) return Promise.resolve(null);
  return getWorkImage(refKey);
}
function saveWorkImgRecord(refKey, record) {
  if (!refKey) return Promise.resolve();
  return saveWorkImage(refKey, record);
}
function saveWorkEntryWithIndex(storageKey, workEntry) {
  return saveWorkWithIndex(storageKey, workEntry);
}
async function clearAllStorage() {
  await clearOverlayData();
  return new Promise((resolve) => {
    chrome.storage.local.clear(() => resolve());
  });
}
function updateBoxNoteInStorage(storageKey, imageSelector, boxIndex, newText, allData2) {
  const workEntry = allData2[storageKey];
  const meta = workEntry?.images?.[imageSelector];
  const refKey = meta?.refKey;
  if (refKey) {
    return getWorkImgRecord(refKey).then((imgRec) => {
      if (!imgRec?.boxes?.[boxIndex]) return;
      imgRec.boxes[boxIndex].note = newText;
      return saveWorkImgRecord(refKey, imgRec).then(() => {
        const notes = (imgRec.boxes || []).map((b) => (b.note || "").trim()).filter(Boolean).join("\n");
        const notePreview = notes.length > 180 ? `${notes.slice(0, 180)}…` : notes;
        meta.boxCount = imgRec.boxes?.length || 0;
        meta.notePreview = notePreview;
        workEntry.metadata.lastUpdated = Date.now();
        return saveWorkEntryWithIndex(storageKey, workEntry).then(() => {
          allData2[storageKey] = workEntry;
        });
      });
    });
  }
  if (workEntry && workEntry.images && workEntry.images[imageSelector]) {
    const imageData = workEntry.images[imageSelector];
    if (imageData.boxes && imageData.boxes[boxIndex]) {
      imageData.boxes[boxIndex].note = newText;
      workEntry.metadata.lastUpdated = Date.now();
      return saveWorkEntryWithIndex(storageKey, workEntry).then(() => {
        allData2[storageKey] = workEntry;
      });
    }
  }
  return Promise.resolve();
}
function createImageCard(storageKey, selector, imageData, workEntry, onImageDelete, onBoxUpdate, opts = {}) {
  const compact = opts.compact === true;
  const imageCard = document.createElement("div");
  imageCard.className = compact ? "image-card-flat image-card-compact" : "image-card-flat";
  imageCard.dataset.imageSelector = selector;
  const boxCount = document.createElement("span");
  boxCount.className = compact ? "image-compact-boxcount" : "image-box-count-flat";
  const n = imageData.boxes?.length || 0;
  boxCount.textContent = `${n} box${n !== 1 ? "es" : ""}`;
  const deleteBtn = document.createElement("button");
  deleteBtn.className = "image-delete-btn-flat danger";
  deleteBtn.textContent = "Delete";
  deleteBtn.onclick = (e) => {
    e.stopPropagation();
    if (confirm("Delete this image and all its boxes?")) {
      onImageDelete(storageKey, selector);
    }
  };
  if (compact) {
    const head = document.createElement("div");
    head.className = "image-compact-head";
    const left = document.createElement("div");
    left.className = "image-compact-left";
    const pageLabel = document.createElement("span");
    pageLabel.className = "image-compact-page";
    pageLabel.textContent = formatPageUrl(imageData.pageUrl, workEntry.site);
    const dot = document.createElement("span");
    dot.className = "image-compact-dot";
    dot.textContent = "·";
    left.appendChild(pageLabel);
    left.appendChild(dot);
    left.appendChild(boxCount);
    head.appendChild(left);
    head.appendChild(deleteBtn);
    imageCard.appendChild(head);
  } else {
    const imageContainer = document.createElement("div");
    imageContainer.className = "image-container-flat";
    const thumbnailContainer = document.createElement("div");
    thumbnailContainer.className = "image-thumbnail-container-flat";
    if (imageData.src) {
      const thumbnail = document.createElement("img");
      thumbnail.className = "image-thumbnail-flat";
      thumbnail.src = imageData.src;
      thumbnail.alt = "Image thumbnail";
      thumbnail.onerror = () => {
        thumbnailContainer.innerHTML = `
                <svg class="thumbnail-placeholder" viewBox="0 0 100 100">
                    <rect width="100" height="100" fill="var(--card-content-bg)"/>
                    <path d="M30 30 L70 30 L70 70 L30 70 Z" stroke="var(--text-secondary)" stroke-width="2" fill="none"/>
                    <path d="M30 30 L50 50 L70 30" stroke="var(--text-secondary)" stroke-width="2" fill="none"/>
                </svg>
            `;
      };
      thumbnail.onclick = () => {
        window.open(imageData.src, "_blank");
      };
      thumbnailContainer.appendChild(thumbnail);
    } else {
      thumbnailContainer.innerHTML = `
            <svg class="thumbnail-placeholder" viewBox="0 0 100 100">
                <rect width="100" height="100" fill="var(--card-content-bg)"/>
                <path d="M30 30 L70 30 L70 70 L30 70 Z" stroke="var(--text-secondary)" stroke-width="2" fill="none"/>
                <path d="M30 30 L50 50 L70 30" stroke="var(--text-secondary)" stroke-width="2" fill="none"/>
            </svg>
        `;
    }
    const imageInfo = document.createElement("div");
    imageInfo.className = "image-info-flat";
    const srcDisplay = imageData.src ? truncateText(imageData.src, 60) : truncateText(selector, 60);
    const srcSpan = document.createElement("div");
    srcSpan.className = "image-src-flat";
    srcSpan.textContent = srcDisplay;
    srcSpan.title = imageData.src || selector;
    const pageUrlDiv = document.createElement("div");
    pageUrlDiv.className = "image-pageurl-flat";
    pageUrlDiv.textContent = formatPageUrl(imageData.pageUrl, workEntry.site);
    if (imageData.pageUrl) {
      pageUrlDiv.style.cursor = "pointer";
      pageUrlDiv.style.textDecoration = "underline";
      pageUrlDiv.style.color = "var(--accent-color)";
      pageUrlDiv.onclick = (e) => {
        e.stopPropagation();
        window.open(imageData.pageUrl, "_blank");
      };
    }
    imageInfo.appendChild(srcSpan);
    imageInfo.appendChild(pageUrlDiv);
    const imageActions = document.createElement("div");
    imageActions.className = "image-actions-flat";
    imageActions.appendChild(boxCount);
    imageActions.appendChild(deleteBtn);
    imageContainer.appendChild(thumbnailContainer);
    imageContainer.appendChild(imageInfo);
    imageContainer.appendChild(imageActions);
    imageCard.appendChild(imageContainer);
  }
  const boxesList = document.createElement("div");
  boxesList.className = "boxes-list-flat";
  if (imageData.boxes && imageData.boxes.length > 0) {
    imageData.boxes.forEach((box, index) => {
      const boxEditor = createBoxEditor(
        storageKey,
        selector,
        index,
        box,
        (sk, sel, idx, text) => {
          if (text === null) {
            const we = window.allDataCache[sk];
            const meta = we?.images?.[sel];
            const refKey = meta?.refKey;
            if (refKey) {
              getWorkImgRecord(refKey).then((imgRec) => {
                if (!imgRec?.boxes) return;
                imgRec.boxes.splice(idx, 1);
                return saveWorkImgRecord(refKey, imgRec).then(() => {
                  const notes = (imgRec.boxes || []).map((b) => (b.note || "").trim()).filter(Boolean).join("\n");
                  const notePreview = notes.length > 180 ? `${notes.slice(0, 180)}…` : notes;
                  meta.boxCount = imgRec.boxes.length;
                  meta.notePreview = notePreview;
                  we.metadata.lastUpdated = Date.now();
                  return saveWorkEntryWithIndex(sk, we).then(() => {
                    window.allDataCache[sk] = we;
                    onBoxUpdate();
                  });
                });
              });
              return;
            }
            if (we && we.images && we.images[sel] && we.images[sel].boxes) {
              we.images[sel].boxes.splice(idx, 1);
              we.metadata.lastUpdated = Date.now();
              saveWorkEntryWithIndex(sk, we).then(() => {
                window.allDataCache[sk] = we;
                onBoxUpdate();
              });
            }
          } else {
            updateBoxNoteInStorage(sk, sel, idx, text, window.allDataCache).then(() => {
              onBoxUpdate();
            });
          }
        },
        { compact }
      );
      boxesList.appendChild(boxEditor);
    });
  } else {
    const emptyMsg = document.createElement("div");
    emptyMsg.className = "empty-boxes-msg";
    emptyMsg.textContent = "No boxes for this image";
    boxesList.appendChild(emptyMsg);
  }
  imageCard.appendChild(boxesList);
  return imageCard;
}
function sortImageKeys(workEntry, imageKeys, site) {
  return [...imageKeys].sort((a, b) => {
    const da = workEntry.images?.[a];
    const db = workEntry.images?.[b];
    const ua = da?.pageUrl || a;
    const ub = db?.pageUrl || b;
    if (site === "e-hentai") {
      const na = parseInt(ua.match(/-(\d+)(?:[#?]|$)/)?.[1] || "0", 10);
      const nb = parseInt(ub.match(/-(\d+)(?:[#?]|$)/)?.[1] || "0", 10);
      if (na !== nb) return na - nb;
    }
    return ua.localeCompare(ub, void 0, { numeric: true, sensitivity: "base" });
  });
}
function createWorkCard(work, onWorkDelete, onUpdate) {
  if (work.legacy) {
    return createLegacyPageRow(work.storageKey, work.notes, onWorkDelete);
  }
  const workEntry = work.workEntry;
  const workId = workEntry.workId != null ? String(workEntry.workId) : "N/A";
  const site = workEntry.site || "other";
  const card = document.createElement("div");
  card.className = "work-card-flat work-card-minimal";
  card.dataset.storageKey = work.storageKey;
  const head = document.createElement("div");
  head.className = "wcm-head";
  head.setAttribute("role", "button");
  head.setAttribute("tabindex", "0");
  head.setAttribute("aria-expanded", "false");
  const row1 = document.createElement("div");
  row1.className = "wcm-row1";
  const chevron = document.createElement("span");
  chevron.className = "wcm-chevron";
  chevron.setAttribute("aria-hidden", "true");
  chevron.textContent = "▸";
  const badge = createSiteBadgeElement(site);
  const titleWrap = document.createElement("div");
  titleWrap.className = "wcm-title-wrap";
  const idEl = document.createElement("span");
  idEl.className = "wcm-id";
  function refreshTitle() {
    const we = window.allDataCache[work.storageKey] || workEntry;
    const label = getWorkDisplayLabel(we);
    idEl.textContent = truncateText(label, 52);
    const idOnly = we.workId != null ? String(we.workId) : "N/A";
    const custom = (we.metadata?.displayName || "").trim();
    idEl.title = custom ? `Work ID: ${idOnly}` : idOnly;
  }
  refreshTitle();
  const renameBtn = document.createElement("button");
  renameBtn.type = "button";
  renameBtn.className = "wcm-rename";
  renameBtn.textContent = "✎";
  renameBtn.title = "Name this work";
  renameBtn.setAttribute("aria-label", "Edit display name");
  renameBtn.onclick = (e) => {
    e.stopPropagation();
    const we0 = window.allDataCache[work.storageKey] || workEntry;
    const input = document.createElement("input");
    input.type = "text";
    input.className = "wcm-name-input";
    input.value = (we0.metadata?.displayName || "").trim();
    input.placeholder = workId;
    titleWrap.replaceChildren(input);
    input.focus();
    input.select();
    let finished = false;
    function finish(commit) {
      if (finished) return;
      finished = true;
      titleWrap.replaceChildren(idEl, renameBtn);
      if (!commit) {
        refreshTitle();
        return;
      }
      const v = input.value.trim();
      const raw = window.allDataCache[work.storageKey];
      if (!raw) {
        refreshTitle();
        return;
      }
      const w = { ...raw, metadata: { ...raw.metadata } };
      if (v) w.metadata.displayName = v;
      else delete w.metadata.displayName;
      w.metadata.lastUpdated = Date.now();
      saveWorkEntryWithIndex(work.storageKey, w).then(() => {
        window.allDataCache[work.storageKey] = w;
        refreshTitle();
        onUpdate();
      });
    }
    input.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter") {
        ev.preventDefault();
        finish(true);
      } else if (ev.key === "Escape") {
        ev.preventDefault();
        finish(false);
      }
    });
    input.addEventListener("blur", () => {
      if (!finished) finish(true);
    });
  };
  titleWrap.appendChild(idEl);
  titleWrap.appendChild(renameBtn);
  const dateEl = document.createElement("span");
  dateEl.className = "wcm-date";
  dateEl.textContent = workEntry.metadata?.lastUpdated ? formatDateShort(workEntry.metadata.lastUpdated) : "—";
  const delBtn = document.createElement("button");
  delBtn.type = "button";
  delBtn.className = "wcm-del";
  delBtn.textContent = "Delete";
  delBtn.onclick = (e) => {
    e.stopPropagation();
    const we = window.allDataCache[work.storageKey] || workEntry;
    const label = getWorkDisplayLabel(we);
    if (confirm(`Delete all overlays for “${label}” (ID ${workId})?`)) {
      onWorkDelete(work.storageKey);
    }
  };
  row1.appendChild(chevron);
  row1.appendChild(badge);
  row1.appendChild(titleWrap);
  row1.appendChild(dateEl);
  row1.appendChild(delBtn);
  const row2 = document.createElement("div");
  row2.className = "wcm-row2";
  const counts = document.createElement("span");
  counts.className = "wcm-counts";
  counts.innerHTML = `<strong>${work.totalBoxes}</strong> box${work.totalBoxes !== 1 ? "es" : ""} · <strong>${work.totalImages}</strong> image${work.totalImages !== 1 ? "s" : ""}`;
  const tags = document.createElement("div");
  tags.className = "wcm-tags";
  const base = workEntry.baseUrl || workEntry.metadata?.urlVariants?.[0] || "";
  const host = hostChipFromUrl(base);
  if (host) {
    const chip = document.createElement("span");
    chip.className = "wcm-chip";
    chip.textContent = host;
    tags.appendChild(chip);
  }
  row2.appendChild(counts);
  row2.appendChild(tags);
  head.appendChild(row1);
  head.appendChild(row2);
  const expanded = document.createElement("div");
  expanded.className = "wcm-expanded";
  expanded.hidden = true;
  const imageKeys = sortImageKeys(workEntry, Object.keys(workEntry.images || {}), site);
  const strip = document.createElement("div");
  strip.className = "wcm-thumb-strip";
  strip.setAttribute("role", "tablist");
  strip.setAttribute("aria-label", "Images in this work");
  const detailSlot = document.createElement("div");
  detailSlot.className = "wcm-detail-slot work-images-list-flat";
  const toolbar = document.createElement("div");
  toolbar.className = "wcm-toolbar";
  const exportBtn = document.createElement("button");
  exportBtn.type = "button";
  exportBtn.className = "do-btn";
  exportBtn.textContent = "Export";
  exportBtn.onclick = (e) => {
    e.stopPropagation();
    const raw = window.allDataCache[work.storageKey];
    const payload = { [work.storageKey]: raw };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `deepoverlay_work_${workId.slice(0, 24)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };
  const goPageBtn = document.createElement("button");
  goPageBtn.type = "button";
  goPageBtn.className = "do-btn wcm-go-page";
  goPageBtn.textContent = "Go to page";
  function updateGoPageButton(imageKey) {
    const fresh = window.allDataCache[work.storageKey];
    const entry = fresh?.images ? fresh : workEntry;
    const data = imageKey && entry?.images?.[imageKey];
    const pageUrl = data?.pageUrl;
    goPageBtn.disabled = !pageUrl;
    goPageBtn.title = pageUrl ? pageUrl : "Select a thumbnail first";
    goPageBtn.onclick = (e) => {
      e.stopPropagation();
      const fr = window.allDataCache[work.storageKey];
      const ent = fr?.images ? fr : workEntry;
      const d = imageKey && ent?.images?.[imageKey];
      const u = d?.pageUrl;
      if (u) window.open(u, "_blank", "noopener,noreferrer");
    };
  }
  toolbar.appendChild(exportBtn);
  toolbar.appendChild(goPageBtn);
  function onImageDelete(storageKey, imageSelector) {
    const w = window.allDataCache[storageKey];
    if (w && w.images) {
      const refKey = w.images?.[imageSelector]?.refKey;
      delete w.images[imageSelector];
      w.metadata.lastUpdated = Date.now();
      const removals = refKey ? [refKey] : [];
      saveWorkEntryWithIndex(storageKey, w).then(() => {
        if (!removals.length) return;
        return removeStorageKeys(removals);
      }).then(() => {
        window.allDataCache[storageKey] = w;
        onUpdate();
      });
    }
  }
  function renderDetail(imageKey) {
    detailSlot.innerHTML = "";
    strip.querySelectorAll(".wcm-thumb-btn").forEach((btn) => {
      const on = btn.dataset.imageKey === imageKey;
      btn.classList.toggle("wcm-thumb-selected", on);
      btn.setAttribute("aria-selected", on ? "true" : "false");
    });
    if (!imageKey || !workEntry.images[imageKey]) {
      const hint = document.createElement("div");
      hint.className = "wcm-detail-hint";
      hint.textContent = "Click a thumbnail to view and edit boxes for that page.";
      detailSlot.appendChild(hint);
      updateGoPageButton(null);
      return;
    }
    const fresh = window.allDataCache[work.storageKey];
    const entry = fresh && fresh.images ? fresh : workEntry;
    const imageData = entry.images[imageKey];
    if (!imageData) {
      renderDetail(null);
      return;
    }
    updateGoPageButton(imageKey);
    if (imageData?.refKey) {
      const hint = document.createElement("div");
      hint.className = "wcm-detail-hint";
      hint.textContent = "Loading…";
      detailSlot.appendChild(hint);
      getWorkImgRecord(imageData.refKey).then((imgRec) => {
        detailSlot.innerHTML = "";
        const merged = { ...imageData, ...imgRec || { boxes: [] } };
        const card2 = createImageCard(
          work.storageKey,
          imageKey,
          merged,
          entry,
          onImageDelete,
          onUpdate,
          { compact: true }
        );
        detailSlot.appendChild(card2);
      });
    } else {
      const card2 = createImageCard(
        work.storageKey,
        imageKey,
        imageData,
        entry,
        onImageDelete,
        onUpdate,
        { compact: true }
      );
      detailSlot.appendChild(card2);
    }
  }
  imageKeys.forEach((imageKey) => {
    const imageData = workEntry.images[imageKey];
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "wcm-thumb-btn";
    btn.dataset.imageKey = imageKey;
    btn.setAttribute("role", "tab");
    btn.setAttribute("aria-selected", "false");
    const label = formatPageUrl(imageData.pageUrl, site) || "Image";
    btn.setAttribute("aria-label", label);
    if (imageData?.src) {
      const img = document.createElement("img");
      img.className = "wcm-thumb";
      img.src = imageData.src;
      img.loading = "lazy";
      img.alt = "";
      btn.appendChild(img);
    } else {
      const ph = document.createElement("div");
      ph.className = "wcm-thumb-placeholder";
      ph.textContent = truncateText(label, 24);
      btn.appendChild(ph);
    }
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      renderDetail(imageKey);
    });
    strip.appendChild(btn);
  });
  if (!strip.childElementCount) {
    strip.style.display = "none";
  }
  renderDetail(null);
  expanded.appendChild(strip);
  expanded.appendChild(toolbar);
  expanded.appendChild(detailSlot);
  let isOpen = getExpandedState(work.storageKey);
  function applyOpen(open) {
    isOpen = open;
    expanded.hidden = !open;
    head.setAttribute("aria-expanded", String(open));
    card.classList.toggle("wcm-open", open);
    chevron.textContent = open ? "▾" : "▸";
    setExpandedState(work.storageKey, open);
  }
  applyOpen(isOpen);
  head.addEventListener("click", () => applyOpen(!isOpen));
  head.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      applyOpen(!isOpen);
    }
  });
  card.appendChild(head);
  card.appendChild(expanded);
  return card;
}
function createLegacyPageRow(url, notes, onDelete) {
  const card = document.createElement("div");
  card.className = "work-card-flat work-card-minimal legacy-row";
  card.dataset.storageKey = url;
  let displayPath = url;
  try {
    const urlObj = new URL(url);
    displayPath = urlObj.pathname + urlObj.search;
    if (displayPath.length > 56) displayPath = `${displayPath.substring(0, 54)}…`;
  } catch {
  }
  const head = document.createElement("div");
  head.className = "wcm-head";
  head.setAttribute("role", "button");
  head.setAttribute("tabindex", "0");
  head.setAttribute("aria-expanded", "false");
  const row1 = document.createElement("div");
  row1.className = "wcm-row1";
  const chevron = document.createElement("span");
  chevron.className = "wcm-chevron";
  chevron.setAttribute("aria-hidden", "true");
  chevron.textContent = "▸";
  const badge = document.createElement("span");
  badge.className = "site-badge site-badge-archive";
  badge.textContent = "Archive";
  const idEl = document.createElement("span");
  idEl.className = "wcm-id";
  idEl.textContent = displayPath;
  idEl.title = url;
  const dateEl = document.createElement("span");
  dateEl.className = "wcm-date";
  dateEl.textContent = "—";
  const delBtn = document.createElement("button");
  delBtn.type = "button";
  delBtn.className = "wcm-del";
  delBtn.textContent = "Delete";
  delBtn.onclick = (e) => {
    e.stopPropagation();
    if (confirm("Delete all notes for this page?")) {
      onDelete(url);
    }
  };
  row1.appendChild(chevron);
  row1.appendChild(badge);
  row1.appendChild(idEl);
  row1.appendChild(dateEl);
  row1.appendChild(delBtn);
  const row2 = document.createElement("div");
  row2.className = "wcm-row2";
  const counts = document.createElement("span");
  counts.className = "wcm-counts";
  counts.innerHTML = `<strong>${notes.length}</strong> note${notes.length !== 1 ? "s" : ""}`;
  const tags = document.createElement("div");
  tags.className = "wcm-tags";
  const host = hostChipFromUrl(url);
  if (host) {
    const chip = document.createElement("span");
    chip.className = "wcm-chip";
    chip.textContent = host;
    tags.appendChild(chip);
  }
  row2.appendChild(counts);
  row2.appendChild(tags);
  head.appendChild(row1);
  head.appendChild(row2);
  const expanded = document.createElement("div");
  expanded.className = "wcm-expanded";
  expanded.hidden = true;
  const notesList = document.createElement("div");
  notesList.className = "work-images-list-flat";
  notes.forEach((note, index) => {
    const ta = document.createElement("textarea");
    ta.className = "note-editor";
    ta.value = note.note || "";
    ta.placeholder = "Empty note…";
    let timeout;
    ta.addEventListener("input", (e) => {
      clearTimeout(timeout);
      timeout = setTimeout(() => {
        const arr = window.allDataCache[url];
        if (arr && arr[index]) {
          arr[index].note = e.target.value;
          const update = {};
          update[url] = arr;
          chrome.storage.local.set(update);
        }
      }, 500);
    });
    ta.onclick = (e) => e.stopPropagation();
    notesList.appendChild(ta);
  });
  expanded.appendChild(notesList);
  let isOpen = getExpandedState(url);
  function applyOpen(open) {
    isOpen = open;
    expanded.hidden = !open;
    head.setAttribute("aria-expanded", String(open));
    card.classList.toggle("wcm-open", open);
    chevron.textContent = open ? "▾" : "▸";
    setExpandedState(url, open);
  }
  applyOpen(isOpen);
  head.addEventListener("click", () => applyOpen(!isOpen));
  head.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      applyOpen(!isOpen);
    }
  });
  card.appendChild(head);
  card.appendChild(expanded);
  return card;
}
function getWorkTimestamp(work) {
  if (work.legacy) return 0;
  const meta = work.workEntry?.metadata;
  return meta?.lastUpdated || meta?.firstSeen || 0;
}
function compareWorks(a, b, order = "desc") {
  const aVal = getWorkTimestamp(a);
  const bVal = getWorkTimestamp(b);
  if (aVal !== bVal) {
    return order === "asc" ? aVal - bVal : bVal - aVal;
  }
  return (a.storageKey || "").localeCompare(b.storageKey || "");
}
function orderWorksForDashboard(allData2, works) {
  const byKey = new Map(works.map((w) => [w.storageKey, w]));
  const ordered = [];
  const seen = /* @__PURE__ */ new Set();
  const index = Array.isArray(allData2._index) ? allData2._index : [];
  for (const row of index) {
    const key = row?.key;
    if (!key || seen.has(key)) continue;
    const work = byKey.get(key);
    if (!work) continue;
    ordered.push(work);
    seen.add(key);
  }
  const remaining = works.filter((w) => !seen.has(w.storageKey));
  remaining.sort((a, b) => compareWorks(a, b, "desc"));
  ordered.push(...remaining);
  return ordered;
}
function filterAndGroupData(allData2, query = "") {
  const lowerQuery = query.toLowerCase();
  const worksByDomain = {};
  Object.keys(allData2).forEach((storageKey) => {
    if (isDashboardMetaKey(storageKey)) return;
    const val = allData2[storageKey];
    if (val && typeof val === "object" && val.images != null && (val.workId !== void 0 || storageKey.startsWith("work:"))) {
      const workEntry = val;
      let hostname = "Unknown";
      try {
        const urlToParse = workEntry.baseUrl || workEntry.metadata?.urlVariants?.[0] || storageKey;
        hostname = new URL(urlToParse).hostname;
      } catch (e) {
        try {
          hostname = new URL(storageKey).hostname;
        } catch (e2) {
          hostname = "Unknown";
        }
      }
      let totalBoxes = 0;
      let totalImages = 0;
      const allNotes = [];
      const allPageUrls = [];
      Object.keys(workEntry.images || {}).forEach((selector) => {
        const imageData = workEntry.images[selector];
        totalImages++;
        totalBoxes += imageData.boxCount ?? (imageData.boxes?.length || 0);
        if (imageData.pageUrl) allPageUrls.push(imageData.pageUrl);
        if (typeof imageData.notePreview === "string" && imageData.notePreview.trim()) {
          allNotes.push(imageData.notePreview);
        } else {
          imageData.boxes?.forEach((box) => {
            if (box.note) allNotes.push(box.note);
          });
        }
      });
      const displayName = (workEntry.metadata?.displayName || "").trim();
      const matchesQuery = lowerQuery === "" || displayName && displayName.toLowerCase().includes(lowerQuery) || workEntry.workId && workEntry.workId.toString().includes(lowerQuery) || workEntry.site && workEntry.site.toLowerCase().includes(lowerQuery) || workEntry.baseUrl && workEntry.baseUrl.toLowerCase().includes(lowerQuery) || allNotes.some((note) => note.toLowerCase().includes(lowerQuery)) || allPageUrls.some((url) => url.toLowerCase().includes(lowerQuery)) || Object.values(workEntry.images || {}).some(
        (img) => img.src && img.src.toLowerCase().includes(lowerQuery)
      );
      if (!matchesQuery) return;
      if (!worksByDomain[hostname]) worksByDomain[hostname] = [];
      worksByDomain[hostname].push({
        storageKey,
        workEntry,
        totalBoxes,
        totalImages
      });
    } else if (Array.isArray(val)) {
      const notes = val;
      let hostname = "Unknown";
      try {
        hostname = new URL(storageKey).hostname;
      } catch (e) {
        hostname = "Unknown";
      }
      const matchesQuery = lowerQuery === "" || storageKey.toLowerCase().includes(lowerQuery) || notes.some((n) => (n.note || "").toLowerCase().includes(lowerQuery));
      if (!matchesQuery) return;
      if (!worksByDomain[hostname]) worksByDomain[hostname] = [];
      worksByDomain[hostname].push({
        storageKey,
        legacy: true,
        notes
      });
    }
  });
  return worksByDomain;
}
function filterWorks(works, filters = {}) {
  const site = filters.site;
  return works.filter((work) => {
    if (work.legacy) {
      if (!site || site === "all") return true;
      return site === "legacy";
    }
    if (site && site !== "all") {
      if (site === "legacy") return false;
      const wSite = work.workEntry.site || "other";
      if (wSite !== site) return false;
    }
    if (filters.dateFrom || filters.dateTo) {
      const lastUpdated = work.workEntry.metadata?.lastUpdated || 0;
      if (filters.dateFrom && lastUpdated < filters.dateFrom) return false;
      if (filters.dateTo && lastUpdated > filters.dateTo) return false;
    }
    if (filters.hasNotes) {
      const hasNotes = Object.values(work.workEntry.images || {}).some(
        (img) => img.boxes?.some((box) => box.note && box.note.trim())
      );
      if (!hasNotes) return false;
    }
    return true;
  });
}
function renderPaginationBarInto(el, opts) {
  const {
    page,
    totalPages,
    totalItems,
    pageSize,
    onPageChange,
    ariaLabel = "Pages"
  } = opts;
  if (!onPageChange) return;
  if (totalPages <= 1) {
    el.innerHTML = "";
    el.hidden = true;
    return;
  }
  el.hidden = false;
  el.innerHTML = "";
  if (!el.classList.contains("do-pagination")) {
    el.classList.add("do-pagination");
  }
  el.setAttribute("role", "navigation");
  el.setAttribute("aria-label", ariaLabel);
  const prev = document.createElement("button");
  prev.type = "button";
  prev.className = "do-btn";
  prev.textContent = "← Prev";
  prev.disabled = page <= 1;
  prev.onclick = () => onPageChange(page - 1);
  const info = document.createElement("span");
  info.className = "do-pagination-info";
  const start = (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, totalItems);
  info.append("Page ");
  const pageInput = document.createElement("input");
  pageInput.type = "number";
  pageInput.className = "do-pagination-page-input";
  pageInput.min = "1";
  pageInput.max = String(totalPages);
  pageInput.value = String(page);
  pageInput.setAttribute("aria-label", "Jump to page");
  const jump = () => {
    let next2 = parseInt(pageInput.value, 10);
    if (!Number.isFinite(next2)) {
      pageInput.value = String(page);
      return;
    }
    next2 = Math.min(Math.max(1, next2), totalPages);
    pageInput.value = String(next2);
    if (next2 !== page) onPageChange(next2);
  };
  pageInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      jump();
      pageInput.blur();
    }
  });
  pageInput.addEventListener("change", jump);
  info.append(pageInput, ` / ${totalPages} · ${start}–${end} of ${totalItems}`);
  const next = document.createElement("button");
  next.type = "button";
  next.className = "do-btn";
  next.textContent = "Next →";
  next.disabled = page >= totalPages;
  next.onclick = () => onPageChange(page + 1);
  el.appendChild(prev);
  el.appendChild(info);
  el.appendChild(next);
}
function renderPaginationBar(el, opts) {
  if (!el) return;
  const targets = Array.isArray(el) ? el : [el];
  for (const target of targets) {
    if (target) renderPaginationBarInto(target, opts);
  }
}
const LIBRARY_PAGE_SIZE = 12;
function renderDashboard(allData2, query = "", listContainer2, onWorkDelete, onUpdate, opts = {}) {
  const pageSize = opts.pageSize ?? LIBRARY_PAGE_SIZE;
  const requestedPage = opts.page ?? 1;
  const paginationEl2 = opts.paginationEl ?? null;
  const onPageChange = opts.onPageChange;
  const siteFilter = opts.siteFilter ?? "all";
  listContainer2.innerHTML = "";
  const worksByDomain = filterAndGroupData(allData2, query);
  const allWorks = [];
  Object.keys(worksByDomain).forEach((domain) => {
    allWorks.push(...worksByDomain[domain]);
  });
  const sortedWorks = orderWorksForDashboard(allData2, allWorks);
  const filteredWorks = filterWorks(sortedWorks, { site: siteFilter });
  const totalWorks = filteredWorks.length;
  if (totalWorks === 0) {
    const noMatch = query || siteFilter && siteFilter !== "all" ? "No works match your search or filter." : "No overlays yet.";
    listContainer2.innerHTML = `<div class="empty-state">${noMatch}</div>`;
    if (paginationEl2) {
      paginationEl2.innerHTML = "";
      paginationEl2.hidden = true;
    }
    return { totalWorks: 0, totalPages: 1, currentPage: 1 };
  }
  const totalPages = Math.max(1, Math.ceil(totalWorks / pageSize));
  const currentPage = Math.min(Math.max(1, requestedPage), totalPages);
  const start = (currentPage - 1) * pageSize;
  const pageWorks = filteredWorks.slice(start, start + pageSize);
  pageWorks.forEach((work) => {
    listContainer2.appendChild(createWorkCard(work, onWorkDelete, onUpdate));
  });
  renderPaginationBar(paginationEl2, {
    page: currentPage,
    totalPages,
    totalItems: totalWorks,
    pageSize,
    onPageChange,
    ariaLabel: "Library pages"
  });
  return { totalWorks, totalPages, currentPage };
}
function createBulkActionsBar(onBulkDelete, onBulkExport, onClearSelection) {
  const bar = document.createElement("div");
  bar.className = "bulk-actions-bar";
  bar.style.display = "none";
  const left = document.createElement("div");
  left.className = "bulk-actions-left";
  const count = document.createElement("span");
  count.className = "bulk-selection-count";
  count.textContent = "0 selected";
  left.appendChild(count);
  const right = document.createElement("div");
  right.className = "bulk-actions-right";
  const exportBtn = document.createElement("button");
  exportBtn.textContent = "Export Selected";
  exportBtn.onclick = () => onBulkExport();
  const deleteBtn = document.createElement("button");
  deleteBtn.className = "danger";
  deleteBtn.textContent = "Delete Selected";
  deleteBtn.onclick = () => {
    if (confirm("Delete all selected items?")) {
      onBulkDelete();
    }
  };
  const clearBtn = document.createElement("button");
  clearBtn.textContent = "Clear Selection";
  clearBtn.onclick = () => onClearSelection();
  right.appendChild(exportBtn);
  right.appendChild(deleteBtn);
  right.appendChild(clearBtn);
  bar.appendChild(left);
  bar.appendChild(right);
  return bar;
}
function updateBulkActionsBar(bar, selectedCount) {
  const countEl = bar.querySelector(".bulk-selection-count");
  if (countEl) {
    countEl.textContent = `${selectedCount} selected`;
  }
  {
    bar.style.display = "none";
  }
}
function parseLikeArchive(text) {
  let jsonText = text.trim();
  const eq = jsonText.indexOf("=");
  if (eq !== -1) jsonText = jsonText.slice(eq + 1).trim();
  if (jsonText.endsWith(";")) jsonText = jsonText.slice(0, -1).trim();
  const raw = JSON.parse(jsonText);
  return raw.map((entry) => {
    const like = entry.like || entry;
    const tweetId = String(like.tweetId || "");
    const fullText = like.fullText || "";
    const tcoLinks = [...fullText.matchAll(/https:\/\/t\.co\/\S+/g)].map((m) => m[0]);
    const text2 = fullText.replace(/https:\/\/t\.co\/\S+/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').trim();
    const postUrl = like.expandedUrl || `https://x.com/i/status/${tweetId}`;
    return { tweetId, text: text2, fullText, tcoLinks, postUrl };
  }).filter((e) => e.tweetId);
}
const LIKES_EXPORT_FORMAT$1 = "deepoverlay-likes-v1";
function normalizeLikeEntries(raw) {
  const list = Array.isArray(raw) ? raw : raw?.entries;
  if (!Array.isArray(list)) return [];
  return list.map((entry) => {
    const like = entry?.like || entry;
    const tweetId = String(like?.tweetId || "");
    if (!tweetId) return null;
    let fullText = like.fullText || like.text || "";
    const tcoLinks = Array.isArray(like.tcoLinks) && like.tcoLinks.length ? like.tcoLinks : [...String(fullText).matchAll(/https:\/\/t\.co\/\S+/g)].map((m) => m[0]);
    const text = like.text || String(fullText).replace(/https:\/\/t\.co\/\S+/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').trim();
    const postUrl = like.postUrl || like.expandedUrl || `https://x.com/i/status/${tweetId}`;
    return { tweetId, text, fullText: fullText || text, tcoLinks, postUrl };
  }).filter(Boolean);
}
function parseLikeImport(text, filename = "") {
  const trimmed = text.trim();
  const isJson = filename.toLowerCase().endsWith(".json") || trimmed.startsWith("{") || trimmed.startsWith("[");
  if (isJson) {
    const data = JSON.parse(trimmed);
    return normalizeLikeEntries(data);
  }
  return parseLikeArchive(text);
}
function isSyncExportFormat(data) {
  return data && typeof data === "object" && data.format === LIKES_EXPORT_FORMAT$1 && Array.isArray(data.entries);
}
const THUMB_CACHE_KEY = "likes:thumbCache";
const META_ID = "main";
const LIKES_ORDER_V = 2;
let dbPromise = null;
let thumbMigrationDone = false;
let likesOrderMigrationDone = false;
function compareTweetIdDesc(a, b) {
  if (a.length !== b.length) return b.length - a.length;
  if (a === b) return 0;
  return a > b ? -1 : 1;
}
function compareLikesNewestFirst(a, b) {
  const order = (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
  if (order !== 0) return order;
  const liked = (b.likedAt ?? 0) - (a.likedAt ?? 0);
  if (liked !== 0) return liked;
  return compareTweetIdDesc(a.tweetId, b.tweetId);
}
function stampNewestFirstOrder(rows, likedAtBase = Date.now()) {
  rows.forEach((row, i) => {
    row.sortOrder = i;
    row.likedAt = likedAtBase - i;
  });
}
async function migrateLikesOrderFields(db) {
  if (likesOrderMigrationDone) return;
  likesOrderMigrationDone = true;
  const meta = await getOne(store(db, STORES.LIKES_META), META_ID);
  if (meta?.likesOrderV >= LIKES_ORDER_V) return;
  const rows = await getAll(store(db, STORES.LIKES));
  if (rows.length) {
    rows.sort(compareLikesNewestFirst);
    stampNewestFirstOrder(rows);
    await putMany(store(db, STORES.LIKES, "readwrite"), rows);
  }
  if (meta) {
    await putOne(store(db, STORES.LIKES_META, "readwrite"), { ...meta, likesOrderV: LIKES_ORDER_V });
  }
}
function getDb() {
  if (!dbPromise) {
    dbPromise = openDb().then(async (db) => {
      await migrateThumbCacheFromChromeStorage(db);
      await migrateLikesOrderFields(db);
      return db;
    });
  }
  return dbPromise;
}
async function migrateThumbCacheFromChromeStorage(db) {
  if (thumbMigrationDone) return;
  thumbMigrationDone = true;
  const legacy = await new Promise((resolve) => {
    chrome.storage?.local?.get([THUMB_CACHE_KEY], (r) => resolve(r?.[THUMB_CACHE_KEY] || null));
  });
  if (!legacy || typeof legacy !== "object" || !Object.keys(legacy).length) return;
  const existing = await getAll(store(db, STORES.LIKE_THUMBS));
  if (existing.length > 0) {
    await chrome.storage?.local?.remove([THUMB_CACHE_KEY]);
    return;
  }
  await putMany(
    store(db, STORES.LIKE_THUMBS, "readwrite"),
    Object.entries(legacy).map(([tweetId, entry]) => ({ tweetId, ...entry }))
  );
  await chrome.storage?.local?.remove([THUMB_CACHE_KEY]);
}
async function getLikesMeta() {
  const db = await getDb();
  const meta = await getOne(store(db, STORES.LIKES_META), META_ID);
  return meta || null;
}
async function hasImportedLikes() {
  const meta = await getLikesMeta();
  if (meta?.count > 0) return true;
  const db = await getDb();
  const all = await getAll(store(db, STORES.LIKES));
  return all.length > 0;
}
async function importLikes(entries, opts = {}) {
  const db = await getDb();
  const now = Date.now();
  const sourceName = opts.sourceName || "like.js";
  const replace = opts.replace !== false;
  const prepend = !replace && opts.prepend === true;
  if (replace) {
    await clearStore(store(db, STORES.LIKES, "readwrite"));
  }
  const existingById = /* @__PURE__ */ new Map();
  if (!replace) {
    for (const row of await getAll(store(db, STORES.LIKES))) {
      existingById.set(row.tweetId, row);
    }
  }
  const seen = /* @__PURE__ */ new Set();
  const likeRows = [];
  let skipped = 0;
  let fileOrder = 0;
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    if (!e?.tweetId || seen.has(e.tweetId)) continue;
    seen.add(e.tweetId);
    if (!replace && existingById.has(e.tweetId)) {
      skipped++;
      continue;
    }
    likeRows.push({
      tweetId: e.tweetId,
      text: e.text || "",
      fullText: e.fullText || "",
      tcoLinks: e.tcoLinks || [],
      postUrl: e.postUrl || `https://x.com/i/web/status/${e.tweetId}`,
      sortOrder: fileOrder,
      likedAt: 0,
      hidden: false,
      importedAt: now
    });
    fileOrder++;
  }
  const imported = likeRows.length;
  if (imported > 0) {
    const toWrite = [];
    if (prepend) {
      stampNewestFirstOrder(likeRows, now);
      for (const row of existingById.values()) {
        toWrite.push({
          ...row,
          sortOrder: (row.sortOrder ?? 0) + imported,
          likedAt: (row.likedAt ?? 0) - imported
        });
      }
    } else if (!replace) {
      const startOrder = [...existingById.values()].reduce((max, row) => Math.max(max, row.sortOrder ?? 0), -1) + 1;
      const likedBase = Math.min(
        ...[...existingById.values()].map((row) => row.likedAt ?? 0),
        now
      );
      likeRows.forEach((row, i) => {
        row.sortOrder = startOrder + i;
        row.likedAt = likedBase - (imported - i);
      });
    } else {
      stampNewestFirstOrder(likeRows, now);
    }
    toWrite.push(...likeRows);
    await putMany(store(db, STORES.LIKES, "readwrite"), toWrite);
  }
  const total = replace ? imported : (await getAll(store(db, STORES.LIKES))).length;
  await putOne(store(db, STORES.LIKES_META, "readwrite"), {
    id: META_ID,
    importedAt: now,
    count: total,
    sourceName
  });
  return { imported, skipped, total };
}
const LIKES_EXPORT_FORMAT = "deepoverlay-likes-v1";
async function exportLikesLibrary() {
  const likes = await getAllLikes({ includeHidden: true });
  const entries = likes.map((l) => ({
    tweetId: l.tweetId,
    text: l.text || "",
    fullText: l.fullText || l.text || "",
    tcoLinks: l.tcoLinks || [],
    postUrl: l.postUrl || `https://x.com/i/status/${l.tweetId}`
  }));
  const newest = entries[0] ? {
    tweetId: entries[0].tweetId,
    text: entries[0].text,
    postUrl: entries[0].postUrl
  } : null;
  return {
    format: LIKES_EXPORT_FORMAT,
    exportedAt: Date.now(),
    count: entries.length,
    newest,
    tweetIds: entries.map((e) => e.tweetId),
    entries
  };
}
async function getAllLikes(opts = {}) {
  const db = await getDb();
  const rows = await getAll(store(db, STORES.LIKES));
  const visible = opts.includeHidden ? rows : rows.filter((r) => !r.hidden);
  visible.sort(compareLikesNewestFirst);
  return visible;
}
async function deleteLike(tweetId) {
  await deleteLikes([tweetId]);
}
async function deleteLikes(tweetIds) {
  const ids = [...new Set(tweetIds.filter(Boolean))];
  if (!ids.length) return;
  const db = await getDb();
  await deleteMany(store(db, STORES.LIKES, "readwrite"), ids);
  await deleteMany(store(db, STORES.LIKE_THUMBS, "readwrite"), ids);
  const remaining = await getAll(store(db, STORES.LIKES));
  const meta = await getOne(store(db, STORES.LIKES_META), META_ID) || { id: META_ID };
  await putOne(store(db, STORES.LIKES_META, "readwrite"), { ...meta, count: remaining.length });
}
async function getAllThumbsMap() {
  const db = await getDb();
  const rows = await getAll(store(db, STORES.LIKE_THUMBS));
  const map = {};
  for (const row of rows) {
    if (row?.tweetId) map[row.tweetId] = row;
  }
  return map;
}
function requestThumbResolve(tweetIds) {
  if (!tweetIds?.length) return Promise.resolve({});
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ action: "RESOLVE_TWEET_MEDIA", tweetIds }, (response) => {
      if (chrome.runtime.lastError) {
        console.warn("Thumb resolve failed:", chrome.runtime.lastError.message);
        resolve({});
        return;
      }
      resolve(response?.cache || {});
    });
  });
}
function createLikeCard(like, thumb, opts = {}) {
  const card = document.createElement("article");
  card.className = "do-like-card";
  if (opts.hasOverlay) card.classList.add("do-like-card--has-overlay");
  if (opts.selectedTweetIds?.has(like.tweetId)) card.classList.add("do-like-card--selected");
  card.dataset.tweetId = like.tweetId;
  if (opts.hasOverlay) card.dataset.hasOverlay = "true";
  const mediaUrl = thumb?.mediaUrl;
  const mediaUrls = thumb?.mediaUrls?.length ? thumb.mediaUrls : mediaUrl ? [mediaUrl] : [];
  const mediaType = thumb?.mediaType;
  const hasMedia = mediaType && mediaType !== "none" && mediaUrl;
  const thumbEl = document.createElement("div");
  thumbEl.className = "do-like-thumb";
  if (hasMedia) {
    const img = document.createElement("img");
    img.className = "do-like-img";
    img.src = mediaUrl;
    img.alt = like.text || "Liked post media";
    img.loading = "lazy";
    img.onerror = () => {
      thumbEl.classList.add("do-like-thumb--placeholder");
      img.remove();
    };
    img.addEventListener("click", (e) => {
      e.preventDefault();
      if (opts.onOpenLightbox && mediaUrls.length) {
        opts.onOpenLightbox(mediaUrls, 0);
      } else {
        window.open(like.postUrl, "_blank", "noopener");
      }
    });
    thumbEl.appendChild(img);
  } else {
    thumbEl.classList.add("do-like-thumb--placeholder");
    thumbEl.innerHTML = `<span class="do-like-placeholder-icon" aria-hidden="true">♡</span>`;
    thumbEl.addEventListener("click", () => {
      window.open(like.postUrl, "_blank", "noopener");
    });
  }
  if (hasMedia && (mediaType === "video" || mediaType === "gif")) {
    const badge = document.createElement("span");
    badge.className = "do-like-badge do-like-badge--media";
    badge.textContent = mediaType === "gif" ? "GIF" : "▶";
    badge.setAttribute("aria-label", mediaType === "gif" ? "Animated GIF" : "Video");
    thumbEl.appendChild(badge);
  }
  if (hasMedia && mediaUrls.length > 1) {
    const count = document.createElement("span");
    count.className = "do-like-badge do-like-badge--count";
    count.textContent = `+${mediaUrls.length - 1}`;
    count.setAttribute("aria-label", `${mediaUrls.length} images`);
    thumbEl.appendChild(count);
  }
  if (opts.hasOverlay) {
    const overlayBadge = document.createElement("span");
    overlayBadge.className = "do-like-badge do-like-badge--overlay";
    overlayBadge.textContent = "⊞";
    overlayBadge.title = "Has DeepOverlay annotation";
    overlayBadge.setAttribute("aria-label", "Has overlay annotation");
    thumbEl.appendChild(overlayBadge);
  }
  if (opts.onSelectToggle) {
    const selectWrap = document.createElement("label");
    selectWrap.className = "do-like-select";
    selectWrap.title = "Select for bulk delete";
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.className = "do-like-select-cb";
    cb.checked = opts.selectedTweetIds?.has(like.tweetId) ?? false;
    cb.setAttribute("aria-label", "Select like");
    cb.addEventListener("click", (e) => e.stopPropagation());
    cb.addEventListener("change", (e) => {
      e.stopPropagation();
      opts.onSelectToggle(like.tweetId, cb.checked);
      card.classList.toggle("do-like-card--selected", cb.checked);
    });
    selectWrap.appendChild(cb);
    thumbEl.appendChild(selectWrap);
  }
  const caption = document.createElement("p");
  caption.className = "do-like-caption";
  caption.textContent = like.text || "(no text)";
  caption.title = like.text;
  const link = document.createElement("a");
  link.className = "do-like-link";
  link.href = like.postUrl;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.textContent = "Open on X";
  link.addEventListener("click", (e) => e.stopPropagation());
  const actions = document.createElement("div");
  actions.className = "do-like-actions";
  if (opts.onDelete) {
    const delBtn = document.createElement("button");
    delBtn.type = "button";
    delBtn.className = "do-btn do-like-action-btn do-like-action-btn--danger";
    delBtn.textContent = "Delete";
    delBtn.title = "Remove from library permanently";
    delBtn.onclick = (e) => {
      e.stopPropagation();
      if (confirm("Remove this like from your library?")) opts.onDelete(like.tweetId);
    };
    actions.appendChild(delBtn);
  }
  card.appendChild(thumbEl);
  card.appendChild(caption);
  card.appendChild(link);
  if (actions.childElementCount) card.appendChild(actions);
  return card;
}
function updateLikeCardThumb(card, like, thumb, opts = {}) {
  const next = createLikeCard(like, thumb, opts);
  card.replaceWith(next);
  return next;
}
const LIKES_PAGE_SIZE = 48;
function getLikesColumnCount(width = typeof window !== "undefined" ? window.innerWidth : 1400) {
  if (width <= 600) return 1;
  if (width <= 1100) return 2;
  if (width <= 1400) return 3;
  return 4;
}
function orderForColumnLayout(items, colCount) {
  const n = items.length;
  if (n <= 1 || colCount <= 1) return items;
  const numRows = Math.ceil(n / colCount);
  const columns = Array.from({ length: colCount }, () => []);
  for (let col = 0; col < colCount; col++) {
    for (let row = 0; row < numRows; row++) {
      const idx = row * colCount + col;
      if (idx < n) columns[col].push(items[idx]);
    }
  }
  return columns.flat();
}
function photoCount(thumb) {
  if (thumb.mediaUrls?.length) return thumb.mediaUrls.length;
  if (thumb.mediaUrl && thumb.mediaType === "photo") return 1;
  return 0;
}
function isVideoLike(thumb) {
  return thumb.mediaType === "video" || thumb.mediaType === "gif";
}
function isPhotoLike(thumb) {
  return thumb.mediaType === "photo" && !!thumb.mediaUrl;
}
function matchesLikesFilter(filter, thumb, tweetId, overlayTweetIds2) {
  if (filter === "with-overlay") return overlayTweetIds2.has(tweetId);
  if (filter === "no-overlay") return !overlayTweetIds2.has(tweetId);
  if (filter === "all") return true;
  if (!thumb?.resolvedAt) return false;
  if (filter === "video") return isVideoLike(thumb);
  if (filter === "image") return isPhotoLike(thumb);
  if (filter === "single") return isPhotoLike(thumb) && photoCount(thumb) === 1;
  if (filter === "multiple") return isPhotoLike(thumb) && photoCount(thumb) > 1;
  return true;
}
function filterLikes(likes, query, filter, thumbCache2, overlayTweetIds2 = /* @__PURE__ */ new Set()) {
  const q = query.trim().toLowerCase();
  return likes.filter((like) => {
    if (filter !== "all") {
      const thumb = thumbCache2[like.tweetId];
      if (!matchesLikesFilter(filter, thumb || {}, like.tweetId, overlayTweetIds2)) return false;
    }
    if (!q) return true;
    return like.text.toLowerCase().includes(q) || like.tweetId.includes(q) || like.postUrl.toLowerCase().includes(q);
  });
}
function ensureLightbox(container) {
  let lb = container.querySelector(".do-likes-lightbox");
  if (lb) return lb;
  lb = document.createElement("div");
  lb.className = "do-likes-lightbox";
  lb.hidden = true;
  lb.innerHTML = `
    <button type="button" class="do-likes-lightbox-close" aria-label="Close">✕</button>
    <button type="button" class="do-likes-lightbox-prev" aria-label="Previous">‹</button>
    <img class="do-likes-lightbox-img" alt="" />
    <button type="button" class="do-likes-lightbox-next" aria-label="Next">›</button>
    <span class="do-likes-lightbox-counter"></span>
  `;
  container.appendChild(lb);
  const img = lb.querySelector(".do-likes-lightbox-img");
  const counter = lb.querySelector(".do-likes-lightbox-counter");
  const state = { urls: [], index: 0 };
  function show() {
    if (!state.urls.length) return;
    img.src = state.urls[state.index];
    counter.textContent = `${state.index + 1} / ${state.urls.length}`;
    lb.hidden = false;
    document.body.classList.add("do-likes-lightbox-open");
  }
  function hide() {
    lb.hidden = true;
    img.src = "";
    document.body.classList.remove("do-likes-lightbox-open");
  }
  lb.querySelector(".do-likes-lightbox-close").onclick = hide;
  lb.querySelector(".do-likes-lightbox-prev").onclick = () => {
    if (state.urls.length < 2) return;
    state.index = (state.index - 1 + state.urls.length) % state.urls.length;
    show();
  };
  lb.querySelector(".do-likes-lightbox-next").onclick = () => {
    if (state.urls.length < 2) return;
    state.index = (state.index + 1) % state.urls.length;
    show();
  };
  lb.addEventListener("click", (e) => {
    if (e.target === lb) hide();
  });
  document.addEventListener("keydown", (e) => {
    if (lb.hidden) return;
    if (e.key === "Escape") {
      e.preventDefault();
      hide();
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      e.stopPropagation();
      lb.querySelector(".do-likes-lightbox-prev").click();
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      e.stopPropagation();
      lb.querySelector(".do-likes-lightbox-next").click();
    }
  });
  lb._open = (urls, index = 0) => {
    state.urls = urls;
    state.index = index;
    show();
  };
  return lb;
}
function renderLikes(opts) {
  const {
    likes,
    query = "",
    filter = "all",
    thumbCache: thumbCache2 = {},
    overlayTweetIds: overlayTweetIds2 = /* @__PURE__ */ new Set(),
    page = 1,
    gridEl,
    paginationEl: paginationEl2,
    lightboxEl,
    onPageChange,
    onDelete,
    selectedTweetIds,
    onSelectToggle
  } = opts;
  const filtered = filterLikes(likes, query, filter, thumbCache2, overlayTweetIds2);
  const totalItems = filtered.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / LIKES_PAGE_SIZE));
  const currentPage = Math.min(Math.max(1, page), totalPages);
  const start = (currentPage - 1) * LIKES_PAGE_SIZE;
  const pageItems = filtered.slice(start, start + LIKES_PAGE_SIZE);
  if (!gridEl) {
    return { filtered, totalPages, currentPage, pageItems };
  }
  gridEl.innerHTML = "";
  gridEl.className = "do-likes-grid";
  if (totalItems === 0) {
    gridEl.innerHTML = `<div class="empty-state">${query || filter !== "all" ? "No likes match your filters." : "No likes loaded."}</div>`;
  } else {
    const lightbox = ensureLightbox(lightboxEl || gridEl.parentElement);
    const openLightbox = (urls, index) => lightbox._open(urls, index);
    const colCount = getLikesColumnCount();
    const displayItems = orderForColumnLayout(pageItems, colCount);
    for (const like of displayItems) {
      const thumb = thumbCache2[like.tweetId];
      const hasOverlay = overlayTweetIds2.has(like.tweetId);
      gridEl.appendChild(
        createLikeCard(like, thumb, {
          onOpenLightbox: openLightbox,
          onDelete,
          hasOverlay,
          selectedTweetIds,
          onSelectToggle
        })
      );
    }
  }
  renderPaginationBar(paginationEl2, {
    page: currentPage,
    totalPages,
    totalItems,
    pageSize: LIKES_PAGE_SIZE,
    onPageChange,
    ariaLabel: "Likes pages"
  });
  return { filtered, totalPages, currentPage, pageItems };
}
function refreshLikeCardThumbs(gridEl, pageItems, thumbCache2, lightboxEl, cardOpts = {}) {
  if (!gridEl) return;
  const lightbox = ensureLightbox(lightboxEl || gridEl.parentElement);
  const openLightbox = (urls, index) => lightbox._open(urls, index);
  ({ ...cardOpts });
  for (const like of pageItems) {
    const card = gridEl.querySelector(`[data-tweet-id="${like.tweetId}"]`);
    if (!card) continue;
    const thumb = thumbCache2[like.tweetId];
    if (!thumb?.resolvedAt && !cardOpts.overlayTweetIds?.has(like.tweetId)) continue;
    const opts = {
      onOpenLightbox: openLightbox,
      onDelete: cardOpts.onDelete,
      hasOverlay: cardOpts.overlayTweetIds?.has(like.tweetId) ?? !!cardOpts.hasOverlay,
      selectedTweetIds: cardOpts.selectedTweetIds,
      onSelectToggle: cardOpts.onSelectToggle
    };
    updateLikeCardThumb(card, like, thumb, opts);
  }
}
let binding = null;
function isTypingTarget(target) {
  if (!target || !(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  return target.isContentEditable;
}
function isPanelActive(panelId) {
  const panel = document.getElementById(`panel-${panelId}`);
  return panel?.classList.contains("active") ?? false;
}
function isLikesLightboxOpen() {
  return document.body.classList.contains("do-likes-lightbox-open");
}
function syncPaginationKeyboard(next) {
  binding = next;
}
let initialized = false;
function initPaginationKeyboard() {
  if (initialized) return;
  initialized = true;
  document.addEventListener("keydown", (e) => {
    if (!binding || !isPanelActive(binding.panelId)) return;
    if (isLikesLightboxOpen()) return;
    if (isTypingTarget(e.target)) return;
    if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    const { page, totalPages, onPageChange } = binding;
    if (e.key === "ArrowLeft" && page > 1) {
      e.preventDefault();
      onPageChange(page - 1);
    } else if (e.key === "ArrowRight" && page < totalPages) {
      e.preventDefault();
      onPageChange(page + 1);
    }
  });
}
const RESOLVE_BATCH = 24;
let likesCache = null;
let thumbCache = {};
let overlayTweetIds = /* @__PURE__ */ new Set();
let likesPage = 1;
let resolveInFlight = false;
let panelLoaded = false;
function initLikesPanel() {
  const gridEl = document.getElementById("likes-grid");
  const paginationEls = [
    document.getElementById("likes-pagination-top"),
    document.getElementById("likes-pagination-bottom")
  ];
  const lightboxEl = document.getElementById("likes-lightbox");
  const searchInput2 = document.getElementById("likes-search-input");
  const filterEl = document.getElementById("likes-filter");
  const progressEl = document.getElementById("likes-progress");
  const countEl = document.getElementById("likes-nav-count");
  const statusEl = document.getElementById("likes-status");
  document.getElementById("likes-import-bar");
  const importBtn = document.getElementById("likes-import-btn");
  const bundledBtn = document.getElementById("likes-import-bundled-btn");
  const reimportBtn = document.getElementById("likes-reimport-btn");
  const exportSyncBtn = document.getElementById("likes-export-sync-btn");
  const syncHintEl = document.getElementById("likes-sync-hint");
  const fileInput = document.getElementById("likes-file-input");
  const mergeWrap = document.getElementById("likes-merge-wrap");
  const mergeEl = document.getElementById("likes-reimport-merge");
  if (!gridEl) return () => {
  };
  let likesFilter = filterEl?.value || "all";
  let selectedLikes = /* @__PURE__ */ new Set();
  let bulkBar = null;
  function ensureBulkBar() {
    if (bulkBar) return bulkBar;
    const paginationTop = document.getElementById("likes-pagination-top");
    bulkBar = document.createElement("div");
    bulkBar.id = "likes-bulk-bar";
    bulkBar.className = "do-likes-bulk-bar bulk-actions-bar";
    bulkBar.hidden = true;
    bulkBar.innerHTML = `
      <div class="bulk-actions-left">
        <span class="bulk-selection-count">0 selected</span>
      </div>
      <div class="bulk-actions-right">
        <button type="button" class="do-btn" data-action="select-page">Select page</button>
        <button type="button" class="do-btn danger" data-action="delete">Delete selected</button>
        <button type="button" class="do-btn" data-action="clear">Clear</button>
      </div>
    `;
    bulkBar.querySelector('[data-action="select-page"]')?.addEventListener("click", selectAllOnPage);
    bulkBar.querySelector('[data-action="delete"]')?.addEventListener("click", handleBulkDelete2);
    bulkBar.querySelector('[data-action="clear"]')?.addEventListener("click", clearSelection);
    const anchor = paginationTop || gridEl;
    anchor.parentNode?.insertBefore(bulkBar, anchor);
    return bulkBar;
  }
  function updateBulkBar() {
    const bar = ensureBulkBar();
    const countEl2 = bar.querySelector(".bulk-selection-count");
    if (countEl2) countEl2.textContent = `${selectedLikes.size} selected`;
    bar.hidden = selectedLikes.size === 0;
  }
  function clearSelection() {
    selectedLikes.clear();
    updateBulkBar();
    renderCurrent();
  }
  function selectAllOnPage() {
    if (!likesCache) return;
    const { pageItems } = renderLikes({
      likes: likesCache,
      query: searchInput2?.value || "",
      filter: likesFilter,
      thumbCache,
      overlayTweetIds,
      page: likesPage,
      gridEl: null,
      paginationEl: null,
      lightboxEl: null,
      onPageChange: () => {
      }
    });
    for (const like of pageItems) selectedLikes.add(like.tweetId);
    updateBulkBar();
    renderCurrent();
  }
  function handleSelectToggle(tweetId, selected) {
    if (selected) selectedLikes.add(tweetId);
    else selectedLikes.delete(tweetId);
    updateBulkBar();
  }
  const cardOpts = () => ({
    onDelete: handleDelete,
    overlayTweetIds,
    selectedTweetIds: selectedLikes,
    onSelectToggle: handleSelectToggle
  });
  function updateNavCount(n) {
    if (countEl) countEl.textContent = String(n);
  }
  function updateImportUi(imported) {
    if (importBtn) importBtn.hidden = imported;
    if (bundledBtn) bundledBtn.hidden = imported;
    if (reimportBtn) reimportBtn.hidden = !imported;
    if (exportSyncBtn) exportSyncBtn.hidden = !imported;
    if (mergeWrap) mergeWrap.hidden = !imported;
    if (syncHintEl) syncHintEl.hidden = !imported;
  }
  function countResolved(cache) {
    return Object.values(cache).filter((e) => e?.resolvedAt).length;
  }
  function countWithMedia(cache) {
    return Object.values(cache).filter((e) => e?.mediaUrl && e.mediaType !== "none").length;
  }
  function updateProgress() {
    if (!progressEl || !likesCache) return;
    const resolved = countResolved(thumbCache);
    const withMedia = countWithMedia(thumbCache);
    const withOverlay = overlayTweetIds.size;
    progressEl.textContent = `Thumbnails: ${resolved} / ${likesCache.length} resolved · ${withMedia} with media · ${withOverlay} with overlay`;
  }
  async function reloadOverlayLinks() {
    overlayTweetIds = await getAnnotatedXTweetIds();
  }
  async function reloadFromDb() {
    likesCache = await getAllLikes();
    thumbCache = await getAllThumbsMap();
    await reloadOverlayLinks();
    updateNavCount(likesCache.length);
    const meta = await getLikesMeta();
    if (statusEl) {
      const when = meta?.importedAt ? new Date(meta.importedAt).toLocaleDateString() : "—";
      statusEl.textContent = `${likesCache.length} likes in library · imported ${when}`;
    }
    updateImportUi(likesCache.length > 0);
  }
  function renderCurrent() {
    if (!likesCache) return;
    const opts = cardOpts();
    const r = renderLikes({
      likes: likesCache,
      query: searchInput2?.value || "",
      filter: likesFilter,
      thumbCache,
      overlayTweetIds,
      page: likesPage,
      gridEl,
      paginationEl: paginationEls,
      lightboxEl,
      onPageChange: (p) => {
        likesPage = p;
        renderCurrent();
        queueResolveForPage();
      },
      onDelete: opts.onDelete,
      selectedTweetIds: opts.selectedTweetIds,
      onSelectToggle: opts.onSelectToggle
    });
    likesPage = r.currentPage;
    syncPaginationKeyboard({
      panelId: "likes",
      page: likesPage,
      totalPages: r.totalPages,
      onPageChange: (p) => {
        likesPage = p;
        renderCurrent();
        queueResolveForPage();
      }
    });
    updateProgress();
    updateBulkBar();
    return r;
  }
  async function resolveNextBatch() {
    if (!likesCache || resolveInFlight) return;
    const allPending = likesCache.map((l) => l.tweetId).filter((id) => !thumbCache[id]?.resolvedAt);
    if (allPending.length === 0) return;
    resolveInFlight = true;
    const batch = allPending.slice(0, RESOLVE_BATCH);
    try {
      const updated = await requestThumbResolve(batch);
      if (updated && Object.keys(updated).length) {
        thumbCache = { ...thumbCache, ...updated };
      }
    } finally {
      resolveInFlight = false;
      updateProgress();
      if (likesCache) {
        const { pageItems } = renderLikes({
          likes: likesCache,
          query: searchInput2?.value || "",
          filter: likesFilter,
          thumbCache,
          overlayTweetIds,
          page: likesPage,
          gridEl,
          paginationEl: paginationEls,
          lightboxEl,
          onPageChange: (p) => {
            likesPage = p;
            renderCurrent();
            queueResolveForPage();
          },
          ...cardOpts()
        });
        refreshLikeCardThumbs(gridEl, pageItems, thumbCache, lightboxEl, cardOpts());
      }
      if (allPending.length > batch.length) {
        setTimeout(resolveNextBatch, 100);
      }
    }
  }
  function queueResolveForPage() {
    if (!likesCache) return;
    const { pageItems } = renderLikes({
      likes: likesCache,
      query: searchInput2?.value || "",
      filter: likesFilter,
      thumbCache,
      overlayTweetIds,
      page: likesPage,
      gridEl: null,
      paginationEl: null,
      lightboxEl: null,
      onPageChange: () => {
      }
    });
    const pending = pageItems.map((l) => l.tweetId).filter((id) => !thumbCache[id]?.resolvedAt);
    if (pending.length) {
      requestThumbResolve(pending).then((patch) => {
        if (patch && Object.keys(patch).length) {
          thumbCache = { ...thumbCache, ...patch };
          renderCurrent();
        }
      });
    }
    resolveNextBatch();
  }
  async function handleDelete(tweetId) {
    await deleteLike(tweetId);
    selectedLikes.delete(tweetId);
    delete thumbCache[tweetId];
    await reloadFromDb();
    renderCurrent();
  }
  async function handleBulkDelete2() {
    const ids = [...selectedLikes];
    if (!ids.length) return;
    if (!confirm(`Remove ${ids.length} like${ids.length === 1 ? "" : "s"} from your library?`)) return;
    await deleteLikes(ids);
    for (const id of ids) {
      selectedLikes.delete(id);
      delete thumbCache[id];
    }
    await reloadFromDb();
    renderCurrent();
  }
  async function handleImportFile(file) {
    if (!file) return;
    const text = await file.text();
    let parsedJson = null;
    if (file.name.toLowerCase().endsWith(".json")) {
      try {
        parsedJson = JSON.parse(text);
      } catch {
        if (statusEl) statusEl.textContent = "Invalid JSON file.";
        return;
      }
    }
    const entries = parseLikeImport(text, file.name);
    if (!entries.length) {
      if (statusEl) statusEl.textContent = "No likes found in file.";
      return;
    }
    const isSync = isSyncExportFormat(parsedJson) || file.name.toLowerCase().includes("sync");
    const merge = isSync ? true : mergeEl?.checked ?? false;
    if (!merge && likesCache?.length) {
      if (!confirm("Replace all likes in library with this file?")) {
        return;
      }
    }
    if (statusEl) statusEl.textContent = "Importing…";
    const { imported, skipped, total } = await importLikes(entries, {
      sourceName: file.name,
      replace: !merge,
      prepend: merge
    });
    await reloadFromDb();
    likesPage = 1;
    panelLoaded = true;
    renderCurrent();
    queueResolveForPage();
    if (statusEl) {
      if (merge) {
        statusEl.textContent = `Added ${imported} new likes (${skipped} already in library) · ${total} total`;
      } else {
        statusEl.textContent = `Imported ${total} likes from ${file.name}`;
      }
    }
  }
  async function handleExportSync() {
    const data = await exportLikesLibrary();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `deepoverlay_likes_sync_${(/* @__PURE__ */ new Date()).toISOString().split("T")[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    if (statusEl && data.newest) {
      statusEl.textContent = `Exported ${data.count} likes · newest: ${data.newest.tweetId}`;
    }
  }
  function showEmptyImportState() {
    updateImportUi(false);
    if (statusEl) statusEl.textContent = "Import your X archive like.js once — then manage likes here without the file.";
    gridEl.innerHTML = `<div class="empty-state">No likes in library yet. Click <strong>Import like.js</strong> above.</div>`;
    for (const el of paginationEls) {
      if (!el) continue;
      el.innerHTML = "";
      el.hidden = true;
    }
    if (bulkBar) bulkBar.hidden = true;
    selectedLikes.clear();
    updateNavCount(0);
  }
  async function loadLikes() {
    try {
      const imported = await hasImportedLikes();
      if (!imported) {
        panelLoaded = true;
        showEmptyImportState();
        return;
      }
      await reloadFromDb();
      likesPage = 1;
      renderCurrent();
      queueResolveForPage();
      panelLoaded = true;
    } catch (err) {
      if (statusEl) statusEl.textContent = "Failed to load likes library.";
      gridEl.innerHTML = `<div class="empty-state">${err?.message || "IndexedDB error."}</div>`;
      console.error("Likes load failed:", err);
    }
  }
  importBtn?.addEventListener("click", () => fileInput?.click());
  reimportBtn?.addEventListener("click", () => fileInput?.click());
  exportSyncBtn?.addEventListener("click", () => handleExportSync().catch((err) => {
    if (statusEl) statusEl.textContent = err?.message || "Export failed.";
  }));
  bundledBtn?.addEventListener("click", async () => {
    try {
      const url = chrome.runtime.getURL("data/like.js");
      const res = await fetch(url);
      if (!res.ok) throw new Error("data/like.js not found in extension — use file import.");
      const text = await res.text();
      const entries = parseLikeImport(text, "data/like.js");
      const merge = mergeEl?.checked ?? false;
      if (!merge && likesCache?.length) {
        if (!confirm("Replace all likes in library with bundled data/like.js?")) return;
      }
      if (statusEl) statusEl.textContent = "Importing bundled like.js…";
      const { imported, skipped, total } = await importLikes(entries, {
        sourceName: "data/like.js",
        replace: !merge,
        prepend: merge
      });
      await reloadFromDb();
      likesPage = 1;
      panelLoaded = true;
      renderCurrent();
      queueResolveForPage();
      if (statusEl) statusEl.textContent = `Imported ${total} likes from extension data/like.js`;
    } catch (err) {
      if (statusEl) statusEl.textContent = err?.message || "Bundled import failed.";
    }
  });
  fileInput?.addEventListener("change", () => {
    const file = fileInput.files?.[0];
    handleImportFile(file).finally(() => {
      fileInput.value = "";
    });
  });
  if (searchInput2) {
    searchInput2.addEventListener("input", () => {
      likesPage = 1;
      renderCurrent();
    });
  }
  if (filterEl) {
    filterEl.addEventListener("change", () => {
      likesFilter = filterEl.value || "all";
      likesPage = 1;
      renderCurrent();
    });
  }
  subscribeOverlayChanges(async () => {
    await reloadOverlayLinks();
    renderCurrent();
  });
  let likesResizeTimer;
  window.addEventListener("resize", () => {
    if (!panelLoaded || !likesCache?.length) return;
    clearTimeout(likesResizeTimer);
    likesResizeTimer = setTimeout(() => renderCurrent(), 150);
  });
  return () => {
    if (!panelLoaded) loadLikes();
    else renderCurrent();
  };
}
const listContainer = document.getElementById("dashboard-list");
const searchInput = document.getElementById("search-input");
const siteFilterEl = document.getElementById("library-site-filter");
const paginationEl = document.getElementById("library-pagination");
let libraryPage = 1;
let librarySiteFilter = "all";
let allData = {};
window.allDataCache = allData;
let selectedItems = /* @__PURE__ */ new Set();
let bulkActionsBar = null;
function countWorks(data) {
  const worksByDomain = filterAndGroupData(data, "");
  let n = 0;
  Object.keys(worksByDomain).forEach((d) => {
    n += worksByDomain[d].length;
  });
  return n;
}
function initNav(onPanelShow) {
  const items = document.querySelectorAll(".do-nav-item[data-panel]");
  const panels = document.querySelectorAll(".do-panel");
  function show(panelId) {
    items.forEach((btn) => {
      const on = btn.dataset.panel === panelId;
      btn.classList.toggle("active", on);
      btn.setAttribute("aria-selected", on ? "true" : "false");
    });
    panels.forEach((p) => {
      const on = p.id === `panel-${panelId}`;
      p.classList.toggle("active", on);
    });
    onPanelShow?.(panelId);
  }
  items.forEach((btn) => {
    btn.addEventListener("click", () => show(btn.dataset.panel));
  });
  show("library");
}
function syncManifestVersion() {
  try {
    const v = chrome.runtime.getManifest?.()?.version;
    const el = document.getElementById("manager-version");
    if (el && v) el.textContent = `v${v}`;
  } catch {
  }
}
document.addEventListener("DOMContentLoaded", () => {
  syncManifestVersion();
  initPaginationKeyboard();
  const showLikesPanel = initLikesPanel();
  initNav((panelId) => {
    if (panelId === "likes") showLikesPanel?.();
  });
  loadDashboard();
  initTheme();
  initBulkActions();
  if (searchInput) {
    searchInput.addEventListener("input", () => {
      libraryPage = 1;
      renderLibrary();
    });
  }
  if (siteFilterEl) {
    siteFilterEl.addEventListener("change", () => {
      librarySiteFilter = siteFilterEl.value;
      libraryPage = 1;
      renderLibrary();
    });
  }
  document.getElementById("refresh-btn").onclick = loadDashboard;
  document.getElementById("export-btn").onclick = exportData;
  document.getElementById("clear-btn").onclick = clearAllData;
  document.getElementById("theme-toggle").onclick = toggleTheme;
  subscribeOverlayChanges(() => loadDashboard());
  window.inspectStorage = () => {
    chrome.storage.local.get(null, (items) => {
      console.log("=== Storage Contents ===");
      console.log("Keys:", Object.keys(items));
      console.log("Total keys:", Object.keys(items).length);
      console.table(items);
      const size = JSON.stringify(items).length;
      console.log("Storage size:", size, "bytes");
      alert(`Storage contains ${Object.keys(items).length} keys:
${Object.keys(items).join(", ")}

Check console (F12) for full details.`);
    });
  };
  initVisualSettings();
  initDisabledHosts();
});
function initBulkActions() {
  if (!listContainer) return;
  bulkActionsBar = createBulkActionsBar(
    handleBulkDelete,
    handleBulkExport,
    handleClearSelection
  );
  bulkActionsBar.classList.add("do-bulk-actions");
  listContainer.parentNode.insertBefore(bulkActionsBar, listContainer);
}
function handleBulkDelete() {
  console.log("Bulk delete:", Array.from(selectedItems));
  selectedItems.clear();
  updateBulkActionsBar(bulkActionsBar, 0);
  loadDashboard();
}
function handleBulkExport() {
  console.log("Bulk export:", Array.from(selectedItems));
}
function handleClearSelection() {
  selectedItems.clear();
  updateBulkActionsBar(bulkActionsBar, 0);
  document.querySelectorAll('input[type="checkbox"].bulk-select').forEach((cb) => {
    cb.checked = false;
  });
}
function handleWorkDelete(storageKey) {
  removeStorageKey(storageKey).then(() => {
    delete allData[storageKey];
    window.allDataCache = allData;
    renderLibrary();
    updateLibraryNavCount(allData);
  });
}
function handleUpdate() {
  getAllData().then((items) => {
    allData = items;
    window.allDataCache = allData;
    renderLibrary();
    updateLibraryNavCount(allData);
  });
}
function renderLibrary() {
  if (!listContainer) return;
  const r = renderDashboard(allData, searchInput?.value || "", listContainer, handleWorkDelete, handleUpdate, {
    page: libraryPage,
    pageSize: LIBRARY_PAGE_SIZE,
    paginationEl,
    siteFilter: librarySiteFilter,
    onPageChange: (p) => {
      libraryPage = p;
      renderLibrary();
    }
  });
  if (r) libraryPage = r.currentPage;
  syncPaginationKeyboard({
    panelId: "library",
    page: libraryPage,
    totalPages: r?.totalPages ?? 1,
    onPageChange: (p) => {
      libraryPage = p;
      renderLibrary();
    }
  });
}
function updateLibraryNavCount(data) {
  const el = document.getElementById("library-nav-count");
  if (el) el.textContent = String(countWorks(data || {}));
}
function initDisabledHosts() {
  const ta = document.getElementById("opt-disabled-hosts");
  if (!ta) return;
  chrome.storage.local.get(["overlay_disabled_hosts"], (r) => {
    const list = r.overlay_disabled_hosts;
    ta.value = Array.isArray(list) ? list.join("\n") : "";
  });
  let t;
  ta.addEventListener("input", () => {
    clearTimeout(t);
    t = setTimeout(() => {
      const lines = ta.value.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
      chrome.storage.local.set({ overlay_disabled_hosts: lines });
    }, 300);
  });
}
function setHexLabels() {
  const border = document.getElementById("opt-border-color");
  const fill = document.getElementById("opt-bg-color");
  const bh = document.getElementById("border-hex-label");
  const fh = document.getElementById("fill-hex-label");
  if (border && bh) bh.textContent = border.value;
  if (fill && fh) fh.textContent = fill.value;
}
function initVisualSettings() {
  const optOpacity = document.getElementById("opt-opacity");
  const valOpacity = document.getElementById("val-opacity");
  const optBorder = document.getElementById("opt-border-color");
  const optBg = document.getElementById("opt-bg-color");
  chrome.storage.local.get(["overlay_opacity", "overlay_border_color", "overlay_bg_color"], (res) => {
    const op = res.overlay_opacity || 1;
    const borderColor = res.overlay_border_color || "#000000";
    const bgColor = res.overlay_bg_color || "#ffffff";
    if (optOpacity) optOpacity.value = op;
    if (valOpacity) valOpacity.innerText = String(op);
    if (optBorder) optBorder.value = borderColor;
    if (optBg) optBg.value = bgColor;
    setHexLabels();
  });
  if (optOpacity) {
    optOpacity.addEventListener("input", (e) => {
      if (valOpacity) valOpacity.innerText = e.target.value;
      chrome.storage.local.set({ overlay_opacity: e.target.value });
    });
  }
  if (optBorder) {
    optBorder.addEventListener("input", (e) => {
      setHexLabels();
      chrome.storage.local.set({ overlay_border_color: e.target.value });
    });
  }
  if (optBg) {
    optBg.addEventListener("input", (e) => {
      setHexLabels();
      chrome.storage.local.set({ overlay_bg_color: e.target.value });
    });
  }
}
function initTheme() {
  const doApp = document.getElementById("doApp");
  chrome.storage.local.get("theme", (result) => {
    if (result.theme === "light") {
      document.body.setAttribute("data-theme", "light");
      doApp?.classList.add("do-light");
    } else {
      document.body.removeAttribute("data-theme");
      doApp?.classList.remove("do-light");
    }
  });
}
function toggleTheme() {
  const isLight = document.body.getAttribute("data-theme") === "light";
  const newTheme = isLight ? "dark" : "light";
  const doApp = document.getElementById("doApp");
  if (newTheme === "light") {
    document.body.setAttribute("data-theme", "light");
    doApp?.classList.add("do-light");
  } else {
    document.body.removeAttribute("data-theme");
    doApp?.classList.remove("do-light");
  }
  chrome.storage.local.set({ theme: newTheme });
}
function loadDashboard() {
  libraryPage = 1;
  getAllData().then((items) => {
    allData = items;
    window.allDataCache = allData;
    renderLibrary();
    updateLibraryNavCount(allData);
  });
  getStorageBytes().then((bytes) => {
    const el = document.getElementById("storage-usage");
    if (!el) return;
    el.textContent = `Storage: ${formatBytes(bytes)}`;
  });
}
function clearAllData() {
  if (confirm("WARNING: Delete EVERYTHING?")) {
    clearAllStorage().then(() => {
      allData = {};
      window.allDataCache = allData;
      loadDashboard();
      chrome.storage.local.remove(
        ["overlay_opacity", "overlay_border_color", "overlay_bg_color", "theme"],
        () => {
          window.location.reload();
        }
      );
    });
  }
}
function exportData() {
  const blob = new Blob([JSON.stringify(allData, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `deep_overlay_backup_${(/* @__PURE__ */ new Date()).toISOString().split("T")[0]}.json`;
  a.click();
}
