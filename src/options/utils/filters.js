// Filtering and sorting logic

import { isDashboardMetaKey } from './storageMeta.js';

/** Best available recency timestamp for a dashboard work row. */
export function getWorkTimestamp(work) {
    if (work.legacy) return 0;
    const meta = work.workEntry?.metadata;
    return meta?.lastUpdated || meta?.firstSeen || 0;
}

/** Stable newest-first compare for library rows. */
export function compareWorks(a, b, order = 'desc') {
    const aVal = getWorkTimestamp(a);
    const bVal = getWorkTimestamp(b);
    if (aVal !== bVal) {
        return order === 'asc' ? aVal - bVal : bVal - aVal;
    }
    return (a.storageKey || '').localeCompare(b.storageKey || '');
}

/**
 * Order works using `_index` (newest first) when present, then any leftovers.
 * @param {Record<string, unknown>} allData
 * @param {Array<{ storageKey: string }>} works
 */
export function orderWorksForDashboard(allData, works) {
    const byKey = new Map(works.map((w) => [w.storageKey, w]));
    const ordered = [];
    const seen = new Set();
    const index = Array.isArray(allData._index) ? allData._index : [];

    for (const row of index) {
        const key = row?.key;
        if (!key || seen.has(key)) continue;
        const work = byKey.get(key);
        if (!work) continue;
        ordered.push(work);
        seen.add(key);
    }

    const remaining = works.filter((w) => !seen.has(w.storageKey));
    remaining.sort((a, b) => compareWorks(a, b, 'desc'));
    ordered.push(...remaining);

    return ordered;
}

export function filterAndGroupData(allData, query = "") {
    const lowerQuery = query.toLowerCase();
    const worksByDomain = {}; // { "domain.com": [ {workEntry} ] }

    Object.keys(allData).forEach(storageKey => {
        if (isDashboardMetaKey(storageKey)) return;

        const val = allData[storageKey];
        
        // New format: work entry (work:* keys, or legacy rows that still have images)
        if (val && typeof val === 'object' && val.images != null &&
            (val.workId !== undefined || storageKey.startsWith('work:'))) {
            // New format: work entry
            const workEntry = val;
            
            // Extract domain from baseUrl or first URL variant
            let hostname = "Unknown";
            try {
                const urlToParse = workEntry.baseUrl || (workEntry.metadata?.urlVariants?.[0]) || storageKey;
                hostname = new URL(urlToParse).hostname;
            } catch (e) {
                // Try to extract from storage key if it's a URL
                try {
                    hostname = new URL(storageKey).hostname;
                } catch (e2) {
                    hostname = "Unknown";
                }
            }
            
            // Count total boxes across all images
            let totalBoxes = 0;
            let totalImages = 0;
            const allNotes = [];
            const allPageUrls = [];
            
            Object.keys(workEntry.images || {}).forEach(selector => {
                const imageData = workEntry.images[selector];
                totalImages++;
                totalBoxes += imageData.boxCount ?? (imageData.boxes?.length || 0);
                if (imageData.pageUrl) allPageUrls.push(imageData.pageUrl);
                if (typeof imageData.notePreview === 'string' && imageData.notePreview.trim()) {
                    allNotes.push(imageData.notePreview);
                } else {
                    imageData.boxes?.forEach(box => {
                        if (box.note) allNotes.push(box.note);
                    });
                }
            });
            
            // Enhanced search: displayName, workId, site, baseUrl, notes, pageUrls, image src
            const displayName = (workEntry.metadata?.displayName || '').trim();
            const matchesQuery = lowerQuery === "" ||
                (displayName && displayName.toLowerCase().includes(lowerQuery)) ||
                (workEntry.workId && workEntry.workId.toString().includes(lowerQuery)) ||
                (workEntry.site && workEntry.site.toLowerCase().includes(lowerQuery)) ||
                (workEntry.baseUrl && workEntry.baseUrl.toLowerCase().includes(lowerQuery)) ||
                allNotes.some(note => note.toLowerCase().includes(lowerQuery)) ||
                allPageUrls.some(url => url.toLowerCase().includes(lowerQuery)) ||
                Object.values(workEntry.images || {}).some(img => 
                    (img.src && img.src.toLowerCase().includes(lowerQuery))
                );
            
            if (!matchesQuery) return;
            
            if (!worksByDomain[hostname]) worksByDomain[hostname] = [];
            worksByDomain[hostname].push({
                storageKey: storageKey,
                workEntry: workEntry,
                totalBoxes: totalBoxes,
                totalImages: totalImages
            });
        } else if (Array.isArray(val)) {
            // Legacy format: array of boxes (backward compatibility)
            const notes = val;
            
            // Try to extract domain from storage key (which is a URL in legacy format)
            let hostname = "Unknown";
            try {
                hostname = new URL(storageKey).hostname;
            } catch (e) {
                hostname = "Unknown";
            }
            
            // Filter by query
            const matchesQuery = lowerQuery === "" ||
                storageKey.toLowerCase().includes(lowerQuery) ||
                notes.some(n => (n.note || "").toLowerCase().includes(lowerQuery));
            
            if (!matchesQuery) return;
            
            if (!worksByDomain[hostname]) worksByDomain[hostname] = [];
            worksByDomain[hostname].push({
                storageKey: storageKey,
                legacy: true,
                notes: notes
            });
        }
    });

    return worksByDomain;
}

export function sortWorks(works, sortBy = 'date', order = 'desc') {
    const sorted = [...works];
    
    sorted.sort((a, b) => {
        if (sortBy === 'date') {
            return compareWorks(a, b, order);
        }

        let aVal, bVal;
        
        switch (sortBy) {
            case 'site':
                aVal = a.legacy ? 'other' : (a.workEntry.site || 'other');
                bVal = b.legacy ? 'other' : (b.workEntry.site || 'other');
                break;
            case 'boxCount':
                aVal = a.totalBoxes || 0;
                bVal = b.totalBoxes || 0;
                break;
            case 'imageCount':
                aVal = a.totalImages || 0;
                bVal = b.totalImages || 0;
                break;
            default:
                return 0;
        }
        
        if (typeof aVal === 'string') {
            const cmp = order === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
            return cmp !== 0 ? cmp : (a.storageKey || '').localeCompare(b.storageKey || '');
        }
        const diff = order === 'asc' ? aVal - bVal : bVal - aVal;
        return diff !== 0 ? diff : (a.storageKey || '').localeCompare(b.storageKey || '');
    });
    
    return sorted;
}

export function filterWorks(works, filters = {}) {
    const site = filters.site;
    return works.filter((work) => {
        if (work.legacy) {
            if (!site || site === 'all') return true;
            return site === 'legacy';
        }

        if (site && site !== 'all') {
            if (site === 'legacy') return false;
            const wSite = work.workEntry.site || 'other';
            if (wSite !== site) return false;
        }
        
        // Filter by date range
        if (filters.dateFrom || filters.dateTo) {
            const lastUpdated = work.workEntry.metadata?.lastUpdated || 0;
            if (filters.dateFrom && lastUpdated < filters.dateFrom) return false;
            if (filters.dateTo && lastUpdated > filters.dateTo) return false;
        }
        
        // Filter by has notes
        if (filters.hasNotes) {
            const hasNotes = Object.values(work.workEntry.images || {}).some(img => 
                img.boxes?.some(box => box.note && box.note.trim())
            );
            if (!hasNotes) return false;
        }
        
        return true;
    });
}


