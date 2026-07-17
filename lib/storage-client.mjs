/**
 * Content-script storage API (bundled → storage-client.js / DeepOverlayStorage).
 * Routes all overlay IndexedDB access through the background service worker so
 * reads/writes use the extension origin (options + background share one DB).
 */

import { subscribeOverlayChanges } from './storage-broadcast.mjs';

/**
 * @param {string} action
 * @param {Record<string, unknown>} [data]
 */
function send(action, data = {}) {
  return new Promise((resolve, reject) => {
    if (!chrome.runtime?.id) {
      reject(new Error('Extension context invalidated — reload the page'));
      return;
    }
    chrome.runtime.sendMessage({ action, ...data }, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      if (response?.error) {
        reject(new Error(response.error));
        return;
      }
      resolve(response?.result ?? response);
    });
  });
}

export async function ensureReady() {
  await send('OVERLAY_ENSURE_READY');
}

/** @param {string} storageKey */
export async function getWorkEntry(storageKey) {
  return send('OVERLAY_GET_WORK', { storageKey });
}

/** @param {string[]} refKeys */
export async function getWorkImages(refKeys) {
  return send('OVERLAY_GET_IMAGES', { refKeys });
}

/** @param {{ storageKey: string, workEntry: object, workImgUpdates?: Record<string, object> }} payload */
export async function saveOverlay(payload) {
  await send('OVERLAY_SAVE', { payload });
}

/** @param {string} storageKey */
export async function deleteOverlay(storageKey) {
  await send('OVERLAY_DELETE', { storageKey });
}

export function onOverlayChanged(callback) {
  return subscribeOverlayChanges(() => callback());
}
