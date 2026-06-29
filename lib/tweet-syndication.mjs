
/**
 * Resolve tweet media URLs without paid X API.
 * Tries syndication first, then api.fxtwitter.com for tombstoned / sensitive posts.
 */

/** @param {string} tweetId */
export function syndicationToken(tweetId) {
  return ((Number(tweetId) / 1e15) * Math.PI)
    .toString(36)
    .replace(/(0+|\.)/g, '');
}

const SYNDICATION_FEATURES =
  'interactive_text_enabled:true;responsive_web_edit_tweet_api_enabled:true;' +
  'responsive_web_enhance_cards_enabled:false;responsive_web_text_conversations_enabled:true;' +
  'longform_notetweets_inline_media_enabled:true';

async function fetchViaSyndication(tweetId) {
  const url = new URL('https://cdn.syndication.twimg.com/tweet-result');
  url.searchParams.set('id', tweetId);
  url.searchParams.set('token', syndicationToken(tweetId));
  url.searchParams.set('lang', 'en');
  url.searchParams.set('features', SYNDICATION_FEATURES);

  const res = await fetch(url.toString());
  if (!res.ok) return null;

  const data = await res.json();
  if (!data || data.__typename === 'TweetTombstone' || data.tombstone) return null;

  if (data.photos?.length) {
    const urls = data.photos.map((p) => p.url).filter(Boolean);
    if (urls.length) return { mediaUrl: urls[0], mediaUrls: urls, mediaType: 'photo' };
  }

  if (data.mediaDetails?.length) {
    const urls = [];
    let mediaType = 'photo';
    for (const m of data.mediaDetails) {
      if (m.type === 'photo' && m.media_url_https) urls.push(m.media_url_https);
      else if ((m.type === 'video' || m.type === 'animated_gif') && m.media_url_https) {
        urls.push(m.media_url_https);
        mediaType = m.type === 'animated_gif' ? 'gif' : 'video';
      }
    }
    if (urls.length) return { mediaUrl: urls[0], mediaUrls: urls, mediaType };
  }

  if (data.video) {
    const poster = data.video.poster || data.video.variants?.find((v) => v.content_type === 'image/jpeg')?.url;
    if (poster) return { mediaUrl: poster, mediaUrls: [poster], mediaType: 'video' };
  }

  return null;
}

async function fetchViaFxTwitter(tweetId) {
  const res = await fetch(`https://api.fxtwitter.com/status/${tweetId}`, {
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) return null;

  const data = await res.json();
  if (!data || data.code !== 200 || !data.tweet) return null;

  const media = data.tweet.media;
  if (!media) return null;

  const urls = [];
  let mediaType = 'photo';

  if (media.photos?.length) {
    for (const p of media.photos) {
      if (p.url) urls.push(p.url);
    }
  }

  if (media.videos?.length) {
    for (const v of media.videos) {
      const thumb = v.thumbnail_url;
      if (thumb) {
        urls.push(thumb);
        if (v.type === 'gif' || v.type === 'animated_gif') mediaType = 'gif';
        else mediaType = 'video';
      }
    }
  }

  if (media.all?.length && urls.length === 0) {
    for (const m of media.all) {
      if (m.type === 'photo' && m.url) urls.push(m.url);
      else if ((m.type === 'video' || m.type === 'animated_gif') && m.thumbnail_url) {
        urls.push(m.thumbnail_url);
        mediaType = m.type === 'animated_gif' ? 'gif' : 'video';
      }
    }
  }

  if (urls.length) return { mediaUrl: urls[0], mediaUrls: urls, mediaType };
  return null;
}

/** @param {string} tweetId */
export async function resolveTweetMedia(tweetId) {
  const syndication = await fetchViaSyndication(tweetId);
  if (syndication) return syndication;
  return fetchViaFxTwitter(tweetId);
}
