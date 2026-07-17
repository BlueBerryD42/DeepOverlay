// Likes gallery rendering — filter, pagination, masonry, lightbox

import { createLikeCard, updateLikeCardThumb } from '../components/LikeCard.js';
import { renderPaginationBar } from './paginationBar.js';

export const LIKES_PAGE_SIZE = 48;

/** Match .do-likes-grid column-count breakpoints in options.css */
export function getLikesColumnCount(width = typeof window !== 'undefined' ? window.innerWidth : 1400) {
  if (width <= 600) return 1;
  if (width <= 1100) return 2;
  if (width <= 1400) return 3;
  return 4;
}

/**
 * Reorder items for CSS column layout so visual reading is left-to-right, top-to-bottom.
 * @template T
 * @param {T[]} items — newest-first
 * @param {number} colCount
 * @returns {T[]}
 */
export function orderForColumnLayout(items, colCount) {
  const n = items.length;
  if (n <= 1 || colCount <= 1) return items;

  const numRows = Math.ceil(n / colCount);
  const columns = Array.from({ length: colCount }, () => []);
  for (let col = 0; col < colCount; col++) {
    for (let row = 0; row < numRows; row++) {
      const idx = row * colCount + col;
      if (idx < n) columns[col].push(items[idx]);
    }
  }
  return columns.flat();
}

/** @typedef {'all' | 'video' | 'image' | 'single' | 'multiple' | 'with-overlay' | 'no-overlay'} LikesFilter */

/**
 * @param {{ mediaUrl?: string; mediaUrls?: string[]; mediaType?: string; resolvedAt?: number }} thumb
 */
function photoCount(thumb) {
  if (thumb.mediaUrls?.length) return thumb.mediaUrls.length;
  if (thumb.mediaUrl && thumb.mediaType === 'photo') return 1;
  return 0;
}

/**
 * @param {{ mediaType?: string; mediaUrl?: string }} thumb
 */
function isVideoLike(thumb) {
  return thumb.mediaType === 'video' || thumb.mediaType === 'gif';
}

/**
 * @param {{ mediaType?: string; mediaUrl?: string }} thumb
 */
function isPhotoLike(thumb) {
  return thumb.mediaType === 'photo' && !!thumb.mediaUrl;
}

/**
 * @param {LikesFilter} filter
 * @param {{ mediaUrl?: string; mediaUrls?: string[]; mediaType?: string; resolvedAt?: number }} thumb
 * @param {string} tweetId
 * @param {Set<string>} overlayTweetIds
 */
function matchesLikesFilter(filter, thumb, tweetId, overlayTweetIds) {
  if (filter === 'with-overlay') return overlayTweetIds.has(tweetId);
  if (filter === 'no-overlay') return !overlayTweetIds.has(tweetId);
  if (filter === 'all') return true;
  if (!thumb?.resolvedAt) return false;

  if (filter === 'video') return isVideoLike(thumb);
  if (filter === 'image') return isPhotoLike(thumb);
  if (filter === 'single') return isPhotoLike(thumb) && photoCount(thumb) === 1;
  if (filter === 'multiple') return isPhotoLike(thumb) && photoCount(thumb) > 1;

  return true;
}

/**
 * @param {Array<{ tweetId: string; text: string; postUrl: string }>} likes
 * @param {string} query
 * @param {LikesFilter} filter
 * @param {Record<string, { mediaUrl?: string; mediaUrls?: string[]; mediaType?: string; resolvedAt?: number }>} thumbCache
 * @param {Set<string>} [overlayTweetIds]
 */
export function filterLikes(likes, query, filter, thumbCache, overlayTweetIds = new Set()) {
  const q = query.trim().toLowerCase();
  return likes.filter((like) => {
    if (filter !== 'all') {
      const thumb = thumbCache[like.tweetId];
      if (!matchesLikesFilter(filter, thumb || {}, like.tweetId, overlayTweetIds)) return false;
    }
    if (!q) return true;
    return (
      like.text.toLowerCase().includes(q) ||
      like.tweetId.includes(q) ||
      like.postUrl.toLowerCase().includes(q)
    );
  });
}

function ensureLightbox(container) {
  let lb = container.querySelector('.do-likes-lightbox');
  if (lb) return lb;

  lb = document.createElement('div');
  lb.className = 'do-likes-lightbox';
  lb.hidden = true;
  lb.innerHTML = `
    <button type="button" class="do-likes-lightbox-close" aria-label="Close">✕</button>
    <button type="button" class="do-likes-lightbox-prev" aria-label="Previous">‹</button>
    <img class="do-likes-lightbox-img" alt="" />
    <button type="button" class="do-likes-lightbox-next" aria-label="Next">›</button>
    <span class="do-likes-lightbox-counter"></span>
  `;
  container.appendChild(lb);

  const img = lb.querySelector('.do-likes-lightbox-img');
  const counter = lb.querySelector('.do-likes-lightbox-counter');
  const state = { urls: [], index: 0 };

  function show() {
    if (!state.urls.length) return;
    img.src = state.urls[state.index];
    counter.textContent = `${state.index + 1} / ${state.urls.length}`;
    lb.hidden = false;
    document.body.classList.add('do-likes-lightbox-open');
  }

  function hide() {
    lb.hidden = true;
    img.src = '';
    document.body.classList.remove('do-likes-lightbox-open');
  }

  lb.querySelector('.do-likes-lightbox-close').onclick = hide;
  lb.querySelector('.do-likes-lightbox-prev').onclick = () => {
    if (state.urls.length < 2) return;
    state.index = (state.index - 1 + state.urls.length) % state.urls.length;
    show();
  };
  lb.querySelector('.do-likes-lightbox-next').onclick = () => {
    if (state.urls.length < 2) return;
    state.index = (state.index + 1) % state.urls.length;
    show();
  };
  lb.addEventListener('click', (e) => {
    if (e.target === lb) hide();
  });

  document.addEventListener('keydown', (e) => {
    if (lb.hidden) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      hide();
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      e.stopPropagation();
      lb.querySelector('.do-likes-lightbox-prev').click();
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      e.stopPropagation();
      lb.querySelector('.do-likes-lightbox-next').click();
    }
  });

  lb._open = (urls, index = 0) => {
    state.urls = urls;
    state.index = index;
    show();
  };

  return lb;
}

