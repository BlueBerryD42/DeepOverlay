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
        if (!box.querySelector('.deep-resize-handle')) {
            const h = document.createElement('div');
            h.className = 'deep-resize-handle';
            box.appendChild(h);
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
        const rect = box.getBoundingClientRect();
        bubble.style.left = (rect.left + window.scrollX) + 'px';
        bubble.style.top = (rect.bottom + window.scrollY + 10) + 'px';

        const ta = document.createElement('textarea');
        ta.classList.add('deep-note-input');
        ta.placeholder = "Write a note...";
        ta.value = box.dataset.note || "";
        ta.addEventListener('keydown', (e) => e.stopPropagation()); // Stop bubbling to page
        ta.focus();

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
        actions.appendChild(delBtn);
        actions.appendChild(btn);
        bubble.appendChild(ta);
        bubble.appendChild(actions);
        root.appendChild(bubble);
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
                root.appendChild(b);
            });
            // Initial position update
            updateBoxPositions();
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
