// Chrome storage operations

import { INDEX_KEY, QUOTA_KEY, removeIndexKey, upsertIndexRow } from './storageMeta.js';

export function getAllData() {
    return new Promise((resolve) => {
        chrome.storage.local.get(null, (items) => {
            resolve(items);
        });
    });
}

export function getStorageBytes() {
    return new Promise((resolve) => {
        chrome.storage.local.getBytesInUse(null, (bytes) => {
            resolve(bytes);
        });
    });
}

export function removeStorageKey(key) {
    return new Promise((resolve) => {
        chrome.storage.local.get([INDEX_KEY], (r) => {
            const index = removeIndexKey(r[INDEX_KEY], key);
            chrome.storage.local.remove([key], () => {
                chrome.storage.local.set({ [INDEX_KEY]: index }, () => resolve());
            });
        });
    });
}

export function removeStorageKeys(keys) {
    return new Promise((resolve) => {
        chrome.storage.local.remove(keys, () => {
            resolve();
        });
    });
}

export function setStorageData(data) {
    return new Promise((resolve) => {
        chrome.storage.local.set(data, () => {
            resolve();
        });
    });
}

/** Persists a work entry and keeps `_index` in sync (dashboard edits). */
export function saveWorkEntryWithIndex(storageKey, workEntry) {
    return new Promise((resolve) => {
        chrome.storage.local.get([INDEX_KEY], (r) => {
            const index = upsertIndexRow(r[INDEX_KEY], storageKey, workEntry);
            chrome.storage.local.set({ [storageKey]: workEntry, [INDEX_KEY]: index }, () => resolve());
        });
    });
}

export function clearAllStorage() {
    return new Promise((resolve) => {
        chrome.storage.local.clear(() => {
            resolve();
        });
    });
}

export function getOcrQuota() {
    return new Promise((resolve) => {
        chrome.storage.local.get([QUOTA_KEY, 'ocr_quota'], (result) => {
            const currentMonth = new Date().toISOString().slice(0, 7);
            const data = result[QUOTA_KEY] || result.ocr_quota || { count: 0, month: currentMonth };
            let count = data.count;
            if (data.month !== currentMonth) count = 0;
            resolve(count);
        });
    });
}

export function updateBoxNoteInStorage(storageKey, imageSelector, boxIndex, newText, allData) {
    const workEntry = allData[storageKey];
    if (workEntry && workEntry.images && workEntry.images[imageSelector]) {
        const imageData = workEntry.images[imageSelector];
        if (imageData.boxes && imageData.boxes[boxIndex]) {
            imageData.boxes[boxIndex].note = newText;
            workEntry.metadata.lastUpdated = Date.now();
            const update = {};
            update[storageKey] = workEntry;
            return new Promise((resolve) => {
                chrome.storage.local.get([INDEX_KEY], (r) => {
                    const index = upsertIndexRow(r[INDEX_KEY], storageKey, workEntry);
                    update[INDEX_KEY] = index;
                    setStorageData(update).then(() => {
                        allData[storageKey] = workEntry;
                        resolve();
                    });
                });
            });
        }
    }
    return Promise.resolve();
}

export function updateNoteInStorage(url, index, newText, allData) {
    // Legacy function for backward compatibility
    const notes = allData[url];
    if (notes && notes[index]) {
        notes[index].note = newText;
        const update = {};
        update[url] = notes;
        return setStorageData(update);
    }
    return Promise.resolve();
}

// Debug function to inspect storage
export function inspectStorage() {
    return new Promise((resolve) => {
        chrome.storage.local.get(null, (items) => {
            console.log('Storage contents:', items);
            console.log('Storage keys:', Object.keys(items));
            const size = JSON.stringify(items).length;
            console.log('Storage size (JSON):', size, 'bytes');
            resolve(items);
        });
    });
}
