/**
 * Canonical storage layout & site adapters (ESM).
 * Build: esbuild → adapters.js (IIFE) for content scripts; background imports this file directly.
 */

export const INDEX_KEY = '_index';
export const QUOTA_KEY = 'quota:ocr';
export const SCHEMA_VERSION_KEY = '_schemaVersion';
export const CURRENT_SCHEMA_VERSION = 2;

/** @param {string} str */
function djb2Hex(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h) + str.charCodeAt(i);
  return (h >>> 0).toString(16);
}

const EHentai = {
  name: 'e-hentai',
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
    const basePath = u.pathname.split('-')[0];
    return {
      site: 'e-hentai',
      workId: m[1],
      normalizedUrl: u.origin + basePath,
    };
  },
  storageKey: (url) => {
    const e = EHentai.extract(url);
    return e ? `work:${e.site}:${e.workId}` : null;
  },
};

const Pixiv = {
  name: 'pixiv',
  match: (url) => {
    try {
      const u = new URL(url);
      return u.hostname.includes('pixiv.net') && /\/artworks\/\d+/.test(u.pathname);
    } catch {
      return false;
    }
  },
  extract: (url) => {
    const u = new URL(url);
    const m = u.pathname.match(/\/artworks\/(\d+)/);
    if (!m) return null;
    return {
      site: 'pixiv',
      workId: m[1],
      normalizedUrl: u.origin + u.pathname.split('#')[0],
    };
  },
  storageKey: (url) => {
    const e = Pixiv.extract(url);
    return e ? `work:${e.site}:${e.workId}` : null;
  },
};

const Twitter = {
  name: 'x',
  match: (url) => {
    try {
      const u = new URL(url);
      return (u.hostname.includes('x.com') || u.hostname.includes('twitter.com')) && /\/status\/\d+/.test(u.pathname);
    } catch {
      return false;
    }
  },
  extract: (url) => {
    const u = new URL(url);
    const m = u.pathname.match(/\/status\/(\d+)/);
    if (!m) return null;
    const base = u.pathname.split('/photo/')[0];
    return {
      site: 'x',
      workId: m[1],
      normalizedUrl: u.origin + base,
    };
  },
  storageKey: (url) => {
    const e = Twitter.extract(url);
    return e ? `work:${e.site}:${e.workId}` : null;
  },
};

const Generic = {
  name: 'generic',
  match: () => true,
  extract: (url) => {
    try {
      const u = new URL(url);
      const normalizedUrl = u.origin + u.pathname;
      return {
        site: 'generic',
        workId: djb2Hex(normalizedUrl),
        normalizedUrl,
      };
    } catch {
      const normalizedUrl = String(url).split('?')[0].split('#')[0];
      return {
        site: 'generic',
        workId: djb2Hex(normalizedUrl),
        normalizedUrl,
      };
    }
  },
  storageKey: (url) => {
    const e = Generic.extract(url);
    return `work:${e.site}:${e.workId}`;
  },
};

const adapters = [EHentai, Pixiv, Twitter, Generic];

export function getAdapter(url) {
  for (let i = 0; i < adapters.length - 1; i++) {
    if (adapters[i].match(url)) return adapters[i];
  }
  return Generic;
}

/** @returns {{ site: string, workId: string, normalizedUrl: string }} */
export function extractWorkMeta(url) {
  return getAdapter(url).extract(url);
}

export function getStorageKey(url) {
  return getAdapter(url).storageKey(url);
}

export function isWorkKey(key) {
  return typeof key === 'string' && key.startsWith('work:');
}

export function isReservedKey(key) {
  if (typeof key !== 'string') return true;
  if (key === INDEX_KEY || key === SCHEMA_VERSION_KEY || key === QUOTA_KEY) return true;
  if (key === 'theme' || key === 'ocr_quota') return true;
  if (key.startsWith('overlay_')) return true;
  if (key === 'settings') return true;
  return false;
}

/**
 * Normalize legacy `site:workId` (no work: prefix) to `work:site:workId`.
 * @param {string} key
 */
function legacySiteWorkKeyToNew(key) {
  if (key.startsWith('work:')) return key;
  const parts = key.split(':');
  if (parts.length === 2 && parts[0] !== 'http' && parts[0] !== 'https' && !key.includes('/')) {
    return `work:${parts[0]}:${parts[1]}`;
  }
  return null;
}

/**
 * @param {object[]} index
 * @param {string} storageKey
 * @param {{ site?: string, workId?: string|null, metadata?: { lastUpdated?: number }, baseUrl?: string }} workEntry
 */
export function upsertIndexEntry(index, storageKey, workEntry) {
  const row = {
    key: storageKey,
    site: workEntry.site || 'generic',
    workId: workEntry.workId != null ? String(workEntry.workId) : '',
    lastUpdated: workEntry.metadata?.lastUpdated || Date.now(),
    baseUrl: workEntry.baseUrl || '',
  };
  const i = index.findIndex((e) => e.key === storageKey);
  if (i >= 0) index[i] = row;
  else index.push(row);
  index.sort((a, b) => (b.lastUpdated || 0) - (a.lastUpdated || 0));
}

export function removeIndexKey(index, storageKey) {
  return index.filter((e) => e.key !== storageKey);
}

/**
 * One-shot migration: legacy URL keys, `site:id` keys, ocr_quota → quota:ocr, _index rebuild.
 * @param {Record<string, unknown>} all
 * @returns {{ set: Record<string, unknown>, remove: string[] }}
 */
export function migrateStorageSnapshot(all) {
  const set = {};
  const remove = [];

  const ver = all[SCHEMA_VERSION_KEY];
  if (ver >= CURRENT_SCHEMA_VERSION) {
    return { set, remove };
  }

  const index = Array.isArray(all[INDEX_KEY]) ? [...all[INDEX_KEY]] : [];

  if (all.ocr_quota != null && all[QUOTA_KEY] == null) {
    set[QUOTA_KEY] = all.ocr_quota;
    remove.push('ocr_quota');
  }

  const processedWorkKeys = new Set();

  for (const key of Object.keys(all)) {
    if (key === SCHEMA_VERSION_KEY || key === INDEX_KEY) continue;
    if (key === 'ocr_quota') continue;
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
          urlVariants: [key],
        },
      };
      set[newKey] = workEntry;
      upsertIndexEntry(index, newKey, workEntry);
      processedWorkKeys.add(newKey);
      if (key !== newKey) remove.push(key);
      continue;
    }

    if (val && typeof val === 'object' && 'images' in val) {
      let newKey = key;
      if (!key.startsWith('work:')) {
        const tryK = legacySiteWorkKeyToNew(key);
        if (tryK) newKey = tryK;
        else if (/^https?:\/\//i.test(key)) newKey = getStorageKey(key);
        else continue;
      }
      if (processedWorkKeys.has(newKey)) continue;

      const we = { ...val };
      normalizeWorkEntryFields(we, newKey);
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
  const parts = storageKey.split(':');
  if (parts[0] === 'work' && parts.length >= 3) {
    workEntry.site = parts[1];
    workEntry.workId = parts.slice(2).join(':');
  }
  if (!workEntry.metadata) {
    workEntry.metadata = { firstSeen: Date.now(), lastUpdated: Date.now(), urlVariants: [] };
  }
}

export function rebuildIndexFromWorks(all) {
  const index = [];
  for (const key of Object.keys(all)) {
    if (!isWorkKey(key)) continue;
    const val = all[key];
    if (val && typeof val === 'object' && val.images) {
      upsertIndexEntry(index, key, val);
    }
  }
  return index;
}
