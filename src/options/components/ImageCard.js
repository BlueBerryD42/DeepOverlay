// Image card component with thumbnail and pageUrl display - Flat design

import { createBoxEditor } from './BoxEditor.js';
import { formatPageUrl, truncateText } from '../utils/helpers.js';
import { updateBoxNoteInStorage, saveWorkEntryWithIndex } from '../utils/storage.js';

export function createImageCard(storageKey, selector, imageData, workEntry, onImageDelete, onBoxUpdate) {
    const imageCard = document.createElement('div');
    imageCard.className = 'image-card-flat';
    imageCard.dataset.imageSelector = selector;
    
    // Image container
    const imageContainer = document.createElement('div');
    imageContainer.className = 'image-container-flat';
    
    // Left: Thumbnail
    const thumbnailContainer = document.createElement('div');
    thumbnailContainer.className = 'image-thumbnail-container-flat';
    
    if (imageData.src) {
        const thumbnail = document.createElement('img');
        thumbnail.className = 'image-thumbnail-flat';
        thumbnail.src = imageData.src;
        thumbnail.alt = 'Image thumbnail';
        thumbnail.onerror = () => {
            // Fallback to placeholder if image fails to load
            thumbnailContainer.innerHTML = `
                <svg class="thumbnail-placeholder" viewBox="0 0 100 100">
                    <rect width="100" height="100" fill="var(--card-content-bg)"/>
                    <path d="M30 30 L70 30 L70 70 L30 70 Z" stroke="var(--text-secondary)" stroke-width="2" fill="none"/>
                    <path d="M30 30 L50 50 L70 30" stroke="var(--text-secondary)" stroke-width="2" fill="none"/>
                </svg>
            `;
        };
        thumbnail.onclick = () => {
            window.open(imageData.src, '_blank');
        };
        thumbnailContainer.appendChild(thumbnail);
    } else {
        // Placeholder icon
        thumbnailContainer.innerHTML = `
            <svg class="thumbnail-placeholder" viewBox="0 0 100 100">
                <rect width="100" height="100" fill="var(--card-content-bg)"/>
                <path d="M30 30 L70 30 L70 70 L30 70 Z" stroke="var(--text-secondary)" stroke-width="2" fill="none"/>
                <path d="M30 30 L50 50 L70 30" stroke="var(--text-secondary)" stroke-width="2" fill="none"/>
            </svg>
        `;
    }
    
    // Center: Image info
    const imageInfo = document.createElement('div');
    imageInfo.className = 'image-info-flat';
    
    const srcDisplay = imageData.src ? truncateText(imageData.src, 60) : truncateText(selector, 60);
    const srcSpan = document.createElement('div');
    srcSpan.className = 'image-src-flat';
    srcSpan.textContent = srcDisplay;
    srcSpan.title = imageData.src || selector;
    
    // PageUrl display
    const pageUrlDiv = document.createElement('div');
    pageUrlDiv.className = 'image-pageurl-flat';
    const pageUrlText = formatPageUrl(imageData.pageUrl, workEntry.site);
    pageUrlDiv.textContent = pageUrlText;
    
    // Make pageUrl clickable if available
    if (imageData.pageUrl) {
        pageUrlDiv.style.cursor = 'pointer';
        pageUrlDiv.style.textDecoration = 'underline';
        pageUrlDiv.style.color = 'var(--accent-color)';
        pageUrlDiv.onclick = (e) => {
            e.stopPropagation();
            window.open(imageData.pageUrl, '_blank');
        };
    }
    
    imageInfo.appendChild(srcSpan);
    imageInfo.appendChild(pageUrlDiv);
    
    // Right: Box count + Actions
    const imageActions = document.createElement('div');
    imageActions.className = 'image-actions-flat';
    
    const boxCount = document.createElement('span');
    boxCount.className = 'image-box-count-flat';
    boxCount.textContent = `${imageData.boxes?.length || 0} box${(imageData.boxes?.length || 0) !== 1 ? 'es' : ''}`;
    
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'image-delete-btn-flat danger';
    deleteBtn.textContent = 'Delete';
    deleteBtn.onclick = (e) => {
        e.stopPropagation();
        if (confirm('Delete this image and all its boxes?')) {
            onImageDelete(storageKey, selector);
        }
    };
    
    imageActions.appendChild(boxCount);
    imageActions.appendChild(deleteBtn);
    
    imageContainer.appendChild(thumbnailContainer);
    imageContainer.appendChild(imageInfo);
    imageContainer.appendChild(imageActions);
    
    // Boxes list - always visible below image
    const boxesList = document.createElement('div');
    boxesList.className = 'boxes-list-flat';
    
    if (imageData.boxes && imageData.boxes.length > 0) {
        imageData.boxes.forEach((box, index) => {
            const boxEditor = createBoxEditor(
                storageKey,
                selector,
                index,
                box,
                (sk, sel, idx, text) => {
                    if (text === null) {
                        // Delete box
                        const workEntry = window.allDataCache[sk];
                        if (workEntry && workEntry.images && workEntry.images[sel]) {
                            workEntry.images[sel].boxes.splice(idx, 1);
                            workEntry.metadata.lastUpdated = Date.now();
                            saveWorkEntryWithIndex(sk, workEntry).then(() => {
                                window.allDataCache[sk] = workEntry;
                                onBoxUpdate();
                            });
                        }
                    } else {
                        updateBoxNoteInStorage(sk, sel, idx, text, window.allDataCache).then(() => {
                            onBoxUpdate();
                        });
                    }
                }
            );
            boxesList.appendChild(boxEditor);
        });
    } else {
        const emptyMsg = document.createElement('div');
        emptyMsg.className = 'empty-boxes-msg';
        emptyMsg.textContent = 'No boxes for this image';
        boxesList.appendChild(emptyMsg);
    }
    
    imageCard.appendChild(imageContainer);
    imageCard.appendChild(boxesList);
    
    return imageCard;
}
