/* empty css                   */
function createBoxEditor(storageKey, imageSelector, boxIndex, boxData, onUpdate) {
  const container = document.createElement("div");
  container.className = "box-editor";
  const editor = document.createElement("textarea");
  editor.className = "note-editor";
  editor.value = boxData.note || "";
  editor.placeholder = `Box ${boxIndex + 1} - Empty note...`;
  editor.dataset.storageKey = storageKey;
  editor.dataset.imageSelector = imageSelector;
  editor.dataset.boxIndex = boxIndex;
  const info = document.createElement("div");
  info.className = "box-info";
  info.textContent = `Box ${boxIndex + 1}`;
  const deleteBtn = document.createElement("button");
  deleteBtn.className = "box-delete-btn";
  deleteBtn.innerHTML = "×";
  deleteBtn.title = "Delete this box";
  deleteBtn.onclick = (e) => {
    e.stopPropagation();
    if (confirm("Delete this box?")) {
      onUpdate(storageKey, imageSelector, boxIndex, null);
    }
  };
  const editorWrapper = document.createElement("div");
  editorWrapper.className = "box-editor-wrapper";
  editorWrapper.style.position = "relative";
  let timeout;
  editor.addEventListener("input", (e) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => {
      onUpdate(storageKey, imageSelector, boxIndex, e.target.value);
    }, 500);
  });
  editor.onclick = (e) => e.stopPropagation();
  editorWrapper.appendChild(editor);
  editorWrapper.appendChild(deleteBtn);
  container.appendChild(info);
  container.appendChild(editorWrapper);
  return container;
}
function formatDate(timestamp) {
  if (!timestamp) return "Unknown";
  const date = new Date(timestamp);
  return date.toLocaleDateString() + " " + date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
function truncateText(text, maxLength = 50) {
  if (!text) return "";
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + "...";
}
function getSiteBadge(site) {
  const badges = {
    "e-hentai": '<span class="site-badge site-badge-ehentai">E-H</span>',
    "x": '<span class="site-badge site-badge-x">X</span>',
    "pixiv": '<span class="site-badge site-badge-pixiv">P</span>',
    "generic": '<span class="site-badge site-badge-other">G</span>',
    "other": '<span class="site-badge site-badge-other">•</span>'
  };
  return badges[site] || badges["other"];
}
function formatPageUrl(pageUrl, site) {
  if (!pageUrl) return "Unknown page";
  try {
    const url = new URL(pageUrl);
    if (site === "e-hentai") {
      const match = url.pathname.match(/-(\d+)$/);
      if (match) return `Page ${match[1]}`;
    } else if (site === "x") {
      const match = url.pathname.match(/\/photo\/(\d+)$/);
      if (match) return `Photo ${match[1]}`;
    } else if (site === "pixiv") {
      const hash = url.hash.match(/#(\d+)$/);
      if (hash) return `Image ${hash[1]}`;
    }
    return url.pathname.split("/").pop() || "Page";
  } catch (e) {
    return pageUrl;
  }
}
function formatBytes(bytes) {
  if (bytes < 1024) return bytes + " B";
  else if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  else return (bytes / (1024 * 1024)).toFixed(2) + " MB";
}
const INDEX_KEY = "_index";
const QUOTA_KEY = "quota:ocr";
const SCHEMA_VERSION_KEY = "_schemaVersion";
function isDashboardMetaKey(storageKey) {
  if (!storageKey || typeof storageKey !== "string") return true;
  if (storageKey.startsWith("work:")) return false;
  if (storageKey === INDEX_KEY || storageKey === SCHEMA_VERSION_KEY) return true;
  if (storageKey === QUOTA_KEY || storageKey === "ocr_quota") return true;
  if (storageKey === "theme" || storageKey === "settings") return true;
  if (storageKey.startsWith("overlay_")) return true;
  return false;
}
function removeIndexKey(index, storageKey) {
  return (index || []).filter((e) => e.key !== storageKey);
}
function upsertIndexRow(index, storageKey, workEntry) {
  const row = {
    key: storageKey,
    site: workEntry.site || "generic",
    workId: workEntry.workId != null ? String(workEntry.workId) : "",
    lastUpdated: workEntry.metadata?.lastUpdated || Date.now(),
    baseUrl: workEntry.baseUrl || ""
  };
  const list = Array.isArray(index) ? [...index] : [];
  const i = list.findIndex((e) => e.key === storageKey);
  if (i >= 0) list[i] = row;
  else list.push(row);
  list.sort((a, b) => (b.lastUpdated || 0) - (a.lastUpdated || 0));
  return list;
}
function getAllData() {
  return new Promise((resolve) => {
    chrome.storage.local.get(null, (items) => {
      resolve(items);
    });
  });
}
function getStorageBytes() {
  return new Promise((resolve) => {
    chrome.storage.local.getBytesInUse(null, (bytes) => {
      resolve(bytes);
    });
  });
}
function removeStorageKey(key) {
  return new Promise((resolve) => {
    chrome.storage.local.get([INDEX_KEY], (r) => {
      const index = removeIndexKey(r[INDEX_KEY], key);
      chrome.storage.local.remove([key], () => {
        chrome.storage.local.set({ [INDEX_KEY]: index }, () => resolve());
      });
    });
  });
}
function setStorageData(data) {
  return new Promise((resolve) => {
    chrome.storage.local.set(data, () => {
      resolve();
    });
  });
}
function saveWorkEntryWithIndex(storageKey, workEntry) {
  return new Promise((resolve) => {
    chrome.storage.local.get([INDEX_KEY], (r) => {
      const index = upsertIndexRow(r[INDEX_KEY], storageKey, workEntry);
      chrome.storage.local.set({ [storageKey]: workEntry, [INDEX_KEY]: index }, () => resolve());
    });
  });
}
function clearAllStorage() {
  return new Promise((resolve) => {
    chrome.storage.local.clear(() => {
      resolve();
    });
  });
}
function getOcrQuota() {
  return new Promise((resolve) => {
    chrome.storage.local.get([QUOTA_KEY, "ocr_quota"], (result) => {
      const currentMonth = (/* @__PURE__ */ new Date()).toISOString().slice(0, 7);
      const data = result[QUOTA_KEY] || result.ocr_quota || { count: 0, month: currentMonth };
      let count = data.count;
      if (data.month !== currentMonth) count = 0;
      resolve(count);
    });
  });
}
function updateBoxNoteInStorage(storageKey, imageSelector, boxIndex, newText, allData2) {
  const workEntry = allData2[storageKey];
  if (workEntry && workEntry.images && workEntry.images[imageSelector]) {
    const imageData = workEntry.images[imageSelector];
    if (imageData.boxes && imageData.boxes[boxIndex]) {
      imageData.boxes[boxIndex].note = newText;
      workEntry.metadata.lastUpdated = Date.now();
      const update = {};
      update[storageKey] = workEntry;
      return new Promise((resolve) => {
        chrome.storage.local.get([INDEX_KEY], (r) => {
          const index = upsertIndexRow(r[INDEX_KEY], storageKey, workEntry);
          update[INDEX_KEY] = index;
          setStorageData(update).then(() => {
            allData2[storageKey] = workEntry;
            resolve();
          });
        });
      });
    }
  }
  return Promise.resolve();
}
function createImageCard(storageKey, selector, imageData, workEntry, onImageDelete, onBoxUpdate) {
  const imageCard = document.createElement("div");
  imageCard.className = "image-card-flat";
  imageCard.dataset.imageSelector = selector;
  const imageContainer = document.createElement("div");
  imageContainer.className = "image-container-flat";
  const thumbnailContainer = document.createElement("div");
  thumbnailContainer.className = "image-thumbnail-container-flat";
  if (imageData.src) {
    const thumbnail = document.createElement("img");
    thumbnail.className = "image-thumbnail-flat";
    thumbnail.src = imageData.src;
    thumbnail.alt = "Image thumbnail";
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
      window.open(imageData.src, "_blank");
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
  const imageInfo = document.createElement("div");
  imageInfo.className = "image-info-flat";
  const srcDisplay = imageData.src ? truncateText(imageData.src, 60) : truncateText(selector, 60);
  const srcSpan = document.createElement("div");
  srcSpan.className = "image-src-flat";
  srcSpan.textContent = srcDisplay;
  srcSpan.title = imageData.src || selector;
  const pageUrlDiv = document.createElement("div");
  pageUrlDiv.className = "image-pageurl-flat";
  const pageUrlText = formatPageUrl(imageData.pageUrl, workEntry.site);
  pageUrlDiv.textContent = pageUrlText;
  if (imageData.pageUrl) {
    pageUrlDiv.style.cursor = "pointer";
    pageUrlDiv.style.textDecoration = "underline";
    pageUrlDiv.style.color = "var(--accent-color)";
    pageUrlDiv.onclick = (e) => {
      e.stopPropagation();
      window.open(imageData.pageUrl, "_blank");
    };
  }
  imageInfo.appendChild(srcSpan);
  imageInfo.appendChild(pageUrlDiv);
  const imageActions = document.createElement("div");
  imageActions.className = "image-actions-flat";
  const boxCount = document.createElement("span");
  boxCount.className = "image-box-count-flat";
  boxCount.textContent = `${imageData.boxes?.length || 0} box${(imageData.boxes?.length || 0) !== 1 ? "es" : ""}`;
  const deleteBtn = document.createElement("button");
  deleteBtn.className = "image-delete-btn-flat danger";
  deleteBtn.textContent = "Delete";
  deleteBtn.onclick = (e) => {
    e.stopPropagation();
    if (confirm("Delete this image and all its boxes?")) {
      onImageDelete(storageKey, selector);
    }
  };
  imageActions.appendChild(boxCount);
  imageActions.appendChild(deleteBtn);
  imageContainer.appendChild(thumbnailContainer);
  imageContainer.appendChild(imageInfo);
  imageContainer.appendChild(imageActions);
  const boxesList = document.createElement("div");
  boxesList.className = "boxes-list-flat";
  if (imageData.boxes && imageData.boxes.length > 0) {
    imageData.boxes.forEach((box, index) => {
      const boxEditor = createBoxEditor(
        storageKey,
        selector,
        index,
        box,
        (sk, sel, idx, text) => {
          if (text === null) {
            const workEntry2 = window.allDataCache[sk];
            if (workEntry2 && workEntry2.images && workEntry2.images[sel]) {
              workEntry2.images[sel].boxes.splice(idx, 1);
              workEntry2.metadata.lastUpdated = Date.now();
              saveWorkEntryWithIndex(sk, workEntry2).then(() => {
                window.allDataCache[sk] = workEntry2;
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
    const emptyMsg = document.createElement("div");
    emptyMsg.className = "empty-boxes-msg";
    emptyMsg.textContent = "No boxes for this image";
    boxesList.appendChild(emptyMsg);
  }
  imageCard.appendChild(imageContainer);
  imageCard.appendChild(boxesList);
  return imageCard;
}
function createWorkCard(work, onWorkDelete, onUpdate) {
  const card = document.createElement("div");
  card.className = "work-card-flat";
  card.dataset.storageKey = work.storageKey;
  if (work.legacy) {
    return createLegacyPageRow(work.storageKey, work.notes, onWorkDelete);
  }
  const workEntry = work.workEntry;
  const workId = workEntry.workId || "N/A";
  const site = workEntry.site || "other";
  const siteBadge = getSiteBadge(site);
  const header = document.createElement("div");
  header.className = "work-header-flat";
  const workInfo = document.createElement("div");
  workInfo.className = "work-info-flat";
  const workIdSpan = document.createElement("div");
  workIdSpan.className = "work-id-flat";
  workIdSpan.innerHTML = `${siteBadge} <strong>${workId}</strong>`;
  const workMeta = document.createElement("div");
  workMeta.className = "work-meta-flat";
  workMeta.innerHTML = `
        <span class="work-stats-flat">${work.totalImages} image${work.totalImages !== 1 ? "s" : ""} • ${work.totalBoxes} box${work.totalBoxes !== 1 ? "es" : ""}</span>
        ${workEntry.metadata?.lastUpdated ? `<span class="work-date-flat">${formatDate(workEntry.metadata.lastUpdated)}</span>` : ""}
    `;
  workInfo.appendChild(workIdSpan);
  workInfo.appendChild(workMeta);
  const controls = document.createElement("div");
  controls.className = "work-controls-flat";
  const delBtn = document.createElement("button");
  delBtn.className = "danger work-delete-btn";
  delBtn.textContent = "Delete";
  delBtn.onclick = (e) => {
    e.stopPropagation();
    if (confirm(`Delete all overlays for work ${workId}?`)) {
      onWorkDelete(work.storageKey);
    }
  };
  controls.appendChild(delBtn);
  header.appendChild(workInfo);
  header.appendChild(controls);
  const imagesList = document.createElement("div");
  imagesList.className = "work-images-list-flat";
  Object.keys(workEntry.images || {}).forEach((selector) => {
    const imageData = workEntry.images[selector];
    const imageCard = createImageCard(
      work.storageKey,
      selector,
      imageData,
      workEntry,
      (storageKey, imageSelector) => {
        const workEntry2 = window.allDataCache[storageKey];
        if (workEntry2 && workEntry2.images) {
          delete workEntry2.images[imageSelector];
          workEntry2.metadata.lastUpdated = Date.now();
          saveWorkEntryWithIndex(storageKey, workEntry2).then(() => {
            window.allDataCache[storageKey] = workEntry2;
            onUpdate();
          });
        }
      },
      () => {
        onUpdate();
      }
    );
    imagesList.appendChild(imageCard);
  });
  card.appendChild(header);
  card.appendChild(imagesList);
  return card;
}
function createLegacyPageRow(url, notes, onDelete) {
  const row = document.createElement("div");
  row.className = "work-card-flat legacy-row";
  let displayPath = url;
  try {
    const urlObj = new URL(url);
    displayPath = urlObj.pathname + urlObj.search;
    if (displayPath.length > 80) displayPath = displayPath.substring(0, 80) + "...";
  } catch (e) {
  }
  const header = document.createElement("div");
  header.className = "work-header-flat";
  const pathSpan = document.createElement("div");
  pathSpan.className = "work-info-flat";
  const link = document.createElement("a");
  link.href = url;
  link.target = "_blank";
  link.textContent = displayPath;
  link.onclick = (e) => e.stopPropagation();
  pathSpan.appendChild(link);
  const controls = document.createElement("div");
  controls.className = "work-controls-flat";
  const badge = document.createElement("span");
  badge.className = "work-stats-flat";
  badge.textContent = `${notes.length} notes`;
  const delBtn = document.createElement("button");
  delBtn.className = "danger work-delete-btn";
  delBtn.textContent = "Delete";
  delBtn.onclick = (e) => {
    e.stopPropagation();
    if (confirm(`Delete all notes for this page?`)) {
      onDelete(url);
    }
  };
  controls.appendChild(badge);
  controls.appendChild(delBtn);
  header.appendChild(pathSpan);
  header.appendChild(controls);
  const notesList = document.createElement("div");
  notesList.className = "work-images-list-flat";
  notes.forEach((note, index) => {
    const ta = document.createElement("textarea");
    ta.className = "note-editor";
    ta.value = note.note || "";
    ta.placeholder = "Empty note...";
    let timeout;
    ta.addEventListener("input", (e) => {
      clearTimeout(timeout);
      timeout = setTimeout(() => {
        const notes2 = window.allDataCache[url];
        if (notes2 && notes2[index]) {
          notes2[index].note = e.target.value;
          const update = {};
          update[url] = notes2;
          chrome.storage.local.set(update);
        }
      }, 500);
    });
    ta.onclick = (e) => e.stopPropagation();
    notesList.appendChild(ta);
  });
  row.appendChild(header);
  row.appendChild(notesList);
  return row;
}
function filterAndGroupData(allData2, query = "") {
  const lowerQuery = query.toLowerCase();
  const worksByDomain = {};
  Object.keys(allData2).forEach((storageKey) => {
    if (isDashboardMetaKey(storageKey)) return;
    const val = allData2[storageKey];
    if (val && typeof val === "object" && val.images && val.workId !== void 0) {
      const workEntry = val;
      let hostname = "Unknown";
      try {
        const urlToParse = workEntry.baseUrl || workEntry.metadata?.urlVariants?.[0] || storageKey;
        hostname = new URL(urlToParse).hostname;
      } catch (e) {
        try {
          hostname = new URL(storageKey).hostname;
        } catch (e2) {
          hostname = "Unknown";
        }
      }
      let totalBoxes = 0;
      let totalImages = 0;
      const allNotes = [];
      const allPageUrls = [];
      Object.keys(workEntry.images || {}).forEach((selector) => {
        const imageData = workEntry.images[selector];
        totalImages++;
        totalBoxes += imageData.boxes?.length || 0;
        if (imageData.pageUrl) allPageUrls.push(imageData.pageUrl);
        imageData.boxes?.forEach((box) => {
          if (box.note) allNotes.push(box.note);
        });
      });
      const matchesQuery = lowerQuery === "" || workEntry.workId && workEntry.workId.toString().includes(lowerQuery) || workEntry.site && workEntry.site.toLowerCase().includes(lowerQuery) || workEntry.baseUrl && workEntry.baseUrl.toLowerCase().includes(lowerQuery) || allNotes.some((note) => note.toLowerCase().includes(lowerQuery)) || allPageUrls.some((url) => url.toLowerCase().includes(lowerQuery)) || Object.values(workEntry.images || {}).some(
        (img) => img.src && img.src.toLowerCase().includes(lowerQuery)
      );
      if (!matchesQuery) return;
      if (!worksByDomain[hostname]) worksByDomain[hostname] = [];
      worksByDomain[hostname].push({
        storageKey,
        workEntry,
        totalBoxes,
        totalImages
      });
    } else if (Array.isArray(val)) {
      const notes = val;
      let hostname = "Unknown";
      try {
        hostname = new URL(storageKey).hostname;
      } catch (e) {
        hostname = "Unknown";
      }
      const matchesQuery = lowerQuery === "" || storageKey.toLowerCase().includes(lowerQuery) || notes.some((n) => (n.note || "").toLowerCase().includes(lowerQuery));
      if (!matchesQuery) return;
      if (!worksByDomain[hostname]) worksByDomain[hostname] = [];
      worksByDomain[hostname].push({
        storageKey,
        legacy: true,
        notes
      });
    }
  });
  return worksByDomain;
}
function sortWorks(works, sortBy = "date", order = "desc") {
  const sorted = [...works];
  sorted.sort((a, b) => {
    let aVal, bVal;
    switch (sortBy) {
      case "date":
        aVal = a.legacy ? 0 : a.workEntry.metadata?.lastUpdated || 0;
        bVal = b.legacy ? 0 : b.workEntry.metadata?.lastUpdated || 0;
        break;
      case "site":
        aVal = a.legacy ? "other" : a.workEntry.site || "other";
        bVal = b.legacy ? "other" : b.workEntry.site || "other";
        break;
      case "boxCount":
        aVal = a.totalBoxes || 0;
        bVal = b.totalBoxes || 0;
        break;
      case "imageCount":
        aVal = a.totalImages || 0;
        bVal = b.totalImages || 0;
        break;
      default:
        return 0;
    }
    if (typeof aVal === "string") {
      return order === "asc" ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
    } else {
      return order === "asc" ? aVal - bVal : bVal - aVal;
    }
  });
  return sorted;
}
function renderDashboard(allData2, query = "", listContainer2, onWorkDelete, onUpdate) {
  listContainer2.innerHTML = "";
  const worksByDomain = filterAndGroupData(allData2, query);
  const allWorks = [];
  Object.keys(worksByDomain).forEach((domain) => {
    allWorks.push(...worksByDomain[domain]);
  });
  const sortedWorks = sortWorks(allWorks, "date", "desc");
  if (sortedWorks.length === 0) {
    listContainer2.innerHTML = `<div class="empty-state">${query ? "No matches found." : "No overlays yet."}</div>`;
    return;
  }
  sortedWorks.forEach((work) => {
    const workCard = createWorkCard(work, onWorkDelete, onUpdate);
    listContainer2.appendChild(workCard);
  });
}
function createBulkActionsBar(onBulkDelete, onBulkExport, onClearSelection) {
  const bar = document.createElement("div");
  bar.className = "bulk-actions-bar";
  bar.style.display = "none";
  const left = document.createElement("div");
  left.className = "bulk-actions-left";
  const count = document.createElement("span");
  count.className = "bulk-selection-count";
  count.textContent = "0 selected";
  left.appendChild(count);
  const right = document.createElement("div");
  right.className = "bulk-actions-right";
  const exportBtn = document.createElement("button");
  exportBtn.textContent = "Export Selected";
  exportBtn.onclick = () => onBulkExport();
  const deleteBtn = document.createElement("button");
  deleteBtn.className = "danger";
  deleteBtn.textContent = "Delete Selected";
  deleteBtn.onclick = () => {
    if (confirm("Delete all selected items?")) {
      onBulkDelete();
    }
  };
  const clearBtn = document.createElement("button");
  clearBtn.textContent = "Clear Selection";
  clearBtn.onclick = () => onClearSelection();
  right.appendChild(exportBtn);
  right.appendChild(deleteBtn);
  right.appendChild(clearBtn);
  bar.appendChild(left);
  bar.appendChild(right);
  return bar;
}
function updateBulkActionsBar(bar, selectedCount) {
  const countEl = bar.querySelector(".bulk-selection-count");
  if (countEl) {
    countEl.textContent = `${selectedCount} selected`;
  }
  {
    bar.style.display = "none";
  }
}
const listContainer = document.getElementById("dashboard-list");
const searchInput = document.getElementById("search-input");
let allData = {};
window.allDataCache = allData;
let selectedItems = /* @__PURE__ */ new Set();
let bulkActionsBar = null;
document.addEventListener("DOMContentLoaded", () => {
  loadDashboard();
  initTheme();
  initBulkActions();
  searchInput.addEventListener("input", (e) => {
    renderDashboard(allData, e.target.value, listContainer, handleWorkDelete, handleUpdate);
  });
  document.getElementById("refresh-btn").onclick = loadDashboard;
  document.getElementById("export-btn").onclick = exportData;
  document.getElementById("clear-btn").onclick = clearAllData;
  document.getElementById("theme-toggle").onclick = toggleTheme;
  window.inspectStorage = () => {
    chrome.storage.local.get(null, (items) => {
      console.log("=== Storage Contents ===");
      console.log("Keys:", Object.keys(items));
      console.log("Total keys:", Object.keys(items).length);
      console.table(items);
      const size = JSON.stringify(items).length;
      console.log("Storage size:", size, "bytes");
      alert(`Storage contains ${Object.keys(items).length} keys:
${Object.keys(items).join(", ")}

Check console (F12) for full details.`);
    });
  };
  initVisualSettings();
  initDisabledHosts();
});
function initBulkActions() {
  bulkActionsBar = createBulkActionsBar(
    handleBulkDelete,
    handleBulkExport,
    handleClearSelection
  );
  document.body.insertBefore(bulkActionsBar, listContainer);
}
function handleBulkDelete() {
  console.log("Bulk delete:", Array.from(selectedItems));
  selectedItems.clear();
  updateBulkActionsBar(bulkActionsBar, 0);
  loadDashboard();
}
function handleBulkExport() {
  console.log("Bulk export:", Array.from(selectedItems));
}
function handleClearSelection() {
  selectedItems.clear();
  updateBulkActionsBar(bulkActionsBar, 0);
  document.querySelectorAll('input[type="checkbox"].bulk-select').forEach((cb) => {
    cb.checked = false;
  });
}
function handleWorkDelete(storageKey) {
  removeStorageKey(storageKey).then(() => {
    delete allData[storageKey];
    window.allDataCache = allData;
    renderDashboard(allData, searchInput.value, listContainer, handleWorkDelete, handleUpdate);
  });
}
function handleUpdate() {
  getAllData().then((items) => {
    allData = items;
    window.allDataCache = allData;
    renderDashboard(allData, searchInput.value, listContainer, handleWorkDelete, handleUpdate);
  });
}
function initDisabledHosts() {
  const ta = document.getElementById("opt-disabled-hosts");
  if (!ta) return;
  chrome.storage.local.get(["overlay_disabled_hosts"], (r) => {
    const list = r.overlay_disabled_hosts;
    ta.value = Array.isArray(list) ? list.join("\n") : "";
  });
  let t;
  ta.addEventListener("input", () => {
    clearTimeout(t);
    t = setTimeout(() => {
      const lines = ta.value.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
      chrome.storage.local.set({ overlay_disabled_hosts: lines });
    }, 300);
  });
}
function initVisualSettings() {
  const optOpacity = document.getElementById("opt-opacity");
  const valOpacity = document.getElementById("val-opacity");
  const optBorder = document.getElementById("opt-border-color");
  const optBg = document.getElementById("opt-bg-color");
  chrome.storage.local.get(["overlay_opacity", "overlay_border_color", "overlay_bg_color"], (res) => {
    const op = res.overlay_opacity || 1;
    const borderColor = res.overlay_border_color || "#000000";
    const bgColor = res.overlay_bg_color || "#ffffff";
    optOpacity.value = op;
    valOpacity.innerText = op;
    optBorder.value = borderColor;
    optBg.value = bgColor;
  });
  optOpacity.addEventListener("input", (e) => {
    valOpacity.innerText = e.target.value;
    chrome.storage.local.set({ overlay_opacity: e.target.value });
  });
  optBorder.addEventListener("input", (e) => {
    chrome.storage.local.set({ overlay_border_color: e.target.value });
  });
  optBg.addEventListener("input", (e) => {
    chrome.storage.local.set({ overlay_bg_color: e.target.value });
  });
}
function initTheme() {
  chrome.storage.local.get("theme", (result) => {
    if (result.theme === "light") {
      document.body.setAttribute("data-theme", "light");
    }
  });
}
function toggleTheme() {
  const isLight = document.body.getAttribute("data-theme") === "light";
  const newTheme = isLight ? "dark" : "light";
  if (newTheme === "light") {
    document.body.setAttribute("data-theme", "light");
  } else {
    document.body.removeAttribute("data-theme");
  }
  chrome.storage.local.set({ theme: newTheme });
}
function loadDashboard() {
  getAllData().then((items) => {
    allData = items;
    window.allDataCache = allData;
    renderDashboard(allData, searchInput.value, listContainer, handleWorkDelete, handleUpdate);
  });
  getStorageBytes().then((bytes) => {
    const el = document.getElementById("storage-usage");
    if (!el) return;
    el.innerText = "Storage: " + formatBytes(bytes);
  });
  getOcrQuota().then((count) => {
    const el = document.getElementById("usage-count");
    if (!el) return;
    el.innerText = count;
    if (count >= 1e3) el.style.color = "#d93025";
  });
}
function clearAllData() {
  if (confirm("WARNING: Delete EVERYTHING?")) {
    clearAllStorage().then(() => {
      allData = {};
      window.allDataCache = allData;
      loadDashboard();
      chrome.storage.local.remove([
        "overlay_opacity",
        "overlay_border_color",
        "overlay_bg_color",
        "theme"
      ], () => {
        window.location.reload();
      });
    });
  }
}
function exportData() {
  const blob = new Blob([JSON.stringify(allData, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `deep_overlay_backup_${(/* @__PURE__ */ new Date()).toISOString().split("T")[0]}.json`;
  a.click();
}
