import { THUMB_CACHE_KEY } from './likes-constants.mjs';
import {
  openDb,
  store,
  getOne,
  getAll,
  putOne,
  putMany,
  deleteOne,
  deleteMany,
  clearStore,
  STORES,
} from './idb-core.mjs';

const META_ID = 'main';
const LIKES_ORDER_V = 2;

let dbPromise = null;
let thumbMigrationDone = false;
let likesOrderMigrationDone = false;

/** @param {string} a @param {string} b */
export function compareTweetIdDesc(a, b) {
  if (a.length !== b.length) return b.length - a.length;
  if (a === b) return 0;
  return a > b ? -1 : 1;
}

/** @param {{ sortOrder?: number; likedAt?: number; tweetId: string }} a @param {{ sortOrder?: number; likedAt?: number; tweetId: string }} b */
export function compareLikesNewestFirst(a, b) {
  const order = (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
  if (order !== 0) return order;
  const liked = (b.likedAt ?? 0) - (a.likedAt ?? 0);
  if (liked !== 0) return liked;
  return compareTweetIdDesc(a.tweetId, b.tweetId);
}

/** @param {Array<{ sortOrder?: number; likedAt?: number }>} rows */
function stampNewestFirstOrder(rows, likedAtBase = Date.now()) {
  rows.forEach((row, i) => {
    row.sortOrder = i;
    row.likedAt = likedAtBase - i;
  });
}

/** @param {IDBDatabase} db */
async function migrateLikesOrderFields(db) {
  if (likesOrderMigrationDone) return;
  likesOrderMigrationDone = true;

  const meta = await getOne(store(db, STORES.LIKES_META), META_ID);
  if (meta?.likesOrderV >= LIKES_ORDER_V) return;

  const rows = await getAll(store(db, STORES.LIKES));
  if (rows.length) {
    rows.sort(compareLikesNewestFirst);
    stampNewestFirstOrder(rows);
    await putMany(store(db, STORES.LIKES, 'readwrite'), rows);
  }

  if (meta) {
    await putOne(store(db, STORES.LIKES_META, 'readwrite'), { ...meta, likesOrderV: LIKES_ORDER_V });
  }
}

/** @returns {Promise<IDBDatabase>} */
export function getDb() {
  if (!dbPromise) {
    dbPromise = openDb().then(async (db) => {
      await migrateThumbCacheFromChromeStorage(db);
      await migrateLikesOrderFields(db);
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

  const existing = await getAll(store(db, STORES.LIKE_THUMBS));
  if (existing.length > 0) {
    await chrome.storage?.local?.remove([THUMB_CACHE_KEY]);
    return;
  }

  await putMany(
    store(db, STORES.LIKE_THUMBS, 'readwrite'),
    Object.entries(legacy).map(([tweetId, entry]) => ({ tweetId, ...entry }))
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
 * @param {{ sourceName?: string; replace?: boolean; prepend?: boolean }} [opts]
 */
export async function importLikes(entries, opts = {}) {
  const db = await getDb();
  const now = Date.now();
  const sourceName = opts.sourceName || 'like.js';
  const replace = opts.replace !== false;
  const prepend = !replace && opts.prepend === true;

  if (replace) {
    await clearStore(store(db, STORES.LIKES, 'readwrite'));
  }

  const existingById = new Map();
  if (!replace) {
    for (const row of await getAll(store(db, STORES.LIKES))) {
      existingById.set(row.tweetId, row);
    }
  }

  const seen = new Set();
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
      text: e.text || '',
      fullText: e.fullText || '',
      tcoLinks: e.tcoLinks || [],
      postUrl: e.postUrl || `https://x.com/i/web/status/${e.tweetId}`,
      sortOrder: fileOrder,
      likedAt: 0,
      hidden: false,
      importedAt: now,
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
          likedAt: (row.likedAt ?? 0) - imported,
        });
      }
    } else if (!replace) {
      const startOrder =
        [...existingById.values()].reduce((max, row) => Math.max(max, row.sortOrder ?? 0), -1) + 1;
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
    await putMany(store(db, STORES.LIKES, 'readwrite'), toWrite);
  }

  const total = replace ? imported : (await getAll(store(db, STORES.LIKES))).length;
  await putOne(store(db, STORES.LIKES_META, 'readwrite'), {
    id: META_ID,
    importedAt: now,
    count: total,
    sourceName,
  });

  return { imported, skipped, total };
}

/** @readonly */
export const LIKES_EXPORT_FORMAT = 'deepoverlay-likes-v1';

/**
 * Full library export for Tampermonkey sync (newest like = sortOrder 0).
 * @returns {Promise<{ format: string; exportedAt: number; count: number; newest: object | null; tweetIds: string[]; entries: object[] }>}
 */
export async function exportLikesLibrary() {
  const likes = await getAllLikes({ includeHidden: true });
  const entries = likes.map((l) => ({
    tweetId: l.tweetId,
    text: l.text || '',
    fullText: l.fullText || l.text || '',
    tcoLinks: l.tcoLinks || [],
    postUrl: l.postUrl || `https://x.com/i/status/${l.tweetId}`,
  }));

  const newest = entries[0]
    ? {
        tweetId: entries[0].tweetId,
        text: entries[0].text,
        postUrl: entries[0].postUrl,
      }
    : null;

  return {
    format: LIKES_EXPORT_FORMAT,
    exportedAt: Date.now(),
    count: entries.length,
    newest,
    tweetIds: entries.map((e) => e.tweetId),
    entries,
  };
}

/**
 * @param {{ includeHidden?: boolean }} [opts]
 * @returns {Promise<Array<{ tweetId: string; text: string; postUrl: string; hidden?: boolean; sortOrder?: number }>>}
 */
export async function getAllLikes(opts = {}) {
  const db = await getDb();
  const rows = await getAll(store(db, STORES.LIKES));
  const visible = opts.includeHidden ? rows : rows.filter((r) => !r.hidden);
  visible.sort(compareLikesNewestFirst);
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
  const existing = await getOne(store(db, STORES.LIKES), tweetId);
  if (!existing) return null;
  const next = { ...existing, ...patch, tweetId };
  await putOne(store(db, STORES.LIKES, 'readwrite'), next);
  return next;
}

/** @param {string} tweetId */
export async function hideLike(tweetId) {
  return updateLike(tweetId, { hidden: true });
}

/** @param {string} tweetId */
export async function deleteLike(tweetId) {
  await deleteLikes([tweetId]);
}

/** @param {string[]} tweetIds */
export async function deleteLikes(tweetIds) {
  const ids = [...new Set(tweetIds.filter(Boolean))];
  if (!ids.length) return;

  const db = await getDb();
  await deleteMany(store(db, STORES.LIKES, 'readwrite'), ids);
  await deleteMany(store(db, STORES.LIKE_THUMBS, 'readwrite'), ids);
  const remaining = await getAll(store(db, STORES.LIKES));
  const meta = (await getOne(store(db, STORES.LIKES_META), META_ID)) || { id: META_ID };
  await putOne(store(db, STORES.LIKES_META, 'readwrite'), { ...meta, count: remaining.length });
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
