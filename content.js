
// Scope isolation
(function () {
    if (window.hasDeepOverlay) return;
    window.hasDeepOverlay = true;

    let root, toolbar, isDrawing = false, startX, startY, activeBox = null;
    let lastUrl = window.location.href.split('?')[0];
    let isEditMode = false; // Default to View Mode

    // Scroll Compensation
    let scrollOffsetX = 0;
    let scrollOffsetY = 0;

    function getUrl() {
        return window.location.href.split('?')[0];
    }

    // --- Init ---
    function init() {
        root = document.createElement('div');
        root.id = 'deep-overlay-root';
        root.classList.add('active'); // Start active

        // Inject into documentElement to avoid body margin issues
        document.documentElement.appendChild(root);

        updateOverlaySize(); // Set initial size
        loadBoxes(); // Load from storage
        setEditMode(false); // Init in View Mode

        // Events
        // Block all clicks on the root layer - ONLY IN EDIT MODE
        root.addEventListener('click', (e) => {
            if (isEditMode) {
                e.stopPropagation();
                e.preventDefault();
            }
        });

        // Key Trap - Capture phase to block page shortcuts in Edit Mode
        window.addEventListener('keydown', (e) => {
            if (isEditMode && root.classList.contains('active')) {
                e.stopPropagation();
                // Don't preventDefault on simple typing (key length 1), unless focused on body?
                // Actually user said "disable all the interaction with the page below (even keyboard short cut...)"
                // But we need to allow typing in the textarea if focused.
                if (e.target.tagName !== 'TEXTAREA' && e.target.tagName !== 'INPUT') {
                    e.preventDefault();
                }
            }
        }, true);

        root.addEventListener('mousedown', onMouseDown);
        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
        window.addEventListener('resize', updateOverlaySize);

        // Capture Event for Custom Scrollers (Pixiv, etc.)
        window.addEventListener('scroll', handleGlobalScroll, true);

        // SPA Navigation Handling
        setInterval(checkUrlChange, 1000); // Check every second
        window.addEventListener('popstate', checkUrlChange);

        // Message Listener
        chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
            if (msg.action === "TOGGLE") {
                toggleVisibility();
            }
            else if (msg.action === "GET_STATUS") {
                sendResponse({
                    active: root && root.classList.contains('active'),
                    isEditMode: isEditMode
                });
            }
            else if (msg.action === "SET_EDIT_MODE") {
                setEditMode(msg.enabled);
                sendResponse({ success: true });
            }
        });
    }

    function handleGlobalScroll(e) {
        // Ignore standard window scroll (bubbles as Document), root.absolute handles that.
        // We only care about ELEMENT scrolls that act as main containers.
        if (e.target.nodeType === Node.DOCUMENT_NODE) return;

        const el = e.target;
        // Heuristic: Must be a significant container (> 40% screen area)
        const area = el.clientWidth * el.clientHeight;
        const minArea = (window.innerWidth * window.innerHeight) * 0.4;

        if (area > minArea) {
            scrollOffsetX = el.scrollLeft;
            scrollOffsetY = el.scrollTop;
            updateRootTransform();
        }
    }

    function updateRootTransform() {
        if (!root) return;
        // Move root UP/LEFT to counteract the scroll
        root.style.transform = `translate(-${scrollOffsetX}px, -${scrollOffsetY}px)`;
    }

    function setEditMode(enabled) {
        isEditMode = enabled;
        if (enabled) {
            root.classList.add('mode-edit');
            root.classList.remove('mode-view');
        } else {
            root.classList.add('mode-view');
            root.classList.remove('mode-edit');

            // Close any open bubbles
            document.querySelectorAll('.deep-edit-bubble').forEach(b => b.remove());
        }
    }

    function checkUrlChange() {
        const url = getUrl();
        if (url !== lastUrl) {
            lastUrl = url;
            // Clear existing boxes
            document.querySelectorAll('.deep-box').forEach(b => b.remove());
            // Reset Scroll
            scrollOffsetX = 0;
            scrollOffsetY = 0;
            updateRootTransform();

            loadBoxes();
        }
    }

    function updateOverlaySize() {
        if (!root) return;
        root.style.width = Math.max(document.documentElement.scrollWidth, window.innerWidth) + 'px';
        root.style.height = Math.max(document.documentElement.scrollHeight, window.innerHeight) + 'px';
    }

    function toggleVisibility() {
        checkUrlChange(); // Check on toggle
        root.classList.toggle('active');
        if (root.classList.contains('active')) {
            updateOverlaySize();
            setEditMode(false); // Reset to View Mode on open
        }
    }

    let interactionMode = 'NONE'; // 'DRAW', 'MOVE', 'RESIZE'
    let initialLeft, initialTop, initialWidth, initialHeight;

    // --- Drawing / Interaction Logic ---
    function onMouseDown(e) {
        if (!isEditMode) return;
        if (!root.classList.contains('active')) return;

        // Prevent default to stop text selection
        if (e.target.tagName !== 'TEXTAREA') e.preventDefault();

        // Corrected Coordinates
        const pageX = e.pageX + scrollOffsetX;
        const pageY = e.pageY + scrollOffsetY;

        // Check what we clicked
        if (e.target.classList.contains('deep-resize-handle')) {
            interactionMode = 'RESIZE';
            activeBox = e.target.parentElement;
            startX = pageX;
            startY = pageY;
            initialWidth = parseInt(activeBox.style.width);
            initialHeight = parseInt(activeBox.style.height);
            e.stopPropagation();
        }
        else if (e.target.classList.contains('deep-box')) {
            interactionMode = 'MOVE';
            activeBox = e.target;
            startX = pageX;
            startY = pageY;
            initialLeft = parseInt(activeBox.style.left);
            initialTop = parseInt(activeBox.style.top);
            e.stopPropagation();
        }
        else if (e.target === root) {
            interactionMode = 'DRAW';
            startX = pageX;
            startY = pageY;

            activeBox = document.createElement('div');
            activeBox.className = 'deep-box';
            activeBox.style.left = startX + 'px';
            activeBox.style.top = startY + 'px';
            // Append resize handle immediately
            const handle = document.createElement('div');
            handle.className = 'deep-resize-handle';
            activeBox.appendChild(handle);

            root.appendChild(activeBox);
        }
    }

    function onMouseMove(e) {
        if (interactionMode === 'NONE') return;

        const currentX = e.pageX + scrollOffsetX;
        const currentY = e.pageY + scrollOffsetY;

        if (interactionMode === 'DRAW') {
            const width = Math.abs(currentX - startX);
            const height = Math.abs(currentY - startY);
            const left = Math.min(currentX, startX);
            const top = Math.min(currentY, startY);

            activeBox.style.width = width + 'px';
            activeBox.style.height = height + 'px';
            activeBox.style.left = left + 'px';
            activeBox.style.top = top + 'px';
        }
        else if (interactionMode === 'MOVE') {
            const dx = currentX - startX;
            const dy = currentY - startY;
            activeBox.style.left = (initialLeft + dx) + 'px';
            activeBox.style.top = (initialTop + dy) + 'px';
        }
        else if (interactionMode === 'RESIZE') {
            const dx = currentX - startX;
            const dy = currentY - startY;
            // Simple resize logic (bottom-right handle)
            activeBox.style.width = Math.max(20, initialWidth + dx) + 'px';
            activeBox.style.height = Math.max(20, initialHeight + dy) + 'px';
        }
    }

    function onMouseUp(e) {
        if (interactionMode === 'NONE') return;

        if (interactionMode === 'DRAW') {
            // Check specific logic for new boxes
            if (parseInt(activeBox.style.width) < 20) {
                activeBox.remove();
                interactionMode = 'NONE';
                return;
            }
            setupBoxEvents(activeBox);
            // In Edit Mode, auto-select new box
            if (isEditMode) selectBox(activeBox);
        }

        // Save ONLY on mouse up (Drag End)
        saveAllBoxes();
        interactionMode = 'NONE';
    }

    // --- Box Management ---
    function setupBoxEvents(box) {
        // Events are now handled globally in onMouseDown for better drag control
        // But clicking to edit specific box still needs distinct handler or check
        box.addEventListener('click', (e) => {
            e.stopPropagation();
            if (isEditMode && interactionMode === 'NONE') { // Only select if not just dragged
                selectBox(box);
            }
        });

        // Ensure handle exists for loaded boxes
        if (!box.querySelector('.deep-resize-handle')) {
            const handle = document.createElement('div');
            handle.className = 'deep-resize-handle';
            box.appendChild(handle);
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

        // Position bubble below box - calculate relative to page
        const rect = box.getBoundingClientRect();
        const scrollTop = window.scrollY || document.documentElement.scrollTop;
        const scrollLeft = window.scrollX || document.documentElement.scrollLeft;

        bubble.style.left = (rect.left + scrollLeft) + 'px';
        bubble.style.top = (rect.bottom + scrollTop + 10) + 'px';

        const ta = document.createElement('textarea');
        ta.placeholder = "Write a note...";
        ta.value = box.dataset.note || "";
        ta.focus();

        const actions = document.createElement('div');
        actions.className = 'actions';

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

        actions.appendChild(delBtn);
        actions.appendChild(btn);

        bubble.appendChild(ta);
        bubble.appendChild(actions);
        root.appendChild(bubble);
    }

    // --- Storage ---
    function saveAllBoxes() {
        const boxes = [];
        document.querySelectorAll('.deep-box').forEach(b => {
            boxes.push({
                l: b.style.left, t: b.style.top,
                w: b.style.width, h: b.style.height,
                note: b.dataset.note || ""
            });
        });

        const data = {};
        data[getUrl()] = boxes;

        try {
            if (!chrome.runtime?.id) throw new Error("Context invalidated");
            chrome.storage.local.set(data);
        } catch (e) {
            console.warn("DeepOverlay: Extension context invalidated. Please reload the page to save.");
        }
    }

    function loadBoxes() {
        const url = getUrl();
        try {
            if (!chrome.runtime?.id) return;
            chrome.storage.local.get([url], (result) => {
                if (chrome.runtime.lastError) return;
                const boxes = result[url] || [];
                boxes.forEach(d => {
                    const b = document.createElement('div');
                    b.className = 'deep-box';
                    b.style.left = d.l; b.style.top = d.t;
                    b.style.width = d.w; b.style.height = d.h;
                    b.dataset.note = d.note;
                    setupBoxEvents(b);
                    root.appendChild(b);
                });
            });
        } catch (e) {
            console.warn("DeepOverlay: Extension context invalidated.");
        }
    }

    // Start
    init();
})();
