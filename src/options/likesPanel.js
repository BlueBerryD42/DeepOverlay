// Likes panel — IndexedDB library (import once, CRUD after)

import { parseLikeArchive } from './utils/parseLikeArchive.js';
import {
  hasImportedLikes,
  getLikesMeta,
  importLikes,
  getAllLikes,
  getAllThumbsMap,
  hideLike,
  deleteLike,
  requestThumbResolve,
} from './utils/likesDb.js';
import { renderLikes, refreshLikeCardThumbs, LIKES_PAGE_SIZE } from './utils/renderLikes.js';

const RESOLVE_BATCH = 24;

/** @type {Array<{ tweetId: string; text: string; postUrl: string }> | null} */
let likesCache = null;
let thumbCache = {};
let likesPage = 1;
let resolveInFlight = false;
let panelLoaded = false;

/**
 * @returns {() => void} call when likes panel is shown
 */
export function initLikesPanel() {
  const gridEl = document.getElementById('likes-grid');
  const paginationEl = document.getElementById('likes-pagination');
  const lightboxEl = document.getElementById('likes-lightbox');
  const searchInput = document.getElementById('likes-search-input');
  const mediaOnlyEl = document.getElementById('likes-media-only');
  const progressEl = document.getElementById('likes-progress');
  const countEl = document.getElementById('likes-nav-count');
  const statusEl = document.getElementById('likes-status');
  const importBar = document.getElementById('likes-import-bar');
  const importBtn = document.getElementById('likes-import-btn');
  const bundledBtn = document.getElementById('likes-import-bundled-btn');
  const reimportBtn = document.getElementById('likes-reimport-btn');
  const fileInput = document.getElementById('likes-file-input');
  const mergeWrap = document.getElementById('likes-merge-wrap');
  const mergeEl = document.getElementById('likes-reimport-merge');

  if (!gridEl) return () => {};

  let mediaOnly = mediaOnlyEl?.checked ?? false;

  const cardOpts = () => ({
    onHide: handleHide,
    onDelete: handleDelete,
  });

  function updateNavCount(n) {
    if (countEl) countEl.textContent = String(n);
  }

  function updateImportUi(imported) {
    if (importBtn) importBtn.hidden = imported;
    if (bundledBtn) bundledBtn.hidden = imported;
    if (reimportBtn) reimportBtn.hidden = !imported;
    if (mergeWrap) mergeWrap.hidden = !imported;
  }

  function countResolved(cache) {
    return Object.values(cache).filter((e) => e?.resolvedAt).length;
  }

  function countWithMedia(cache) {
    return Object.values(cache).filter((e) => e?.mediaUrl && e.mediaType !== 'none').length;
  }

  function updateProgress() {
    if (!progressEl || !likesCache) return;
    const resolved = countResolved(thumbCache);
    const withMedia = countWithMedia(thumbCache);
    progressEl.textContent = `Thumbnails: ${resolved} / ${likesCache.length} resolved · ${withMedia} with media`;
  }

  async function reloadFromDb() {
    likesCache = await getAllLikes();
    thumbCache = await getAllThumbsMap();
    updateNavCount(likesCache.length);
    const meta = await getLikesMeta();
    if (statusEl) {
      const when = meta?.importedAt
        ? new Date(meta.importedAt).toLocaleDateString()
        : '—';
      statusEl.textContent = `${likesCache.length} likes in library · imported ${when}`;
    }
    updateImportUi(likesCache.length > 0);
  }

  function renderCurrent() {
    if (!likesCache) return;
    const opts = cardOpts();
    const r = renderLikes({
      likes: likesCache,
      query: searchInput?.value || '',
      mediaOnly,
      thumbCache,
      page: likesPage,
      gridEl,
      paginationEl,
      lightboxEl,
      onPageChange: (p) => {
        likesPage = p;
        renderCurrent();
        queueResolveForPage();
      },
      onHide: opts.onHide,
      onDelete: opts.onDelete,
    });
    likesPage = r.currentPage;
    updateProgress();
    return r;
  }

  async function resolveNextBatch() {
    if (!likesCache || resolveInFlight) return;
    const allPending = likesCache.map((l) => l.tweetId).filter((id) => !thumbCache[id]?.resolvedAt);
    if (allPending.length === 0) return;

    resolveInFlight = true;
    const batch = allPending.slice(0, RESOLVE_BATCH);
    try {
      const updated = await requestThumbResolve(batch);
      if (updated && Object.keys(updated).length) {
        thumbCache = { ...thumbCache, ...updated };
      }
    } finally {
      resolveInFlight = false;
      updateProgress();
      if (likesCache) {
        const { pageItems } = renderLikes({
          likes: likesCache,
          query: searchInput?.value || '',
          mediaOnly,
          thumbCache,
          page: likesPage,
          gridEl,
          paginationEl,
          lightboxEl,
          onPageChange: (p) => {
            likesPage = p;
            renderCurrent();
            queueResolveForPage();
          },
          ...cardOpts(),
        });
        refreshLikeCardThumbs(gridEl, pageItems, thumbCache, lightboxEl, cardOpts());
      }
      if (allPending.length > batch.length) {
        setTimeout(resolveNextBatch, 100);
      }
    }
  }

  function queueResolveForPage() {
    if (!likesCache) return;
    const { pageItems } = renderLikes({
      likes: likesCache,
      query: searchInput?.value || '',
      mediaOnly,
      thumbCache,
      page: likesPage,
      gridEl: null,
      paginationEl: null,
      lightboxEl: null,
      onPageChange: () => {},
    });
    const pending = pageItems.map((l) => l.tweetId).filter((id) => !thumbCache[id]?.resolvedAt);
    if (pending.length) {
      requestThumbResolve(pending).then((patch) => {
        if (patch && Object.keys(patch).length) {
          thumbCache = { ...thumbCache, ...patch };
          renderCurrent();
        }
      });
    }
    resolveNextBatch();
  }

  async function handleHide(tweetId) {
    await hideLike(tweetId);
    await reloadFromDb();
    renderCurrent();
  }

  async function handleDelete(tweetId) {
    await deleteLike(tweetId);
    delete thumbCache[tweetId];
    await reloadFromDb();
    renderCurrent();
  }

  async function handleImportFile(file) {
    if (!file) return;
    const text = await file.text();
    const entries = parseLikeArchive(text);
    const merge = mergeEl?.checked ?? false;
    if (!merge && likesCache?.length) {
      if (!confirm('Replace all likes in library with this file? Hidden items will be lost unless you choose Merge.')) {
        return;
      }
    }
    if (statusEl) statusEl.textContent = 'Importing…';
    const { total } = await importLikes(entries, { sourceName: file.name, replace: !merge });
    await reloadFromDb();
    likesPage = 1;
    panelLoaded = true;
    renderCurrent();
    queueResolveForPage();
    if (statusEl) statusEl.textContent = `Imported ${total} likes from ${file.name}`;
  }

  function showEmptyImportState() {
    updateImportUi(false);
    if (statusEl) statusEl.textContent = 'Import your X archive like.js once — then manage likes here without the file.';
    gridEl.innerHTML = `<div class="empty-state">No likes in library yet. Click <strong>Import like.js</strong> above.</div>`;
    if (paginationEl) {
      paginationEl.innerHTML = '';
      paginationEl.hidden = true;
    }
    updateNavCount(0);
  }

  async function loadLikes() {
    try {
      const imported = await hasImportedLikes();
      if (!imported) {
        panelLoaded = true;
        showEmptyImportState();
        return;
      }
      await reloadFromDb();
      likesPage = 1;
      renderCurrent();
      queueResolveForPage();
      panelLoaded = true;
    } catch (err) {
      if (statusEl) statusEl.textContent = 'Failed to load likes library.';
      gridEl.innerHTML = `<div class="empty-state">${err?.message || 'IndexedDB error.'}</div>`;
      console.error('Likes load failed:', err);
    }
  }

  importBtn?.addEventListener('click', () => fileInput?.click());
  reimportBtn?.addEventListener('click', () => fileInput?.click());
  bundledBtn?.addEventListener('click', async () => {
    try {
      const url = chrome.runtime.getURL('data/like.js');
      const res = await fetch(url);
      if (!res.ok) throw new Error('data/like.js not found in extension — use file import.');
      const text = await res.text();
      const entries = parseLikeArchive(text);
      const merge = mergeEl?.checked ?? false;
      if (!merge && likesCache?.length) {
        if (!confirm('Replace all likes in library with bundled data/like.js?')) return;
      }
      if (statusEl) statusEl.textContent = 'Importing bundled like.js…';
      const { total } = await importLikes(entries, { sourceName: 'data/like.js', replace: !merge });
      await reloadFromDb();
      likesPage = 1;
      panelLoaded = true;
      renderCurrent();
      queueResolveForPage();
      if (statusEl) statusEl.textContent = `Imported ${total} likes from extension data/like.js`;
    } catch (err) {
      if (statusEl) statusEl.textContent = err?.message || 'Bundled import failed.';
    }
  });
  fileInput?.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    handleImportFile(file).finally(() => {
      fileInput.value = '';
    });
  });

  if (searchInput) {
    searchInput.addEventListener('input', () => {
      likesPage = 1;
      renderCurrent();
    });
  }

  if (mediaOnlyEl) {
    mediaOnlyEl.addEventListener('change', () => {
      mediaOnly = mediaOnlyEl.checked;
      likesPage = 1;
      renderCurrent();
    });
  }

  return () => {
    if (!panelLoaded) loadLikes();
    else renderCurrent();
  };
}

export { LIKES_PAGE_SIZE };
