// Work card component - Flat design without collapsible sections

import { createImageCard } from './ImageCard.js';
import { getSiteBadge, formatDate } from '../utils/helpers.js';
import { removeStorageKey, saveWorkEntryWithIndex } from '../utils/storage.js';

export function createWorkCard(work, onWorkDelete, onUpdate) {
    const card = document.createElement('div');
    card.className = 'work-card-flat';
    card.dataset.storageKey = work.storageKey;
    
    if (work.legacy) {
        // Legacy format: show as page (fallback to old format)
        return createLegacyPageRow(work.storageKey, work.notes, onWorkDelete);
    }
    
    // New format: work entry
    const workEntry = work.workEntry;
    const workId = workEntry.workId || 'N/A';
    const site = workEntry.site || 'other';
    const siteBadge = getSiteBadge(site);
    
    // Work header - always visible
    const header = document.createElement('div');
    header.className = 'work-header-flat';
    
    // Left: Work info
    const workInfo = document.createElement('div');
    workInfo.className = 'work-info-flat';
    
    const workIdSpan = document.createElement('div');
    workIdSpan.className = 'work-id-flat';
    workIdSpan.innerHTML = `${siteBadge} <strong>${workId}</strong>`;
    
    const workMeta = document.createElement('div');
    workMeta.className = 'work-meta-flat';
    workMeta.innerHTML = `
        <span class="work-stats-flat">${work.totalImages} image${work.totalImages !== 1 ? 's' : ''} • ${work.totalBoxes} box${work.totalBoxes !== 1 ? 'es' : ''}</span>
        ${workEntry.metadata?.lastUpdated ? `<span class="work-date-flat">${formatDate(workEntry.metadata.lastUpdated)}</span>` : ''}
    `;
    
    workInfo.appendChild(workIdSpan);
    workInfo.appendChild(workMeta);
    
    // Right: Controls
    const controls = document.createElement('div');
    controls.className = 'work-controls-flat';
    
    const delBtn = document.createElement('button');
    delBtn.className = 'danger work-delete-btn';
    delBtn.textContent = 'Delete';
    delBtn.onclick = (e) => {
        e.stopPropagation();
        if (confirm(`Delete all overlays for work ${workId}?`)) {
            onWorkDelete(work.storageKey);
        }
    };
    
    controls.appendChild(delBtn);
    
    header.appendChild(workInfo);
    header.appendChild(controls);
    
    // Images list - always visible, no collapsible
    const imagesList = document.createElement('div');
    imagesList.className = 'work-images-list-flat';
    
    Object.keys(workEntry.images || {}).forEach(selector => {
        const imageData = workEntry.images[selector];
        const imageCard = createImageCard(
            work.storageKey,
            selector,
            imageData,
            workEntry,
            (storageKey, imageSelector) => {
                // Delete image
                const workEntry = window.allDataCache[storageKey];
                if (workEntry && workEntry.images) {
                    delete workEntry.images[imageSelector];
                    workEntry.metadata.lastUpdated = Date.now();
                    saveWorkEntryWithIndex(storageKey, workEntry).then(() => {
                        window.allDataCache[storageKey] = workEntry;
                        onUpdate();
                    });
                }
            },
            () => {
                // Box updated, refresh
                onUpdate();
            }
        );
        imagesList.appendChild(imageCard);
    });
    
    card.appendChild(header);
    card.appendChild(imagesList);
    
    return card;
}

// Legacy page row (backward compatibility)
function createLegacyPageRow(url, notes, onDelete) {
    const row = document.createElement('div');
    row.className = 'work-card-flat legacy-row';
    
    // Parse path for display
    let displayPath = url;
    try {
        const urlObj = new URL(url);
        displayPath = urlObj.pathname + urlObj.search;
        if (displayPath.length > 80) displayPath = displayPath.substring(0, 80) + "...";
    } catch (e) { }
    
    // Header
    const header = document.createElement('div');
    header.className = 'work-header-flat';
    
    // Left side: Path link
    const pathSpan = document.createElement('div');
    pathSpan.className = 'work-info-flat';
    
    const link = document.createElement('a');
    link.href = url;
    link.target = "_blank";
    link.textContent = displayPath;
    link.onclick = (e) => e.stopPropagation();
    
    pathSpan.appendChild(link);
    
    // Right side: Controls
    const controls = document.createElement('div');
    controls.className = 'work-controls-flat';
    
    const badge = document.createElement('span');
    badge.className = 'work-stats-flat';
    badge.textContent = `${notes.length} notes`;
    
    const delBtn = document.createElement('button');
    delBtn.className = 'danger work-delete-btn';
    delBtn.textContent = "Delete";
    delBtn.onclick = (e) => {
        e.stopPropagation();
        if (confirm(`Delete all notes for this page?`)) {
            onDelete(url);
        }
    };
    
    controls.appendChild(badge);
    controls.appendChild(delBtn);
    
    header.appendChild(pathSpan);
    header.appendChild(controls);
    
    // Notes list - always visible
    const notesList = document.createElement('div');
    notesList.className = 'work-images-list-flat';
    
    notes.forEach((note, index) => {
        const ta = document.createElement('textarea');
        ta.className = 'note-editor';
        ta.value = note.note || "";
        ta.placeholder = "Empty note...";
        
        let timeout;
        ta.addEventListener('input', (e) => {
            clearTimeout(timeout);
            timeout = setTimeout(() => {
                const notes = window.allDataCache[url];
                if (notes && notes[index]) {
                    notes[index].note = e.target.value;
                    const update = {};
                    update[url] = notes;
                    chrome.storage.local.set(update);
                }
            }, 500);
        });
        ta.onclick = (e) => e.stopPropagation();
        
        notesList.appendChild(ta);
    });
    
    row.appendChild(header);
    row.appendChild(notesList);
    return row;
}
