import { THUMB_CACHE_KEY } from './likes-constants.mjs';
import {
  openDb,
  store,
  getOne,
  getAll,
  putOne,
  deleteOne,
  clearStore,
  STORES,
} from './idb-core.mjs';

const META_ID = 'main';

let dbPromise = null;
let thumbMigrationDone = false;

/** @returns {Promise<IDBDatabase>} */
export function getDb() {
  if (!dbPromise) {
    dbPromise = openDb().then(async (db) => {
      await migrateThumbCacheFromChromeStorage(db);
      return db;
    });
  }
  return dbPromise;
}

/**
 * One-time migration: chrome.storage likes:thumbCache → like_thumbs store.
 * @param {IDBDatabase} db
 */
async function migrateThumbCacheFromChromeStorage(db) {
  if (thumbMigrationDone) return;
  thumbMigrationDone = true;

  const legacy = await new Promise((resolve) => {
    chrome.storage?.local?.get([THUMB_CACHE_KEY], (r) => resolve(r?.[THUMB_CACHE_KEY] || null));
  });
  if (!legacy || typeof legacy !== 'object' || !Object.keys(legacy).length) return;

  const thumbOs = store(db, STORES.LIKE_THUMBS, 'readwrite');
  const existing = await getAll(thumbOs);
  if (existing.length > 0) {
    await chrome.storage?.local?.remove([THUMB_CACHE_KEY]);
    return;
  }

  await Promise.all(
    Object.entries(legacy).map(([tweetId, entry]) =>
      putOne(thumbOs, { tweetId, ...entry })
    )
  );
  await chrome.storage?.local?.remove([THUMB_CACHE_KEY]);
}

/** @returns {Promise<{ importedAt?: number; count?: number; sourceName?: string } | null>} */
export async function getLikesMeta() {
  const db = await getDb();
  const meta = await getOne(store(db, STORES.LIKES_META), META_ID);
  return meta || null;
}

/** @returns {Promise<boolean>} */
export async function hasImportedLikes() {
  const meta = await getLikesMeta();
  if (meta?.count > 0) return true;
  const db = await getDb();
  const all = await getAll(store(db, STORES.LIKES));
  return all.length > 0;
}

/**
 * @param {Array<{ tweetId: string; text: string; fullText?: string; tcoLinks?: string[]; postUrl: string }>} entries
 * @param {{ sourceName?: string; replace?: boolean }} [opts]
 */
export async function importLikes(entries, opts = {}) {
  const db = await getDb();
  const now = Date.now();
  const sourceName = opts.sourceName || 'like.js';
  const replace = opts.replace !== false;

  if (replace) {
    await clearStore(store(db, STORES.LIKES, 'readwrite'));
  }

  let startOrder = 0;
  if (!replace) {
    const existing = await getAll(store(db, STORES.LIKES));
    startOrder = existing.reduce((max, row) => Math.max(max, row.sortOrder ?? 0), -1) + 1;
  }

  const likesOs = store(db, STORES.LIKES, 'readwrite');
  const seen = new Set();
  let imported = 0;

  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    if (!e?.tweetId || seen.has(e.tweetId)) continue;
    seen.add(e.tweetId);

    let hidden = false;
    if (!replace) {
      const prev = await getOne(likesOs, e.tweetId);
      if (prev) hidden = !!prev.hidden;
    }

    await putOne(likesOs, {
      tweetId: e.tweetId,
      text: e.text || '',
      fullText: e.fullText || '',
      tcoLinks: e.tcoLinks || [],
      postUrl: e.postUrl || `https://x.com/i/web/status/${e.tweetId}`,
      sortOrder: replace ? i : startOrder + imported,
      hidden,
      importedAt: now,
    });
    imported++;
  }

  const metaOs = store(db, STORES.LIKES_META, 'readwrite');
  const total = replace ? imported : (await getAll(likesOs)).length;
  await putOne(metaOs, {
    id: META_ID,
    importedAt: now,
    count: total,
    sourceName,
  });

  return { imported, total };
}

/**
 * @param {{ includeHidden?: boolean }} [opts]
 * @returns {Promise<Array<{ tweetId: string; text: string; postUrl: string; hidden?: boolean; sortOrder?: number }>>}
 */
