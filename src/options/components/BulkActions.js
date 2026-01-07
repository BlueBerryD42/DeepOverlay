// Bulk selection and operations component

export function createBulkActionsBar(onBulkDelete, onBulkExport, onClearSelection) {
    const bar = document.createElement('div');
    bar.className = 'bulk-actions-bar';
    bar.style.display = 'none';
    
    const left = document.createElement('div');
    left.className = 'bulk-actions-left';
    
    const count = document.createElement('span');
    count.className = 'bulk-selection-count';
    count.textContent = '0 selected';
    
    left.appendChild(count);
    
    const right = document.createElement('div');
    right.className = 'bulk-actions-right';
    
    const exportBtn = document.createElement('button');
    exportBtn.textContent = 'Export Selected';
    exportBtn.onclick = () => onBulkExport();
    
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'danger';
    deleteBtn.textContent = 'Delete Selected';
    deleteBtn.onclick = () => {
        if (confirm('Delete all selected items?')) {
            onBulkDelete();
        }
    };
    
    const clearBtn = document.createElement('button');
    clearBtn.textContent = 'Clear Selection';
    clearBtn.onclick = () => onClearSelection();
    
    right.appendChild(exportBtn);
    right.appendChild(deleteBtn);
    right.appendChild(clearBtn);
    
    bar.appendChild(left);
    bar.appendChild(right);
    
    return bar;
}

export function updateBulkActionsBar(bar, selectedCount) {
    const countEl = bar.querySelector('.bulk-selection-count');
    if (countEl) {
        countEl.textContent = `${selectedCount} selected`;
    }
    
    if (selectedCount > 0) {
        bar.style.display = 'flex';
    } else {
        bar.style.display = 'none';
    }
}


