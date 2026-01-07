// Domain grouping component

import { createWorkCard } from './WorkCard.js';
import { sortWorks, filterWorks } from '../utils/filters.js';
import { getExpandedState, setExpandedState } from '../utils/helpers.js';

export function createDomainGroup(domain, works, forceOpen, onWorkDelete, onUpdate) {
    const group = document.createElement('div');
    group.className = 'domain-group';
    group.dataset.domain = domain;
    
    // Calculate domain stats
    let totalWorks = works.length;
    let totalImages = 0;
    let totalBoxes = 0;
    
    works.forEach(work => {
        if (!work.legacy) {
            totalImages += work.totalImages || 0;
            totalBoxes += work.totalBoxes || 0;
        }
    });
    
    // Header
    const header = document.createElement('div');
    header.className = 'domain-header';
    if (forceOpen) header.classList.add('open');
    
    const expandedKey = `domain_${domain}`;
    const isExpanded = forceOpen || getExpandedState(expandedKey);
    if (isExpanded) header.classList.add('open');
    
    header.innerHTML = `
        <div>
            <span class="toggle-icon">▶</span>
            <span class="domain-name">${domain}</span>
        </div>
        <div class="domain-meta">
            ${totalWorks} ${totalWorks === 1 ? 'Work' : 'Works'}
            ${totalImages > 0 ? ` • ${totalImages} images` : ''}
            ${totalBoxes > 0 ? ` • ${totalBoxes} boxes` : ''}
        </div>
    `;
    
    // Works List Container
    const worksList = document.createElement('div');
    worksList.className = 'page-list';
    if (isExpanded) worksList.classList.add('open');
    
    // Click to toggle
    header.addEventListener('click', () => {
        header.classList.toggle('open');
        worksList.classList.toggle('open');
        setExpandedState(expandedKey, worksList.classList.contains('open'));
    });
    
    // Sort works (default: by date, newest first)
    const sortedWorks = sortWorks(works, 'date', 'desc');
    
    // Render Works
    sortedWorks.forEach(work => {
        const workCard = createWorkCard(work, onWorkDelete, onUpdate);
        worksList.appendChild(workCard);
    });
    
    group.appendChild(header);
    group.appendChild(worksList);
    return group;
}


