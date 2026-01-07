// Main rendering orchestration

import { createWorkCard } from '../components/WorkCard.js';
import { filterAndGroupData, sortWorks } from './filters.js';

export function renderDashboard(allData, query = "", listContainer, onWorkDelete, onUpdate) {
    listContainer.innerHTML = "";
    
    // Filter and group data
    const worksByDomain = filterAndGroupData(allData, query);
    
    // Flatten all works into a single array (no domain grouping)
    const allWorks = [];
    Object.keys(worksByDomain).forEach(domain => {
        allWorks.push(...worksByDomain[domain]);
    });
    
    // Sort works by date (newest first)
    const sortedWorks = sortWorks(allWorks, 'date', 'desc');
    
    if (sortedWorks.length === 0) {
        listContainer.innerHTML = `<div class="empty-state">${query ? "No matches found." : "No overlays yet."}</div>`;
        return;
    }
    
    // Render works directly (no domain grouping)
    sortedWorks.forEach(work => {
        const workCard = createWorkCard(work, onWorkDelete, onUpdate);
        listContainer.appendChild(workCard);
    });
}
