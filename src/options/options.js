// DeepOverlay Management Dashboard - Entry Point

import { renderDashboard, LIBRARY_PAGE_SIZE } from './utils/render.js';
import { getAllData, getStorageBytes, removeStorageKey, clearAllStorage } from './utils/storage.js';
import { formatBytes } from './utils/helpers.js';
import { createBulkActionsBar, updateBulkActionsBar } from './components/BulkActions.js';
import { filterAndGroupData } from './utils/filters.js';
import { initLikesPanel } from './likesPanel.js';

const listContainer = document.getElementById('dashboard-list');
const searchInput = document.getElementById('search-input');
const siteFilterEl = document.getElementById('library-site-filter');
const paginationEl = document.getElementById('library-pagination');
let libraryPage = 1;
let librarySiteFilter = 'all';
let allData = {}; // Cache
window.allDataCache = allData; // Make available to components

// Bulk selection state
let selectedItems = new Set();
let bulkActionsBar = null;

function countWorks(data) {
    const worksByDomain = filterAndGroupData(data, '');
    let n = 0;
    Object.keys(worksByDomain).forEach((d) => {
        n += worksByDomain[d].length;
    });
    return n;
}

function initNav(onPanelShow) {
    const items = document.querySelectorAll('.do-nav-item[data-panel]');
    const panels = document.querySelectorAll('.do-panel');

    function show(panelId) {
        items.forEach((btn) => {
            const on = btn.dataset.panel === panelId;
            btn.classList.toggle('active', on);
            btn.setAttribute('aria-selected', on ? 'true' : 'false');
        });
        panels.forEach((p) => {
            const on = p.id === `panel-${panelId}`;
            p.classList.toggle('active', on);
        });
        onPanelShow?.(panelId);
    }

    items.forEach((btn) => {
        btn.addEventListener('click', () => show(btn.dataset.panel));
    });

    show('library');
}

function syncManifestVersion() {
    try {
        const v = chrome.runtime.getManifest?.()?.version;
        const el = document.getElementById('manager-version');
        if (el && v) el.textContent = `v${v}`;
    } catch {
        /* ignore */
    }
}

// --- Init ---
document.addEventListener('DOMContentLoaded', () => {
    syncManifestVersion();
    const showLikesPanel = initLikesPanel();
    initNav((panelId) => {
        if (panelId === 'likes') showLikesPanel?.();
    });
    loadDashboard();
    initTheme();
    initBulkActions();

    if (searchInput) {
        searchInput.addEventListener('input', () => {
            libraryPage = 1;
            renderLibrary();
        });
    }

    if (siteFilterEl) {
        siteFilterEl.addEventListener('change', () => {
            librarySiteFilter = siteFilterEl.value;
            libraryPage = 1;
            renderLibrary();
        });
    }

    document.getElementById('refresh-btn').onclick = loadDashboard;
    document.getElementById('export-btn').onclick = exportData;
    document.getElementById('clear-btn').onclick = clearAllData;
    document.getElementById('theme-toggle').onclick = toggleTheme;

    window.inspectStorage = () => {
        chrome.storage.local.get(null, (items) => {
            console.log('=== Storage Contents ===');
            console.log('Keys:', Object.keys(items));
            console.log('Total keys:', Object.keys(items).length);
            console.table(items);

            const size = JSON.stringify(items).length;
            console.log('Storage size:', size, 'bytes');

            alert(`Storage contains ${Object.keys(items).length} keys:\n${Object.keys(items).join(', ')}\n\nCheck console (F12) for full details.`);
        });
    };

    initVisualSettings();
    initDisabledHosts();
});

function initBulkActions() {
    if (!listContainer) return;

    bulkActionsBar = createBulkActionsBar(
        handleBulkDelete,
        handleBulkExport,
        handleClearSelection
    );
    bulkActionsBar.classList.add('do-bulk-actions');
    listContainer.parentNode.insertBefore(bulkActionsBar, listContainer);
}

function handleBulkDelete() {
    console.log('Bulk delete:', Array.from(selectedItems));
    selectedItems.clear();
    updateBulkActionsBar(bulkActionsBar, 0);
    loadDashboard();
}

function handleBulkExport() {
    console.log('Bulk export:', Array.from(selectedItems));
}

function handleClearSelection() {
    selectedItems.clear();
    updateBulkActionsBar(bulkActionsBar, 0);
    document.querySelectorAll('input[type="checkbox"].bulk-select').forEach((cb) => {
        cb.checked = false;
    });
}

function handleWorkDelete(storageKey) {
    removeStorageKey(storageKey).then(() => {
        delete allData[storageKey];
        window.allDataCache = allData;
        renderLibrary();
        updateLibraryNavCount(allData);
    });
}

function handleUpdate() {
    getAllData().then((items) => {
        allData = items;
        window.allDataCache = allData;
        renderLibrary();
        updateLibraryNavCount(allData);
    });
}

