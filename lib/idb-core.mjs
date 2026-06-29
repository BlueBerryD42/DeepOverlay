/** @readonly */
export const DB_NAME = 'deepoverlay';
/** @readonly */
export const DB_VERSION = 1;

/** @readonly */
export const STORES = {
  LIKES_META: 'likes_meta',
  LIKES: 'likes',
  LIKE_THUMBS: 'like_thumbs',
};

/**
 * @returns {Promise<IDBDatabase>}
 */
export function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB open failed'));
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORES.LIKES_META)) {
        db.createObjectStore(STORES.LIKES_META, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORES.LIKES)) {
        const likes = db.createObjectStore(STORES.LIKES, { keyPath: 'tweetId' });
        likes.createIndex('sortOrder', 'sortOrder', { unique: false });
        likes.createIndex('hidden', 'hidden', { unique: false });
      }
      if (!db.objectStoreNames.contains(STORES.LIKE_THUMBS)) {
        db.createObjectStore(STORES.LIKE_THUMBS, { keyPath: 'tweetId' });
      }
    };
  });
}

/**
 * @param {IDBDatabase} db
 * @param {string} storeName
 * @param {IDBTransactionMode} mode
 */
export function store(db, storeName, mode = 'readonly') {
  return db.transaction(storeName, mode).objectStore(storeName);
}

/**
 * @param {IDBObjectStore} os
 * @param {IDBValidKey} key
 */
export function getOne(os, key) {
  return new Promise((resolve, reject) => {
    const req = os.get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/**
 * @param {IDBObjectStore} os
 */
export function getAll(os) {
  return new Promise((resolve, reject) => {
    const req = os.getAll();
    req.onsuccess = () => resolve(req.result ?? []);
    req.onerror = () => reject(req.error);
  });
}

/**
 * @param {IDBObjectStore} os
 * @param {unknown} value
 */
export function putOne(os, value) {
  return new Promise((resolve, reject) => {
    const req = os.put(value);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

/**
 * @param {IDBObjectStore} os
 * @param {IDBValidKey} key
 */
export function deleteOne(os, key) {
  return new Promise((resolve, reject) => {
    const req = os.delete(key);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

/**
 * @param {IDBObjectStore} os
 */
export function clearStore(os) {
  return new Promise((resolve, reject) => {
    const req = os.clear();
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

/**
 * @param {IDBDatabase} db
 * @param {string} storeName
 * @param {() => void | Promise<void>} fn
 * @param {IDBTransactionMode} mode
 */
export async function withStore(db, storeName, fn, mode = 'readonly') {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, mode);
    const os = tx.objectStore(storeName);
    Promise.resolve(fn(os))
      .then((result) => {
        tx.oncomplete = () => resolve(result);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error ?? new Error('transaction aborted'));
      })
      .catch(reject);
  });
}
