// DeepOverlay Management Dashboard Logic

const listContainer = document.getElementById('dashboard-list');
const searchInput = document.getElementById('search-input');
let allData = {}; // Cache

// --- Init ---
document.addEventListener('DOMContentLoaded', () => {
    loadDashboard();
    initTheme();

    // Search Listener
    searchInput.addEventListener('input', (e) => {
        renderDashboard(e.target.value);
    });

    // Buttons
    document.getElementById('refresh-btn').onclick = loadDashboard;
    document.getElementById('export-btn').onclick = exportData;
    document.getElementById('clear-btn').onclick = clearAllData;
    document.getElementById('theme-toggle').onclick = toggleTheme;

    // Visual Settings Init
    initVisualSettings();
});

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
    chrome.storage.local.get(null, (items) => {
        allData = items;
        renderDashboard(searchInput.value);
    });

    // Update Storage Usage
    chrome.storage.local.getBytesInUse(null, (bytes) => {
        const el = document.getElementById('storage-usage');
        if (!el) return;

        let text = "";
        if (bytes < 1024) text = bytes + " B";
        else if (bytes < 1024 * 1024) text = (bytes / 1024).toFixed(1) + " KB";
        else text = (bytes / (1024 * 1024)).toFixed(2) + " MB";

        el.innerText = "Storage: " + text;
    });

    // Update Cloud Usage Stats
    chrome.storage.local.get("ocr_quota", (result) => {
        const el = document.getElementById('usage-count');
        if (!el) return;

        const currentMonth = new Date().toISOString().slice(0, 7);
        const data = result.ocr_quota || { count: 0, month: currentMonth };

        // If stored data is from old month, display 0 (logic matches content.js)
        let count = data.count;
        if (data.month !== currentMonth) count = 0;

        el.innerText = count;
        if (count >= 1000) el.style.color = "#d93025"; // Red if limit hit
    });
}

function renderDashboard(query = "") {
    listContainer.innerHTML = "";

    // 1. Group Data by Domain
    const lowerQuery = query.toLowerCase();
    const grouped = {}; // { "domain.com": [ {url, notes} ] }

    Object.keys(allData).forEach(url => {
        // Filter out non-URL keys (settings, quotas, etc.)
        if (url === 'theme' || url === 'ocr_quota') return;

        const val = allData[url];
        // Valid notes data must be an array of objects
        if (!Array.isArray(val)) return;

        const notes = val;

        // Filter: Check if URL or Notes match query
        const matchesQuery = lowerQuery === "" ||
            url.toLowerCase().includes(lowerQuery) ||
            notes.some(n => (n.note || "").toLowerCase().includes(lowerQuery));

        if (!matchesQuery) return;

        let hostname;
        try {
            hostname = new URL(url).hostname;
        } catch (e) {
            hostname = "Unknown";
        }

        if (!grouped[hostname]) grouped[hostname] = [];
        grouped[hostname].push({ url, notes });
    });

    const domains = Object.keys(grouped).sort();

    if (domains.length === 0) {
        listContainer.innerHTML = `<div class="empty-state">${query ? "No matches found." : "No overlays yet."}</div>`;
        return;
    }

    // 2. Render Groups
    domains.forEach(domain => {
        const pages = grouped[domain];
        const groupEl = createDomainGroup(domain, pages, lowerQuery !== "");
        listContainer.appendChild(groupEl);
    });
}

function createDomainGroup(domain, pages, forceOpen) {
    const group = document.createElement('div');
    group.className = 'domain-group';

    // Header
    const header = document.createElement('div');
    header.className = 'domain-header';
    if (forceOpen) header.classList.add('open');

    header.innerHTML = `
        <div>
            <span class="toggle-icon">▶</span>
            <span class="domain-name">${domain}</span>
        </div>
        <div class="domain-meta">${pages.length} Pages</div>
    `;

    // Page List Container
    const pageList = document.createElement('div');
    pageList.className = 'page-list';
    if (forceOpen) pageList.classList.add('open');

    // Click to toggle
    header.addEventListener('click', () => {
        header.classList.toggle('open');
        pageList.classList.toggle('open');
    });

    // Render Pages
    pages.forEach(p => {
        pageList.appendChild(createPageRow(p.url, p.notes));
    });

    group.appendChild(header);
    group.appendChild(pageList);
    return group;
}

function createPageRow(url, notes) {
    const row = document.createElement('div');
    row.className = 'page-row';

    // Parse path for display
    let displayPath = url;
    try {
        const urlObj = new URL(url);
        displayPath = urlObj.pathname + urlObj.search;
        if (displayPath.length > 80) displayPath = displayPath.substring(0, 80) + "...";
    } catch (e) { }

    // Header
    const header = document.createElement('div');
    header.className = 'page-header';

    // Left side: Path link
    const pathSpan = document.createElement('span');
    pathSpan.className = 'page-path';

    const link = document.createElement('a');
    link.href = url;
    link.target = "_blank";
    link.innerText = displayPath;
    // Stop propagation so clicking link doesn't toggle notes
    link.onclick = (e) => e.stopPropagation();

    pathSpan.appendChild(link);

    // Right side: Controls
    const controls = document.createElement('div');
    const badge = document.createElement('span');
    badge.style.cssText = "font-size: 11px; color:#999; margin-right: 15px;";
    badge.innerText = `${notes.length} notes`;

    const delBtn = document.createElement('button');
    delBtn.className = 'danger';
    delBtn.innerText = "Delete";
    delBtn.onclick = (e) => {
        e.stopPropagation();
        deletePage(url);
    };

    controls.appendChild(badge);
    controls.appendChild(delBtn);

    header.appendChild(pathSpan);
    header.appendChild(controls);

    // Notes Area
    const notesArea = document.createElement('div');
    notesArea.className = 'notes-area';

    // Toggle Notes
    header.addEventListener('click', () => {
        notesArea.classList.toggle('open');
    });

    // Render Notes
    notes.forEach((note, index) => {
        const ta = document.createElement('textarea');
        ta.className = 'note-editor';
        ta.value = note.note || "";
        ta.placeholder = "Empty note...";

        let timeout;
        ta.addEventListener('input', (e) => {
            clearTimeout(timeout);
            timeout = setTimeout(() => {
                updateNote(url, index, e.target.value);
            }, 500);
        });
        // Stop propagation on click so typing doesn't close row (unlikely but safe)
        ta.onclick = (e) => e.stopPropagation();

        notesArea.appendChild(ta);
    });

    row.appendChild(header);
    row.appendChild(notesArea);
    return row;
}

// --- Storage Ops ---
function deletePage(url) {
    if (!confirm(`Delete all notes for this page?`)) return;

    chrome.storage.local.remove(url, () => {
        delete allData[url];
        // Re-render efficiently? For now full re-render is fine
        renderDashboard(searchInput.value);
    });
}

function updateNote(url, index, newText) {
    const notes = allData[url];
    if (notes && notes[index]) {
        notes[index].note = newText;
        const update = {};
        update[url] = notes;
        chrome.storage.local.set(update);
    }
}

function clearAllData() {
    if (confirm("WARNING: Delete EVERYTHING?")) {
        chrome.storage.local.clear(() => {
            allData = {};
            loadDashboard();
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
