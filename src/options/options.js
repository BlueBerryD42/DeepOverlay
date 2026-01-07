// DeepOverlay Management Dashboard - Entry Point

import { renderDashboard } from './utils/render.js';
import { getAllData, getStorageBytes, getOcrQuota, removeStorageKey, clearAllStorage, setStorageData } from './utils/storage.js';
import { formatBytes } from './utils/helpers.js';
import { createBulkActionsBar, updateBulkActionsBar } from './components/BulkActions.js';

const listContainer = document.getElementById('dashboard-list');
const searchInput = document.getElementById('search-input');
let allData = {}; // Cache
window.allDataCache = allData; // Make available to components

// Bulk selection state
let selectedItems = new Set();
let bulkActionsBar = null;

// --- Init ---
document.addEventListener('DOMContentLoaded', () => {
    loadDashboard();
    initTheme();
    initBulkActions();

    // Search Listener
    searchInput.addEventListener('input', (e) => {
        renderDashboard(allData, e.target.value, listContainer, handleWorkDelete, handleUpdate);
    });

    // Buttons
    document.getElementById('refresh-btn').onclick = loadDashboard;
    document.getElementById('export-btn').onclick = exportData;
    document.getElementById('clear-btn').onclick = clearAllData;
    document.getElementById('theme-toggle').onclick = toggleTheme;
    
    // Debug: Expose storage inspection function to window
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

    // Visual Settings Init
    initVisualSettings();
});

function initBulkActions() {
    bulkActionsBar = createBulkActionsBar(
        handleBulkDelete,
        handleBulkExport,
        handleClearSelection
    );
    document.body.insertBefore(bulkActionsBar, listContainer);
}

function handleBulkDelete() {
    // TODO: Implement bulk delete
    console.log('Bulk delete:', Array.from(selectedItems));
    selectedItems.clear();
    updateBulkActionsBar(bulkActionsBar, 0);
    loadDashboard();
}

function handleBulkExport() {
    // TODO: Implement bulk export
    console.log('Bulk export:', Array.from(selectedItems));
}

function handleClearSelection() {
    selectedItems.clear();
    updateBulkActionsBar(bulkActionsBar, 0);
    // Uncheck all checkboxes
    document.querySelectorAll('input[type="checkbox"].bulk-select').forEach(cb => {
        cb.checked = false;
    });
}

function handleWorkDelete(storageKey) {
    removeStorageKey(storageKey).then(() => {
        delete allData[storageKey];
        window.allDataCache = allData;
        renderDashboard(allData, searchInput.value, listContainer, handleWorkDelete, handleUpdate);
    });
}

function handleUpdate() {
    // Refresh data and re-render
    getAllData().then(items => {
        allData = items;
        window.allDataCache = allData;
        renderDashboard(allData, searchInput.value, listContainer, handleWorkDelete, handleUpdate);
    });
}

// --- Visual Settings Logic ---
function initVisualSettings() {
    const optOpacity = document.getElementById('opt-opacity');
    const valOpacity = document.getElementById('val-opacity');

    const optBorder = document.getElementById('opt-border-color');
    const optBg = document.getElementById('opt-bg-color');

    // Load saved or defaults
    chrome.storage.local.get(['overlay_opacity', 'overlay_border_color', 'overlay_bg_color'], (res) => {
        const op = res.overlay_opacity || 1.0;
        const borderColor = res.overlay_border_color || '#000000';
        const bgColor = res.overlay_bg_color || '#ffffff';

        optOpacity.value = op;
        valOpacity.innerText = op;

        optBorder.value = borderColor;
        optBg.value = bgColor;
    });

    // Listeners
    optOpacity.addEventListener('input', (e) => {
        valOpacity.innerText = e.target.value;
        chrome.storage.local.set({ overlay_opacity: e.target.value });
    });

    optBorder.addEventListener('input', (e) => {
        chrome.storage.local.set({ overlay_border_color: e.target.value });
    });

    optBg.addEventListener('input', (e) => {
        chrome.storage.local.set({ overlay_bg_color: e.target.value });
    });
}

// --- Theme Logic ---
function initTheme() {
    chrome.storage.local.get('theme', (result) => {
        // Default is dark (no attribute), so only set 'light' if explicit
        if (result.theme === 'light') {
            document.body.setAttribute('data-theme', 'light');
        }
    });
}

function toggleTheme() {
    const isLight = document.body.getAttribute('data-theme') === 'light';
    const newTheme = isLight ? 'dark' : 'light';

    if (newTheme === 'light') {
        document.body.setAttribute('data-theme', 'light');
    } else {
        document.body.removeAttribute('data-theme');
    }

    chrome.storage.local.set({ theme: newTheme });
}

// --- Core Logic ---
function loadDashboard() {
    getAllData().then(items => {
        allData = items;
        window.allDataCache = allData;
        renderDashboard(allData, searchInput.value, listContainer, handleWorkDelete, handleUpdate);
    });

    // Update Storage Usage
    getStorageBytes().then(bytes => {
        const el = document.getElementById('storage-usage');
        if (!el) return;
        el.innerText = "Storage: " + formatBytes(bytes);
    });

    // Update Cloud Usage Stats
    getOcrQuota().then(count => {
        const el = document.getElementById('usage-count');
        if (!el) return;
        el.innerText = count;
        if (count >= 1000) el.style.color = "#d93025"; // Red if limit hit
    });
}

function clearAllData() {
    if (confirm("WARNING: Delete EVERYTHING?")) {
        clearAllStorage().then(() => {
            allData = {};
            window.allDataCache = allData;
            loadDashboard();
            
            // Also clear visual settings to truly reset everything
            chrome.storage.local.remove([
                'overlay_opacity',
                'overlay_border_color',
                'overlay_bg_color',
                'theme'
            ], () => {
                // Reload page to reset visual settings UI
                window.location.reload();
            });
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
