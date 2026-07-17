/** @readonly */
export const OVERLAY_BC = 'deepoverlay-overlay-storage';

/** @param {string[]} keys */
export function broadcastOverlayChange(keys) {
  try {
    const ch = new BroadcastChannel(OVERLAY_BC);
    ch.postMessage({ type: 'overlay-updated', keys: keys || [] });
    ch.close();
  } catch {
    /* BroadcastChannel unavailable */
  }
}

/**
 * @param {(detail: { keys: string[] }) => void} handler
 * @returns {() => void} unsubscribe
 */
export function subscribeOverlayChanges(handler) {
  try {
    const ch = new BroadcastChannel(OVERLAY_BC);
    ch.onmessage = (e) => {
      if (e.data?.type === 'overlay-updated') handler(e.data);
    };
    return () => ch.close();
  } catch {
    return () => {};
  }
}
