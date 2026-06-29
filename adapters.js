var DeepOverlayAdapters = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // lib/site-adapters.mjs
  var site_adapters_exports = {};
  __export(site_adapters_exports, {
    CURRENT_SCHEMA_VERSION: () => CURRENT_SCHEMA_VERSION,
    INDEX_KEY: () => INDEX_KEY,
    SCHEMA_VERSION_KEY: () => SCHEMA_VERSION_KEY,
    extractWorkMeta: () => extractWorkMeta,
    getAdapter: () => getAdapter,
    getStorageKey: () => getStorageKey,
    isReservedKey: () => isReservedKey,
    isWorkKey: () => isWorkKey,
    makeImageStorageKey: () => makeImageStorageKey,
    makeWorkImgKey: () => makeWorkImgKey,
    migrateImageKeysInWorkEntry: () => migrateImageKeysInWorkEntry,
    migrateStorageSnapshot: () => migrateStorageSnapshot,
    parseImageStorageKey: () => parseImageStorageKey,
    rebuildIndexFromWorks: () => rebuildIndexFromWorks,
    removeIndexKey: () => removeIndexKey,
    upsertIndexEntry: () => upsertIndexEntry
  });
  var INDEX_KEY = "_index";
  var SCHEMA_VERSION_KEY = "_schemaVersion";
  var CURRENT_SCHEMA_VERSION = 4;
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
  var EHentai = {
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
  var Pixiv = {
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
  var Twitter = {
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
  var Generic = {
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
  var adapters = [EHentai, Pixiv, Twitter, Generic];
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
  var IMAGE_ENTRY_SEP = "";
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
  function removeIndexKey(index, storageKey) {
    return index.filter((e) => e.key !== storageKey);
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
            const notePreview = allNotes.length > 180 ? `${allNotes.slice(0, 180)}\u2026` : allNotes;
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
  return __toCommonJS(site_adapters_exports);
})();