/**
 * @param {object} opts
 * @param {Array} opts.likes
 * @param {string} opts.query
 * @param {LikesFilter} [opts.filter]
 * @param {Record<string, unknown>} opts.thumbCache
 * @param {Set<string>} [opts.overlayTweetIds]
 * @param {number} opts.page
 * @param {HTMLElement} opts.gridEl
 * @param {HTMLElement | null} opts.paginationEl
 * @param {HTMLElement | null} opts.lightboxEl
 * @param {(p: number) => void} opts.onPageChange
 * @param {(tweetId: string) => void} [opts.onDelete]
 * @param {Set<string>} [opts.selectedTweetIds]
 * @param {(tweetId: string, selected: boolean) => void} [opts.onSelectToggle]
 * @returns {{ filtered: Array; totalPages: number; currentPage: number; pageItems: Array }}
 */
export function renderLikes(opts) {
  const {
    likes,
    query = '',
    filter = 'all',
    thumbCache = {},
    overlayTweetIds = new Set(),
    page = 1,
    gridEl,
    paginationEl,
    lightboxEl,
    onPageChange,
    onDelete,
    selectedTweetIds,
    onSelectToggle,
  } = opts;

  const filtered = filterLikes(likes, query, filter, thumbCache, overlayTweetIds);
  const totalItems = filtered.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / LIKES_PAGE_SIZE));
  const currentPage = Math.min(Math.max(1, page), totalPages);
  const start = (currentPage - 1) * LIKES_PAGE_SIZE;
  const pageItems = filtered.slice(start, start + LIKES_PAGE_SIZE);

  if (!gridEl) {
    return { filtered, totalPages, currentPage, pageItems };
  }

  gridEl.innerHTML = '';
  gridEl.className = 'do-likes-grid';

  if (totalItems === 0) {
    gridEl.innerHTML = `<div class="empty-state">${query || filter !== 'all' ? 'No likes match your filters.' : 'No likes loaded.'}</div>`;
  } else {
    const lightbox = ensureLightbox(lightboxEl || gridEl.parentElement);
    const openLightbox = (urls, index) => lightbox._open(urls, index);
    const colCount = getLikesColumnCount();
    const displayItems = orderForColumnLayout(pageItems, colCount);

    for (const like of displayItems) {
      const thumb = thumbCache[like.tweetId];
      const hasOverlay = overlayTweetIds.has(like.tweetId);
      gridEl.appendChild(
        createLikeCard(like, thumb, {
          onOpenLightbox: openLightbox,
          onDelete,
          hasOverlay,
          selectedTweetIds,
          onSelectToggle,
        })
      );
    }
  }

  renderPaginationBar(paginationEl, {
    page: currentPage,
    totalPages,
    totalItems,
    pageSize: LIKES_PAGE_SIZE,
    onPageChange,
    ariaLabel: 'Likes pages',
  });

  return { filtered, totalPages, currentPage, pageItems };
}

/**
 * Refresh thumbs on visible cards without full re-render.
 * @param {HTMLElement} gridEl
 * @param {Array} pageItems
 * @param {Record<string, unknown>} thumbCache
 * @param {HTMLElement | null} lightboxEl
 */
export function refreshLikeCardThumbs(gridEl, pageItems, thumbCache, lightboxEl, cardOpts = {}) {
  if (!gridEl) return;
  const lightbox = ensureLightbox(lightboxEl || gridEl.parentElement);
  const openLightbox = (urls, index) => lightbox._open(urls, index);
  const opts = { onOpenLightbox: openLightbox, ...cardOpts };

  for (const like of pageItems) {
    const card = gridEl.querySelector(`[data-tweet-id="${like.tweetId}"]`);
    if (!card) continue;
    const thumb = thumbCache[like.tweetId];
    if (!thumb?.resolvedAt && !cardOpts.overlayTweetIds?.has(like.tweetId)) continue;
    const opts = {
      onOpenLightbox: openLightbox,
      onDelete: cardOpts.onDelete,
      hasOverlay: cardOpts.overlayTweetIds?.has(like.tweetId) ?? !!cardOpts.hasOverlay,
      selectedTweetIds: cardOpts.selectedTweetIds,
      onSelectToggle: cardOpts.onSelectToggle,
    };
    updateLikeCardThumb(card, like, thumb, opts);
  }
}
