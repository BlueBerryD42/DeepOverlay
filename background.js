import { BACKEND_URL } from './config.js';

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
  if (request.action === "CAPTURE_VISIBLE_TAB") {
    chrome.tabs.captureVisibleTab(null, { format: "png" }, (dataUrl) => {
      if (chrome.runtime.lastError) {
        sendResponse({ error: chrome.runtime.lastError.message });
      } else {
        sendResponse({ dataUrl: dataUrl });
      }
    });
    return true; // Keep channel open for async response
  }
  if (request.action === "PERFORM_OCR") {
    const { image } = request;
    // const BACKEND_URL = process.env.BE_URL; // Removed
    // BACKEND_URL is imported from config.js

    // --- CLOUD RUN DISABLED TO SAVE COST ---
    // fetch(BACKEND_URL, {
    //   method: "POST",
    //   headers: {
    //     "Content-Type": "application/json"
    //   },
    //   body: JSON.stringify({ image: image })
    // })
    //   .then(response => response.json())
    //   .then(data => sendResponse({ result: data })) // Pass full result object
    //   .catch(error => {
    //     console.error("OCR Fetch Error:", error);
    //     sendResponse({ error: error.message });
    //   });

    // Immediate fallback response
    sendResponse({ error: "Cloud OCR is currently disabled by the user to save costs." });

    return true; // async response
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
