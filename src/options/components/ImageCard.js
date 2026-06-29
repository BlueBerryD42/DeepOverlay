// Image card component with thumbnail and pageUrl display - Flat design

import { createBoxEditor } from './BoxEditor.js';
import { formatPageUrl, truncateText } from '../utils/helpers.js';
import { updateBoxNoteInStorage, saveWorkEntryWithIndex, getWorkImgRecord, saveWorkImgRecord } from '../utils/storage.js';

/**
 * @param {{ compact?: boolean }} [opts] compact: single-line header, tight box editors (library thumb view)
 */
export function createImageCard(storageKey, selector, imageData, workEntry, onImageDelete, onBoxUpdate, opts = {}) {
    const compact = opts.compact === true;
    const imageCard = document.createElement('div');
    imageCard.className = compact ? 'image-card-flat image-card-compact' : 'image-card-flat';
    imageCard.dataset.imageSelector = selector;

    const boxCount = document.createElement('span');
    boxCount.className = compact ? 'image-compact-boxcount' : 'image-box-count-flat';
    const n = imageData.boxes?.length || 0;
    boxCount.textContent = `${n} box${n !== 1 ? 'es' : ''}`;

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'image-delete-btn-flat danger';
    deleteBtn.textContent = 'Delete';
    deleteBtn.onclick = (e) => {
        e.stopPropagation();
        if (confirm('Delete this image and all its boxes?')) {
            onImageDelete(storageKey, selector);
        }
    };

    if (compact) {
        const head = document.createElement('div');
        head.className = 'image-compact-head';
        const left = document.createElement('div');
        left.className = 'image-compact-left';
        const pageLabel = document.createElement('span');
        pageLabel.className = 'image-compact-page';
        pageLabel.textContent = formatPageUrl(imageData.pageUrl, workEntry.site);
        const dot = document.createElement('span');
        dot.className = 'image-compact-dot';
        dot.textContent = '·';
        left.appendChild(pageLabel);
        left.appendChild(dot);
        left.appendChild(boxCount);
        head.appendChild(left);
        head.appendChild(deleteBtn);
        imageCard.appendChild(head);
    } else {
        const imageContainer = document.createElement('div');
        imageContainer.className = 'image-container-flat';

        const thumbnailContainer = document.createElement('div');
        thumbnailContainer.className = 'image-thumbnail-container-flat';

        if (imageData.src) {
            const thumbnail = document.createElement('img');
            thumbnail.className = 'image-thumbnail-flat';
            thumbnail.src = imageData.src;
            thumbnail.alt = 'Image thumbnail';
            thumbnail.onerror = () => {
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
            thumbnailContainer.innerHTML = `
            <svg class="thumbnail-placeholder" viewBox="0 0 100 100">
                <rect width="100" height="100" fill="var(--card-content-bg)"/>
                <path d="M30 30 L70 30 L70 70 L30 70 Z" stroke="var(--text-secondary)" stroke-width="2" fill="none"/>
                <path d="M30 30 L50 50 L70 30" stroke="var(--text-secondary)" stroke-width="2" fill="none"/>
            </svg>
        `;
        }

        const imageInfo = document.createElement('div');
        imageInfo.className = 'image-info-flat';

        const srcDisplay = imageData.src ? truncateText(imageData.src, 60) : truncateText(selector, 60);
        const srcSpan = document.createElement('div');
        srcSpan.className = 'image-src-flat';
        srcSpan.textContent = srcDisplay;
        srcSpan.title = imageData.src || selector;

        const pageUrlDiv = document.createElement('div');
        pageUrlDiv.className = 'image-pageurl-flat';
        pageUrlDiv.textContent = formatPageUrl(imageData.pageUrl, workEntry.site);

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

        const imageActions = document.createElement('div');
        imageActions.className = 'image-actions-flat';
        imageActions.appendChild(boxCount);
        imageActions.appendChild(deleteBtn);

        imageContainer.appendChild(thumbnailContainer);
        imageContainer.appendChild(imageInfo);
        imageContainer.appendChild(imageActions);
        imageCard.appendChild(imageContainer);
    }

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
                        const we = window.allDataCache[sk];
                        const meta = we?.images?.[sel];
                        const refKey = meta?.refKey;

                        // New split-storage format
                        if (refKey) {
                            getWorkImgRecord(refKey).then((imgRec) => {
                                if (!imgRec?.boxes) return;
                                imgRec.boxes.splice(idx, 1);
                                return saveWorkImgRecord(refKey, imgRec).then(() => {
                                    const notes = (imgRec.boxes || [])
                                        .map((b) => (b.note || '').trim())
                                        .filter(Boolean)
                                        .join('\n');
                                    const notePreview = notes.length > 180 ? `${notes.slice(0, 180)}…` : notes;
                                    meta.boxCount = imgRec.boxes.length;
                                    meta.notePreview = notePreview;
                                    we.metadata.lastUpdated = Date.now();
                                    return saveWorkEntryWithIndex(sk, we).then(() => {
                                        window.allDataCache[sk] = we;
                                        onBoxUpdate();
                                    });
                                });
                            });
                            return;
                        }

                        // Old format fallback
                        if (we && we.images && we.images[sel] && we.images[sel].boxes) {
                            we.images[sel].boxes.splice(idx, 1);
                            we.metadata.lastUpdated = Date.now();
                            saveWorkEntryWithIndex(sk, we).then(() => {
                                window.allDataCache[sk] = we;
                                onBoxUpdate();
                            });
                        }
                    } else {
                        updateBoxNoteInStorage(sk, sel, idx, text, window.allDataCache).then(() => {
                            onBoxUpdate();
                        });
                    }
                },
                { compact }
            );
            boxesList.appendChild(boxEditor);
        });
    } else {
        const emptyMsg = document.createElement('div');
        emptyMsg.className = 'empty-boxes-msg';
        emptyMsg.textContent = 'No boxes for this image';
        boxesList.appendChild(emptyMsg);
    }

    imageCard.appendChild(boxesList);

    return imageCard;
}
