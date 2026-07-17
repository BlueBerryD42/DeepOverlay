/**
 * Overlay works + work_images in IndexedDB.
 * Settings remain in chrome.storage.local.
 */

import {
  INDEX_KEY,
  SCHEMA_VERSION_KEY,
  migrateStorageSnapshot,
  upsertIndexEntry,
  rebuildIndexFromWorks,
} from './site-adapters.mjs';
import {
  openDb,
  store,
  getOne,
  getAll,
  putOne,
  putMany,
  deleteMany,
  deleteOne,
  clearStore,
  STORES,
} from './idb-core.mjs';
import { broadcastOverlayChange } from './storage-broadcast.mjs';
import { countBoxesInWorkEntry, tweetIdFromXWorkKey } from './overlay-x-link.mjs';

const META_OVERLAY_MIGRATED = 'overlay_migrated';
const META_WORKS_INDEX = 'works_index';

let dbPromise = null;
let migratePromise = null;

/** @returns {Promise<IDBDatabase>} */
export function getOverlayDb() {
  if (!dbPromise) dbPromise = openDb();
  return dbPromise;
}

function workRow(storageKey, workEntry) {
  const lastUpdated = workEntry?.metadata?.lastUpdated || Date.now();
  return {
    ...workEntry,
    storageKey,
    site: workEntry?.site || 'generic',
    workId: workEntry?.workId != null ? String(workEntry.workId) : '',
    lastUpdated,
  };
}

function rowToWorkEntry(row) {
  if (!row) return null;
  const { storageKey, site, workId, lastUpdated, ...rest } = row;
  return {
    ...rest,
    site: site ?? rest.site,
    workId: workId ?? rest.workId,
  };
}

/** @returns {Promise<object[]>} */
export async function getWorksIndex() {
  const db = await getOverlayDb();
  const row = await getOne(store(db, STORES.APP_META), META_WORKS_INDEX);
  return Array.isArray(row?.rows) ? row.rows : [];
}

/** @param {object[]} rows */
async function setWorksIndex(rows) {
  const db = await getOverlayDb();
  await putOne(store(db, STORES.APP_META, 'readwrite'), {
    id: META_WORKS_INDEX,
    rows,
  });
}

/** One-shot: chrome.storage work:* / workimg:* → IndexedDB */
export async function ensureOverlayMigrated() {
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
      if (key.startsWith('work:') && val && typeof val === 'object' && !Array.isArray(val)) {
        workRows.push(workRow(key, val));
      }
      if (key.startsWith('workimg:') && val && typeof val === 'object') {
        const parts = key.split(':');
        const storageKey = parts.length >= 3 ? `work:${parts[1]}:${parts[2]}` : '';
        imgRows.push({ refKey: key, storageKey, ...val });
      }
    }

    if (workRows.length) {
      await putMany(store(db, STORES.WORKS, 'readwrite'), workRows);
    }
    if (imgRows.length) {
      await putMany(store(db, STORES.WORK_IMAGES, 'readwrite'), imgRows);
    }

    let index = Array.isArray(merged[INDEX_KEY]) ? merged[INDEX_KEY] : [];
    if (!index.length) {
      const snapshot = {};
      const works = await getAll(store(db, STORES.WORKS));
      for (const w of works) snapshot[w.storageKey] = rowToWorkEntry(w);
      index = rebuildIndexFromWorks(snapshot);
    }
    await setWorksIndex(index);

    await putOne(store(db, STORES.APP_META, 'readwrite'), {
      id: META_OVERLAY_MIGRATED,
      done: true,
      migratedAt: Date.now(),
    });

    const keysToRemove = Object.keys(all).filter(
      (k) =>
        k.startsWith('work:') ||
        k.startsWith('workimg:') ||
        k === INDEX_KEY ||
        k === SCHEMA_VERSION_KEY
    );
    if (keysToRemove.length && chrome.storage?.local?.remove) {
      await new Promise((resolve) => chrome.storage.local.remove(keysToRemove, resolve));
    }
  })();

  return migratePromise;
}

/** @param {string} storageKey */
export async function getWork(storageKey) {
  await ensureOverlayMigrated();
  const db = await getOverlayDb();
  const row = await getOne(store(db, STORES.WORKS), storageKey);
  return rowToWorkEntry(row);
}

