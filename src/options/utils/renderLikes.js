// Likes gallery rendering — filter, pagination, masonry, lightbox

import { createLikeCard, updateLikeCardThumb } from '../components/LikeCard.js';

export const LIKES_PAGE_SIZE = 48;

/**
 * @param {Array<{ tweetId: string; text: string; postUrl: string }>} likes
 * @param {string} query
 * @param {boolean} mediaOnly
 * @param {Record<string, { mediaUrl?: string; mediaType?: string }>} thumbCache
 */
export function filterLikes(likes, query, mediaOnly, thumbCache) {
  const q = query.trim().toLowerCase();
  return likes.filter((like) => {
    if (mediaOnly) {
      const thumb = thumbCache[like.tweetId];
      if (!thumb?.resolvedAt) return true;
      if (thumb.mediaType === 'none' || !thumb.mediaUrl) return false;
    }
    if (!q) return true;
    return (
      like.text.toLowerCase().includes(q) ||
      like.tweetId.includes(q) ||
      like.postUrl.toLowerCase().includes(q)
    );
  });
}

function renderPaginationBar(el, { page, totalPages, totalItems, pageSize, onPageChange }) {
  if (!el || !onPageChange) return;
  if (totalPages <= 1) {
    el.innerHTML = '';
    el.hidden = true;
    return;
  }
  el.hidden = false;
  el.innerHTML = '';
  el.className = 'do-pagination';
  el.setAttribute('role', 'navigation');
  el.setAttribute('aria-label', 'Likes pages');

  const prev = document.createElement('button');
  prev.type = 'button';
  prev.className = 'do-btn';
  prev.textContent = '← Prev';
  prev.disabled = page <= 1;
  prev.onclick = () => onPageChange(page - 1);

  const info = document.createElement('span');
  info.className = 'do-pagination-info';
  const start = (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, totalItems);
  info.textContent = `Page ${page} / ${totalPages} · ${start}–${end} of ${totalItems}`;

  const next = document.createElement('button');
  next.type = 'button';
  next.className = 'do-btn';
  next.textContent = 'Next →';
  next.disabled = page >= totalPages;
  next.onclick = () => onPageChange(page + 1);

  el.appendChild(prev);
  el.appendChild(info);
  el.appendChild(next);
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
    if (e.key === 'Escape') hide();
    else if (e.key === 'ArrowLeft') lb.querySelector('.do-likes-lightbox-prev').click();
    else if (e.key === 'ArrowRight') lb.querySelector('.do-likes-lightbox-next').click();
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
 * @param {boolean} opts.mediaOnly
 * @param {Record<string, unknown>} opts.thumbCache
 * @param {number} opts.page
 * @param {HTMLElement} opts.gridEl
 * @param {HTMLElement | null} opts.paginationEl
 * @param {HTMLElement | null} opts.lightboxEl
 * @param {(p: number) => void} opts.onPageChange
 * @param {(tweetId: string) => void} [opts.onHide]
 * @param {(tweetId: string) => void} [opts.onDelete]
 * @returns {{ filtered: Array; totalPages: number; currentPage: number; pageItems: Array }}
 */
export function renderLikes(opts) {
  const {
    likes,
    query = '',
    mediaOnly = false,
    thumbCache = {},
    page = 1,
    gridEl,
    paginationEl,
    lightboxEl,
    onPageChange,
    onHide,
    onDelete,
  } = opts;

  const filtered = filterLikes(likes, query, mediaOnly, thumbCache);
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
    gridEl.innerHTML = `<div class="empty-state">${query || mediaOnly ? 'No likes match your filters.' : 'No likes loaded.'}</div>`;
  } else {
    const lightbox = ensureLightbox(lightboxEl || gridEl.parentElement);
    const openLightbox = (urls, index) => lightbox._open(urls, index);

    for (const like of pageItems) {
      const thumb = thumbCache[like.tweetId];
      gridEl.appendChild(createLikeCard(like, thumb, { onOpenLightbox: openLightbox, onHide, onDelete }));
    }
  }

  renderPaginationBar(paginationEl, {
    page: currentPage,
    totalPages,
    totalItems,
    pageSize: LIKES_PAGE_SIZE,
    onPageChange,
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
    if (!thumb?.resolvedAt) continue;
    updateLikeCardThumb(card, like, thumb, opts);
  }
}