function renderLibrary() {
    if (!listContainer) return;
    const r = renderDashboard(allData, searchInput?.value || '', listContainer, handleWorkDelete, handleUpdate, {
        page: libraryPage,
        pageSize: LIBRARY_PAGE_SIZE,
        paginationEl,
        siteFilter: librarySiteFilter,
        onPageChange: (p) => {
            libraryPage = p;
            renderLibrary();
        }
    });
    if (r) libraryPage = r.currentPage;
}

function updateLibraryNavCount(data) {
    const el = document.getElementById('library-nav-count');
    if (el) el.textContent = String(countWorks(data || {}));
}

// --- Visual Settings Logic ---
function initDisabledHosts() {
    const ta = document.getElementById('opt-disabled-hosts');
    if (!ta) return;

    chrome.storage.local.get(['overlay_disabled_hosts'], (r) => {
        const list = r.overlay_disabled_hosts;
        ta.value = Array.isArray(list) ? list.join('\n') : '';
    });

    let t;
    ta.addEventListener('input', () => {
        clearTimeout(t);
        t = setTimeout(() => {
            const lines = ta.value
                .split(/\r?\n/)
                .map((s) => s.trim())
                .filter(Boolean);
            chrome.storage.local.set({ overlay_disabled_hosts: lines });
        }, 300);
    });
}

function setHexLabels() {
    const border = document.getElementById('opt-border-color');
    const fill = document.getElementById('opt-bg-color');
    const bh = document.getElementById('border-hex-label');
    const fh = document.getElementById('fill-hex-label');
    if (border && bh) bh.textContent = border.value;
    if (fill && fh) fh.textContent = fill.value;
}

function initVisualSettings() {
    const optOpacity = document.getElementById('opt-opacity');
    const valOpacity = document.getElementById('val-opacity');

    const optBorder = document.getElementById('opt-border-color');
    const optBg = document.getElementById('opt-bg-color');

    chrome.storage.local.get(['overlay_opacity', 'overlay_border_color', 'overlay_bg_color'], (res) => {
        const op = res.overlay_opacity || 1.0;
        const borderColor = res.overlay_border_color || '#000000';
        const bgColor = res.overlay_bg_color || '#ffffff';

        if (optOpacity) optOpacity.value = op;
        if (valOpacity) valOpacity.innerText = String(op);

        if (optBorder) optBorder.value = borderColor;
        if (optBg) optBg.value = bgColor;
        setHexLabels();
    });

    if (optOpacity) {
        optOpacity.addEventListener('input', (e) => {
            if (valOpacity) valOpacity.innerText = e.target.value;
            chrome.storage.local.set({ overlay_opacity: e.target.value });
        });
    }

    if (optBorder) {
        optBorder.addEventListener('input', (e) => {
            setHexLabels();
            chrome.storage.local.set({ overlay_border_color: e.target.value });
        });
    }

    if (optBg) {
        optBg.addEventListener('input', (e) => {
            setHexLabels();
            chrome.storage.local.set({ overlay_bg_color: e.target.value });
        });
    }
}

// --- Theme Logic ---
function initTheme() {
    const doApp = document.getElementById('doApp');
    chrome.storage.local.get('theme', (result) => {
        if (result.theme === 'light') {
            document.body.setAttribute('data-theme', 'light');
            doApp?.classList.add('do-light');
        } else {
            document.body.removeAttribute('data-theme');
            doApp?.classList.remove('do-light');
        }
    });
}

function toggleTheme() {
    const isLight = document.body.getAttribute('data-theme') === 'light';
    const newTheme = isLight ? 'dark' : 'light';
    const doApp = document.getElementById('doApp');

    if (newTheme === 'light') {
        document.body.setAttribute('data-theme', 'light');
        doApp?.classList.add('do-light');
    } else {
        document.body.removeAttribute('data-theme');
        doApp?.classList.remove('do-light');
    }

    chrome.storage.local.set({ theme: newTheme });
}

// --- Core Logic ---
function loadDashboard() {
    libraryPage = 1;
    getAllData().then((items) => {
        allData = items;
        window.allDataCache = allData;
        renderLibrary();
        updateLibraryNavCount(allData);
    });

    getStorageBytes().then((bytes) => {
        const el = document.getElementById('storage-usage');
        if (!el) return;
        el.textContent = `Storage: ${formatBytes(bytes)}`;
    });
}

function clearAllData() {
    if (confirm('WARNING: Delete EVERYTHING?')) {
        clearAllStorage().then(() => {
            allData = {};
            window.allDataCache = allData;
            loadDashboard();

            chrome.storage.local.remove(
                ['overlay_opacity', 'overlay_border_color', 'overlay_bg_color', 'theme'],
                () => {
                    window.location.reload();
                }
            );
        });
    }
}

function exportData() {
    const blob = new Blob([JSON.stringify(allData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `deep_overlay_backup_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
}
