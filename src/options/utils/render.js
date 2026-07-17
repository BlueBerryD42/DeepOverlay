// Main rendering orchestration

import { createWorkCard } from '../components/WorkCard.js';
import { filterAndGroupData, orderWorksForDashboard, filterWorks } from './filters.js';
import { renderPaginationBar } from './paginationBar.js';

export const LIBRARY_PAGE_SIZE = 12;

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
    const sortedWorks = orderWorksForDashboard(allData, allWorks);
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
        totalItems: totalWorks,
        pageSize,
        onPageChange,
        ariaLabel: 'Library pages',
    });

    return { totalWorks, totalPages, currentPage };
}