/** @param {string[]} refKeys */
export async function getWorkImagesMap(refKeys) {
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

/** @param {string} refKey */
export async function getWorkImage(refKey) {
  const map = await getWorkImagesMap([refKey]);
  return map[refKey] || null;
}

/**
 * @param {{ storageKey: string, workEntry: object, workImgUpdates?: Record<string, object> }} payload
 */
export async function saveWorkBundle(payload) {
  await ensureOverlayMigrated();
  const { storageKey, workEntry, workImgUpdates = {} } = payload;
  const db = await getOverlayDb();

  const index = await getWorksIndex();
  upsertIndexEntry(index, storageKey, workEntry);
  await setWorksIndex(index);

  await putOne(store(db, STORES.WORKS, 'readwrite'), workRow(storageKey, workEntry));

  const imgRows = Object.entries(workImgUpdates).map(([refKey, record]) => ({
    refKey,
    storageKey,
    ...record,
  }));
  if (imgRows.length) {
    await putMany(store(db, STORES.WORK_IMAGES, 'readwrite'), imgRows);
  }

  broadcastOverlayChange([storageKey, ...Object.keys(workImgUpdates)]);
}

/** @param {string} storageKey */
export async function saveWorkWithIndex(storageKey, workEntry) {
  const index = await getWorksIndex();
  upsertIndexEntry(index, storageKey, workEntry);
  await setWorksIndex(index);
  const db = await getOverlayDb();
  await putOne(store(db, STORES.WORKS, 'readwrite'), workRow(storageKey, workEntry));
  broadcastOverlayChange([storageKey]);
}

/** @param {string} refKey */
export async function saveWorkImage(refKey, record, storageKey = '') {
  await ensureOverlayMigrated();
  const db = await getOverlayDb();
  const sk =
    storageKey ||
    (refKey.startsWith('workimg:')
      ? (() => {
          const parts = refKey.split(':');
          return parts.length >= 3 ? `work:${parts[1]}:${parts[2]}` : '';
        })()
      : '');
  await putOne(store(db, STORES.WORK_IMAGES, 'readwrite'), { refKey, storageKey: sk, ...record });
  broadcastOverlayChange([refKey, sk]);
}

/**
 * Dashboard snapshot: { _index, work:key: entry, ... }
 * @returns {Promise<Record<string, unknown>>}
 */
export async function getWorksSnapshot() {
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

/**
 * Tweet IDs that have at least one saved overlay box (work:x:{tweetId}).
 * @returns {Promise<Set<string>>}
 */
export async function getAnnotatedXTweetIds() {
  await ensureOverlayMigrated();
  const db = await getOverlayDb();
  const works = await getAll(store(db, STORES.WORKS));
  const ids = new Set();

  for (const row of works) {
    const storageKey = row.storageKey;
    const tweetId = tweetIdFromXWorkKey(storageKey) || (row.site === 'x' ? row.workId : null);
    if (!tweetId) continue;

    const entry = rowToWorkEntry(row);
    if (countBoxesInWorkEntry(entry) > 0) {
      ids.add(String(tweetId));
    }
  }

  return ids;
}

/** @param {string} storageKey */
export async function deleteWork(storageKey) {
  await ensureOverlayMigrated();
  const db = await getOverlayDb();

  const imgs = await getAll(store(db, STORES.WORK_IMAGES));
  const refKeys = imgs.filter((img) => img.storageKey === storageKey).map((img) => img.refKey);
  if (refKeys.length) {
    await deleteMany(store(db, STORES.WORK_IMAGES, 'readwrite'), refKeys);
  }

  await deleteOne(store(db, STORES.WORKS, 'readwrite'), storageKey);

  const index = (await getWorksIndex()).filter((e) => e.key !== storageKey);
  await setWorksIndex(index);
  broadcastOverlayChange([storageKey]);
}

/** @param {string[]} refKeys */
export async function deleteWorkImages(refKeys) {
  await ensureOverlayMigrated();
  const db = await getOverlayDb();
  const keys = refKeys.filter(Boolean);
  if (keys.length) {
    await deleteMany(store(db, STORES.WORK_IMAGES, 'readwrite'), keys);
  }
  broadcastOverlayChange(refKeys);
}

/** Clear overlay works + images (not likes). */
export async function clearOverlayData() {
  const db = await getOverlayDb();
  await clearStore(store(db, STORES.WORKS, 'readwrite'));
  await clearStore(store(db, STORES.WORK_IMAGES, 'readwrite'));
  await deleteOne(store(db, STORES.APP_META, 'readwrite'), META_WORKS_INDEX);
  await putOne(store(db, STORES.APP_META, 'readwrite'), {
    id: META_OVERLAY_MIGRATED,
    done: true,
    migratedAt: Date.now(),
  });
  broadcastOverlayChange(['*']);
}

/** Rough byte estimate for dashboard badge. */
export async function estimateOverlayBytes() {
  const snap = await getWorksSnapshot();
  return JSON.stringify(snap).length;
}
