// Scope isolation
(function () {
    if (window.hasDeepOverlay) return;

    function isHostDisabledForOverlay(hosts, hostname) {
        const h = hostname.toLowerCase();
        for (const raw of hosts || []) {
            let p = String(raw).trim().toLowerCase();
            if (!p) continue;
            if (p.startsWith('*.')) p = p.slice(2);
            if (h === p || h.endsWith('.' + p)) return true;
        }
        return false;
    }

    function adapters() {
        return globalThis.DeepOverlayAdapters;
    }

    /** Fixed viewport shell (#deep-overlay-root); does not affect document scroll metrics. */
    let shell;
    /** Document-sized layer (#deep-overlay-layer); holds notes; synced with scroll via transform. */
    let root, isEditMode = false;
    let lastUrl = window.location.href.split('?')[0];

    // Interaction State
    let interactionMode = 'NONE'; // 'DRAW', 'MOVE', 'RESIZE'
    let startX, startY, activeBox = null;
    let initialLeft, initialTop, initialWidth, initialHeight;
    let isDrawing = false;

    // Image Selection State
    let imageSelectionMode = false; // Separate from isEditMode
    let selectedImages = new Map(); // Map<imageElement, {overlayContainer, resizeObserver, lastPosition}>
    let hoveredImage = null; // Currently hovered image element
    let imageResizeObservers = new Map(); // Map<imageElement, ResizeObserver>
    
    // Position tracking for dynamic layout changes
    let positionCheckInterval = null;
    let lastPositionCheckTime = 0;

    // --- Init ---
    function init() {
        if (!adapters()) {
            console.error('DeepOverlay: adapters.js must load before content.js (check manifest).');
            return;
        }

        shell = document.createElement('div');
        shell.id = 'deep-overlay-root';
        shell.classList.add('active');

        root = document.createElement('div');
        root.id = 'deep-overlay-layer';

        shell.appendChild(root);
        (document.body || document.documentElement).appendChild(shell);

        syncLayerScroll();

        // Initial setup
        checkUrlChange();
        setEditMode(false);
        
        // Image selection mode setup
        setupImageSelection();

        // --- Event Listeners ---

        // 1. Root Click Blocking (Edit Mode)
        // Also capture window clicks to prevent interaction with underlying page
        window.addEventListener('click', (e) => {
            if (isEditMode) {
                // Allow interaction with our own UI (root and children)
                if (shell.contains(e.target)) return;
                
                // Allow clicks on images when in image selection mode
                if (imageSelectionMode && e.target.tagName === 'IMG') {
                    return; // Let handleImageClick handle it
                }

                e.stopPropagation();
                e.stopImmediatePropagation();
                e.preventDefault();
            }
        }, true);

        root.addEventListener('click', (e) => {
            if (isEditMode) {
                // Allow clicks on images when in image selection mode
                if (imageSelectionMode && e.target.tagName === 'IMG') {
                    return; // Let handleImageClick handle it
                }
                
                // If clicking root background (not box/handle), stop it
                if (e.target === root) {
                    e.stopPropagation();
                    e.preventDefault();
                }
            }
        });

        // 2. Key Trap (Edit Mode)
        window.addEventListener('keydown', (e) => {
            if (isEditMode && shell.classList.contains('active')) {
                // Allow typing ONLY in our own notes
                if (e.target.classList.contains('deep-note-input')) {
                    // Let it pass to the textarea (don't preventDefault)
                    // But we rely on the textarea's own listener to stop bubbling
                    return;
                }

                // Block everything else (Page shortcuts, scrolling, typing in page inputs)
                e.stopPropagation();
                e.stopImmediatePropagation();
                e.preventDefault();
            }
        }, true);

        // 3. Mouse Interactions
        root.addEventListener('mousedown', onMouseDown);
        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);

        // 4. Responsive Updates
        // Update positions whenever the page changes layout (resize, scroll, etc)
        window.addEventListener('resize', () => {
            requestUpdate();
            updateImageOverlayPositions();
        });
        window.addEventListener('scroll', () => {
            requestUpdate();
            updateImageOverlayPositions();
        }, true); // Capture globally

        // 5. App Navigation
        setInterval(checkUrlChange, 1000);
        window.addEventListener('popstate', checkUrlChange);
        
        // 5.5. Layout change detection (MutationObserver for dynamic layouts)
        setupLayoutChangeDetection();
        
        // 5.5. Page Load Events - Reload boxes after page/images are fully loaded
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => {
                // Wait a bit for images to start loading
                setTimeout(() => loadBoxes(), 100);
            });
        } else {
            // DOM already loaded, but images might still be loading
            setTimeout(() => loadBoxes(), 100);
        }
        
        // Also reload boxes when window fully loads (including images)
        window.addEventListener('load', () => {
            setTimeout(() => loadBoxes(), 200);
        });

        // 6. Messages
        chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
            if (msg.action === "TOGGLE") toggleVisibility();
            else if (msg.action === "GET_STATUS") {
                sendResponse({ active: shell.classList.contains('active'), isEditMode });
            }
            else if (msg.action === "SET_EDIT_MODE") {
                setEditMode(msg.enabled);
                sendResponse({ success: true });
            }
        });

        // 7. Visual Settings
        applyVisualSettings();
        chrome.storage.onChanged.addListener((changes, area) => {
            if (area === 'local') {
                if (changes.overlay_opacity || changes.overlay_border_color || changes.overlay_bg_color) {
                    applyVisualSettings();
                }
            }
        });
    }

    // --- Visual Settings ---
    function applyVisualSettings() {
        chrome.storage.local.get(['overlay_opacity', 'overlay_border_color', 'overlay_bg_color'], (res) => {
            if (!shell) return;
            const op = res.overlay_opacity || 1.0;
            const borderColor = res.overlay_border_color || '#000000';
            const bgColor = res.overlay_bg_color || '#ffffff';

            // Set CSS Variables for border and background colors (used in styles.css for .deep-box)
            shell.style.setProperty('--deep-border-color', borderColor);
            shell.style.setProperty('--deep-bg-color', bgColor);

            // Apply opacity ONLY to the overlay boxes, not the root (to avoid affecting tooltips)
            document.querySelectorAll('.deep-box').forEach(box => {
                box.style.opacity = op;
            });
        });
    }

    // Helper to apply visual settings to a single box
    function applyVisualSettingsToBox(box) {
        chrome.storage.local.get(['overlay_opacity'], (res) => {
            if (!box) return;
            const op = res.overlay_opacity || 1.0;
            box.style.opacity = op;
        });
    }

    // --- Anchoring Logic ---

    // Generate a unique CSS selector for an element
    function getUniqueSelector(el) {
        if (!el || el === document.body || el === document.documentElement) return null;
        if (el.id) return '#' + el.id;

        let path = [];
        while (el.parentElement) {
            let tag = el.tagName.toLowerCase();
            if (el.id) {
                path.unshift('#' + el.id);
                break; // ID is unique enough
            } else {
                let sibling = el, nth = 1;
                while (sibling = sibling.previousElementSibling) {
                    if (sibling.tagName.toLowerCase() == tag) nth++;
                }
                path.unshift(`${tag}:nth-of-type(${nth})`);
            }
            el = el.parentElement;
        }
        return path.join(' > ');
    }

    // Recalculate positions of all boxes based on their anchors
    let updateScheduled = false;
    function requestUpdate() {
        if (updateScheduled) return;
        updateScheduled = true;
        requestAnimationFrame(() => {
            updateBoxPositions();
            updateScheduled = false;
        });
    }

    /** Keeps the document layer sized to scroll extents without expanding <html> scroll overflow. */
    function syncLayerScroll() {
        if (!root) return;
        const w = Math.max(document.documentElement.scrollWidth, window.innerWidth);
        const h = Math.max(document.documentElement.scrollHeight, window.innerHeight);
        root.style.width = w + 'px';
        root.style.height = h + 'px';
        root.style.transform = `translate3d(${-window.scrollX}px, ${-window.scrollY}px, 0)`;
    }

    function updateBoxPositions() {
        if (!root) return;

        syncLayerScroll();

        // First, update all image overlay container positions
        selectedImages.forEach((containerData, img) => {
            if (containerData.overlayContainer && isImageVisible(img)) {
                updateImageOverlayPosition(containerData.overlayContainer, img);
                updateBoxesInOverlay(containerData.overlayContainer, img);
            }
        });

        // Then update boxes that are anchored to generic elements (not in image overlays)
        document.querySelectorAll('.deep-box').forEach(box => {
            // Skip boxes that are in image overlays (they're handled above)
            if (box.closest('.deep-image-overlay')) return;
            
            if (box.dataset.anchorSelector) {
                try {
                    const anchor = document.querySelector(box.dataset.anchorSelector);
                    if (anchor) {
                        const rect = anchor.getBoundingClientRect();
                        // Recover absolute position from relative ratio
                        // RatioX = (BoxCenter - AnchorLeft) / AnchorWidth ??
                        // Let's use simpler: RatioX = (BoxLeft - AnchorLeft)
                        // No, let's use percentage to be responsive.

                        // Storage format: { anchorSelector, rX (0-1), rY (0-1), w, h }
                        // BoxLeft = AnchorLeft + (AnchorWidth * rX)
                        // This handles resizing images/containers perfectly!

                        const rX = parseFloat(box.dataset.rX);
                        const rY = parseFloat(box.dataset.rY);
                        const rW = parseFloat(box.dataset.rW);
                        const rH = parseFloat(box.dataset.rH);

                        // Calculate absolute page position
                        const absLeft = rect.left + window.scrollX + (rect.width * rX);
                        const absTop = rect.top + window.scrollY + (rect.height * rY);

                        box.style.left = absLeft + 'px';
                        box.style.top = absTop + 'px';

                        // Apply relative scaling if ratios exist
                        if (!isNaN(rW) && !isNaN(rH)) {
                            box.style.width = (rect.width * rW) + 'px';
                            box.style.height = (rect.height * rH) + 'px';
                        }
                    }
                } catch (e) { /* Sentinel */ }
            }
        });
    }

    // --- Interaction ---

    function onMouseDown(e) {
        if (!isEditMode) return;
        if (e.target.tagName !== 'TEXTAREA') e.preventDefault();

        // If clicking on an image in selection mode, let handleImageClick handle it
        if (imageSelectionMode && e.target.tagName === 'IMG') {
            return; // Let handleImageClick handle it
        }
        
        // If in image selection mode but no images selected yet, don't allow drawing
        if (imageSelectionMode && selectedImages.size === 0) {
            e.preventDefault();
            e.stopPropagation();
            return;
        }

        const pageX = e.pageX;
        const pageY = e.pageY;

        if (e.target.classList.contains('deep-resize-handle')) {
            interactionMode = 'RESIZE';
            activeBox = e.target.parentElement;
            startX = pageX; startY = pageY;
            initialWidth = parseInt(activeBox.style.width);
            initialHeight = parseInt(activeBox.style.height);
            e.stopPropagation();
        } else if (e.target.classList.contains('deep-box')) {
            interactionMode = 'MOVE';
            activeBox = e.target;
            const overlayContainer = activeBox.closest('.deep-image-overlay');
            if (overlayContainer) {
                // Box is in an overlay - use relative coordinates
                const overlayRect = overlayContainer.getBoundingClientRect();
                startX = e.clientX - overlayRect.left;
                startY = e.clientY - overlayRect.top;
            } else {
                // Box is in root - use page coordinates
                startX = pageX;
                startY = pageY;
            }
            initialLeft = parseInt(activeBox.style.left) || 0;
            initialTop = parseInt(activeBox.style.top) || 0;
            e.stopPropagation();
        } else if (e.target === root || e.target.classList.contains('deep-image-overlay')) {
            // Only allow drawing if we have selected images and clicking on their overlay
            if (imageSelectionMode && selectedImages.size === 0) {
                // In image selection mode but no images selected - don't draw
                return;
            }
            
            // Find which image overlay we're clicking on
            let targetOverlay = e.target.classList.contains('deep-image-overlay') 
                ? e.target 
                : e.target.closest('.deep-image-overlay');
            
            if (targetOverlay && imageSelectionMode) {
                // Drawing within an image overlay - use percentage coordinates
                interactionMode = 'DRAW';
                const overlayRect = targetOverlay.getBoundingClientRect();
                const img = findImageForOverlay(targetOverlay);
                if (!img) return;
                
                const imgRect = img.getBoundingClientRect();
                const relX = e.clientX - overlayRect.left;
                const relY = e.clientY - overlayRect.top;
                
                // Calculate percentage positions
                const percentLeft = relX / imgRect.width;
                const percentTop = relY / imgRect.height;
                
                startX = relX;
                startY = relY;

                activeBox = document.createElement('div');
                activeBox.className = 'deep-box';
                activeBox.style.left = relX + 'px';
                activeBox.style.top = relY + 'px';
                
                // Store percentage values for responsive positioning
                activeBox.dataset.percentLeft = percentLeft;
                activeBox.dataset.percentTop = percentTop;
                activeBox.dataset.imageSelector = targetOverlay.dataset.imageSelector;

                // Apply visual settings to new box
                applyVisualSettingsToBox(activeBox);

                const handle = document.createElement('div');
                handle.className = 'deep-resize-handle';
                activeBox.appendChild(handle);
                targetOverlay.appendChild(activeBox);
            } else if (e.target === root && !imageSelectionMode) {
                // Original behavior: drawing on root
                interactionMode = 'DRAW';
                startX = pageX; startY = pageY;

                activeBox = document.createElement('div');
                activeBox.className = 'deep-box';
                activeBox.style.left = startX + 'px';
                activeBox.style.top = startY + 'px';

                // Apply visual settings to new box
                applyVisualSettingsToBox(activeBox);

                const handle = document.createElement('div');
                handle.className = 'deep-resize-handle';
                activeBox.appendChild(handle);
                root.appendChild(activeBox);
            }
        }
    }

    function onMouseMove(e) {
        if (interactionMode === 'NONE') return;
        
        // Check if we're working within an image overlay
        const overlayContainer = activeBox?.closest('.deep-image-overlay');
        let currentX, currentY;
        
        if (overlayContainer && interactionMode === 'DRAW') {
            // For drawing in image overlay, use relative coordinates
            const overlayRect = overlayContainer.getBoundingClientRect();
            currentX = e.clientX - overlayRect.left;
            currentY = e.clientY - overlayRect.top;
        } else {
            // Use page coordinates for root-level operations
            currentX = e.pageX;
            currentY = e.pageY;
        }

        if (interactionMode === 'DRAW') {
            const width = Math.abs(currentX - startX);
            const height = Math.abs(currentY - startY);
            activeBox.style.width = width + 'px';
            activeBox.style.height = height + 'px';
            activeBox.style.left = Math.min(currentX, startX) + 'px';
            activeBox.style.top = Math.min(currentY, startY) + 'px';
            
            // Update percentage values if box is in an image overlay
            const overlayContainer = activeBox.closest('.deep-image-overlay');
            if (overlayContainer && activeBox.dataset.imageSelector) {
                const img = findImageForOverlay(overlayContainer);
                if (img) {
                    const imgRect = img.getBoundingClientRect();
                    const percentLeft = parseFloat(activeBox.style.left) / imgRect.width;
                    const percentTop = parseFloat(activeBox.style.top) / imgRect.height;
                    const percentWidth = parseFloat(activeBox.style.width) / imgRect.width;
                    const percentHeight = parseFloat(activeBox.style.height) / imgRect.height;
                    
                    activeBox.dataset.percentLeft = percentLeft;
                    activeBox.dataset.percentTop = percentTop;
                    activeBox.dataset.percentWidth = percentWidth;
                    activeBox.dataset.percentHeight = percentHeight;
                }
            }
        } else if (interactionMode === 'MOVE') {
            // For move, check if box is in an overlay
            if (overlayContainer) {
                const overlayRect = overlayContainer.getBoundingClientRect();
                const relX = e.clientX - overlayRect.left;
                const relY = e.clientY - overlayRect.top;
                const newLeft = initialLeft + (relX - startX);
                const newTop = initialTop + (relY - startY);
                activeBox.style.left = newLeft + 'px';
                activeBox.style.top = newTop + 'px';
                
                // Update percentage values
                const img = findImageForOverlay(overlayContainer);
                if (img && activeBox.dataset.imageSelector) {
                    const imgRect = img.getBoundingClientRect();
                    activeBox.dataset.percentLeft = newLeft / imgRect.width;
                    activeBox.dataset.percentTop = newTop / imgRect.height;
                }
            } else {
                activeBox.style.left = (initialLeft + (currentX - startX)) + 'px';
                activeBox.style.top = (initialTop + (currentY - startY)) + 'px';
            }
        } else if (interactionMode === 'RESIZE') {
            if (overlayContainer) {
                const overlayRect = overlayContainer.getBoundingClientRect();
                const relX = e.clientX - overlayRect.left;
                const relY = e.clientY - overlayRect.top;
                const newWidth = Math.max(20, initialWidth + (relX - startX));
                const newHeight = Math.max(20, initialHeight + (relY - startY));
                activeBox.style.width = newWidth + 'px';
                activeBox.style.height = newHeight + 'px';
                
                // Update percentage values
                const img = findImageForOverlay(overlayContainer);
                if (img && activeBox.dataset.imageSelector) {
                    const imgRect = img.getBoundingClientRect();
                    activeBox.dataset.percentWidth = newWidth / imgRect.width;
                    activeBox.dataset.percentHeight = newHeight / imgRect.height;
                }
            } else {
                activeBox.style.width = Math.max(20, initialWidth + (currentX - startX)) + 'px';
                activeBox.style.height = Math.max(20, initialHeight + (currentY - startY)) + 'px';
            }
        }
    }

    function onMouseUp(e) {
        if (interactionMode === 'NONE') return;

        if (interactionMode === 'DRAW' && parseInt(activeBox.style.width) < 20) {
            activeBox.remove();
            interactionMode = 'NONE';
            return;
        }

        // Ensure percentage values are calculated for boxes in image overlays
        const overlayContainer = activeBox?.closest('.deep-image-overlay');
        if (overlayContainer && activeBox.dataset.imageSelector) {
            const img = findImageForOverlay(overlayContainer);
            if (img) {
                const imgRect = img.getBoundingClientRect();
                const boxRect = activeBox.getBoundingClientRect();
                
                // Calculate and store final percentage values
                activeBox.dataset.percentLeft = ((boxRect.left - imgRect.left) / imgRect.width);
                activeBox.dataset.percentTop = ((boxRect.top - imgRect.top) / imgRect.height);
                activeBox.dataset.percentWidth = (boxRect.width / imgRect.width);
                activeBox.dataset.percentHeight = (boxRect.height / imgRect.height);
            }
        }

        if (interactionMode === 'DRAW') {
            setupBoxEvents(activeBox);
            if (isEditMode) selectBox(activeBox);
        }

        calculateAnchors(activeBox); // CRITICAL: Find anchor now
        saveAllBoxes();
        interactionMode = 'NONE';
        activeBox = null;
    }

    // Find the element below the box and attach logic
    function calculateAnchors(box) {
        // Check if box is in an image overlay - if so, anchor to the image
        const overlayContainer = box.closest('.deep-image-overlay');
        if (overlayContainer && box.dataset.imageSelector) {
            const img = findImageForOverlay(overlayContainer);
            if (img) {
                // Box is anchored to an image - use percentage-based positioning
                const imgRect = img.getBoundingClientRect();
                const boxRect = box.getBoundingClientRect();
                
                // Calculate percentage positions relative to image
                const percentLeft = (boxRect.left - imgRect.left) / imgRect.width;
                const percentTop = (boxRect.top - imgRect.top) / imgRect.height;
                const percentWidth = boxRect.width / imgRect.width;
                const percentHeight = boxRect.height / imgRect.height;
                
                // Store image selector and percentages
                box.dataset.imageSelector = overlayContainer.dataset.imageSelector;
                box.dataset.percentLeft = percentLeft;
                box.dataset.percentTop = percentTop;
                box.dataset.percentWidth = percentWidth;
                box.dataset.percentHeight = percentHeight;
                
                // Also store image src for reference
                box.dataset.imageSrc = img.src || '';
                return;
            }
        }
        
        // Original behavior: anchor to generic element (for boxes not in image overlays)
        // 1. Measure Box FIRST (while visible)
        const rect = box.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;

        // 2. Temporarily hide overlay to see what's underneath
        const prevDisplay = shell.style.display;
        shell.style.display = 'none';

        // 3. Find Element
        const el = document.elementFromPoint(centerX, centerY);

        // 4. Restore
        shell.style.display = prevDisplay;

        // If we found a valid element (not html/body ideally, but fallback is ok)
        // Actually, we want to anchor to something specific if possible.
        // If el is null or body, we fallback to page coordinates (no anchor).

        if (el && el !== document.documentElement && el !== document.body) {
            const elRect = el.getBoundingClientRect();
            // Calculate relative percentage position
            // BoxLeft = AnchorLeft + (AnchorWidth * rX) -> rX = (BoxLeft - AnchorLeft) / AnchorWidth
            // But verify: BoxLeft is absolute page coord. elRect.left is viewport.
            // Be consistent. Use Viewport coords for calculation.

            const rX = (rect.left - elRect.left) / elRect.width;
            const rY = (rect.top - elRect.top) / elRect.height;
            const rW = rect.width / elRect.width;
            const rH = rect.height / elRect.height;

            const selector = getUniqueSelector(el);
            if (selector) {
                box.dataset.anchorSelector = selector;
                box.dataset.rX = rX;
                box.dataset.rY = rY;
                box.dataset.rW = rW;
                box.dataset.rH = rH;
                // console.log("Anchored to", selector, rX, rY, rW, rH);
                return;
            }
        }

        // Fallback: Clear anchor if not found
        delete box.dataset.anchorSelector;
    }

    // --- Box & Storage ---
    function setupBoxEvents(box) {
        box.addEventListener('click', (e) => {
            e.stopPropagation();
            if (isEditMode && interactionMode === 'NONE') selectBox(box);
        });

        // Tooltip events (JS-based for positioning)
        box.addEventListener('mouseenter', () => showTooltip(box));
        box.addEventListener('mouseleave', hideTooltip);
        // Also hide on interaction begin to prevent stuck tooltips
        box.addEventListener('mousedown', hideTooltip);

        if (!box.querySelector('.deep-resize-handle')) {
            const h = document.createElement('div');
            h.className = 'deep-resize-handle';
            box.appendChild(h);
        }
    }

    let tooltipEl = null;

    function showTooltip(box) {
        if (isEditMode) return; // Don't show in edit mode
        const note = box.dataset.note;
        if (!note) return;

        if (!tooltipEl) {
            tooltipEl = document.createElement('div');
            tooltipEl.className = 'deep-tooltip';
            root.appendChild(tooltipEl);
        }

        tooltipEl.textContent = note;
        tooltipEl.style.display = 'block';

        requestAnimationFrame(() => {
            const boxRect = box.getBoundingClientRect();
            const tooltipRect = tooltipEl.getBoundingClientRect();
            const viewportWidth = document.documentElement.clientWidth;
            const viewportHeight = document.documentElement.clientHeight; // Exclude scrollbar

            // Default: Bottom-Left aligned relative to box
            let left = boxRect.left + window.scrollX;
            let top = boxRect.bottom + window.scrollY + 5;

            // 1. Horizontal Clamp
            if (left + tooltipRect.width > window.scrollX + viewportWidth - 10) {
                left = (window.scrollX + viewportWidth) - tooltipRect.width - 10;
            }
            if (left < window.scrollX + 10) {
                left = window.scrollX + 10;
            }

            // 2. Vertical Flip
            if (boxRect.bottom + 5 + tooltipRect.height > window.scrollY + viewportHeight - 10) {
                top = boxRect.top + window.scrollY - tooltipRect.height - 5;
            }

            // 3. Top Safety
            if (top < window.scrollY + 5) {
                top = window.scrollY + 5;
            }
            // 4. Bottom clamp if still too low logic
            // ...

            tooltipEl.style.left = left + 'px';
            tooltipEl.style.top = top + 'px';
        });
    }

    function hideTooltip() {
        if (tooltipEl) {
            tooltipEl.style.display = 'none';
        }
    }

    function selectBox(box) {
        document.querySelectorAll('.deep-box').forEach(b => b.classList.remove('selected'));
        document.querySelectorAll('.deep-edit-bubble').forEach(b => b.remove());
        box.classList.add('selected');
        createBubble(box);
    }

    function createBubble(box) {
        const bubble = document.createElement('div');
        bubble.className = 'deep-edit-bubble';

        // Critical: Prevent root's onMouseDown from blocking interactions (selects/buttons)
        bubble.addEventListener('mousedown', (e) => e.stopPropagation());

        const ta = document.createElement('textarea');
        ta.classList.add('deep-note-input');
        ta.placeholder = "Write a note...";
        ta.value = box.dataset.note || "";
        ta.addEventListener('keydown', (e) => e.stopPropagation());
        ta.focus();

        // Metadata / Status Bar
        const metaBar = document.createElement('div');
        metaBar.className = 'deep-meta-bar';
        metaBar.style.display = 'none'; // Hidden until scan
        metaBar.style.padding = '4px 8px';
        metaBar.style.fontSize = '11px';
        metaBar.style.color = '#555';
        metaBar.style.borderTop = '1px solid #eee';
        metaBar.style.background = '#fafafa';
        metaBar.style.display = 'flex';
        metaBar.style.justifyContent = 'space-between';
        metaBar.style.flexWrap = 'wrap';
        metaBar.style.gap = '4px';

        // Options Bar (Orientation)
        const optionsBar = document.createElement('div');
        optionsBar.style.display = 'flex';
        optionsBar.style.gap = '5px';
        optionsBar.style.alignItems = 'center';

        const langSelect = document.createElement('select');
        langSelect.style.fontSize = '11px';
        langSelect.style.border = '1px solid #ccc';
        langSelect.style.borderRadius = '3px';
        langSelect.style.padding = '2px';
        langSelect.style.cursor = 'pointer';
        langSelect.style.background = '#fff'; // Force white bg
        langSelect.style.color = '#333';      // Force dark text
        // Add Chinese options
        langSelect.innerHTML = `
            <option value="jpn_vert">JPN (Vert)</option>
            <option value="jpn">JPN (Horz)</option>
            <option value="chi">CHN</option>
            <option value="chi_vert">CHN (Vert)</option>
            <option value="eng">ENG</option>
            <option value="kor">KOR</option>
            <option value="kor_vert">KOR (Vert)</option>
        `;

        // Scan Button
        const scanBtn = document.createElement('button');
        scanBtn.innerText = "Scan";
        scanBtn.title = "Extract text from image";
        scanBtn.onclick = () => scanBox(box, ta, metaBar, langSelect.value);

        optionsBar.appendChild(scanBtn);
        optionsBar.appendChild(langSelect);

        const btn = document.createElement('button');
        btn.innerText = "Save";
        btn.onclick = () => {
            box.dataset.note = ta.value;
            saveAllBoxes();
            bubble.remove();
        };

        const delBtn = document.createElement('button');
        delBtn.innerText = "Delete";
        delBtn.onclick = () => {
            box.remove();
            saveAllBoxes();
            bubble.remove();
        };

        const actions = document.createElement('div');
        actions.className = 'actions';
        actions.style.display = 'flex';
        actions.style.justifyContent = 'space-between';
        actions.style.alignItems = 'center';


        const rightActions = document.createElement('div');
        rightActions.style.display = 'flex';
        rightActions.style.gap = '5px';
        rightActions.appendChild(delBtn);
        rightActions.appendChild(btn);

        actions.appendChild(optionsBar);
        actions.appendChild(rightActions);

        bubble.appendChild(ta);
        bubble.appendChild(metaBar);
        bubble.appendChild(actions);
        root.appendChild(bubble);

        // --- Positioning Logic with Boundary Detection ---
        requestAnimationFrame(() => {
            const rect = box.getBoundingClientRect();
            const bubbleRect = bubble.getBoundingClientRect();
            const viewportWidth = document.documentElement.clientWidth;
            const viewportHeight = document.documentElement.clientHeight;

            let left = rect.left + window.scrollX;
            let top = rect.bottom + window.scrollY + 10;

            if (left + bubbleRect.width > window.scrollX + viewportWidth - 20) {
                left = (window.scrollX + viewportWidth) - bubbleRect.width - 20;
            }
            if (left < window.scrollX + 20) {
                left = window.scrollX + 20;
            }

            if (top + bubbleRect.height > window.scrollY + viewportHeight - 20) {
                top = rect.top + window.scrollY - bubbleRect.height - 10;
            }

            if (top < window.scrollY + 10) {
                top = window.scrollY + 10;
            }

            bubble.style.left = left + 'px';
            bubble.style.top = top + 'px';

            ta.focus();
        });
    }

    async function scanBox(box, textarea, metaBar, lang) {

        // --- 1. Client-Side Counter Check ---
        const quotaKey = adapters().QUOTA_KEY;
        const currentMonth = new Date().toISOString().slice(0, 7); // YYYY-MM
        const quotaData = await chrome.storage.local.get([quotaKey, 'ocr_quota']);
        let usage = quotaData[quotaKey] || quotaData.ocr_quota || { count: 0, month: currentMonth };

        if (usage.month !== currentMonth) {
            usage = { count: 0, month: currentMonth }; // Reset new month
        }

        if (usage.count >= 1000) {
            alert("Monthly Free OCR Limit (1000) Reached. Please wait until next month.");
            metaBar.innerHTML = `<span style="color:red">Limit Reached (1000/1000)</span>`;
            return;
        }

        // --- 2. Prepare Scan ---
        metaBar.style.display = 'flex';
        metaBar.innerHTML = '<span>Scanning...</span>';

        try {
            const response = await chrome.runtime.sendMessage({ action: "CAPTURE_VISIBLE_TAB" });
            if (response.error || !response.dataUrl) {
                throw new Error(response.error || "Capture failed");
            }

            const image = new Image();
            image.onload = async () => {
                const canvas = document.createElement('canvas');
                const boxRect = box.getBoundingClientRect();
                const dpr = window.devicePixelRatio || 1;
                canvas.width = boxRect.width * dpr;
                canvas.height = boxRect.height * dpr;

                const ctx = canvas.getContext('2d');
                ctx.drawImage(image,
                    boxRect.left * dpr, boxRect.top * dpr, boxRect.width * dpr, boxRect.height * dpr,
                    0, 0, canvas.width, canvas.height
                );

                const cropUrl = canvas.toDataURL('image/png');

                // Show Preview Link
                metaBar.innerHTML = `
                    <span>Scanning...</span>
                    <a href="#" style="color:#2196f3; font-size:10px" id="deep-preview-link">View Image</a>
                `;
                setTimeout(() => {
                    const lnk = metaBar.querySelector('#deep-preview-link');
                    if (lnk) lnk.onclick = (e) => {
                        e.preventDefault();
                        const win = window.open("", "Preview", "width=400,height=400");
                        if (win) {
                            win.document.body.innerHTML = '';
                            win.document.write(`<img src="${cropUrl}" style="border:1px solid red; max-width:100%"/>`);
                            win.document.close();
                        }
                    };
                }, 0);

                // --- 3. Recognize (Cloud Vision API) ---
                // Expecting { result: { fullTextAnnotation: ... } } or { text: ... } or { error: ... }
                const responseData = await chrome.runtime.sendMessage({
                    action: "PERFORM_OCR",
                    image: cropUrl
                });

                if (responseData.error) throw new Error(responseData.error);

                // --- 4. Increment Usage ---
                usage.count++;
                chrome.storage.local.set({ [quotaKey]: usage });

                // --- 5. Process & Sort Text ---
                const rawResult = responseData.result || {};
                const isVertical = lang.includes("vert"); // e.g. "jpn_vert", "chi_sim_vert"

                const finalText = processOCRResult(rawResult, isVertical);

                // --- 6. Update UI ---
                let confColor = '#388e3c'; // Green since Cloud is reliable

                try {
                    await navigator.clipboard.writeText(finalText.trim());
                    // Success UI
                    metaBar.innerHTML = `
                        <span style="display:flex; align-items:center; gap:4px">
                            <span style="color:${confColor}; font-weight:bold">OK</span>
                            <span style="color:#999; font-size:10px">${usage.count}/1000</span>
                        </span>
                        <a href="#" style="color:#2196f3; font-size:10px; margin-left:5px" id="deep-preview-link-done">Img</a>
                        <span style="color:#388e3c; font-weight:bold; margin-left:auto">Copied!</span>
                    `;
                } catch (err) {
                    console.warn("Auto-copy failed (focus lost?), showing manual button", err);
                    // Fail UI (Manual Copy Button)
                    metaBar.innerHTML = `
                        <span style="display:flex; align-items:center; gap:4px">
                            <span style="color:${confColor}; font-weight:bold">OK</span>
                            <span style="color:#999; font-size:10px">${usage.count}/1000</span>
                        </span>
                        <a href="#" style="color:#2196f3; font-size:10px; margin-left:5px" id="deep-preview-link-done">Img</a>
                        <button id="deep-manual-copy" style="margin-left:auto; border:1px solid #ccc; background:#fff; cursor:pointer; font-size:10px; padding:2px 6px;">Copy</button>
                    `;

                    setTimeout(() => {
                        const copyBtn = metaBar.querySelector('#deep-manual-copy');
                        if (copyBtn) {
                            copyBtn.onclick = () => {
                                navigator.clipboard.writeText(finalText.trim());
                                copyBtn.innerText = "Copied!";
                                copyBtn.style.color = "#388e3c";
                            };
                        }
                    }, 0);
                }

                setTimeout(() => {
                    const lnk = metaBar.querySelector('#deep-preview-link-done');
                    if (lnk) lnk.onclick = (e) => {
                        e.preventDefault();
                        const win = window.open("", "Preview", "width=400,height=400");
                        if (win) {
                            win.document.body.innerHTML = '';
                            win.document.write(`<img src="${cropUrl}" style="border:1px solid red; max-width:100%"/>`);
                            win.document.close();
                        }
                    };
                }, 0);

            };
            image.src = response.dataUrl;

        } catch (e) {
            console.error(e);
            metaBar.innerHTML = `<span style="color:red">Error: ${e.message}</span>`;
        }
    }

    // --- Helper: Vertical Layout Sorting ---
    // --- Helper: Vertical Layout Sorting (Right-to-Left Columns) ---
    function processOCRResult(result, isVertical) {
        // Backup for simple text result (fallback)
        if (!result || !result.fullTextAnnotation || !result.fullTextAnnotation.pages) {
            return result.text || (result.fullTextAnnotation ? result.fullTextAnnotation.text : "") || "";
        }

        if (!isVertical) {
            return result.fullTextAnnotation.text; // Default L-R Reading
        }

        // 1. Flatten into text blocks with centers
        const blocks = [];
        const pages = result.fullTextAnnotation.pages || [];

        pages.forEach(page => {
            (page.blocks || []).forEach(block => {
                let blockText = "";

                (block.paragraphs || []).forEach(para => {
                    (para.words || []).forEach(word => {
                        (word.symbols || []).forEach(sym => {
                            blockText += sym.text;
                            // Add newlines only if explicit break
                            const t = sym.property?.detectedBreak?.type;
                            if (t === 'EOL_SURE_SPACE' || t === 'LINE_BREAK') blockText += "\n";
                        });
                    });
                });

                blockText = blockText.trim();
                if (!blockText) return;

                // Geometry
                const verts = block.boundingBox.vertices;
                const xs = verts.map(v => v.x || 0);
                const ys = verts.map(v => v.y || 0);
                const minX = Math.min(...xs), maxX = Math.max(...xs);
                const minY = Math.min(...ys), maxY = Math.max(...ys);

                blocks.push({
                    text: blockText,
                    x: (minX + maxX) / 2, // Center X
                    y: (minY + maxY) / 2  // Center Y
                });
            });
        });

        if (blocks.length === 0) return "";

        // 2. Sort R->L (Columns), then Top->Bottom
        // Heuristic: Group by Columns (X-position)
        // Sort blocks by Right Edge Descending (Right -> Left)

        blocks.sort((a, b) => {
            const xDiff = Math.abs(a.x - b.x);
            // Column threshold: if centers are close, they are in same vertical column.
            const colThresh = 50;

            if (xDiff < colThresh) {
                return a.y - b.y; // Same column: Top -> Bottom
            } else {
                return b.x - a.x; // Different column: Right -> Left
            }
        });

        return blocks.map(b => b.text).join("\n\n");
    }

    function saveAllBoxes() {
        if (!chrome.runtime?.id) return;
        
        const currentUrl = window.location.href;
        const workData = adapters().extractWorkMeta(currentUrl);
        const storageKey = adapters().getStorageKey(currentUrl);
        const pageUrl = getCurrentPageUrl();
        const timestamp = Date.now();
        const INDEX_KEY = adapters().INDEX_KEY;
        
        // Get or create work entry
        chrome.storage.local.get([storageKey, INDEX_KEY], (result) => {
            let workEntry = result[storageKey] || {
                workId: workData.workId,
                site: workData.site,
                baseUrl: workData.normalizedUrl,
                images: {},
                metadata: {
                    firstSeen: timestamp,
                    lastUpdated: timestamp,
                    urlVariants: []
                }
            };
            delete workEntry.legacyFlatBoxes;
            
            // Update metadata
            workEntry.metadata.lastUpdated = timestamp;
            if (!workEntry.metadata.urlVariants.includes(currentUrl)) {
                workEntry.metadata.urlVariants.push(currentUrl);
            }
            
            // Collect boxes grouped by image
            const imageBoxes = new Map(); // Map<imageSelector, boxes[]>
            
            // First, collect boxes from image overlays
            selectedImages.forEach((containerData, img) => {
                const selector = containerData.overlayContainer.dataset.imageSelector;
                if (!selector) return;
                
                const boxes = [];
                containerData.overlayContainer.querySelectorAll('.deep-box').forEach(box => {
                    boxes.push({
                        percentLeft: parseFloat(box.dataset.percentLeft) || 0,
                        percentTop: parseFloat(box.dataset.percentTop) || 0,
                        percentWidth: parseFloat(box.dataset.percentWidth) || 0,
                        percentHeight: parseFloat(box.dataset.percentHeight) || 0,
                        note: box.dataset.note || "",
                        imageSelector: selector,
                        imageSrc: box.dataset.imageSrc || img.src || ""
                    });
                });
                
                if (boxes.length > 0) {
                    imageBoxes.set(selector, {
                        selector: selector,
                        src: img.src || "",
                        pageUrl: pageUrl,
                        boxes: boxes
                    });
                }
            });
            
            // Also collect boxes not in image overlays (legacy support)
            document.querySelectorAll('.deep-box').forEach(box => {
                if (box.closest('.deep-image-overlay')) return; // Already handled
                
                // For legacy boxes, try to find if they're near an image
                const boxRect = box.getBoundingClientRect();
                const centerX = boxRect.left + boxRect.width / 2;
                const centerY = boxRect.top + boxRect.height / 2;
                
                // Find nearest image
                let nearestImg = null;
                let minDist = Infinity;
                document.querySelectorAll('img').forEach(img => {
                    if (!isImageVisible(img)) return;
                    const imgRect = img.getBoundingClientRect();
                    const dist = Math.sqrt(
                        Math.pow(centerX - (imgRect.left + imgRect.width/2), 2) +
                        Math.pow(centerY - (imgRect.top + imgRect.height/2), 2)
                    );
                    if (dist < minDist && dist < Math.max(imgRect.width, imgRect.height)) {
                        minDist = dist;
                        nearestImg = img;
                    }
                });
                
                if (nearestImg) {
                    const selector = getUniqueSelector(nearestImg);
                    if (selector) {
                        const imgRect = nearestImg.getBoundingClientRect();
                        if (!imageBoxes.has(selector)) {
                            imageBoxes.set(selector, {
                                selector: selector,
                                src: nearestImg.src || "",
                                pageUrl: pageUrl,
                                boxes: []
                            });
                        }
                        
                        const percentLeft = (boxRect.left - imgRect.left) / imgRect.width;
                        const percentTop = (boxRect.top - imgRect.top) / imgRect.height;
                        const percentWidth = boxRect.width / imgRect.width;
                        const percentHeight = boxRect.height / imgRect.height;
                        
                        imageBoxes.get(selector).boxes.push({
                            percentLeft: percentLeft,
                            percentTop: percentTop,
                            percentWidth: percentWidth,
                            percentHeight: percentHeight,
                            note: box.dataset.note || "",
                            imageSelector: selector,
                            imageSrc: nearestImg.src || ""
                        });
                    }
                }
            });
            
            // Update work entry with image data
            imageBoxes.forEach((imageData, selector) => {
                workEntry.images[selector] = imageData;
            });
            
            // Save to storage + _index
            const index = Array.isArray(result[INDEX_KEY]) ? [...result[INDEX_KEY]] : [];
            adapters().upsertIndexEntry(index, storageKey, workEntry);
            const data = { [storageKey]: workEntry, [INDEX_KEY]: index };
            chrome.storage.local.set(data);
        });
    }

    function loadBoxes(retryCount = 0) {
        if (!chrome.runtime?.id) return;
        
        const currentUrl = window.location.href;
        const storageKey = adapters().getStorageKey(currentUrl);
        const pageUrl = getCurrentPageUrl();
        
        chrome.storage.local.get([storageKey], (result) => {
            if (chrome.runtime.lastError) return;
            
            const workEntry = result[storageKey];
            if (!workEntry) {
                loadLegacyBoxes();
                return;
            }
            if (workEntry.legacyFlatBoxes && Array.isArray(workEntry.legacyFlatBoxes)) {
                loadLegacyFlatFromEntry(workEntry.legacyFlatBoxes);
                updateImageSelectionUI();
                return;
            }
            if (!workEntry.images) {
                loadLegacyBoxes();
                return;
            }
            
            let loadedAny = false;
            const missingSelectors = [];
            
            // Filter images by pageUrl - only load boxes for current page
            Object.keys(workEntry.images).forEach(selector => {
                const imageData = workEntry.images[selector];
                
                // Only load if this image is on the current page
                if (imageData.pageUrl !== pageUrl) return;
                
                // Try to find the image in the DOM
                let img;
                try {
                    img = document.querySelector(selector);
                } catch (e) {
                    missingSelectors.push(selector);
                    return; // Invalid selector
                }
                
                if (!img || img.tagName !== 'IMG' || !isImageVisible(img)) {
                    missingSelectors.push(selector);
                    return; // Image not found or not visible
                }
                
                loadedAny = true;
                
                // Select the image and create overlay container
                if (!selectedImages.has(img)) {
                    img.classList.add('deep-image-selected');
                    const containerData = createImageOverlayContainer(img);
                    selectedImages.set(img, containerData);
                }
                
                const overlayContainer = selectedImages.get(img).overlayContainer;
                
                // Load boxes for this image
                imageData.boxes.forEach(boxData => {
                    const box = document.createElement('div');
                    box.className = 'deep-box';
                    box.dataset.note = boxData.note || "";
                    box.dataset.imageSelector = selector;
                    box.dataset.imageSrc = boxData.imageSrc || imageData.src || "";
                    
                    // Store percentage values
                    box.dataset.percentLeft = boxData.percentLeft;
                    box.dataset.percentTop = boxData.percentTop;
                    box.dataset.percentWidth = boxData.percentWidth;
                    box.dataset.percentHeight = boxData.percentHeight;
                    
                    // Calculate initial pixel positions from percentages
                    const imgRect = img.getBoundingClientRect();
                    box.style.left = (imgRect.width * boxData.percentLeft) + 'px';
                    box.style.top = (imgRect.height * boxData.percentTop) + 'px';
                    box.style.width = (imgRect.width * boxData.percentWidth) + 'px';
                    box.style.height = (imgRect.height * boxData.percentHeight) + 'px';
                    
                    setupBoxEvents(box);
                    applyVisualSettingsToBox(box);
                    
                    // Add resize handle
                    if (!box.querySelector('.deep-resize-handle')) {
                        const handle = document.createElement('div');
                        handle.className = 'deep-resize-handle';
                        box.appendChild(handle);
                    }
                    
                    overlayContainer.appendChild(box);
                });
            });
            
            // If some images weren't found and we haven't retried too many times, retry
            if (missingSelectors.length > 0 && retryCount < 10) {
                // Retry after a delay, with exponential backoff
                const delay = Math.min(100 * Math.pow(1.5, retryCount), 2000);
                setTimeout(() => {
                    loadBoxes(retryCount + 1);
                }, delay);
            }
            
            // Initial position update
            if (loadedAny) {
                updateBoxPositions();
                applyVisualSettings();
            }
            
            // Always update UI to reflect current state (even if no images loaded)
            updateImageSelectionUI();
        });
    }
    
    function appendLegacyBoxData(d) {
        const b = document.createElement('div');
        b.className = 'deep-box';
        b.style.left = d.l; b.style.top = d.t;
        b.style.width = d.w; b.style.height = d.h;
        b.dataset.note = d.note;

        if (d.anchor) {
            b.dataset.anchorSelector = d.anchor;
            b.dataset.rX = d.rX;
            b.dataset.rY = d.rY;
            if (d.rW) b.dataset.rW = d.rW;
            if (d.rH) b.dataset.rH = d.rH;
        }

        setupBoxEvents(b);
        applyVisualSettingsToBox(b);
        root.appendChild(b);
    }

    /** Migrated flat box list stored under work:* entry (legacyFlatBoxes). */
    function loadLegacyFlatFromEntry(boxes) {
        boxes.forEach((d) => appendLegacyBoxData(d));
        updateBoxPositions();
        applyVisualSettings();
    }

    function loadLegacyBoxes() {
        // Fallback: raw URL key with array of boxes (pre–work-entry migration)
        const url = getUrl();
        chrome.storage.local.get([url], (result) => {
            if (chrome.runtime.lastError) return;
            const boxes = result[url] || [];
            boxes.forEach((d) => appendLegacyBoxData(d));
            updateBoxPositions();
            applyVisualSettings();
        });
    }

    function getCurrentPageUrl() {
        // Get current URL without hash/query for page matching
        const url = window.location.href;
        try {
            const urlObj = new URL(url);
            return urlObj.origin + urlObj.pathname;
        } catch (e) {
            return url.split('?')[0].split('#')[0];
        }
    }

    // --- Utils ---
    function getUrl() { return window.location.href.split('?')[0]; }

    function checkUrlChange() {
        const url = getUrl();
        if (url !== lastUrl) {
            lastUrl = url;
            
            // Clear all boxes and image overlays
            document.querySelectorAll('.deep-box').forEach(b => b.remove());
            document.querySelectorAll('.deep-image-overlay').forEach(overlay => overlay.remove());
            
            // Deselect all images and clean up observers
            selectedImages.forEach((containerData, img) => {
                if (containerData.resizeObserver) {
                    containerData.resizeObserver.disconnect();
                }
                img.classList.remove('deep-image-selected', 'deep-image-hover');
            });
            selectedImages.clear();
            imageResizeObservers.clear();
            
            // Update UI to reflect cleared selection
            updateImageSelectionUI();
            
            // Load boxes for new page
            loadBoxes();
        }
    }

    function setEditMode(enabled) {
        isEditMode = enabled;
        if (enabled) {
            shell.classList.add('mode-edit');
            shell.classList.remove('mode-view');
        } else {
            shell.classList.add('mode-view');
            shell.classList.remove('mode-edit');
            document.querySelectorAll('.deep-edit-bubble').forEach(b => b.remove());
        }
    }

    function toggleVisibility() {
        shell.classList.toggle('active');
        if (shell.classList.contains('active')) {
            updateBoxPositions();
            setEditMode(false);
        }
    }

    // --- Image Selection System ---

    function setupImageSelection() {
        // When edit mode is enabled, activate image selection mode
        // We'll enable this when edit mode is turned on
    }

    function enableImageSelectionMode() {
        imageSelectionMode = true;
        shell.classList.add('image-selection-mode');
        
        // Add hover listeners to all images
        document.querySelectorAll('img').forEach(img => {
            if (isImageVisible(img)) {
                setupImageHover(img);
            }
        });

        // Watch for new images added to the page
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                mutation.addedNodes.forEach((node) => {
                    if (node.nodeType === 1) { // Element node
                        if (node.tagName === 'IMG' && isImageVisible(node)) {
                            setupImageHover(node);
                        }
                        // Also check for images within added nodes
                        node.querySelectorAll && node.querySelectorAll('img').forEach(img => {
                            if (isImageVisible(img)) {
                                setupImageHover(img);
                            }
                        });
                    }
                });
            });
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
    }

    function disableImageSelectionMode() {
        imageSelectionMode = false;
        shell.classList.remove('image-selection-mode');
        
        // Remove hover effects from all images
        document.querySelectorAll('img').forEach(img => {
            img.classList.remove('deep-image-hover');
        });
        
        // Deselect all images and clean up observers
        selectedImages.forEach((containerData, img) => {
            if (containerData.resizeObserver) {
                containerData.resizeObserver.disconnect();
            }
            img.classList.remove('deep-image-selected');
        });
        selectedImages.clear();
        imageResizeObservers.clear();
        
        hoveredImage = null;
    }

    function isImageVisible(img) {
        if (!img) return false;
        const rect = img.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0 && 
               rect.top < window.innerHeight && 
               rect.bottom > 0 &&
               rect.left < window.innerWidth && 
               rect.right > 0;
    }

    function setupImageHover(img) {
        // Remove existing listeners to avoid duplicates
        img.removeEventListener('mouseenter', handleImageHover);
        img.removeEventListener('mouseleave', handleImageUnhover);
        img.removeEventListener('click', handleImageClick);

        img.addEventListener('mouseenter', handleImageHover, { passive: true });
        img.addEventListener('mouseleave', handleImageUnhover, { passive: true });
        img.addEventListener('click', handleImageClick);
    }

    function handleImageHover(e) {
        if (!imageSelectionMode || !isEditMode) return;
        const img = e.target;
        if (img.tagName !== 'IMG') return;
        
        hoveredImage = img;
        img.classList.add('deep-image-hover');
    }

    function handleImageUnhover(e) {
        if (!imageSelectionMode) return;
        const img = e.target;
        if (img.tagName !== 'IMG') return;
        
        // Only remove hover if not selected
        if (!selectedImages.has(img)) {
            img.classList.remove('deep-image-hover');
        }
        if (hoveredImage === img) {
            hoveredImage = null;
        }
    }

    function handleImageClick(e) {
        if (!imageSelectionMode || !isEditMode) return;
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();

        const img = e.target;
        if (img.tagName !== 'IMG') return;

        // Toggle selection
        if (selectedImages.has(img)) {
            deselectImage(img);
        } else {
            selectImage(img);
        }
    }

    function selectImage(img) {
        if (selectedImages.has(img)) return; // Already selected

        // Remove hover class, add selected class
        img.classList.remove('deep-image-hover');
        img.classList.add('deep-image-selected');

        // Create overlay container for this image
        const containerData = createImageOverlayContainer(img);
        
        // Store initial position
        const rect = img.getBoundingClientRect();
        containerData.lastPosition = {
            left: rect.left,
            top: rect.top,
            width: rect.width,
            height: rect.height
        };
        
        selectedImages.set(img, containerData);
        
        // Update UI to show active image count
        updateImageSelectionUI();
        
        // Update root class to indicate images are selected
        if (selectedImages.size > 0) {
            shell.classList.add('has-selected-images');
        }
        
        // Start position monitoring if not already running
        startPositionMonitoring();
    }

    function deselectImage(img) {
        if (!selectedImages.has(img)) return;

        img.classList.remove('deep-image-selected');
        const containerData = selectedImages.get(img);
        
        // Disconnect ResizeObserver
        if (containerData.resizeObserver) {
            containerData.resizeObserver.disconnect();
            imageResizeObservers.delete(img);
        }
        
        // Remove overlay container
        if (containerData.overlayContainer && containerData.overlayContainer.parentNode) {
            containerData.overlayContainer.remove();
        }
        
        selectedImages.delete(img);
        updateImageSelectionUI();
        
        // Update root class to indicate if images are still selected
        if (selectedImages.size === 0) {
            shell.classList.remove('has-selected-images');
            // Stop position monitoring when no images selected
            stopPositionMonitoring();
        }
    }

    function createImageOverlayContainer(img) {
        const container = document.createElement('div');
        container.className = 'deep-image-overlay';
        container.dataset.imageSelector = getUniqueSelector(img);
        container.dataset.imageSrc = img.src || '';
        
        // Position container to match image bounds
        updateImageOverlayPosition(container, img);
        
        root.appendChild(container);
        
        // Set up ResizeObserver to watch the image
        const resizeObserver = new ResizeObserver((entries) => {
            for (const entry of entries) {
                const img = entry.target;
                if (selectedImages.has(img)) {
                    const { overlayContainer } = selectedImages.get(img);
                    updateImageOverlayPosition(overlayContainer, img);
                    // Update all boxes within this overlay to maintain percentage positions
                    updateBoxesInOverlay(overlayContainer, img);
                }
            }
        });
        
        resizeObserver.observe(img);
        imageResizeObservers.set(img, resizeObserver);
        
        return { overlayContainer: container, resizeObserver };
    }

    function updateImageOverlayPosition(container, img) {
        const rect = img.getBoundingClientRect();
        container.style.left = (rect.left + window.scrollX) + 'px';
        container.style.top = (rect.top + window.scrollY) + 'px';
        container.style.width = rect.width + 'px';
        container.style.height = rect.height + 'px';
    }

    function updateBoxesInOverlay(overlayContainer, img) {
        // Update all boxes within this overlay using percentage-based positioning
        const boxes = overlayContainer.querySelectorAll('.deep-box');
        const imgRect = img.getBoundingClientRect();
        
        boxes.forEach(box => {
            const percentLeft = parseFloat(box.dataset.percentLeft);
            const percentTop = parseFloat(box.dataset.percentTop);
            const percentWidth = parseFloat(box.dataset.percentWidth);
            const percentHeight = parseFloat(box.dataset.percentHeight);
            
            if (!isNaN(percentLeft) && !isNaN(percentTop)) {
                box.style.left = (imgRect.width * percentLeft) + 'px';
                box.style.top = (imgRect.height * percentTop) + 'px';
            }
            
            if (!isNaN(percentWidth) && !isNaN(percentHeight)) {
                box.style.width = (imgRect.width * percentWidth) + 'px';
                box.style.height = (imgRect.height * percentHeight) + 'px';
            }
        });
    }

    function updateImageSelectionUI() {
        // Update any UI indicators showing selected image count
        if (selectedImages.size > 0) {
            shell.classList.add('has-selected-images');
            shell.setAttribute('data-selected-count', selectedImages.size);
        } else {
            shell.classList.remove('has-selected-images');
            shell.removeAttribute('data-selected-count');
        }
    }

    function findImageForOverlay(overlayContainer) {
        // Find the image element that corresponds to this overlay
        const selector = overlayContainer.dataset.imageSelector;
        if (!selector) return null;
        
        try {
            const img = document.querySelector(selector);
            return img && img.tagName === 'IMG' ? img : null;
        } catch (e) {
            return null;
        }
    }

    function updateImageOverlayPositions() {
        // Update all image overlay container positions
        selectedImages.forEach((containerData, img) => {
            if (containerData.overlayContainer && isImageVisible(img)) {
                updateImageOverlayPosition(containerData.overlayContainer, img);
                updateBoxesInOverlay(containerData.overlayContainer, img);
            }
        });
    }
    
    // Check if image positions have changed and update if needed
    function checkImagePositions() {
        if (selectedImages.size === 0 || !shell.classList.contains('active')) {
            return; // No images selected or overlay not active
        }
        
        let positionChanged = false;
        
        selectedImages.forEach((containerData, img) => {
            if (!containerData.overlayContainer || !isImageVisible(img)) return;
            
            const rect = img.getBoundingClientRect();
            const currentPos = {
                left: rect.left,
                top: rect.top,
                width: rect.width,
                height: rect.height
            };
            
            // Check if position changed (allow 1px tolerance for floating point)
            if (containerData.lastPosition) {
                const leftDiff = Math.abs(currentPos.left - containerData.lastPosition.left);
                const topDiff = Math.abs(currentPos.top - containerData.lastPosition.top);
                
                if (leftDiff > 1 || topDiff > 1) {
                    // Position changed significantly, update overlay
                    updateImageOverlayPosition(containerData.overlayContainer, img);
                    updateBoxesInOverlay(containerData.overlayContainer, img);
                    positionChanged = true;
                }
            }
            
            // Store current position for next check
            containerData.lastPosition = currentPos;
        });
        
        return positionChanged;
    }
    
    // Start position monitoring (polling fallback)
    function startPositionMonitoring() {
        if (positionCheckInterval) return; // Already running
        
        let lastCheckTime = 0;
        const checkThrottleMs = 150; // Check every 150ms max
        
        const checkLoop = (timestamp) => {
            // Throttle checks
            if (timestamp - lastCheckTime >= checkThrottleMs) {
                checkImagePositions();
                lastCheckTime = timestamp;
            }
            
            // Continue loop if we have selected images and overlay is active
            if (selectedImages.size > 0 && shell.classList.contains('active')) {
                positionCheckInterval = requestAnimationFrame(checkLoop);
            } else {
                positionCheckInterval = null;
            }
        };
        
        positionCheckInterval = requestAnimationFrame(checkLoop);
    }
    
    // Stop position monitoring
    function stopPositionMonitoring() {
        if (positionCheckInterval) {
            cancelAnimationFrame(positionCheckInterval);
            positionCheckInterval = null;
        }
    }
    
    // Setup MutationObserver to detect layout changes
    function setupLayoutChangeDetection() {
        let layoutCheckTimeout = null;
        
        const observer = new MutationObserver((mutations) => {
            // Throttle: only check after mutations stop for 100ms
            if (layoutCheckTimeout) clearTimeout(layoutCheckTimeout);
            
            layoutCheckTimeout = setTimeout(() => {
                // Check if we have selected images
                if (selectedImages.size > 0 && shell.classList.contains('active')) {
                    // Check positions and update if needed
                    checkImagePositions();
                }
            }, 100);
        });
        
        // Observe body for attribute/style changes that might affect layout
        observer.observe(document.body, {
            attributes: true,
            attributeFilter: ['style', 'class'],
            subtree: true,
            childList: false
        });
    }

    // Update setEditMode to enable/disable image selection
    const originalSetEditMode = setEditMode;
    setEditMode = function(enabled) {
        originalSetEditMode(enabled);
        if (enabled) {
            enableImageSelectionMode();
        } else {
            disableImageSelectionMode();
        }
    };

    function maybeStart() {
        chrome.storage.local.get(['overlay_disabled_hosts'], (r) => {
            if (chrome.runtime.lastError) {
                window.hasDeepOverlay = true;
                init();
                return;
            }
            if (isHostDisabledForOverlay(r.overlay_disabled_hosts, location.hostname)) {
                return;
            }
            window.hasDeepOverlay = true;
            init();
        });
    }
    maybeStart();

})();
