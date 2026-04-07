function createBoxEditor(storageKey, imageSelector, boxIndex, boxData, onUpdate, opts = {}) {
  const compact = opts.compact === true;
  const container = document.createElement("div");
  container.className = compact ? "box-editor box-editor-compact" : "box-editor";
  const editor = document.createElement("textarea");
  editor.className = "note-editor";
  editor.value = boxData.note || "";
  editor.placeholder = compact ? "Note…" : `Box ${boxIndex + 1} - Empty note...`;
  editor.dataset.storageKey = storageKey;
  editor.dataset.imageSelector = imageSelector;
  editor.dataset.boxIndex = boxIndex;
  const info = document.createElement("div");
  info.className = "box-info";
  info.textContent = `Box ${boxIndex + 1}`;
  const deleteBtn = document.createElement("button");
  deleteBtn.className = compact ? "box-delete-btn box-delete-btn-compact" : "box-delete-btn";
  deleteBtn.innerHTML = "×";
  deleteBtn.title = "Delete this box";
  deleteBtn.onclick = (e) => {
    e.stopPropagation();
    if (confirm("Delete this box?")) {
      onUpdate(storageKey, imageSelector, boxIndex, null);
    }
  };
  const editorWrapper = document.createElement("div");
  editorWrapper.className = compact ? "box-editor-wrapper box-editor-wrapper-compact" : "box-editor-wrapper";
  editorWrapper.style.position = "relative";
  let timeout;
  editor.addEventListener("input", (e) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => {
      onUpdate(storageKey, imageSelector, boxIndex, e.target.value);
    }, 500);
  });
  editor.onclick = (e) => e.stopPropagation();
  if (compact) {
    info.className = "box-info box-info-compact";
    const row = document.createElement("div");
    row.className = "box-editor-compact-toolbar";
    row.appendChild(info);
    row.appendChild(deleteBtn);
    editorWrapper.appendChild(editor);
    container.appendChild(row);
    container.appendChild(editorWrapper);
  } else {
    editorWrapper.appendChild(editor);
    editorWrapper.appendChild(deleteBtn);
    container.appendChild(info);
    container.appendChild(editorWrapper);
  }
  return container;
}
function formatDateShort(timestamp) {
  if (!timestamp) return "—";
  const date = new Date(timestamp);
  return date.toLocaleDateString(void 0, { year: "numeric", month: "short", day: "numeric" });
}
function truncateText(text, maxLength = 50) {
  if (!text) return "";
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + "...";
}
const SITE_BADGE_CLASS = {
  "e-hentai": "site-badge-ehentai",
  "x": "site-badge-x",
  "pixiv": "site-badge-pixiv",
  "generic": "site-badge-other",
  "other": "site-badge-other"
};
const SITE_BADGE_LABEL = {
  "e-hentai": "E-H",
  "x": "X",
  "pixiv": "Pixiv",
  "generic": "Web",
  "other": "Other"
};
function getSiteBadgeClass(site) {
  return SITE_BADGE_CLASS[site] || SITE_BADGE_CLASS.other;
}
function createSiteBadgeElement(site) {
  const span = document.createElement("span");
  span.className = `site-badge ${getSiteBadgeClass(site)}`;
  span.textContent = SITE_BADGE_LABEL[site] || SITE_BADGE_LABEL.other;
  return span;
}
function getWorkDisplayLabel(workEntry) {
  if (!workEntry || workEntry.workId === void 0) return "N/A";
  const custom = (workEntry.metadata?.displayName || "").trim();
  if (custom) return custom;
  return String(workEntry.workId);
}
function hostChipFromUrl(pageUrl) {
  if (!pageUrl) return "";
  try {
    const h = new URL(pageUrl).hostname.replace(/^www\./, "");
    return h.length > 28 ? `${h.slice(0, 26)}…` : h;
  } catch {
    return "";
  }
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
function getExpandedState(key) {
  const state = localStorage.getItem(`expanded_${key}`);
  return state === "true";
}
function setExpandedState(key, expanded) {
  localStorage.setItem(`expanded_${key}`, expanded.toString());
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
function createImageCard(storageKey, selector, imageData, workEntry, onImageDelete, onBoxUpdate, opts = {}) {
  const compact = opts.compact === true;
  const imageCard = document.createElement("div");
  imageCard.className = compact ? "image-card-flat image-card-compact" : "image-card-flat";
  imageCard.dataset.imageSelector = selector;
  const boxCount = document.createElement("span");
  boxCount.className = compact ? "image-compact-boxcount" : "image-box-count-flat";
  const n = imageData.boxes?.length || 0;
  boxCount.textContent = `${n} box${n !== 1 ? "es" : ""}`;
  const deleteBtn = document.createElement("button");
  deleteBtn.className = "image-delete-btn-flat danger";
  deleteBtn.textContent = "Delete";
  deleteBtn.onclick = (e) => {
    e.stopPropagation();
    if (confirm("Delete this image and all its boxes?")) {
      onImageDelete(storageKey, selector);
    }
  };
  if (compact) {
    const head = document.createElement("div");
    head.className = "image-compact-head";
    const left = document.createElement("div");
    left.className = "image-compact-left";
    const pageLabel = document.createElement("span");
    pageLabel.className = "image-compact-page";
    pageLabel.textContent = formatPageUrl(imageData.pageUrl, workEntry.site);
    const dot = document.createElement("span");
    dot.className = "image-compact-dot";
    dot.textContent = "·";
    left.appendChild(pageLabel);
    left.appendChild(dot);
    left.appendChild(boxCount);
    head.appendChild(left);
    head.appendChild(deleteBtn);
    imageCard.appendChild(head);
  } else {
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
    pageUrlDiv.textContent = formatPageUrl(imageData.pageUrl, workEntry.site);
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
    imageActions.appendChild(boxCount);
    imageActions.appendChild(deleteBtn);
    imageContainer.appendChild(thumbnailContainer);
    imageContainer.appendChild(imageInfo);
    imageContainer.appendChild(imageActions);
    imageCard.appendChild(imageContainer);
  }
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
            const we = window.allDataCache[sk];
            if (we && we.images && we.images[sel]) {
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
    const emptyMsg = document.createElement("div");
    emptyMsg.className = "empty-boxes-msg";
    emptyMsg.textContent = "No boxes for this image";
    boxesList.appendChild(emptyMsg);
  }
  imageCard.appendChild(boxesList);
  return imageCard;
}
function createWorkCard(work, onWorkDelete, onUpdate) {
  if (work.legacy) {
    return createLegacyPageRow(work.storageKey, work.notes, onWorkDelete);
  }
  const workEntry = work.workEntry;
  const workId = workEntry.workId != null ? String(workEntry.workId) : "N/A";
  const site = workEntry.site || "other";
  const card = document.createElement("div");
  card.className = "work-card-flat work-card-minimal";
  card.dataset.storageKey = work.storageKey;
  const head = document.createElement("div");
  head.className = "wcm-head";
  head.setAttribute("role", "button");
  head.setAttribute("tabindex", "0");
  head.setAttribute("aria-expanded", "false");
  const row1 = document.createElement("div");
  row1.className = "wcm-row1";
  const chevron = document.createElement("span");
  chevron.className = "wcm-chevron";
  chevron.setAttribute("aria-hidden", "true");
  chevron.textContent = "▸";
  const badge = createSiteBadgeElement(site);
  const titleWrap = document.createElement("div");
  titleWrap.className = "wcm-title-wrap";
  const idEl = document.createElement("span");
  idEl.className = "wcm-id";
  function refreshTitle() {
    const we = window.allDataCache[work.storageKey] || workEntry;
    const label = getWorkDisplayLabel(we);
    idEl.textContent = truncateText(label, 52);
    const idOnly = we.workId != null ? String(we.workId) : "N/A";
    const custom = (we.metadata?.displayName || "").trim();
    idEl.title = custom ? `Work ID: ${idOnly}` : idOnly;
  }
  refreshTitle();
  const renameBtn = document.createElement("button");
  renameBtn.type = "button";
  renameBtn.className = "wcm-rename";
  renameBtn.textContent = "✎";
  renameBtn.title = "Name this work";
  renameBtn.setAttribute("aria-label", "Edit display name");
  renameBtn.onclick = (e) => {
    e.stopPropagation();
    const we0 = window.allDataCache[work.storageKey] || workEntry;
    const input = document.createElement("input");
    input.type = "text";
    input.className = "wcm-name-input";
    input.value = (we0.metadata?.displayName || "").trim();
    input.placeholder = workId;
    titleWrap.replaceChildren(input);
    input.focus();
    input.select();
    let finished = false;
    function finish(commit) {
      if (finished) return;
      finished = true;
      titleWrap.replaceChildren(idEl, renameBtn);
      if (!commit) {
        refreshTitle();
        return;
      }
      const v = input.value.trim();
      const raw = window.allDataCache[work.storageKey];
      if (!raw) {
        refreshTitle();
        return;
      }
      const w = { ...raw, metadata: { ...raw.metadata } };
      if (v) w.metadata.displayName = v;
      else delete w.metadata.displayName;
      w.metadata.lastUpdated = Date.now();
      saveWorkEntryWithIndex(work.storageKey, w).then(() => {
        window.allDataCache[work.storageKey] = w;
        refreshTitle();
        onUpdate();
      });
    }
    input.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter") {
        ev.preventDefault();
        finish(true);
      } else if (ev.key === "Escape") {
        ev.preventDefault();
        finish(false);
      }
    });
    input.addEventListener("blur", () => {
      if (!finished) finish(true);
    });
  };
  titleWrap.appendChild(idEl);
  titleWrap.appendChild(renameBtn);
  const dateEl = document.createElement("span");
  dateEl.className = "wcm-date";
  dateEl.textContent = workEntry.metadata?.lastUpdated ? formatDateShort(workEntry.metadata.lastUpdated) : "—";
  const delBtn = document.createElement("button");
  delBtn.type = "button";
  delBtn.className = "wcm-del";
  delBtn.textContent = "Delete";
  delBtn.onclick = (e) => {
    e.stopPropagation();
    const we = window.allDataCache[work.storageKey] || workEntry;
    const label = getWorkDisplayLabel(we);
    if (confirm(`Delete all overlays for “${label}” (ID ${workId})?`)) {
      onWorkDelete(work.storageKey);
    }
  };
  row1.appendChild(chevron);
  row1.appendChild(badge);
  row1.appendChild(titleWrap);
  row1.appendChild(dateEl);
  row1.appendChild(delBtn);
  const row2 = document.createElement("div");
  row2.className = "wcm-row2";
  const counts = document.createElement("span");
  counts.className = "wcm-counts";
  counts.innerHTML = `<strong>${work.totalBoxes}</strong> box${work.totalBoxes !== 1 ? "es" : ""} · <strong>${work.totalImages}</strong> image${work.totalImages !== 1 ? "s" : ""}`;
  const tags = document.createElement("div");
  tags.className = "wcm-tags";
  const base = workEntry.baseUrl || workEntry.metadata?.urlVariants?.[0] || "";
  const host = hostChipFromUrl(base);
  if (host) {
    const chip = document.createElement("span");
    chip.className = "wcm-chip";
    chip.textContent = host;
    tags.appendChild(chip);
  }
  row2.appendChild(counts);
  row2.appendChild(tags);
  head.appendChild(row1);
  head.appendChild(row2);
  const expanded = document.createElement("div");
  expanded.className = "wcm-expanded";
  expanded.hidden = true;
  const imageKeys = Object.keys(workEntry.images || {});
  const strip = document.createElement("div");
  strip.className = "wcm-thumb-strip";
  strip.setAttribute("role", "tablist");
  strip.setAttribute("aria-label", "Images in this work");
  const detailSlot = document.createElement("div");
  detailSlot.className = "wcm-detail-slot work-images-list-flat";
  const toolbar = document.createElement("div");
  toolbar.className = "wcm-toolbar";
  const exportBtn = document.createElement("button");
  exportBtn.type = "button";
  exportBtn.className = "do-btn";
  exportBtn.textContent = "Export";
  exportBtn.onclick = (e) => {
    e.stopPropagation();
    const raw = window.allDataCache[work.storageKey];
    const payload = { [work.storageKey]: raw };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `deepoverlay_work_${workId.slice(0, 24)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };
  const goPageBtn = document.createElement("button");
  goPageBtn.type = "button";
  goPageBtn.className = "do-btn wcm-go-page";
  goPageBtn.textContent = "Go to page";
  function updateGoPageButton(imageKey) {
    const fresh = window.allDataCache[work.storageKey];
    const entry = fresh?.images ? fresh : workEntry;
    const data = imageKey && entry?.images?.[imageKey];
    const pageUrl = data?.pageUrl;
    goPageBtn.disabled = !pageUrl;
    goPageBtn.title = pageUrl ? pageUrl : "Select a thumbnail first";
    goPageBtn.onclick = (e) => {
      e.stopPropagation();
      const fr = window.allDataCache[work.storageKey];
      const ent = fr?.images ? fr : workEntry;
      const d = imageKey && ent?.images?.[imageKey];
      const u = d?.pageUrl;
      if (u) window.open(u, "_blank", "noopener,noreferrer");
    };
  }
  toolbar.appendChild(exportBtn);
  toolbar.appendChild(goPageBtn);
  function onImageDelete(storageKey, imageSelector) {
    const w = window.allDataCache[storageKey];
    if (w && w.images) {
      delete w.images[imageSelector];
      w.metadata.lastUpdated = Date.now();
      saveWorkEntryWithIndex(storageKey, w).then(() => {
        window.allDataCache[storageKey] = w;
        onUpdate();
      });
    }
  }
  function renderDetail(imageKey) {
    detailSlot.innerHTML = "";
    strip.querySelectorAll(".wcm-thumb-btn").forEach((btn) => {
      const on = btn.dataset.imageKey === imageKey;
      btn.classList.toggle("wcm-thumb-selected", on);
      btn.setAttribute("aria-selected", on ? "true" : "false");
    });
    if (!imageKey || !workEntry.images[imageKey]) {
      const hint = document.createElement("div");
      hint.className = "wcm-detail-hint";
      hint.textContent = "Click a thumbnail to view and edit boxes for that page.";
      detailSlot.appendChild(hint);
      updateGoPageButton(null);
      return;
    }
    const fresh = window.allDataCache[work.storageKey];
    const entry = fresh && fresh.images ? fresh : workEntry;
    const imageData = entry.images[imageKey];
    if (!imageData) {
      renderDetail(null);
      return;
    }
    const card2 = createImageCard(
      work.storageKey,
      imageKey,
      imageData,
      entry,
      onImageDelete,
      onUpdate,
      { compact: true }
    );
    detailSlot.appendChild(card2);
    updateGoPageButton(imageKey);
  }
  imageKeys.forEach((imageKey) => {
    const imageData = workEntry.images[imageKey];
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "wcm-thumb-btn";
    btn.dataset.imageKey = imageKey;
    btn.setAttribute("role", "tab");
    btn.setAttribute("aria-selected", "false");
    const label = formatPageUrl(imageData.pageUrl, site) || "Image";
    btn.setAttribute("aria-label", label);
    if (imageData?.src) {
      const img = document.createElement("img");
      img.className = "wcm-thumb";
      img.src = imageData.src;
      img.loading = "lazy";
      img.alt = "";
      btn.appendChild(img);
    } else {
      const ph = document.createElement("div");
      ph.className = "wcm-thumb-placeholder";
      ph.textContent = truncateText(label, 24);
      btn.appendChild(ph);
    }
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      renderDetail(imageKey);
    });
    strip.appendChild(btn);
  });
  if (!strip.childElementCount) {
    strip.style.display = "none";
  }
  renderDetail(null);
  expanded.appendChild(strip);
  expanded.appendChild(toolbar);
  expanded.appendChild(detailSlot);
  let isOpen = getExpandedState(work.storageKey);
  function applyOpen(open) {
    isOpen = open;
    expanded.hidden = !open;
    head.setAttribute("aria-expanded", String(open));
    card.classList.toggle("wcm-open", open);
    chevron.textContent = open ? "▾" : "▸";
    setExpandedState(work.storageKey, open);
  }
  applyOpen(isOpen);
  head.addEventListener("click", () => applyOpen(!isOpen));
  head.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      applyOpen(!isOpen);
    }
  });
  card.appendChild(head);
  card.appendChild(expanded);
  return card;
}
function createLegacyPageRow(url, notes, onDelete) {
  const card = document.createElement("div");
  card.className = "work-card-flat work-card-minimal legacy-row";
  card.dataset.storageKey = url;
  let displayPath = url;
  try {
    const urlObj = new URL(url);
    displayPath = urlObj.pathname + urlObj.search;
    if (displayPath.length > 56) displayPath = `${displayPath.substring(0, 54)}…`;
  } catch {
  }
  const head = document.createElement("div");
  head.className = "wcm-head";
  head.setAttribute("role", "button");
  head.setAttribute("tabindex", "0");
  head.setAttribute("aria-expanded", "false");
  const row1 = document.createElement("div");
  row1.className = "wcm-row1";
  const chevron = document.createElement("span");
  chevron.className = "wcm-chevron";
  chevron.setAttribute("aria-hidden", "true");
  chevron.textContent = "▸";
  const badge = document.createElement("span");
  badge.className = "site-badge site-badge-archive";
  badge.textContent = "Archive";
  const idEl = document.createElement("span");
  idEl.className = "wcm-id";
  idEl.textContent = displayPath;
  idEl.title = url;
  const dateEl = document.createElement("span");
  dateEl.className = "wcm-date";
  dateEl.textContent = "—";
  const delBtn = document.createElement("button");
  delBtn.type = "button";
  delBtn.className = "wcm-del";
  delBtn.textContent = "Delete";
  delBtn.onclick = (e) => {
    e.stopPropagation();
    if (confirm("Delete all notes for this page?")) {
      onDelete(url);
    }
  };
  row1.appendChild(chevron);
  row1.appendChild(badge);
  row1.appendChild(idEl);
  row1.appendChild(dateEl);
  row1.appendChild(delBtn);
  const row2 = document.createElement("div");
  row2.className = "wcm-row2";
  const counts = document.createElement("span");
  counts.className = "wcm-counts";
  counts.innerHTML = `<strong>${notes.length}</strong> note${notes.length !== 1 ? "s" : ""}`;
  const tags = document.createElement("div");
  tags.className = "wcm-tags";
  const host = hostChipFromUrl(url);
  if (host) {
    const chip = document.createElement("span");
    chip.className = "wcm-chip";
    chip.textContent = host;
    tags.appendChild(chip);
  }
  row2.appendChild(counts);
  row2.appendChild(tags);
  head.appendChild(row1);
  head.appendChild(row2);
  const expanded = document.createElement("div");
  expanded.className = "wcm-expanded";
  expanded.hidden = true;
  const notesList = document.createElement("div");
  notesList.className = "work-images-list-flat";
  notes.forEach((note, index) => {
    const ta = document.createElement("textarea");
    ta.className = "note-editor";
    ta.value = note.note || "";
    ta.placeholder = "Empty note…";
    let timeout;
    ta.addEventListener("input", (e) => {
      clearTimeout(timeout);
      timeout = setTimeout(() => {
        const arr = window.allDataCache[url];
        if (arr && arr[index]) {
          arr[index].note = e.target.value;
          const update = {};
          update[url] = arr;
          chrome.storage.local.set(update);
        }
      }, 500);
    });
    ta.onclick = (e) => e.stopPropagation();
    notesList.appendChild(ta);
  });
  expanded.appendChild(notesList);
  let isOpen = getExpandedState(url);
  function applyOpen(open) {
    isOpen = open;
    expanded.hidden = !open;
    head.setAttribute("aria-expanded", String(open));
    card.classList.toggle("wcm-open", open);
    chevron.textContent = open ? "▾" : "▸";
    setExpandedState(url, open);
  }
  applyOpen(isOpen);
  head.addEventListener("click", () => applyOpen(!isOpen));
  head.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      applyOpen(!isOpen);
    }
  });
  card.appendChild(head);
  card.appendChild(expanded);
  return card;
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
      const displayName = (workEntry.metadata?.displayName || "").trim();
      const matchesQuery = lowerQuery === "" || displayName && displayName.toLowerCase().includes(lowerQuery) || workEntry.workId && workEntry.workId.toString().includes(lowerQuery) || workEntry.site && workEntry.site.toLowerCase().includes(lowerQuery) || workEntry.baseUrl && workEntry.baseUrl.toLowerCase().includes(lowerQuery) || allNotes.some((note) => note.toLowerCase().includes(lowerQuery)) || allPageUrls.some((url) => url.toLowerCase().includes(lowerQuery)) || Object.values(workEntry.images || {}).some(
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
function filterWorks(works, filters = {}) {
  const site = filters.site;
  return works.filter((work) => {
    if (work.legacy) {
      if (!site || site === "all") return true;
      return site === "legacy";
    }
    if (site && site !== "all") {
      if (site === "legacy") return false;
      const wSite = work.workEntry.site || "other";
      if (wSite !== site) return false;
    }
    if (filters.dateFrom || filters.dateTo) {
      const lastUpdated = work.workEntry.metadata?.lastUpdated || 0;
      if (filters.dateFrom && lastUpdated < filters.dateFrom) return false;
      if (filters.dateTo && lastUpdated > filters.dateTo) return false;
    }
    if (filters.hasNotes) {
      const hasNotes = Object.values(work.workEntry.images || {}).some(
        (img) => img.boxes?.some((box) => box.note && box.note.trim())
      );
      if (!hasNotes) return false;
    }
    return true;
  });
}
const LIBRARY_PAGE_SIZE = 12;
function renderPaginationBar(el, { page, totalPages, totalWorks, pageSize, onPageChange }) {
  if (!el || !onPageChange) return;
  if (totalPages <= 1) {
    el.innerHTML = "";
    el.hidden = true;
    return;
  }
  el.hidden = false;
  el.innerHTML = "";
  el.className = "do-pagination";
  el.setAttribute("role", "navigation");
  el.setAttribute("aria-label", "Library pages");
  const prev = document.createElement("button");
  prev.type = "button";
  prev.className = "do-btn";
  prev.textContent = "← Prev";
  prev.disabled = page <= 1;
  prev.onclick = () => onPageChange(page - 1);
  const info = document.createElement("span");
  info.className = "do-pagination-info";
  const start = (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, totalWorks);
  info.textContent = `Page ${page} / ${totalPages} · ${start}–${end} of ${totalWorks}`;
  const next = document.createElement("button");
  next.type = "button";
  next.className = "do-btn";
  next.textContent = "Next →";
  next.disabled = page >= totalPages;
  next.onclick = () => onPageChange(page + 1);
  el.appendChild(prev);
  el.appendChild(info);
  el.appendChild(next);
}
function renderDashboard(allData2, query = "", listContainer2, onWorkDelete, onUpdate, opts = {}) {
  const pageSize = opts.pageSize ?? LIBRARY_PAGE_SIZE;
  const requestedPage = opts.page ?? 1;
  const paginationEl2 = opts.paginationEl ?? null;
  const onPageChange = opts.onPageChange;
  const siteFilter = opts.siteFilter ?? "all";
  listContainer2.innerHTML = "";
  const worksByDomain = filterAndGroupData(allData2, query);
  const allWorks = [];
  Object.keys(worksByDomain).forEach((domain) => {
    allWorks.push(...worksByDomain[domain]);
  });
  const sortedWorks = sortWorks(allWorks, "date", "desc");
  const filteredWorks = filterWorks(sortedWorks, { site: siteFilter });
  const totalWorks = filteredWorks.length;
  if (totalWorks === 0) {
    const noMatch = query || siteFilter && siteFilter !== "all" ? "No works match your search or filter." : "No overlays yet.";
    listContainer2.innerHTML = `<div class="empty-state">${noMatch}</div>`;
    if (paginationEl2) {
      paginationEl2.innerHTML = "";
      paginationEl2.hidden = true;
    }
    return { totalWorks: 0, totalPages: 1, currentPage: 1 };
  }
  const totalPages = Math.max(1, Math.ceil(totalWorks / pageSize));
  const currentPage = Math.min(Math.max(1, requestedPage), totalPages);
  const start = (currentPage - 1) * pageSize;
  const pageWorks = filteredWorks.slice(start, start + pageSize);
  pageWorks.forEach((work) => {
    listContainer2.appendChild(createWorkCard(work, onWorkDelete, onUpdate));
  });
  renderPaginationBar(paginationEl2, {
    page: currentPage,
    totalPages,
    totalWorks,
    pageSize,
    onPageChange
  });
  return { totalWorks, totalPages, currentPage };
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
const siteFilterEl = document.getElementById("library-site-filter");
const paginationEl = document.getElementById("library-pagination");
let libraryPage = 1;
let librarySiteFilter = "all";
let allData = {};
window.allDataCache = allData;
let selectedItems = /* @__PURE__ */ new Set();
let bulkActionsBar = null;
function countWorks(data) {
  const worksByDomain = filterAndGroupData(data, "");
  let n = 0;
  Object.keys(worksByDomain).forEach((d) => {
    n += worksByDomain[d].length;
  });
  return n;
}
function initNav() {
  const items = document.querySelectorAll(".do-nav-item[data-panel]");
  const panels = document.querySelectorAll(".do-panel");
  function show(panelId) {
    items.forEach((btn) => {
      const on = btn.dataset.panel === panelId;
      btn.classList.toggle("active", on);
      btn.setAttribute("aria-selected", on ? "true" : "false");
    });
    panels.forEach((p) => {
      const on = p.id === `panel-${panelId}`;
      p.classList.toggle("active", on);
    });
  }
  items.forEach((btn) => {
    btn.addEventListener("click", () => show(btn.dataset.panel));
  });
  show("library");
}
function syncManifestVersion() {
  try {
    const v = chrome.runtime.getManifest?.()?.version;
    const el = document.getElementById("manager-version");
    if (el && v) el.textContent = `v${v}`;
  } catch {
  }
}
async function refreshCloudEndpoint() {
  const el = document.getElementById("cloud-endpoint-url");
  if (!el) return;
  try {
    const url = chrome.runtime.getURL("config.js");
    const res = await fetch(url);
    const t = await res.text();
    const m = t.match(/BACKEND_URL\s*=\s*["']([^"']+)["']/);
    el.textContent = m && m[1] ? m[1] : "(not configured)";
  } catch {
    el.textContent = "(unavailable)";
  }
}
document.addEventListener("DOMContentLoaded", () => {
  syncManifestVersion();
  initNav();
  loadDashboard();
  initTheme();
  initBulkActions();
  if (searchInput) {
    searchInput.addEventListener("input", () => {
      libraryPage = 1;
      renderLibrary();
    });
  }
  if (siteFilterEl) {
    siteFilterEl.addEventListener("change", () => {
      librarySiteFilter = siteFilterEl.value;
      libraryPage = 1;
      renderLibrary();
    });
  }
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
  if (!listContainer) return;
  bulkActionsBar = createBulkActionsBar(
    handleBulkDelete,
    handleBulkExport,
    handleClearSelection
  );
  bulkActionsBar.classList.add("do-bulk-actions");
  listContainer.parentNode.insertBefore(bulkActionsBar, listContainer);
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
    renderLibrary();
    updateLibraryNavCount(allData);
  });
}
function handleUpdate() {
  getAllData().then((items) => {
    allData = items;
    window.allDataCache = allData;
    renderLibrary();
    updateLibraryNavCount(allData);
  });
}
function renderLibrary() {
  if (!listContainer) return;
  const r = renderDashboard(allData, searchInput?.value || "", listContainer, handleWorkDelete, handleUpdate, {
    page: libraryPage,
    pageSize: LIBRARY_PAGE_SIZE,
    paginationEl,
    siteFilter: librarySiteFilter,
    onPageChange: (p) => {
      libraryPage = p;
      renderLibrary();
    }
  });
  if (r) libraryPage = r.currentPage;
}
function updateLibraryNavCount(data) {
  const el = document.getElementById("library-nav-count");
  if (el) el.textContent = String(countWorks(data || {}));
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
function setHexLabels() {
  const border = document.getElementById("opt-border-color");
  const fill = document.getElementById("opt-bg-color");
  const bh = document.getElementById("border-hex-label");
  const fh = document.getElementById("fill-hex-label");
  if (border && bh) bh.textContent = border.value;
  if (fill && fh) fh.textContent = fill.value;
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
    if (optOpacity) optOpacity.value = op;
    if (valOpacity) valOpacity.innerText = String(op);
    if (optBorder) optBorder.value = borderColor;
    if (optBg) optBg.value = bgColor;
    setHexLabels();
  });
  if (optOpacity) {
    optOpacity.addEventListener("input", (e) => {
      if (valOpacity) valOpacity.innerText = e.target.value;
      chrome.storage.local.set({ overlay_opacity: e.target.value });
    });
  }
  if (optBorder) {
    optBorder.addEventListener("input", (e) => {
      setHexLabels();
      chrome.storage.local.set({ overlay_border_color: e.target.value });
    });
  }
  if (optBg) {
    optBg.addEventListener("input", (e) => {
      setHexLabels();
      chrome.storage.local.set({ overlay_bg_color: e.target.value });
    });
  }
}
function initTheme() {
  const doApp = document.getElementById("doApp");
  chrome.storage.local.get("theme", (result) => {
    if (result.theme === "light") {
      document.body.setAttribute("data-theme", "light");
      doApp?.classList.add("do-light");
    } else {
      document.body.removeAttribute("data-theme");
      doApp?.classList.remove("do-light");
    }
  });
}
function toggleTheme() {
  const isLight = document.body.getAttribute("data-theme") === "light";
  const newTheme = isLight ? "dark" : "light";
  const doApp = document.getElementById("doApp");
  if (newTheme === "light") {
    document.body.setAttribute("data-theme", "light");
    doApp?.classList.add("do-light");
  } else {
    document.body.removeAttribute("data-theme");
    doApp?.classList.remove("do-light");
  }
  chrome.storage.local.set({ theme: newTheme });
}
function loadDashboard() {
  libraryPage = 1;
  getAllData().then((items) => {
    allData = items;
    window.allDataCache = allData;
    renderLibrary();
    updateLibraryNavCount(allData);
  });
  getStorageBytes().then((bytes) => {
    const el = document.getElementById("storage-usage");
    if (!el) return;
    el.textContent = `Storage: ${formatBytes(bytes)}`;
  });
  getOcrQuota().then((count) => {
    const el = document.getElementById("usage-count");
    const fill = document.getElementById("usage-progress-fill");
    const rem = document.getElementById("usage-remaining");
    const meta = document.getElementById("ocr-usage-meta");
    if (el) {
      el.textContent = String(count);
      el.style.color = count >= 1e3 ? "var(--do-danger, #e05a5a)" : "";
    }
    if (fill) fill.style.width = `${Math.min(100, count / 1e3 * 100)}%`;
    if (rem) rem.textContent = `${Math.max(0, 1e3 - count)} remaining`;
    if (meta) meta.textContent = `${(count / 1e3 * 100).toFixed(1)}% used · resets monthly`;
  });
  refreshCloudEndpoint();
}
function clearAllData() {
  if (confirm("WARNING: Delete EVERYTHING?")) {
    clearAllStorage().then(() => {
      allData = {};
      window.allDataCache = allData;
      loadDashboard();
      chrome.storage.local.remove(
        ["overlay_opacity", "overlay_border_color", "overlay_bg_color", "theme"],
        () => {
          window.location.reload();
        }
      );
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
