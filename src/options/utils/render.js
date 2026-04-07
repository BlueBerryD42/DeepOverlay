// Main rendering orchestration

import { createWorkCard } from '../components/WorkCard.js';
import { filterAndGroupData, sortWorks, filterWorks } from './filters.js';

export const LIBRARY_PAGE_SIZE = 12;

function renderPaginationBar(el, { page, totalPages, totalWorks, pageSize, onPageChange }) {
    if (!el || !onPageChange) return;
    if (totalPages <= 1) {
        el.innerHTML = '';
        el.hidden = true;
        return;
    }
    el.hidden = false;
    el.innerHTML = '';
    el.className = 'do-pagination';
    el.setAttribute('role', 'navigation');
    el.setAttribute('aria-label', 'Library pages');

    const prev = document.createElement('button');
    prev.type = 'button';
    prev.className = 'do-btn';
    prev.textContent = '← Prev';
    prev.disabled = page <= 1;
    prev.onclick = () => onPageChange(page - 1);

    const info = document.createElement('span');
    info.className = 'do-pagination-info';
    const start = (page - 1) * pageSize + 1;
    const end = Math.min(page * pageSize, totalWorks);
    info.textContent = `Page ${page} / ${totalPages} · ${start}–${end} of ${totalWorks}`;

    const next = document.createElement('button');
    next.type = 'button';
    next.className = 'do-btn';
    next.textContent = 'Next →';
    next.disabled = page >= totalPages;
    next.onclick = () => onPageChange(page + 1);

    el.appendChild(prev);
    el.appendChild(info);
    el.appendChild(next);
}

/**
 * @param {Record<string, unknown>} allData
 * @param {string} query
 * @param {HTMLElement} listContainer
 * @param {(key: string) => void} onWorkDelete
 * @param {() => void} onUpdate
 * @param {{ page?: number; pageSize?: number; paginationEl?: HTMLElement | null; onPageChange?: (p: number) => void; siteFilter?: string }} [opts]
 * @returns {{ totalWorks: number; totalPages: number; currentPage: number }}
 */
export function renderDashboard(allData, query = '', listContainer, onWorkDelete, onUpdate, opts = {}) {
    const pageSize = opts.pageSize ?? LIBRARY_PAGE_SIZE;
    const requestedPage = opts.page ?? 1;
    const paginationEl = opts.paginationEl ?? null;
    const onPageChange = opts.onPageChange;
    const siteFilter = opts.siteFilter ?? 'all';

    listContainer.innerHTML = '';

    const worksByDomain = filterAndGroupData(allData, query);
    const allWorks = [];
    Object.keys(worksByDomain).forEach((domain) => {
        allWorks.push(...worksByDomain[domain]);
    });
    const sortedWorks = sortWorks(allWorks, 'date', 'desc');
    const filteredWorks = filterWorks(sortedWorks, { site: siteFilter });
    const totalWorks = filteredWorks.length;

    if (totalWorks === 0) {
        const noMatch =
            query || (siteFilter && siteFilter !== 'all')
                ? 'No works match your search or filter.'
                : 'No overlays yet.';
        listContainer.innerHTML = `<div class="empty-state">${noMatch}</div>`;
        if (paginationEl) {
            paginationEl.innerHTML = '';
            paginationEl.hidden = true;
        }
        return { totalWorks: 0, totalPages: 1, currentPage: 1 };
    }

    const totalPages = Math.max(1, Math.ceil(totalWorks / pageSize));
    const currentPage = Math.min(Math.max(1, requestedPage), totalPages);
    const start = (currentPage - 1) * pageSize;
    const pageWorks = filteredWorks.slice(start, start + pageSize);

    pageWorks.forEach((work) => {
        listContainer.appendChild(createWorkCard(work, onWorkDelete, onUpdate));
    });

    renderPaginationBar(paginationEl, {
        page: currentPage,
        totalPages,
        totalWorks,
        pageSize,
        onPageChange
    });

    return { totalWorks, totalPages, currentPage };
}
