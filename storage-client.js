var DeepOverlayStorage = (() => {
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

  // lib/storage-client.mjs
  var storage_client_exports = {};
  __export(storage_client_exports, {
    deleteOverlay: () => deleteOverlay,
    ensureReady: () => ensureReady,
    getWorkEntry: () => getWorkEntry,
    getWorkImages: () => getWorkImages,
    onOverlayChanged: () => onOverlayChanged,
    saveOverlay: () => saveOverlay
  });

  // lib/storage-broadcast.mjs
  var OVERLAY_BC = "deepoverlay-overlay-storage";
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

  // lib/storage-client.mjs
  function send(action, data = {}) {
    return new Promise((resolve, reject) => {
      if (!chrome.runtime?.id) {
        reject(new Error("Extension context invalidated \u2014 reload the page"));
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
  async function ensureReady() {
    await send("OVERLAY_ENSURE_READY");
  }
  async function getWorkEntry(storageKey) {
    return send("OVERLAY_GET_WORK", { storageKey });
  }
  async function getWorkImages(refKeys) {
    return send("OVERLAY_GET_IMAGES", { refKeys });
  }
  async function saveOverlay(payload) {
    await send("OVERLAY_SAVE", { payload });
  }
  async function deleteOverlay(storageKey) {
    await send("OVERLAY_DELETE", { storageKey });
  }
  function onOverlayChanged(callback) {
    return subscribeOverlayChanges(() => callback());
  }
  return __toCommonJS(storage_client_exports);
})();
