// Utility helper functions

export function formatDate(timestamp) {
    if (!timestamp) return 'Unknown';
    const date = new Date(timestamp);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function truncateText(text, maxLength = 50) {
    if (!text) return '';
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
}

export function getSiteBadge(site) {
    const badges = {
        'e-hentai': '<span class="site-badge site-badge-ehentai">E-H</span>',
        'x': '<span class="site-badge site-badge-x">X</span>',
        'pixiv': '<span class="site-badge site-badge-pixiv">P</span>',
        'other': '<span class="site-badge site-badge-other">•</span>'
    };
    return badges[site] || badges['other'];
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


