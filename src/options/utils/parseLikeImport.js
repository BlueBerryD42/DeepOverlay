// Parse like.js archives or DeepOverlay / Tampermonkey JSON sync files

import { parseLikeArchive } from './parseLikeArchive.js';

/** @readonly */
export const LIKES_EXPORT_FORMAT = 'deepoverlay-likes-v1';

/**
 * @param {unknown} raw
 * @returns {Array<{ tweetId: string; text: string; fullText: string; tcoLinks: string[]; postUrl: string }>}
 */
export function normalizeLikeEntries(raw) {
  const list = Array.isArray(raw) ? raw : raw?.entries;
  if (!Array.isArray(list)) return [];

  return list
    .map((entry) => {
      const like = entry?.like || entry;
      const tweetId = String(like?.tweetId || '');
      if (!tweetId) return null;

      let fullText = like.fullText || like.text || '';
      const tcoLinks =
        Array.isArray(like.tcoLinks) && like.tcoLinks.length
          ? like.tcoLinks
          : [...String(fullText).matchAll(/https:\/\/t\.co\/\S+/g)].map((m) => m[0]);

      const text =
        like.text ||
        String(fullText)
          .replace(/https:\/\/t\.co\/\S+/g, '')
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&quot;/g, '"')
          .trim();

      const postUrl =
        like.postUrl || like.expandedUrl || `https://x.com/i/status/${tweetId}`;

      return { tweetId, text, fullText: fullText || text, tcoLinks, postUrl };
    })
    .filter(Boolean);
}

/**
 * @param {string} text
 * @param {string} [filename]
 */
export function parseLikeImport(text, filename = '') {
  const trimmed = text.trim();
  const isJson =
    filename.toLowerCase().endsWith('.json') ||
    trimmed.startsWith('{') ||
    trimmed.startsWith('[');

  if (isJson) {
    const data = JSON.parse(trimmed);
    return normalizeLikeEntries(data);
  }

  return parseLikeArchive(text);
}

/**
 * @param {unknown} data
 */
export function isSyncExportFormat(data) {
  return (
    data &&
    typeof data === 'object' &&
    data.format === LIKES_EXPORT_FORMAT &&
    Array.isArray(data.entries)
  );
}
