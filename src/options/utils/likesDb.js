/**
 * Options-page facade over IndexedDB likes API.
 */

export {
  getDb,
  getLikesMeta,
  hasImportedLikes,
  importLikes,
  exportLikesLibrary,
  getAllLikes,
  countLikes,
  getLike,
  updateLike,
  deleteLike,
  deleteLikes,
  getThumbsMap,
  getAllThumbsMap,
  putThumbsBatch,
  getThumbsNeedingResolve,
  clearAllLikesData,
} from '../../../lib/likes-db.mjs';

/**
 * @param {string[]} tweetIds
 * @returns {Promise<Record<string, unknown>>}
 */
export function requestThumbResolve(tweetIds) {
  if (!tweetIds?.length) return Promise.resolve({});
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ action: 'RESOLVE_TWEET_MEDIA', tweetIds }, (response) => {
      if (chrome.runtime.lastError) {
        console.warn('Thumb resolve failed:', chrome.runtime.lastError.message);
        resolve({});
        return;
      }
      resolve(response?.cache || {});
    });
  });
}
