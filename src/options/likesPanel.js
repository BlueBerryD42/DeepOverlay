// Likes panel — IndexedDB library (import once, CRUD after)

import { parseLikeImport, isSyncExportFormat } from './utils/parseLikeImport.js';
import {
  hasImportedLikes,
  getLikesMeta,
  importLikes,
  exportLikesLibrary,
  getAllLikes,
  getAllThumbsMap,
  deleteLike,
  deleteLikes,
  requestThumbResolve,
} from './utils/likesDb.js';
import { renderLikes, refreshLikeCardThumbs, LIKES_PAGE_SIZE } from './utils/renderLikes.js';
import { getAnnotatedXTweetIds } from './utils/likesOverlay.js';
import { subscribeOverlayChanges } from '../../lib/storage-broadcast.mjs';
import { syncPaginationKeyboard } from './utils/paginationKeyboard.js';

const RESOLVE_BATCH = 24;

/** @type {Array<{ tweetId: string; text: string; postUrl: string }> | null} */
let likesCache = null;
let thumbCache = {};
/** @type {Set<string>} */
let overlayTweetIds = new Set();
let likesPage = 1;
let resolveInFlight = false;
let panelLoaded = false;

/**
 * @returns {() => void} call when likes panel is shown
 */
export function initLikesPanel() {
  const gridEl = document.getElementById('likes-grid');
  const paginationEls = [
    document.getElementById('likes-pagination-top'),
    document.getElementById('likes-pagination-bottom'),
  ];
  const lightboxEl = document.getElementById('likes-lightbox');
  const searchInput = document.getElementById('likes-search-input');
  const filterEl = document.getElementById('likes-filter');
  const progressEl = document.getElementById('likes-progress');
  const countEl = document.getElementById('likes-nav-count');
  const statusEl = document.getElementById('likes-status');
  const importBar = document.getElementById('likes-import-bar');
  const importBtn = document.getElementById('likes-import-btn');
  const bundledBtn = document.getElementById('likes-import-bundled-btn');
  const reimportBtn = document.getElementById('likes-reimport-btn');
  const exportSyncBtn = document.getElementById('likes-export-sync-btn');
  const syncHintEl = document.getElementById('likes-sync-hint');
  const fileInput = document.getElementById('likes-file-input');
  const mergeWrap = document.getElementById('likes-merge-wrap');
  const mergeEl = document.getElementById('likes-reimport-merge');

  if (!gridEl) return () => {};

  let likesFilter = filterEl?.value || 'all';
  /** @type {Set<string>} */
  let selectedLikes = new Set();
  let bulkBar = null;

  function ensureBulkBar() {
    if (bulkBar) return bulkBar;
    const paginationTop = document.getElementById('likes-pagination-top');
    bulkBar = document.createElement('div');
    bulkBar.id = 'likes-bulk-bar';
    bulkBar.className = 'do-likes-bulk-bar bulk-actions-bar';
    bulkBar.hidden = true;
    bulkBar.innerHTML = `
      <div class="bulk-actions-left">
        <span class="bulk-selection-count">0 selected</span>
      </div>
      <div class="bulk-actions-right">
        <button type="button" class="do-btn" data-action="select-page">Select page</button>
        <button type="button" class="do-btn danger" data-action="delete">Delete selected</button>
        <button type="button" class="do-btn" data-action="clear">Clear</button>
      </div>
    `;
    bulkBar.querySelector('[data-action="select-page"]')?.addEventListener('click', selectAllOnPage);
    bulkBar.querySelector('[data-action="delete"]')?.addEventListener('click', handleBulkDelete);
    bulkBar.querySelector('[data-action="clear"]')?.addEventListener('click', clearSelection);
    const anchor = paginationTop || gridEl;
    anchor.parentNode?.insertBefore(bulkBar, anchor);
    return bulkBar;
  }

  function updateBulkBar() {
    const bar = ensureBulkBar();
    const countEl = bar.querySelector('.bulk-selection-count');
    if (countEl) countEl.textContent = `${selectedLikes.size} selected`;
    bar.hidden = selectedLikes.size === 0;
  }

  function clearSelection() {
    selectedLikes.clear();
    updateBulkBar();
    renderCurrent();
  }

  function selectAllOnPage() {
    if (!likesCache) return;
    const { pageItems } = renderLikes({
      likes: likesCache,
      query: searchInput?.value || '',
      filter: likesFilter,
      thumbCache,
      overlayTweetIds,
      page: likesPage,
      gridEl: null,
      paginationEl: null,
      lightboxEl: null,
      onPageChange: () => {},
    });
    for (const like of pageItems) selectedLikes.add(like.tweetId);
    updateBulkBar();
    renderCurrent();
  }

  function handleSelectToggle(tweetId, selected) {
    if (selected) selectedLikes.add(tweetId);
    else selectedLikes.delete(tweetId);
    updateBulkBar();
  }

  const cardOpts = () => ({
    onDelete: handleDelete,
    overlayTweetIds,
    selectedTweetIds: selectedLikes,
    onSelectToggle: handleSelectToggle,
  });

  function updateNavCount(n) {
    if (countEl) countEl.textContent = String(n);
  }

  function updateImportUi(imported) {
    if (importBtn) importBtn.hidden = imported;
    if (bundledBtn) bundledBtn.hidden = imported;
    if (reimportBtn) reimportBtn.hidden = !imported;
    if (exportSyncBtn) exportSyncBtn.hidden = !imported;
    if (mergeWrap) mergeWrap.hidden = !imported;
    if (syncHintEl) syncHintEl.hidden = !imported;
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
    const withOverlay = overlayTweetIds.size;
    progressEl.textContent =
      `Thumbnails: ${resolved} / ${likesCache.length} resolved · ${withMedia} with media · ${withOverlay} with overlay`;
  }

  async function reloadOverlayLinks() {
    overlayTweetIds = await getAnnotatedXTweetIds();
  }

  async function reloadFromDb() {
    likesCache = await getAllLikes();
    thumbCache = await getAllThumbsMap();
    await reloadOverlayLinks();
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
      filter: likesFilter,
      thumbCache,
      overlayTweetIds,
      page: likesPage,
      gridEl,
      paginationEl: paginationEls,
      lightboxEl,
      onPageChange: (p) => {
        likesPage = p;
        renderCurrent();
        queueResolveForPage();
      },
      onDelete: opts.onDelete,
      selectedTweetIds: opts.selectedTweetIds,
      onSelectToggle: opts.onSelectToggle,
    });
    likesPage = r.currentPage;
    syncPaginationKeyboard({
      panelId: 'likes',
      page: likesPage,
      totalPages: r.totalPages,
      onPageChange: (p) => {
        likesPage = p;
        renderCurrent();
        queueResolveForPage();
      },
    });
    updateProgress();
    updateBulkBar();
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
          filter: likesFilter,
          thumbCache,
          overlayTweetIds,
          page: likesPage,
          gridEl,
          paginationEl: paginationEls,
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
      filter: likesFilter,
      thumbCache,
      overlayTweetIds,
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

  async function handleDelete(tweetId) {
    await deleteLike(tweetId);
    selectedLikes.delete(tweetId);
    delete thumbCache[tweetId];
    await reloadFromDb();
    renderCurrent();
  }

  async function handleBulkDelete() {
    const ids = [...selectedLikes];
    if (!ids.length) return;
    if (!confirm(`Remove ${ids.length} like${ids.length === 1 ? '' : 's'} from your library?`)) return;
    await deleteLikes(ids);
    for (const id of ids) {
      selectedLikes.delete(id);
      delete thumbCache[id];
    }
    await reloadFromDb();
    renderCurrent();
  }

  async function handleImportFile(file) {
    if (!file) return;
    const text = await file.text();
    let parsedJson = null;
    if (file.name.toLowerCase().endsWith('.json')) {
      try {
        parsedJson = JSON.parse(text);
      } catch {
        if (statusEl) statusEl.textContent = 'Invalid JSON file.';
        return;
      }
    }

    const entries = parseLikeImport(text, file.name);
    if (!entries.length) {
      if (statusEl) statusEl.textContent = 'No likes found in file.';
      return;
    }

    const isSync =
      isSyncExportFormat(parsedJson) || file.name.toLowerCase().includes('sync');
    const merge = isSync ? true : (mergeEl?.checked ?? false);

    if (!merge && likesCache?.length) {
      if (!confirm('Replace all likes in library with this file?')) {
        return;
      }
    }

    if (statusEl) statusEl.textContent = 'Importing…';
    const { imported, skipped, total } = await importLikes(entries, {
      sourceName: file.name,
      replace: !merge,
      prepend: merge,
    });
    await reloadFromDb();
    likesPage = 1;
    panelLoaded = true;
    renderCurrent();
    queueResolveForPage();

    if (statusEl) {
      if (merge) {
        statusEl.textContent = `Added ${imported} new likes (${skipped} already in library) · ${total} total`;
      } else {
        statusEl.textContent = `Imported ${total} likes from ${file.name}`;
      }
    }
  }

  async function handleExportSync() {
    const data = await exportLikesLibrary();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `deepoverlay_likes_sync_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    if (statusEl && data.newest) {
      statusEl.textContent = `Exported ${data.count} likes · newest: ${data.newest.tweetId}`;
    }
  }

  function showEmptyImportState() {
    updateImportUi(false);
    if (statusEl) statusEl.textContent = 'Import your X archive like.js once — then manage likes here without the file.';
    gridEl.innerHTML = `<div class="empty-state">No likes in library yet. Click <strong>Import like.js</strong> above.</div>`;
    for (const el of paginationEls) {
      if (!el) continue;
      el.innerHTML = '';
      el.hidden = true;
    }
    if (bulkBar) bulkBar.hidden = true;
    selectedLikes.clear();
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
  exportSyncBtn?.addEventListener('click', () => handleExportSync().catch((err) => {
    if (statusEl) statusEl.textContent = err?.message || 'Export failed.';
  }));
  bundledBtn?.addEventListener('click', async () => {
    try {
      const url = chrome.runtime.getURL('data/like.js');
      const res = await fetch(url);
      if (!res.ok) throw new Error('data/like.js not found in extension — use file import.');
      const text = await res.text();
      const entries = parseLikeImport(text, 'data/like.js');
      const merge = mergeEl?.checked ?? false;
      if (!merge && likesCache?.length) {
        if (!confirm('Replace all likes in library with bundled data/like.js?')) return;
      }
      if (statusEl) statusEl.textContent = 'Importing bundled like.js…';
      const { imported, skipped, total } = await importLikes(entries, {
        sourceName: 'data/like.js',
        replace: !merge,
        prepend: merge,
      });
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

  if (filterEl) {
    filterEl.addEventListener('change', () => {
      likesFilter = filterEl.value || 'all';
      likesPage = 1;
      renderCurrent();
    });
  }

  subscribeOverlayChanges(async () => {
    await reloadOverlayLinks();
    renderCurrent();
  });

  let likesResizeTimer;
  window.addEventListener('resize', () => {
    if (!panelLoaded || !likesCache?.length) return;
    clearTimeout(likesResizeTimer);
    likesResizeTimer = setTimeout(() => renderCurrent(), 150);
  });

  return () => {
    if (!panelLoaded) loadLikes();
    else renderCurrent();
  };
}

export { LIKES_PAGE_SIZE };
