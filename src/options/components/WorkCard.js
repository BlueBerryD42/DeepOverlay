// Work card — minimal collapsed row; expand for thumbnails + editing

import { createImageCard } from './ImageCard.js';
import {
    createSiteBadgeElement,
    formatDateShort,
    truncateText,
    hostChipFromUrl,
    getExpandedState,
    setExpandedState,
    formatPageUrl,
    getWorkDisplayLabel
} from '../utils/helpers.js';
import { saveWorkEntryWithIndex } from '../utils/storage.js';

export function createWorkCard(work, onWorkDelete, onUpdate) {
    if (work.legacy) {
        return createLegacyPageRow(work.storageKey, work.notes, onWorkDelete);
    }

    const workEntry = work.workEntry;
    const workId = workEntry.workId != null ? String(workEntry.workId) : 'N/A';
    const site = workEntry.site || 'other';

    const card = document.createElement('div');
    card.className = 'work-card-flat work-card-minimal';
    card.dataset.storageKey = work.storageKey;

    const head = document.createElement('div');
    head.className = 'wcm-head';
    head.setAttribute('role', 'button');
    head.setAttribute('tabindex', '0');
    head.setAttribute('aria-expanded', 'false');

    const row1 = document.createElement('div');
    row1.className = 'wcm-row1';

    const chevron = document.createElement('span');
    chevron.className = 'wcm-chevron';
    chevron.setAttribute('aria-hidden', 'true');
    chevron.textContent = '▸';

    const badge = createSiteBadgeElement(site);

    const titleWrap = document.createElement('div');
    titleWrap.className = 'wcm-title-wrap';

    const idEl = document.createElement('span');
    idEl.className = 'wcm-id';

    function refreshTitle() {
        const we = window.allDataCache[work.storageKey] || workEntry;
        const label = getWorkDisplayLabel(we);
        idEl.textContent = truncateText(label, 52);
        const idOnly = we.workId != null ? String(we.workId) : 'N/A';
        const custom = (we.metadata?.displayName || '').trim();
        idEl.title = custom ? `Work ID: ${idOnly}` : idOnly;
    }
    refreshTitle();

    const renameBtn = document.createElement('button');
    renameBtn.type = 'button';
    renameBtn.className = 'wcm-rename';
    renameBtn.textContent = '✎';
    renameBtn.title = 'Name this work';
    renameBtn.setAttribute('aria-label', 'Edit display name');
    renameBtn.onclick = (e) => {
        e.stopPropagation();
        const we0 = window.allDataCache[work.storageKey] || workEntry;
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'wcm-name-input';
        input.value = (we0.metadata?.displayName || '').trim();
        input.placeholder = workId;
        titleWrap.replaceChildren(input);
        input.focus();
        input.select();

        let finished = false;
        function finish(commit) {
            if (finished) return;
            finished = true;
            titleWrap.replaceChildren(idEl, renameBtn);
            if (!commit) {
                refreshTitle();
                return;
            }
            const v = input.value.trim();
            const raw = window.allDataCache[work.storageKey];
            if (!raw) {
                refreshTitle();
                return;
            }
            const w = { ...raw, metadata: { ...raw.metadata } };
            if (v) w.metadata.displayName = v;
            else delete w.metadata.displayName;
            w.metadata.lastUpdated = Date.now();
            saveWorkEntryWithIndex(work.storageKey, w).then(() => {
                window.allDataCache[work.storageKey] = w;
                refreshTitle();
                onUpdate();
            });
        }

        input.addEventListener('keydown', (ev) => {
            if (ev.key === 'Enter') {
                ev.preventDefault();
                finish(true);
            } else if (ev.key === 'Escape') {
                ev.preventDefault();
                finish(false);
            }
        });
        input.addEventListener('blur', () => {
            if (!finished) finish(true);
        });
    };

    titleWrap.appendChild(idEl);
    titleWrap.appendChild(renameBtn);

    const dateEl = document.createElement('span');
    dateEl.className = 'wcm-date';
    dateEl.textContent = workEntry.metadata?.lastUpdated
        ? formatDateShort(workEntry.metadata.lastUpdated)
        : '—';

    const delBtn = document.createElement('button');
    delBtn.type = 'button';
    delBtn.className = 'wcm-del';
    delBtn.textContent = 'Delete';
    delBtn.onclick = (e) => {
        e.stopPropagation();
        const we = window.allDataCache[work.storageKey] || workEntry;
        const label = getWorkDisplayLabel(we);
        if (confirm(`Delete all overlays for “${label}” (ID ${workId})?`)) {
            onWorkDelete(work.storageKey);
        }
    };

    row1.appendChild(chevron);
    row1.appendChild(badge);
    row1.appendChild(titleWrap);
    row1.appendChild(dateEl);
    row1.appendChild(delBtn);

    const row2 = document.createElement('div');
    row2.className = 'wcm-row2';

    const counts = document.createElement('span');
    counts.className = 'wcm-counts';
    counts.innerHTML = `<strong>${work.totalBoxes}</strong> box${work.totalBoxes !== 1 ? 'es' : ''} · <strong>${work.totalImages}</strong> image${work.totalImages !== 1 ? 's' : ''}`;

    const tags = document.createElement('div');
    tags.className = 'wcm-tags';
    const base = workEntry.baseUrl || workEntry.metadata?.urlVariants?.[0] || '';
    const host = hostChipFromUrl(base);
    if (host) {
        const chip = document.createElement('span');
        chip.className = 'wcm-chip';
        chip.textContent = host;
        tags.appendChild(chip);
    }

    row2.appendChild(counts);
    row2.appendChild(tags);

    head.appendChild(row1);
    head.appendChild(row2);

    const expanded = document.createElement('div');
    expanded.className = 'wcm-expanded';
    expanded.hidden = true;

    const imageKeys = Object.keys(workEntry.images || {});

    const strip = document.createElement('div');
    strip.className = 'wcm-thumb-strip';
    strip.setAttribute('role', 'tablist');
    strip.setAttribute('aria-label', 'Images in this work');

    const detailSlot = document.createElement('div');
    detailSlot.className = 'wcm-detail-slot work-images-list-flat';

    const toolbar = document.createElement('div');
    toolbar.className = 'wcm-toolbar';

    const exportBtn = document.createElement('button');
    exportBtn.type = 'button';
    exportBtn.className = 'do-btn';
    exportBtn.textContent = 'Export';
    exportBtn.onclick = (e) => {
        e.stopPropagation();
        const raw = window.allDataCache[work.storageKey];
        const payload = { [work.storageKey]: raw };
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `deepoverlay_work_${workId.slice(0, 24)}.json`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const goPageBtn = document.createElement('button');
    goPageBtn.type = 'button';
    goPageBtn.className = 'do-btn wcm-go-page';
    goPageBtn.textContent = 'Go to page';

    function updateGoPageButton(imageKey) {
        const fresh = window.allDataCache[work.storageKey];
        const entry = fresh?.images ? fresh : workEntry;
        const data = imageKey && entry?.images?.[imageKey];
        const pageUrl = data?.pageUrl;
        goPageBtn.disabled = !pageUrl;
        goPageBtn.title = pageUrl ? pageUrl : 'Select a thumbnail first';
        goPageBtn.onclick = (e) => {
            e.stopPropagation();
            const fr = window.allDataCache[work.storageKey];
            const ent = fr?.images ? fr : workEntry;
            const d = imageKey && ent?.images?.[imageKey];
            const u = d?.pageUrl;
            if (u) window.open(u, '_blank', 'noopener,noreferrer');
        };
    }

    toolbar.appendChild(exportBtn);
    toolbar.appendChild(goPageBtn);

    function onImageDelete(storageKey, imageSelector) {
        const w = window.allDataCache[storageKey];
        if (w && w.images) {
            delete w.images[imageSelector];
            w.metadata.lastUpdated = Date.now();
            saveWorkEntryWithIndex(storageKey, w).then(() => {
                window.allDataCache[storageKey] = w;
                onUpdate();
            });
        }
    }

    function renderDetail(imageKey) {
        detailSlot.innerHTML = '';
        strip.querySelectorAll('.wcm-thumb-btn').forEach((btn) => {
            const on = btn.dataset.imageKey === imageKey;
            btn.classList.toggle('wcm-thumb-selected', on);
            btn.setAttribute('aria-selected', on ? 'true' : 'false');
        });

        if (!imageKey || !workEntry.images[imageKey]) {
            const hint = document.createElement('div');
            hint.className = 'wcm-detail-hint';
            hint.textContent = 'Click a thumbnail to view and edit boxes for that page.';
            detailSlot.appendChild(hint);
            updateGoPageButton(null);
            return;
        }

        const fresh = window.allDataCache[work.storageKey];
        const entry = fresh && fresh.images ? fresh : workEntry;
        const imageData = entry.images[imageKey];
        if (!imageData) {
            renderDetail(null);
            return;
        }

        const card = createImageCard(
            work.storageKey,
            imageKey,
            imageData,
            entry,
            onImageDelete,
            onUpdate,
            { compact: true }
        );
        detailSlot.appendChild(card);
        updateGoPageButton(imageKey);
    }

    imageKeys.forEach((imageKey) => {
        const imageData = workEntry.images[imageKey];
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'wcm-thumb-btn';
        btn.dataset.imageKey = imageKey;
        btn.setAttribute('role', 'tab');
        btn.setAttribute('aria-selected', 'false');
        const label = formatPageUrl(imageData.pageUrl, site) || 'Image';
        btn.setAttribute('aria-label', label);

        if (imageData?.src) {
            const img = document.createElement('img');
            img.className = 'wcm-thumb';
            img.src = imageData.src;
            img.loading = 'lazy';
            img.alt = '';
            btn.appendChild(img);
        } else {
            const ph = document.createElement('div');
            ph.className = 'wcm-thumb-placeholder';
            ph.textContent = truncateText(label, 24);
            btn.appendChild(ph);
        }

        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            renderDetail(imageKey);
        });

        strip.appendChild(btn);
    });

    if (!strip.childElementCount) {
        strip.style.display = 'none';
    }

    renderDetail(null);

    expanded.appendChild(strip);
    expanded.appendChild(toolbar);
    expanded.appendChild(detailSlot);

    let isOpen = getExpandedState(work.storageKey);

    function applyOpen(open) {
        isOpen = open;
        expanded.hidden = !open;
        head.setAttribute('aria-expanded', String(open));
        card.classList.toggle('wcm-open', open);
        chevron.textContent = open ? '▾' : '▸';
        setExpandedState(work.storageKey, open);
    }

    applyOpen(isOpen);

    head.addEventListener('click', () => applyOpen(!isOpen));
    head.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            applyOpen(!isOpen);
        }
    });

    card.appendChild(head);
    card.appendChild(expanded);

    return card;
}

