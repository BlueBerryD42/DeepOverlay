// Utility helper functions

export function formatDate(timestamp) {
    if (!timestamp) return 'Unknown';
    const date = new Date(timestamp);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function formatDateShort(timestamp) {
    if (!timestamp) return '—';
    const date = new Date(timestamp);
    return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export function truncateText(text, maxLength = 50) {
    if (!text) return '';
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
}

const SITE_BADGE_CLASS = {
    'e-hentai': 'site-badge-ehentai',
    'x': 'site-badge-x',
    'pixiv': 'site-badge-pixiv',
    'generic': 'site-badge-other',
    'other': 'site-badge-other'
};

const SITE_BADGE_LABEL = {
    'e-hentai': 'E-H',
    'x': 'X',
    'pixiv': 'Pixiv',
    'generic': 'Web',
    'other': 'Other'
};

export function getSiteBadgeClass(site) {
    return SITE_BADGE_CLASS[site] || SITE_BADGE_CLASS.other;
}

/** DOM element for minimal cards (avoids innerHTML for badge). */
export function createSiteBadgeElement(site) {
    const span = document.createElement('span');
    span.className = `site-badge ${getSiteBadgeClass(site)}`;
    span.textContent = SITE_BADGE_LABEL[site] || SITE_BADGE_LABEL.other;
    return span;
}

export function getSiteBadge(site) {
    const cls = getSiteBadgeClass(site);
    const label = SITE_BADGE_LABEL[site] || SITE_BADGE_LABEL.other;
    return `<span class="site-badge ${cls}">${label}</span>`;
}

/** User-defined label in options library, or numeric / string work id. */
export function getWorkDisplayLabel(workEntry) {
    if (!workEntry || workEntry.workId === undefined) return 'N/A';
    const custom = (workEntry.metadata?.displayName || '').trim();
    if (custom) return custom;
    return String(workEntry.workId);
}

export function hostChipFromUrl(pageUrl) {
    if (!pageUrl) return '';
    try {
        const h = new URL(pageUrl).hostname.replace(/^www\./, '');
        return h.length > 28 ? `${h.slice(0, 26)}…` : h;
    } catch {
        return '';
    }
}

export function formatPageUrl(pageUrl, site) {
    if (!pageUrl) return 'Unknown page';
    
    try {
        const url = new URL(pageUrl);
        
        // Extract page number from URL based on site
        if (site === 'e-hentai') {
            // e-hentai.org/s/.../3373006-3 format
            const match = url.pathname.match(/-(\d+)$/);
            if (match) return `Page ${match[1]}`;
        } else if (site === 'x') {
            // x.com/.../status/.../photo/2 format
            const match = url.pathname.match(/\/photo\/(\d+)$/);
            if (match) return `Photo ${match[1]}`;
        } else if (site === 'pixiv') {
            // pixiv.net/en/artworks/.../#1 format
            const hash = url.hash.match(/#(\d+)$/);
            if (hash) return `Image ${hash[1]}`;
        }
        
        // Fallback: show pathname
        return url.pathname.split('/').pop() || 'Page';
    } catch (e) {
        return pageUrl;
    }
}

export function formatBytes(bytes) {
    if (bytes < 1024) return bytes + " B";
    else if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    else return (bytes / (1024 * 1024)).toFixed(2) + " MB";
}

export function getExpandedState(key) {
    const state = localStorage.getItem(`expanded_${key}`);
    return state === 'true';
}

export function setExpandedState(key, expanded) {
    localStorage.setItem(`expanded_${key}`, expanded.toString());
}


