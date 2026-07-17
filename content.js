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
    let toastEl = null;
    let toastT = null;

    // --- OCR paste helper widget ---
    const OCR_HELPER_ENABLED_KEY = 'ocr_paste_helper_enabled';
    const OCR_HELPER_AUTO_COPY_KEY = 'ocr_paste_helper_auto_copy';
    let ocrHelper = null;
    let ocrInputT = null;

    function debounce(fn, ms) {
        let t;
        return (...args) => {
            if (t) clearTimeout(t);
            t = setTimeout(() => fn(...args), ms);
        };
    }

    function convertJpVerticalSimple(text) {
        // v1: reverse line order and join, dropping blanks (matches user example)
        const lines = String(text || '')
            .split(/\r?\n/)
            .map((s) => s.trim())
            .filter(Boolean)
            .reverse();
        const joined = lines.join('');
        return joined.replace(/[ \t]+/g, ' ').trim();
    }

    /** Whitespace / Intl.Segmenter word count for pasted OCR text. */
    function countPasteWords(text) {
        const t = String(text || '');
        if (!t.trim()) return 0;
        try {
            if (typeof Intl !== 'undefined' && Intl.Segmenter) {
                const seg = new Intl.Segmenter(undefined, { granularity: 'word' });
                let n = 0;
                for (const { isWordLike } of seg.segment(t)) {
                    if (isWordLike) n++;
                }
                return n;
            }
        } catch (_) {
            /* ignore */
        }
        return t.trim().split(/\s+/).filter(Boolean).length;
    }

    async function copyToClipboard(text) {
        const t = String(text || '');
        try {
            await navigator.clipboard.writeText(t);
            return true;
        } catch {
            try {
                const ta = document.createElement('textarea');
                ta.value = t;
                ta.setAttribute('readonly', 'readonly');
                ta.style.position = 'fixed';
                ta.style.left = '-9999px';
                ta.style.top = '-9999px';
                document.body.appendChild(ta);
                ta.select();
                const ok = document.execCommand('copy');
                ta.remove();
                return !!ok;
            } catch {
                return false;
            }
        }
    }

    function syncOcrHelperVisibility() {
        if (!ocrHelper) return;
        if (!shell?.classList?.contains('active') || !isEditMode) {
            ocrHelper.wrapper.style.display = 'none';
            ocrHelper.showBtn.style.display = 'none';
            return;
        }
        chrome.storage.local.get([OCR_HELPER_ENABLED_KEY], (r) => {
            const enabled = !!r[OCR_HELPER_ENABLED_KEY];
            ocrHelper.wrapper.style.display = enabled ? 'flex' : 'none';
            ocrHelper.showBtn.style.display = enabled ? 'none' : 'inline-flex';
        });
    }

    function ensureOcrHelperDom() {
        if (!shell) return null;
        if (ocrHelper) return ocrHelper;

        const wrapper = document.createElement('div');
        wrapper.id = 'deep-ocr-helper';
        wrapper.className = 'do-ocr-helper';

        const header = document.createElement('div');
        header.className = 'do-ocr-head';

        const title = document.createElement('div');
        title.className = 'do-ocr-title';
        title.textContent = 'OCR Paste Helper';

        const pasteStatsEl = document.createElement('div');
        pasteStatsEl.className = 'do-ocr-paste-stats';
        pasteStatsEl.setAttribute('aria-live', 'polite');

        const titleWrap = document.createElement('div');
        titleWrap.className = 'do-ocr-title-wrap';
        titleWrap.appendChild(title);
        titleWrap.appendChild(pasteStatsEl);

        const right = document.createElement('div');
        right.className = 'do-ocr-actions';

        const autoCopyLabel = document.createElement('label');
        autoCopyLabel.className = 'do-ocr-toggle';
        const autoCopyCb = document.createElement('input');
        autoCopyCb.type = 'checkbox';
        autoCopyCb.className = 'do-ocr-auto-copy';
        const autoCopyTxt = document.createElement('span');
        autoCopyTxt.textContent = 'Auto-copy';
        autoCopyLabel.appendChild(autoCopyCb);
        autoCopyLabel.appendChild(autoCopyTxt);

        const hideBtn = document.createElement('button');
        hideBtn.type = 'button';
        hideBtn.className = 'do-ocr-btn do-ocr-hide';
        hideBtn.textContent = 'Hide';

        right.appendChild(autoCopyLabel);
        right.appendChild(hideBtn);

        header.appendChild(titleWrap);
        header.appendChild(right);

        const body = document.createElement('div');
        body.className = 'do-ocr-body';

        const inTa = document.createElement('textarea');
        inTa.className = 'do-ocr-input deep-ocr-input';
        inTa.placeholder = 'Paste OCR text here…';
        inTa.rows = 6;

        const inWrap = document.createElement('div');
        inWrap.className = 'do-ocr-in-wrap';

        const clearBtn = document.createElement('button');
        clearBtn.type = 'button';
        clearBtn.className = 'do-ocr-btn do-ocr-clear';
        clearBtn.textContent = 'Clear';

        const outWrap = document.createElement('div');
        outWrap.className = 'do-ocr-out-wrap';

        const outTa = document.createElement('textarea');
        outTa.className = 'do-ocr-output deep-ocr-output';
        outTa.placeholder = 'Converted text…';
        outTa.rows = 6;
        outTa.readOnly = true;

        const copyBtn = document.createElement('button');
        copyBtn.type = 'button';
        copyBtn.className = 'do-ocr-btn do-ocr-copy';
        copyBtn.textContent = 'Copy';

        outWrap.appendChild(outTa);
        outWrap.appendChild(copyBtn);

        function updatePasteStats() {
            const raw = inTa.value;
            const words = countPasteWords(raw);
            const chars = [...raw].length;
            pasteStatsEl.textContent =
                words === 1 ? `1 word · ${chars} chars` : `${words} words · ${chars} chars`;
        }

        inWrap.appendChild(inTa);
        inWrap.appendChild(clearBtn);
        body.appendChild(inWrap);
        body.appendChild(outWrap);

        // Small show button (visible when hidden)
        const showBtn = document.createElement('button');
        showBtn.type = 'button';
        showBtn.id = 'deep-ocr-helper-show';
        showBtn.className = 'do-ocr-show';
        showBtn.textContent = 'OCR';

        function setVisible(vis) {
            chrome.storage.local.set({ [OCR_HELPER_ENABLED_KEY]: !!vis }, () => {
                syncOcrHelperVisibility();
            });
        }

        hideBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            setVisible(false);
        });

        showBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            setVisible(true);
        });

        autoCopyCb.addEventListener('change', (e) => {
            chrome.storage.local.set({ [OCR_HELPER_AUTO_COPY_KEY]: !!e.target.checked });
        });

        const updateOut = debounce(async () => {
            const converted = convertJpVerticalSimple(inTa.value);
            outTa.value = converted;
            if (autoCopyCb.checked && converted) {
                const ok = await copyToClipboard(converted);
                if (ok) showToast('Copied', 'info');
                else showToast('Copy failed', 'error');
            }
        }, 180);

        clearBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (ocrInputT) clearTimeout(ocrInputT);
            inTa.value = '';
            outTa.value = '';
            updatePasteStats();
            inTa.focus();
        });

        inTa.addEventListener('input', () => {
            updatePasteStats();
            updateOut();
        });

        copyBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const ok = await copyToClipboard(outTa.value);
            if (ok) showToast('Copied', 'info');
            else showToast('Copy failed', 'error');
        });

        // Prevent overlay mouse handlers from interfering with typing/clicking
        wrapper.addEventListener('mousedown', (e) => e.stopPropagation());
        wrapper.addEventListener('click', (e) => e.stopPropagation());

        wrapper.appendChild(header);
        wrapper.appendChild(body);

        shell.appendChild(wrapper);
        shell.appendChild(showBtn);

        updatePasteStats();

        ocrHelper = { wrapper, showBtn, inTa, outTa, autoCopyCb, setVisible };
        return ocrHelper;
    }

    function initOcrPasteHelper() {
        const ui = ensureOcrHelperDom();
        if (!ui) return;
        chrome.storage.local.get([OCR_HELPER_ENABLED_KEY, OCR_HELPER_AUTO_COPY_KEY], (r) => {
            const enabled = !!r[OCR_HELPER_ENABLED_KEY];
            const autoCopy = !!r[OCR_HELPER_AUTO_COPY_KEY];
            ui.autoCopyCb.checked = autoCopy;
            // Persisted preference is stored; actual visibility is gated by edit mode.
            chrome.storage.local.set({ [OCR_HELPER_ENABLED_KEY]: enabled }, () => {
                syncOcrHelperVisibility();
            });
        });
    }

    function showToast(message, kind = 'info') {
        try {
            if (!shell) return;
            if (!toastEl) {
                toastEl = document.createElement('div');
                toastEl.id = 'deep-overlay-toast';
                toastEl.style.position = 'fixed';
                toastEl.style.right = '10px';
                toastEl.style.bottom = '10px';
                toastEl.style.zIndex = '2147483647';
                toastEl.style.pointerEvents = 'none';
                toastEl.style.maxWidth = '420px';
                toastEl.style.whiteSpace = 'pre-wrap';
                toastEl.style.fontFamily = "'Roboto Mono', 'JetBrains Mono', monospace";
                toastEl.style.fontSize = '12px';
                toastEl.style.padding = '10px 12px';
                toastEl.style.borderRadius = '8px';
                toastEl.style.border = '1px solid rgba(255,255,255,0.12)';
                toastEl.style.boxShadow = '0 8px 20px rgba(0,0,0,0.35)';
                toastEl.style.background = 'rgba(30, 31, 34, 0.94)';
                toastEl.style.color = '#fff';
                shell.appendChild(toastEl);
            }
            toastEl.textContent = message;
            toastEl.style.display = 'block';
            toastEl.style.borderColor = kind === 'error' ? 'rgba(224, 90, 90, 0.7)' : 'rgba(255,255,255,0.12)';
            if (toastT) clearTimeout(toastT);
            toastT = setTimeout(() => {
                if (toastEl) toastEl.style.display = 'none';
            }, kind === 'error' ? 6000 : 2200);
        } catch {
            // ignore
        }
    }

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

    // loadBoxes can be triggered many times on page load (DOM ready, window load, img load, retries).
    let loadBoxesGeneration = 0;
    let saveInFlight = false;

    function clearPageOverlays() {
        if (!root) return;
        root.querySelectorAll('.deep-box').forEach((b) => b.remove());
        root.querySelectorAll('.deep-image-overlay').forEach((overlay) => overlay.remove());
        selectedImages.forEach((containerData, img) => {
            if (containerData.resizeObserver) {
                containerData.resizeObserver.disconnect();
            }
            img.classList.remove('deep-image-selected', 'deep-image-hover');
        });
        selectedImages.clear();
        imageResizeObservers.clear();
        stopPositionMonitoring();
    }

    const scheduleLoadBoxes = debounce(() => loadBoxes(0), 80);

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

        // OCR paste helper overlay widget (optional)
        initOcrPasteHelper();

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
                if (e.target.classList.contains('deep-note-input') || e.target.classList.contains('deep-ocr-input') || e.target.classList.contains('deep-ocr-output')) {
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
            document.addEventListener('DOMContentLoaded', () => scheduleLoadBoxes());
        } else {
            scheduleLoadBoxes();
        }

        window.addEventListener('load', () => scheduleLoadBoxes());

        // Some sites (e.g. e-hentai next/prev) swap/replace the main <img> after URL change.
        // If we load before the new image finishes loading, our retry loop can miss it.
        document.addEventListener('load', (e) => {
            const t = e.target;
            if (!t || t.tagName !== 'IMG') return;
            if (!shell?.classList?.contains('active')) return;
            scheduleLoadBoxes();
        }, true);

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

        if (globalThis.DeepOverlayStorage) {
            globalThis.DeepOverlayStorage.onOverlayChanged(() => {
                if (saveInFlight) return;
                loadBoxes();
            });
        }
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

        const btn = document.createElement('button');
        btn.innerText = "Save";
        btn.onclick = () => {
            box.dataset.note = ta.value;
            saveAllBoxes();
            bubble.remove();
        };

        const delBtn = document.createElement('button');
        delBtn.innerText = "Delete";
        delBtn.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
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

    function saveAllBoxes() {
        if (!chrome.runtime?.id) return;
        const storage = globalThis.DeepOverlayStorage;
        if (!storage) {
            console.error('DeepOverlay: storage-client not loaded');
            return;
        }

        const currentUrl = window.location.href;
        const workData = adapters().extractWorkMeta(currentUrl);
        const storageKey = adapters().getStorageKey(currentUrl);
        const pageUrl = getCurrentPageUrl();
        const timestamp = Date.now();

        storage.ensureReady().then(() => storage.getWorkEntry(storageKey)).then((existing) => {
            let workEntry = existing || {
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

            workEntry.site = workEntry.site || workData.site;
            workEntry.workId = workEntry.workId ?? workData.workId;
            workEntry.baseUrl = workEntry.baseUrl || workData.normalizedUrl;
            workEntry.images = workEntry.images || {};

            workEntry.metadata = workEntry.metadata || {
                firstSeen: timestamp,
                lastUpdated: timestamp,
                urlVariants: []
            };
            workEntry.metadata.lastUpdated = timestamp;
            if (!workEntry.metadata.urlVariants.includes(currentUrl)) {
                workEntry.metadata.urlVariants.push(currentUrl);
            }

            const imageBoxes = new Map();

            // Collect from every image overlay in the DOM (not only selectedImages).
            root.querySelectorAll('.deep-image-overlay').forEach((overlay) => {
                const selector = overlay.dataset.imageSelector;
                if (!selector) return;

                const img = findImageForOverlay(overlay);
                const boxes = [];
                overlay.querySelectorAll('.deep-box').forEach((box) => {
                    boxes.push({
                        percentLeft: parseFloat(box.dataset.percentLeft) || 0,
                        percentTop: parseFloat(box.dataset.percentTop) || 0,
                        percentWidth: parseFloat(box.dataset.percentWidth) || 0,
                        percentHeight: parseFloat(box.dataset.percentHeight) || 0,
                        note: box.dataset.note || '',
                        imageSelector: selector,
                        imageSrc: box.dataset.imageSrc || img?.src || overlay.dataset.imageSrc || '',
                    });
                });

                if (boxes.length > 0) {
                    imageBoxes.set(selector, {
                        selector,
                        src: img?.src || overlay.dataset.imageSrc || '',
                        pageUrl,
                        boxes,
                    });
                }
            });

            selectedImages.forEach((containerData, img) => {
                const selector = containerData.overlayContainer.dataset.imageSelector;
                if (!selector || imageBoxes.has(selector)) return;

                const boxes = [];
                containerData.overlayContainer.querySelectorAll('.deep-box').forEach((box) => {
                    boxes.push({
                        percentLeft: parseFloat(box.dataset.percentLeft) || 0,
                        percentTop: parseFloat(box.dataset.percentTop) || 0,
                        percentWidth: parseFloat(box.dataset.percentWidth) || 0,
                        percentHeight: parseFloat(box.dataset.percentHeight) || 0,
                        note: box.dataset.note || '',
                        imageSelector: selector,
                        imageSrc: box.dataset.imageSrc || img.src || '',
                    });
                });

                if (boxes.length > 0) {
                    imageBoxes.set(selector, {
                        selector,
                        src: img.src || '',
                        pageUrl,
                        boxes,
                    });
                }
            });

            document.querySelectorAll('.deep-box').forEach(box => {
                if (box.closest('.deep-image-overlay')) return;

                const boxRect = box.getBoundingClientRect();
                const centerX = boxRect.left + boxRect.width / 2;
                const centerY = boxRect.top + boxRect.height / 2;

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

            const workImgUpdates = {};

            imageBoxes.forEach((imageData, cssSelector) => {
                const imageKey = adapters().makeImageStorageKey(pageUrl, cssSelector);
                const refKey = adapters().makeWorkImgKey(storageKey, imageKey);

                workImgUpdates[refKey] = {
                    pageUrl: imageData.pageUrl,
                    selector: cssSelector,
                    src: imageData.src || '',
                    boxes: imageData.boxes || []
                };

                const allNotes = (imageData.boxes || [])
                    .map((b) => (b.note || '').trim())
                    .filter(Boolean)
                    .join('\n');
                const notePreview = allNotes.length > 180 ? `${allNotes.slice(0, 180)}…` : allNotes;

                workEntry.images[imageKey] = {
                    refKey,
                    pageUrl: imageData.pageUrl,
                    selector: cssSelector,
                    src: imageData.src || '',
                    boxCount: (imageData.boxes || []).length,
                    notePreview
                };
            });

            Object.keys(workEntry.images).forEach((k) => {
                const p = adapters().parseImageStorageKey(k);
                if (!p.legacy) return;
                const data = workEntry.images[k];
                if (normalizePageUrl(data.pageUrl || '') !== pageUrl) return;
                if (!imageBoxes.has(p.cssSelector)) return;
                delete workEntry.images[k];
            });

            // Clear image records on this page that no longer have boxes.
            const pageImageKeys = Object.keys(workEntry.images);
            for (const imageKey of pageImageKeys) {
                const imageMeta = workEntry.images[imageKey];
                const metaPage = normalizePageUrl(imageMeta.pageUrl || '');
                if (metaPage !== pageUrl) continue;

                const parsed = adapters().parseImageStorageKey(imageKey);
                const cssSelector = parsed.cssSelector;
                const live = imageBoxes.get(cssSelector);
                if (live?.boxes?.length) continue;

                if (imageMeta.refKey) {
                    workImgUpdates[imageMeta.refKey] = {
                        pageUrl: imageMeta.pageUrl,
                        selector: imageMeta.selector || cssSelector,
                        src: imageMeta.src || '',
                        boxes: [],
                    };
                }
                delete workEntry.images[imageKey];
            }

            const domBoxCount = root.querySelectorAll('.deep-box').length;
            const hasImages = Object.keys(workEntry.images).length > 0;
            const hasLegacy = Array.isArray(workEntry.legacyFlatBoxes) && workEntry.legacyFlatBoxes.length > 0;
            if (!hasImages && !hasLegacy && domBoxCount === 0) {
                saveInFlight = true;
                return storage.deleteOverlay(storageKey).finally(() => {
                    saveInFlight = false;
                });
            }

            saveInFlight = true;
            return storage.saveOverlay({
                storageKey,
                workEntry,
                workImgUpdates
            }).finally(() => {
                saveInFlight = false;
            });
        }).catch((err) => {
            saveInFlight = false;
            console.error('DeepOverlay: save failed', err);
            showToast(`Save failed: ${err?.message || err}`, 'error');
        });
    }

    function loadBoxes(retryCount = 0) {
        if (!chrome.runtime?.id) return;
        const storage = globalThis.DeepOverlayStorage;
        if (!storage) return;

        const generation = ++loadBoxesGeneration;
        clearPageOverlays();

        const currentUrl = window.location.href;
        const storageKey = adapters().getStorageKey(currentUrl);
        const pageUrl = getCurrentPageUrl();

        storage.ensureReady().then(() => storage.getWorkEntry(storageKey)).then((workEntry) => {
            if (generation !== loadBoxesGeneration) return;

            if (!workEntry) {
                loadLegacyBoxes(generation);
                return;
            }
            if (workEntry.legacyFlatBoxes && Array.isArray(workEntry.legacyFlatBoxes)) {
                loadLegacyFlatFromEntry(workEntry.legacyFlatBoxes);
                updateImageSelectionUI();
                return;
            }
            if (!workEntry.images) {
                loadLegacyBoxes(generation);
                return;
            }

            let loadedAny = false;
            const missingSelectors = [];
            const toLoad = [];

            Object.keys(workEntry.images).forEach(imageKey => {
                const imageMeta = workEntry.images[imageKey];
                const metaPage = normalizePageUrl(imageMeta.pageUrl || '');
                if (metaPage !== pageUrl) return;

                const parsed = adapters().parseImageStorageKey(imageKey);
                const cssSelector = parsed.cssSelector;
                const refKey = imageMeta.refKey;

                let img;
                try {
                    img = document.querySelector(cssSelector);
                } catch (e) {
                    missingSelectors.push(cssSelector);
                    return;
                }

                if (!img || img.tagName !== 'IMG' || !isImageVisible(img)) {
                    missingSelectors.push(cssSelector);
                    return;
                }

                loadedAny = true;
                toLoad.push({ imageKey, cssSelector, refKey, img });
            });

            const refKeys = toLoad.map((x) => x.refKey).filter(Boolean);
            return storage.getWorkImages(refKeys).then((imgRes) => {
                if (generation !== loadBoxesGeneration) return;

                toLoad.forEach(({ refKey, cssSelector, img }) => {
                    const imageData = refKey ? imgRes[refKey] : null;
                    const boxes = imageData?.boxes || [];

                    if (!selectedImages.has(img)) {
                        img.classList.add('deep-image-selected');
                        const containerData = createImageOverlayContainer(img);
                        selectedImages.set(img, containerData);
                    }

                    const overlayContainer = selectedImages.get(img).overlayContainer;

                    boxes.forEach((boxData) => {
                        const box = document.createElement('div');
                        box.className = 'deep-box';
                        box.dataset.note = boxData.note || "";
                        box.dataset.imageSelector = cssSelector;
                        box.dataset.imageSrc = boxData.imageSrc || imageData?.src || "";

                        box.dataset.percentLeft = boxData.percentLeft;
                        box.dataset.percentTop = boxData.percentTop;
                        box.dataset.percentWidth = boxData.percentWidth;
                        box.dataset.percentHeight = boxData.percentHeight;

                        const imgRect = img.getBoundingClientRect();
                        box.style.left = (imgRect.width * boxData.percentLeft) + 'px';
                        box.style.top = (imgRect.height * boxData.percentTop) + 'px';
                        box.style.width = (imgRect.width * boxData.percentWidth) + 'px';
                        box.style.height = (imgRect.height * boxData.percentHeight) + 'px';

                        setupBoxEvents(box);
                        applyVisualSettingsToBox(box);

                        if (!box.querySelector('.deep-resize-handle')) {
                            const handle = document.createElement('div');
                            handle.className = 'deep-resize-handle';
                            box.appendChild(handle);
                        }

                        overlayContainer.appendChild(box);
                    });
                });

                if (missingSelectors.length > 0 && retryCount < 30) {
                    const delay = Math.min(120 * Math.pow(1.45, retryCount), 3000);
                    setTimeout(() => loadBoxes(retryCount + 1), delay);
                }

                if (loadedAny) {
                    updateBoxPositions();
                    applyVisualSettings();
                }
                updateImageSelectionUI();
            });
        }).catch((err) => {
            console.warn('DeepOverlay: loadBoxes failed', err);
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

    function loadLegacyBoxes(generation) {
        const storage = globalThis.DeepOverlayStorage;
        const url = getUrl();
        if (!storage) return;

        storage.ensureReady()
            .then(() => storage.getWorkEntry(adapters().getStorageKey(url)))
            .then((workEntry) => {
                if (generation !== loadBoxesGeneration) return;
                if (workEntry?.legacyFlatBoxes) {
                    loadLegacyFlatFromEntry(workEntry.legacyFlatBoxes);
                    return;
                }
                return storage.getWorkEntry(url).then((legacy) => {
                    if (generation !== loadBoxesGeneration) return;
                    const boxes = Array.isArray(legacy) ? legacy : [];
                    boxes.forEach((d) => appendLegacyBoxData(d));
                    updateBoxPositions();
                    applyVisualSettings();
                });
            })
            .catch(() => {});
    }

    function normalizePageUrl(url) {
        try {
            const u = new URL(url);
            let path = u.pathname;
            if (path.length > 1 && path.endsWith('/')) path = path.slice(0, -1);
            return u.origin + path;
        } catch {
            let s = String(url).split('?')[0].split('#')[0];
            if (s.length > 1 && s.endsWith('/')) s = s.slice(0, -1);
            return s;
        }
    }

    function getCurrentPageUrl() {
        return normalizePageUrl(window.location.href);
    }

    // --- Utils ---
    function getUrl() { return window.location.href.split('?')[0]; }

    function checkUrlChange() {
        const url = getUrl();
        if (url !== lastUrl) {
            lastUrl = url;
            updateImageSelectionUI();
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
            syncOcrHelperVisibility();
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

        // Persist overlays before tearing down selection tracking.
        if (root?.querySelectorAll('.deep-box').length) {
            saveAllBoxes();
        }

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
        syncOcrHelperVisibility();
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