function createLegacyPageRow(url, notes, onDelete) {
    const card = document.createElement('div');
    card.className = 'work-card-flat work-card-minimal legacy-row';
    card.dataset.storageKey = url;

    let displayPath = url;
    try {
        const urlObj = new URL(url);
        displayPath = urlObj.pathname + urlObj.search;
        if (displayPath.length > 56) displayPath = `${displayPath.substring(0, 54)}…`;
    } catch {
        /* keep raw */
    }

    const head = document.createElement('div');
    head.className = 'wcm-head';
    head.setAttribute('role', 'button');
    head.setAttribute('tabindex', '0');
    head.setAttribute('aria-expanded', 'false');

    const row1 = document.createElement('div');
    row1.className = 'wcm-row1';

    const chevron = document.createElement('span');
    chevron.className = 'wcm-chevron';
    chevron.setAttribute('aria-hidden', 'true');
    chevron.textContent = '▸';

    const badge = document.createElement('span');
    badge.className = 'site-badge site-badge-archive';
    badge.textContent = 'Archive';

    const idEl = document.createElement('span');
    idEl.className = 'wcm-id';
    idEl.textContent = displayPath;
    idEl.title = url;

    const dateEl = document.createElement('span');
    dateEl.className = 'wcm-date';
    dateEl.textContent = '—';

    const delBtn = document.createElement('button');
    delBtn.type = 'button';
    delBtn.className = 'wcm-del';
    delBtn.textContent = 'Delete';
    delBtn.onclick = (e) => {
        e.stopPropagation();
        if (confirm('Delete all notes for this page?')) {
            onDelete(url);
        }
    };

    row1.appendChild(chevron);
    row1.appendChild(badge);
    row1.appendChild(idEl);
    row1.appendChild(dateEl);
    row1.appendChild(delBtn);

    const row2 = document.createElement('div');
    row2.className = 'wcm-row2';
    const counts = document.createElement('span');
    counts.className = 'wcm-counts';
    counts.innerHTML = `<strong>${notes.length}</strong> note${notes.length !== 1 ? 's' : ''}`;
    const tags = document.createElement('div');
    tags.className = 'wcm-tags';
    const host = hostChipFromUrl(url);
    if (host) {
        const chip = document.createElement('span');
        chip.className = 'wcm-chip';
        chip.textContent = host;
        tags.appendChild(chip);
    }
    row2.appendChild(counts);
    row2.appendChild(tags);

    head.appendChild(row1);
    head.appendChild(row2);

    const expanded = document.createElement('div');
    expanded.className = 'wcm-expanded';
    expanded.hidden = true;

    const notesList = document.createElement('div');
    notesList.className = 'work-images-list-flat';

    notes.forEach((note, index) => {
        const ta = document.createElement('textarea');
        ta.className = 'note-editor';
        ta.value = note.note || '';
        ta.placeholder = 'Empty note…';

        let timeout;
        ta.addEventListener('input', (e) => {
            clearTimeout(timeout);
            timeout = setTimeout(() => {
                const arr = window.allDataCache[url];
                if (arr && arr[index]) {
                    arr[index].note = e.target.value;
                    const update = {};
                    update[url] = arr;
                    chrome.storage.local.set(update);
                }
            }, 500);
        });
        ta.onclick = (e) => e.stopPropagation();

        notesList.appendChild(ta);
    });

    expanded.appendChild(notesList);

    let isOpen = getExpandedState(url);

    function applyOpen(open) {
        isOpen = open;
        expanded.hidden = !open;
        head.setAttribute('aria-expanded', String(open));
        card.classList.toggle('wcm-open', open);
        chevron.textContent = open ? '▾' : '▸';
        setExpandedState(url, open);
    }

    applyOpen(isOpen);

    head.addEventListener('click', () => applyOpen(!isOpen));
    head.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            applyOpen(!isOpen);
        }
    });

    card.appendChild(head);
    card.appendChild(expanded);
    return card;
}
