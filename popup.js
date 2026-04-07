
// UI Elements
const statusText = document.getElementById('status-text');
const statusDot = document.getElementById('status-ind');
const editCheck = document.getElementById('edit-check');
const toggleBtn = document.getElementById('toggle-btn');
const dashboardBtn = document.getElementById('dashboard-btn');

// --- Init: Get Status ---
chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (!tabs[0]?.id) return;

    chrome.tabs.sendMessage(tabs[0].id, { action: "GET_STATUS" }, (response) => {
        if (chrome.runtime.lastError || !response) {
            // Content script likely not injected or page not supported
            statusText.innerText = "Not Active";
            statusDot.classList.remove('active');
            editCheck.parentElement.style.opacity = '0.5';
            editCheck.disabled = true;
            return;
        }

        // Update UI based on response
        updateUI(response.active, response.isEditMode);
    });
});

function updateUI(active, isEditMode) {
    if (active) {
        statusText.innerText = "Active";
        statusDot.classList.add('active');
        editCheck.parentElement.style.opacity = '1';
        editCheck.disabled = false;
        editCheck.checked = isEditMode;
    } else {
        statusText.innerText = "Hidden";
        statusDot.classList.remove('active');
        editCheck.parentElement.style.opacity = '0.5';
        editCheck.disabled = true; // Cannot edit if hidden
        editCheck.checked = false;
    }
}

// --- Events ---

toggleBtn.addEventListener('click', () => {
    chrome.runtime.sendMessage({ action: "TOGGLE_OVERLAY" });
    window.close();
});

dashboardBtn.addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
    window.close();
});

editCheck.addEventListener('change', (e) => {
    const enabled = e.target.checked;
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]?.id) {
            chrome.tabs.sendMessage(tabs[0].id, {
                action: "SET_EDIT_MODE",
                enabled: enabled
            });
        }
    });
});
