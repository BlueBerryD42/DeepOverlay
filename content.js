// Scope isolation
(function () {
    if (window.hasDeepOverlay) return;
    window.hasDeepOverlay = true;

    let root, isEditMode = false;
    let lastUrl = window.location.href.split('?')[0];

    // Interaction State
    let interactionMode = 'NONE'; // 'DRAW', 'MOVE', 'RESIZE'
    let startX, startY, activeBox = null;
    let initialLeft, initialTop, initialWidth, initialHeight;
    let isDrawing = false;

    // --- Init ---
    function init() {
        root = document.createElement('div');
        root.id = 'deep-overlay-root';
        root.classList.add('active');

        document.documentElement.appendChild(root);

        // Initial setup
        checkUrlChange();
        setEditMode(false);

        // --- Event Listeners ---

        // 1. Root Click Blocking (Edit Mode)
        // Also capture window clicks to prevent interaction with underlying page
        window.addEventListener('click', (e) => {
            if (isEditMode) {
                // Allow interaction with our own UI (root and children)
                if (root.contains(e.target)) return;

                e.stopPropagation();
                e.stopImmediatePropagation();
                e.preventDefault();
            }
        }, true);

        root.addEventListener('click', (e) => {
            if (isEditMode) {
                // If clicking root background (not box/handle), stop it
                if (e.target === root) {
                    e.stopPropagation();
                    e.preventDefault();
                }
            }
        });

        // 2. Key Trap (Edit Mode)
        window.addEventListener('keydown', (e) => {
            if (isEditMode && root.classList.contains('active')) {
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
        window.addEventListener('resize', requestUpdate);
        window.addEventListener('scroll', requestUpdate, true); // Capture globally

        // 5. App Navigation
        setInterval(checkUrlChange, 1000);
        window.addEventListener('popstate', checkUrlChange);

        // 6. Messages
        chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
            if (msg.action === "TOGGLE") toggleVisibility();
            else if (msg.action === "GET_STATUS") {
                sendResponse({ active: root.classList.contains('active'), isEditMode });
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
            if (!root) return;
            const op = res.overlay_opacity || 1.0;
            const borderColor = res.overlay_border_color || '#000000';
            const bgColor = res.overlay_bg_color || '#ffffff';

            // Set CSS Variables for border and background colors (used in styles.css for .deep-box)
            root.style.setProperty('--deep-border-color', borderColor);
            root.style.setProperty('--deep-bg-color', bgColor);

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

    function updateBoxPositions() {
        if (!root) return;

        // Update root size just in case
        root.style.width = Math.max(document.documentElement.scrollWidth, window.innerWidth) + 'px';
        root.style.height = Math.max(document.documentElement.scrollHeight, window.innerHeight) + 'px';

        document.querySelectorAll('.deep-box').forEach(box => {
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
            startX = pageX; startY = pageY;
            initialLeft = parseInt(activeBox.style.left);
            initialTop = parseInt(activeBox.style.top);
            e.stopPropagation();
        } else if (e.target === root) {
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

    function onMouseMove(e) {
        if (interactionMode === 'NONE') return;
        const currentX = e.pageX;
        const currentY = e.pageY;

        if (interactionMode === 'DRAW') {
            const width = Math.abs(currentX - startX);
            const height = Math.abs(currentY - startY);
            activeBox.style.width = width + 'px';
            activeBox.style.height = height + 'px';
            activeBox.style.left = Math.min(currentX, startX) + 'px';
            activeBox.style.top = Math.min(currentY, startY) + 'px';
        } else if (interactionMode === 'MOVE') {
            activeBox.style.left = (initialLeft + (currentX - startX)) + 'px';
            activeBox.style.top = (initialTop + (currentY - startY)) + 'px';
        } else if (interactionMode === 'RESIZE') {
            activeBox.style.width = Math.max(20, initialWidth + (currentX - startX)) + 'px';
            activeBox.style.height = Math.max(20, initialHeight + (currentY - startY)) + 'px';
        }
    }

    function onMouseUp(e) {
        if (interactionMode === 'NONE') return;

        if (interactionMode === 'DRAW' && parseInt(activeBox.style.width) < 20) {
            activeBox.remove();
            interactionMode = 'NONE';
            return;
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
        // 1. Measure Box FIRST (while visible)
        const rect = box.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;

        // 2. Temporarily hide root to see what's underneath
        const prevDisplay = root.style.display;
        root.style.display = 'none';

        // 3. Find Element
        const el = document.elementFromPoint(centerX, centerY);

        // 4. Restore
        root.style.display = prevDisplay;

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
        const quotaKey = "ocr_quota";
        const currentMonth = new Date().toISOString().slice(0, 7); // YYYY-MM
        const quotaData = await chrome.storage.local.get(quotaKey);
        let usage = quotaData[quotaKey] || { count: 0, month: currentMonth };

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
        const boxes = [];
        document.querySelectorAll('.deep-box').forEach(b => {
            boxes.push({
                l: b.style.left, t: b.style.top,
                w: b.style.width, h: b.style.height,
                note: b.dataset.note || "",
                // Save Anchor Data
                anchor: b.dataset.anchorSelector || null,
                rX: b.dataset.rX || 0,
                rY: b.dataset.rY || 0,
                rW: b.dataset.rW || null,
                rH: b.dataset.rH || null
            });
        });
        const data = {};
        data[getUrl()] = boxes;
        chrome.storage.local.set(data);
    }

    function loadBoxes() {
        if (!chrome.runtime?.id) return;
        const url = getUrl();
        chrome.storage.local.get([url], (result) => {
            if (chrome.runtime.lastError) return;
            const boxes = result[url] || [];
            boxes.forEach(d => {
                const b = document.createElement('div');
                b.className = 'deep-box';
                b.style.left = d.l; b.style.top = d.t;
                b.style.width = d.w; b.style.height = d.h;
                b.dataset.note = d.note;

                // Load Anchor Data
                if (d.anchor) {
                    b.dataset.anchorSelector = d.anchor;
                    b.dataset.rX = d.rX;
                    b.dataset.rY = d.rY;
                    if (d.rW) b.dataset.rW = d.rW;
                    if (d.rH) b.dataset.rH = d.rH;
                }

                setupBoxEvents(b);
                // Apply visual settings to loaded box
                applyVisualSettingsToBox(b);
                root.appendChild(b);
            });
            // Initial position update
            updateBoxPositions();
            // Ensure all boxes have visual settings applied
            applyVisualSettings();
        });
    }

    // --- Utils ---
    function getUrl() { return window.location.href.split('?')[0]; }

    function checkUrlChange() {
        const url = getUrl();
        if (url !== lastUrl) {
            lastUrl = url;
            document.querySelectorAll('.deep-box').forEach(b => b.remove());
            loadBoxes();
        }
    }

    function setEditMode(enabled) {
        isEditMode = enabled;
        if (enabled) {
            root.classList.add('mode-edit');
            root.classList.remove('mode-view');
        } else {
            root.classList.add('mode-view');
            root.classList.remove('mode-edit');
            document.querySelectorAll('.deep-edit-bubble').forEach(b => b.remove());
        }
    }

    function toggleVisibility() {
        root.classList.toggle('active');
        if (root.classList.contains('active')) {
            updateBoxPositions();
            setEditMode(false);
        }
    }

    init();

})();