export async function getAllLikes(opts = {}) {
  const db = await getDb();
  const rows = await getAll(store(db, STORES.LIKES));
  const visible = opts.includeHidden ? rows : rows.filter((r) => !r.hidden);
  visible.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  return visible;
}

/** @param {{ includeHidden?: boolean }} [opts] */
export async function countLikes(opts = {}) {
  const likes = await getAllLikes(opts);
  return likes.length;
}

/** @param {string} tweetId */
export async function getLike(tweetId) {
  const db = await getDb();
  return getOne(store(db, STORES.LIKES), tweetId);
}

/**
 * @param {string} tweetId
 * @param {Partial<{ text: string; hidden: boolean }>} patch
 */
export async function updateLike(tweetId, patch) {
  const db = await getDb();
  const os = store(db, STORES.LIKES, 'readwrite');
  const existing = await getOne(os, tweetId);
  if (!existing) return null;
  const next = { ...existing, ...patch, tweetId };
  await putOne(os, next);
  return next;
}

/** @param {string} tweetId */
export async function hideLike(tweetId) {
  return updateLike(tweetId, { hidden: true });
}

/** @param {string} tweetId */
export async function deleteLike(tweetId) {
  const db = await getDb();
  await deleteOne(store(db, STORES.LIKES, 'readwrite'), tweetId);
  await deleteOne(store(db, STORES.LIKE_THUMBS, 'readwrite'), tweetId);
  const remaining = await getAll(store(db, STORES.LIKES));
  const metaOs = store(db, STORES.LIKES_META, 'readwrite');
  const meta = (await getOne(store(db, STORES.LIKES_META), META_ID)) || { id: META_ID };
  await putOne(metaOs, { ...meta, count: remaining.length });
}

/** @param {string[]} tweetIds */
export async function getThumbsMap(tweetIds) {
  const db = await getDb();
  const os = store(db, STORES.LIKE_THUMBS);
  const map = {};
  await Promise.all(
    tweetIds.map(async (id) => {
      const row = await getOne(os, id);
      if (row) map[id] = row;
    })
  );
  return map;
}

/** @returns {Promise<Record<string, { mediaUrl?: string; mediaUrls?: string[]; mediaType?: string; resolvedAt?: number }>>} */
export async function getAllThumbsMap() {
  const db = await getDb();
  const rows = await getAll(store(db, STORES.LIKE_THUMBS));
  const map = {};
  for (const row of rows) {
    if (row?.tweetId) map[row.tweetId] = row;
  }
  return map;
}

/**
 * @param {string} tweetId
 * @param {{ mediaUrl?: string; mediaUrls?: string[]; mediaType?: string; resolvedAt?: number }} data
 */
export async function putThumb(tweetId, data) {
  const db = await getDb();
  await putOne(store(db, STORES.LIKE_THUMBS, 'readwrite'), { tweetId, ...data });
}

/**
 * @param {Record<string, { mediaUrl?: string; mediaUrls?: string[]; mediaType?: string; resolvedAt?: number }>} patch
 */
export async function putThumbsBatch(patch) {
  const db = await getDb();
  const os = store(db, STORES.LIKE_THUMBS, 'readwrite');
  await Promise.all(
    Object.entries(patch).map(([tweetId, data]) => putOne(os, { tweetId, ...data }))
  );
}

/** @param {string[]} tweetIds */
export async function getThumbsNeedingResolve(tweetIds) {
  const db = await getDb();
  const os = store(db, STORES.LIKE_THUMBS);
  const need = [];
  for (const id of tweetIds) {
    const row = await getOne(os, id);
    if (!row?.resolvedAt) need.push(id);
  }
  return need;
}

/** Clear all likes and thumbs (factory reset for likes feature). */
export async function clearAllLikesData() {
  const db = await getDb();
  await clearStore(store(db, STORES.LIKES, 'readwrite'));
  await clearStore(store(db, STORES.LIKE_THUMBS, 'readwrite'));
  await clearStore(store(db, STORES.LIKES_META, 'readwrite'));
}
