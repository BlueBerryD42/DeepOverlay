// Individual box note editor component

export function createBoxEditor(storageKey, imageSelector, boxIndex, boxData, onUpdate) {
    const container = document.createElement('div');
    container.className = 'box-editor';
    
    const editor = document.createElement('textarea');
    editor.className = 'note-editor';
    editor.value = boxData.note || "";
    editor.placeholder = `Box ${boxIndex + 1} - Empty note...`;
    editor.dataset.storageKey = storageKey;
    editor.dataset.imageSelector = imageSelector;
    editor.dataset.boxIndex = boxIndex;
    
    // Box info
    const info = document.createElement('div');
    info.className = 'box-info';
    info.textContent = `Box ${boxIndex + 1}`;
    
    // Delete button
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'box-delete-btn';
    deleteBtn.innerHTML = '×';
    deleteBtn.title = 'Delete this box';
    deleteBtn.onclick = (e) => {
        e.stopPropagation();
        if (confirm('Delete this box?')) {
            onUpdate(storageKey, imageSelector, boxIndex, null); // null means delete
        }
    };
    
    // Wrap editor in container for positioning
    const editorWrapper = document.createElement('div');
    editorWrapper.className = 'box-editor-wrapper';
    editorWrapper.style.position = 'relative';
    
    // Auto-save with debounce
    let timeout;
    editor.addEventListener('input', (e) => {
        clearTimeout(timeout);
        timeout = setTimeout(() => {
            onUpdate(storageKey, imageSelector, boxIndex, e.target.value);
        }, 500);
    });
    
    // Stop propagation on click so typing doesn't close parent
    editor.onclick = (e) => e.stopPropagation();
    
    editorWrapper.appendChild(editor);
    editorWrapper.appendChild(deleteBtn);
    
    container.appendChild(info);
    container.appendChild(editorWrapper);
    
    return container;
}
