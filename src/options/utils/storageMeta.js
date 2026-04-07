/** Mirrors lib/site-adapters.mjs reserved keys for the options bundle (no import from extension root). */

export const INDEX_KEY = '_index';
export const SCHEMA_VERSION_KEY = '_schemaVersion';

export function isDashboardMetaKey(storageKey) {
    if (!storageKey || typeof storageKey !== 'string') return true;
    if (storageKey.startsWith('work:')) return false;
    if (storageKey === INDEX_KEY || storageKey === SCHEMA_VERSION_KEY) return true;
    if (storageKey === 'theme' || storageKey === 'settings') return true;
    if (storageKey.startsWith('overlay_')) return true;
    return false;
}

export function removeIndexKey(index, storageKey) {
    return (index || []).filter((e) => e.key !== storageKey);
}

/** Keep in sync with lib/site-adapters.mjs upsertIndexEntry */
export function upsertIndexRow(index, storageKey, workEntry) {
    const row = {
        key: storageKey,
        site: workEntry.site || 'generic',
        workId: workEntry.workId != null ? String(workEntry.workId) : '',
        lastUpdated: workEntry.metadata?.lastUpdated || Date.now(),
        baseUrl: workEntry.baseUrl || '',
    };
    const list = Array.isArray(index) ? [...index] : [];
    const i = list.findIndex((e) => e.key === storageKey);
    if (i >= 0) list[i] = row;
    else list.push(row);
    list.sort((a, b) => (b.lastUpdated || 0) - (a.lastUpdated || 0));
    return list;
}
