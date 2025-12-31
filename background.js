// Shortcuts
chrome.commands.onCommand.addListener((command) => {
  if (command === "toggle-overlay") {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) toggleOverlay(tabs[0].id);
    });
  }
});

// Messages from Popup or Content
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "OPEN_OPTIONS") {
    chrome.runtime.openOptionsPage();
  }
  if (request.action === "TOGGLE_OVERLAY") {
    // Called from Popup usually
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) toggleOverlay(tabs[0].id);
    });
  }
});

// Force popup on install/startup to ensure it works
chrome.runtime.onInstalled.addListener(() => {
  chrome.action.setPopup({ popup: "popup.html" });
});

async function toggleOverlay(tabId) {
  try {
    // Script is auto-injected, just toggle.
    await chrome.tabs.sendMessage(tabId, { action: "TOGGLE" });
  } catch (error) {
    // Script might not be ready or page is restricted (e.g. chrome://)
    console.log("DeepOverlay: Toggle failed (page might be restricted).");
  }
}
