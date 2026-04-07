// Individual box note editor component

/**
 * @param {{ compact?: boolean }} [opts]
 */
export function createBoxEditor(storageKey, imageSelector, boxIndex, boxData, onUpdate, opts = {}) {
    const compact = opts.compact === true;
    const container = document.createElement('div');
    container.className = compact ? 'box-editor box-editor-compact' : 'box-editor';
    
    const editor = document.createElement('textarea');
    editor.className = 'note-editor';
    editor.value = boxData.note || "";
    editor.placeholder = compact ? 'Note…' : `Box ${boxIndex + 1} - Empty note...`;
    editor.dataset.storageKey = storageKey;
    editor.dataset.imageSelector = imageSelector;
    editor.dataset.boxIndex = boxIndex;
    
    // Box info
    const info = document.createElement('div');
    info.className = 'box-info';
    info.textContent = `Box ${boxIndex + 1}`;
    
    // Delete button
    const deleteBtn = document.createElement('button');
    deleteBtn.className = compact ? 'box-delete-btn box-delete-btn-compact' : 'box-delete-btn';
    deleteBtn.innerHTML = '×';
    deleteBtn.title = 'Delete this box';
    deleteBtn.onclick = (e) => {
        e.stopPropagation();
        if (confirm('Delete this box?')) {
            onUpdate(storageKey, imageSelector, boxIndex, null); // null means delete
        }
    };

    const editorWrapper = document.createElement('div');
    editorWrapper.className = compact ? 'box-editor-wrapper box-editor-wrapper-compact' : 'box-editor-wrapper';
    editorWrapper.style.position = 'relative';

    let timeout;
    editor.addEventListener('input', (e) => {
        clearTimeout(timeout);
        timeout = setTimeout(() => {
            onUpdate(storageKey, imageSelector, boxIndex, e.target.value);
        }, 500);
    });

    editor.onclick = (e) => e.stopPropagation();

    if (compact) {
        info.className = 'box-info box-info-compact';
        const row = document.createElement('div');
        row.className = 'box-editor-compact-toolbar';
        row.appendChild(info);
        row.appendChild(deleteBtn);
        editorWrapper.appendChild(editor);
        container.appendChild(row);
        container.appendChild(editorWrapper);
    } else {
        editorWrapper.appendChild(editor);
        editorWrapper.appendChild(deleteBtn);
        container.appendChild(info);
        container.appendChild(editorWrapper);
    }

    return container;
}
