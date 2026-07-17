/** Link X/Twitter likes (tweetId) ↔ overlay works (work:x:{tweetId}). */

const X_WORK_PREFIX = 'work:x:';

/** @param {string} tweetId */
export function xWorkKeyForTweet(tweetId) {
  return `${X_WORK_PREFIX}${tweetId}`;
}

/** @param {string} storageKey */
export function tweetIdFromXWorkKey(storageKey) {
  if (!storageKey?.startsWith(X_WORK_PREFIX)) return null;
  const id = storageKey.slice(X_WORK_PREFIX.length);
  return id || null;
}

/**
 * @param {object | null | undefined} workEntry
 * @returns {number}
 */
export function countBoxesInWorkEntry(workEntry) {
  if (!workEntry || typeof workEntry !== 'object') return 0;
  if (Array.isArray(workEntry.legacyFlatBoxes)) {
    return workEntry.legacyFlatBoxes.length;
  }
  let total = 0;
  for (const img of Object.values(workEntry.images || {})) {
    if (!img || typeof img !== 'object') continue;
    total += img.boxCount ?? (Array.isArray(img.boxes) ? img.boxes.length : 0);
  }
  return total;
}
