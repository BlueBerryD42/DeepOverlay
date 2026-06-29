// Parse X archive like.js (window.YTD.like.part0 = [...])

/**
 * @param {string} text
 * @returns {Array<{ tweetId: string; text: string; fullText: string; tcoLinks: string[]; postUrl: string }>}
 */
export function parseLikeArchive(text) {
  let jsonText = text.trim();
  const eq = jsonText.indexOf('=');
  if (eq !== -1) jsonText = jsonText.slice(eq + 1).trim();
  if (jsonText.endsWith(';')) jsonText = jsonText.slice(0, -1).trim();

  const raw = JSON.parse(jsonText);

  return raw
    .map((entry) => {
      const like = entry.like || entry;
      const tweetId = String(like.tweetId || '');
      const fullText = like.fullText || '';
      const tcoLinks = [...fullText.matchAll(/https:\/\/t\.co\/\S+/g)].map((m) => m[0]);
      const text = fullText
        .replace(/https:\/\/t\.co\/\S+/g, '')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .trim();
      const postUrl = like.expandedUrl || `https://x.com/i/status/${tweetId}`;
      return { tweetId, text, fullText, tcoLinks, postUrl };
    })
    .filter((e) => e.tweetId);
}

/** @returns {Promise<ReturnType<typeof parseLikeArchive>>} */
export async function fetchLikeArchive() {
  const url = chrome.runtime.getURL('data/like.js');
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load like archive (${res.status})`);
  const text = await res.text();
  return parseLikeArchive(text);
}
