// Overlay + settings storage (works in IndexedDB; settings in chrome.storage)

import { INDEX_KEY } from './storageMeta.js';
import {
  ensureOverlayMigrated,
  getWorksSnapshot,
  getWorkImage,
  saveWorkImage,
  saveWorkWithIndex,
  deleteWork,
  deleteWorkImages,
  clearOverlayData,
  estimateOverlayBytes,
} from '../../../lib/overlay-db.mjs';

export async function getAllData() {
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

export async function getStorageBytes() {
  const [chromeBytes, overlayBytes] = await Promise.all([
    new Promise((resolve) => {
      chrome.storage.local.getBytesInUse(null, (bytes) => resolve(bytes || 0));
    }),
    estimateOverlayBytes(),
  ]);
  return chromeBytes + overlayBytes;
}

export async function removeStorageKey(key) {
  if (key.startsWith('work:')) {
    await deleteWork(key);
    return;
  }
  return new Promise((resolve) => {
    chrome.storage.local.remove([key], () => resolve());
  });
}

export function removeStorageKeys(keys) {
  const workKeys = keys.filter((k) => k.startsWith('work:'));
  const imgKeys = keys.filter((k) => k.startsWith('workimg:'));
  const other = keys.filter((k) => !k.startsWith('work:') && !k.startsWith('workimg:'));

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

export function getStorageData(keys) {
  return getAllData().then((all) => {
    const out = {};
    for (const k of keys) {
      if (all[k] !== undefined) out[k] = all[k];
    }
    return out;
  });
}

export function getWorkImgRecord(refKey) {
  if (!refKey) return Promise.resolve(null);
  return getWorkImage(refKey);
}

export function saveWorkImgRecord(refKey, record) {
  if (!refKey) return Promise.resolve();
  return saveWorkImage(refKey, record);
}

export function setStorageData(data) {
  const overlay = {};
  const chrome = {};
  for (const [k, v] of Object.entries(data)) {
    if (k.startsWith('work:') || k === INDEX_KEY) overlay[k] = v;
    else chrome[k] = v;
  }
  const tasks = [];
  if (Object.keys(chrome).length) {
    tasks.push(
      new Promise((resolve) => {
        chrome.storage.local.set(chrome, () => resolve());
      })
    );
  }
  for (const [k, v] of Object.entries(overlay)) {
    if (k.startsWith('work:')) tasks.push(saveWorkWithIndex(k, v));
  }
  return Promise.all(tasks);
}

export function saveWorkEntryWithIndex(storageKey, workEntry) {
  return saveWorkWithIndex(storageKey, workEntry);
}

export async function clearAllStorage() {
  await clearOverlayData();
  return new Promise((resolve) => {
    chrome.storage.local.clear(() => resolve());
  });
}

export function updateBoxNoteInStorage(storageKey, imageSelector, boxIndex, newText, allData) {
  const workEntry = allData[storageKey];
  const meta = workEntry?.images?.[imageSelector];
  const refKey = meta?.refKey;

  if (refKey) {
    return getWorkImgRecord(refKey).then((imgRec) => {
      if (!imgRec?.boxes?.[boxIndex]) return;
      imgRec.boxes[boxIndex].note = newText;
      return saveWorkImgRecord(refKey, imgRec).then(() => {
        const notes = (imgRec.boxes || [])
          .map((b) => (b.note || '').trim())
          .filter(Boolean)
          .join('\n');
        const notePreview = notes.length > 180 ? `${notes.slice(0, 180)}…` : notes;

        meta.boxCount = imgRec.boxes?.length || 0;
        meta.notePreview = notePreview;
        workEntry.metadata.lastUpdated = Date.now();

        return saveWorkEntryWithIndex(storageKey, workEntry).then(() => {
          allData[storageKey] = workEntry;
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
        allData[storageKey] = workEntry;
      });
    }
  }
  return Promise.resolve();
}

export function updateNoteInStorage(url, index, newText, allData) {
  const notes = allData[url];
  if (notes && notes[index]) {
    notes[index].note = newText;
    return setStorageData({ [url]: notes });
  }
  return Promise.resolve();
}

export function inspectStorage() {
  return getAllData().then((items) => {
    console.log('Storage contents:', items);
    console.log('Storage keys:', Object.keys(items));
    console.log('Storage size (JSON):', JSON.stringify(items).length, 'bytes');
    return items;
  });
}
