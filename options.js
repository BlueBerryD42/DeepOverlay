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
const SCHEMA_VERSION_KEY = "_schemaVersion";
function isDashboardMetaKey(storageKey) {
  if (!storageKey || typeof storageKey !== "string") return true;
  if (storageKey.startsWith("work:")) return false;
  if (storageKey === INDEX_KEY || storageKey === SCHEMA_VERSION_KEY) return true;
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
function removeStorageKeys(keys) {
  return new Promise((resolve) => {
    chrome.storage.local.remove(keys, () => {
      resolve();
    });
  });
}
function getWorkImgRecord(refKey) {
  return new Promise((resolve) => {
    if (!refKey) return resolve(null);
    chrome.storage.local.get([refKey], (r) => {
      resolve(r ? r[refKey] : null);
    });
  });
}
function saveWorkImgRecord(refKey, record) {
  return new Promise((resolve) => {
    if (!refKey) return resolve();
    chrome.storage.local.set({ [refKey]: record }, () => resolve());
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
function updateBoxNoteInStorage(storageKey, imageSelector, boxIndex, newText, allData2) {
  const workEntry = allData2[storageKey];
  const meta = workEntry?.images?.[imageSelector];
  const refKey = meta?.refKey;
  if (refKey) {
    return getWorkImgRecord(refKey).then((imgRec) => {
      if (!imgRec?.boxes?.[boxIndex]) return;
      imgRec.boxes[boxIndex].note = newText;
      return saveWorkImgRecord(refKey, imgRec).then(() => {
        const notes = (imgRec.boxes || []).map((b) => (b.note || "").trim()).filter(Boolean).join("\n");
        const notePreview = notes.length > 180 ? `${notes.slice(0, 180)}…` : notes;
        meta.boxCount = imgRec.boxes?.length || 0;
        meta.notePreview = notePreview;
        workEntry.metadata.lastUpdated = Date.now();
        return saveWorkEntryWithIndex(storageKey, workEntry).then(() => {
          allData2[storageKey] = workEntry;
        });
      });
    });
  }
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
            const meta = we?.images?.[sel];
            const refKey = meta?.refKey;
            if (refKey) {
              getWorkImgRecord(refKey).then((imgRec) => {
                if (!imgRec?.boxes) return;
                imgRec.boxes.splice(idx, 1);
                return saveWorkImgRecord(refKey, imgRec).then(() => {
                  const notes = (imgRec.boxes || []).map((b) => (b.note || "").trim()).filter(Boolean).join("\n");
                  const notePreview = notes.length > 180 ? `${notes.slice(0, 180)}…` : notes;
                  meta.boxCount = imgRec.boxes.length;
                  meta.notePreview = notePreview;
                  we.metadata.lastUpdated = Date.now();
                  return saveWorkEntryWithIndex(sk, we).then(() => {
                    window.allDataCache[sk] = we;
                    onBoxUpdate();
                  });
                });
              });
              return;
            }
            if (we && we.images && we.images[sel] && we.images[sel].boxes) {
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
function sortImageKeys(workEntry, imageKeys, site) {
  return [...imageKeys].sort((a, b) => {
    const da = workEntry.images?.[a];
    const db = workEntry.images?.[b];
    const ua = da?.pageUrl || a;
    const ub = db?.pageUrl || b;
    if (site === "e-hentai") {
      const na = parseInt(ua.match(/-(\d+)(?:[#?]|$)/)?.[1] || "0", 10);
      const nb = parseInt(ub.match(/-(\d+)(?:[#?]|$)/)?.[1] || "0", 10);
      if (na !== nb) return na - nb;
    }
    return ua.localeCompare(ub, void 0, { numeric: true, sensitivity: "base" });
  });
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
  const imageKeys = sortImageKeys(workEntry, Object.keys(workEntry.images || {}), site);
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
      const refKey = w.images?.[imageSelector]?.refKey;
      delete w.images[imageSelector];
      w.metadata.lastUpdated = Date.now();
      const removals = refKey ? [refKey] : [];
      saveWorkEntryWithIndex(storageKey, w).then(() => {
        if (!removals.length) return;
        return removeStorageKeys(removals);
      }).then(() => {
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
    updateGoPageButton(imageKey);
    if (imageData?.refKey) {
      const hint = document.createElement("div");
      hint.className = "wcm-detail-hint";
      hint.textContent = "Loading…";
      detailSlot.appendChild(hint);
      getWorkImgRecord(imageData.refKey).then((imgRec) => {
        detailSlot.innerHTML = "";
        const merged = { ...imageData, ...imgRec || { boxes: [] } };
        const card2 = createImageCard(
          work.storageKey,
          imageKey,
          merged,
          entry,
          onImageDelete,
          onUpdate,
          { compact: true }
        );
        detailSlot.appendChild(card2);
      });
    } else {
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
    }
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
function getWorkTimestamp(work) {
  if (work.legacy) return 0;
  const meta = work.workEntry?.metadata;
  return meta?.lastUpdated || meta?.firstSeen || 0;
}
function compareWorks(a, b, order = "desc") {
  const aVal = getWorkTimestamp(a);
  const bVal = getWorkTimestamp(b);
  if (aVal !== bVal) {
    return order === "asc" ? aVal - bVal : bVal - aVal;
  }
  return (a.storageKey || "").localeCompare(b.storageKey || "");
}
function orderWorksForDashboard(allData2, works) {
  const byKey = new Map(works.map((w) => [w.storageKey, w]));
  const ordered = [];
  const seen = /* @__PURE__ */ new Set();
  const index = Array.isArray(allData2._index) ? allData2._index : [];
  for (const row of index) {
    const key = row?.key;
    if (!key || seen.has(key)) continue;
    const work = byKey.get(key);
    if (!work) continue;
    ordered.push(work);
    seen.add(key);
  }
  const remaining = works.filter((w) => !seen.has(w.storageKey));
  remaining.sort((a, b) => compareWorks(a, b, "desc"));
  ordered.push(...remaining);
  return ordered;
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
        totalBoxes += imageData.boxCount ?? (imageData.boxes?.length || 0);
        if (imageData.pageUrl) allPageUrls.push(imageData.pageUrl);
        if (typeof imageData.notePreview === "string" && imageData.notePreview.trim()) {
          allNotes.push(imageData.notePreview);
        } else {
          imageData.boxes?.forEach((box) => {
            if (box.note) allNotes.push(box.note);
          });
        }
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
function renderPaginationBar$1(el, { page, totalPages, totalWorks, pageSize, onPageChange }) {
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
  const sortedWorks = orderWorksForDashboard(allData2, allWorks);
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
  renderPaginationBar$1(paginationEl2, {
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
function parseLikeArchive(text) {
  let jsonText = text.trim();
  const eq = jsonText.indexOf("=");
  if (eq !== -1) jsonText = jsonText.slice(eq + 1).trim();
  if (jsonText.endsWith(";")) jsonText = jsonText.slice(0, -1).trim();
  const raw = JSON.parse(jsonText);
  return raw.map((entry) => {
    const like = entry.like || entry;
    const tweetId = String(like.tweetId || "");
    const fullText = like.fullText || "";
    const tcoLinks = [...fullText.matchAll(/https:\/\/t\.co\/\S+/g)].map((m) => m[0]);
    const text2 = fullText.replace(/https:\/\/t\.co\/\S+/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').trim();
    const postUrl = like.expandedUrl || `https://x.com/i/status/${tweetId}`;
    return { tweetId, text: text2, fullText, tcoLinks, postUrl };
  }).filter((e) => e.tweetId);
}
const THUMB_CACHE_KEY = "likes:thumbCache";
const DB_NAME = "deepoverlay";
const DB_VERSION = 1;
const STORES = {
  LIKES_META: "likes_meta",
  LIKES: "likes",
  LIKE_THUMBS: "like_thumbs"
};
function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB open failed"));
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORES.LIKES_META)) {
        db.createObjectStore(STORES.LIKES_META, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(STORES.LIKES)) {
        const likes = db.createObjectStore(STORES.LIKES, { keyPath: "tweetId" });
        likes.createIndex("sortOrder", "sortOrder", { unique: false });
        likes.createIndex("hidden", "hidden", { unique: false });
      }
      if (!db.objectStoreNames.contains(STORES.LIKE_THUMBS)) {
        db.createObjectStore(STORES.LIKE_THUMBS, { keyPath: "tweetId" });
      }
    };
  });
}
function store(db, storeName, mode = "readonly") {
  return db.transaction(storeName, mode).objectStore(storeName);
}
function getOne(os, key) {
  return new Promise((resolve, reject) => {
    const req = os.get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
function getAll(os) {
  return new Promise((resolve, reject) => {
    const req = os.getAll();
    req.onsuccess = () => resolve(req.result ?? []);
    req.onerror = () => reject(req.error);
  });
}
function putOne(os, value) {
  return new Promise((resolve, reject) => {
    const req = os.put(value);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}
function deleteOne(os, key) {
  return new Promise((resolve, reject) => {
    const req = os.delete(key);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}
function clearStore(os) {
  return new Promise((resolve, reject) => {
    const req = os.clear();
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}
const META_ID = "main";
let dbPromise = null;
let thumbMigrationDone = false;
function getDb() {
  if (!dbPromise) {
    dbPromise = openDb().then(async (db) => {
      await migrateThumbCacheFromChromeStorage(db);
      return db;
    });
  }
  return dbPromise;
}
async function migrateThumbCacheFromChromeStorage(db) {
  if (thumbMigrationDone) return;
  thumbMigrationDone = true;
  const legacy = await new Promise((resolve) => {
    chrome.storage?.local?.get([THUMB_CACHE_KEY], (r) => resolve(r?.[THUMB_CACHE_KEY] || null));
  });
  if (!legacy || typeof legacy !== "object" || !Object.keys(legacy).length) return;
  const thumbOs = store(db, STORES.LIKE_THUMBS, "readwrite");
  const existing = await getAll(thumbOs);
  if (existing.length > 0) {
    await chrome.storage?.local?.remove([THUMB_CACHE_KEY]);
    return;
  }
  await Promise.all(
    Object.entries(legacy).map(
      ([tweetId, entry]) => putOne(thumbOs, { tweetId, ...entry })
    )
  );
  await chrome.storage?.local?.remove([THUMB_CACHE_KEY]);
}
async function getLikesMeta() {
  const db = await getDb();
  const meta = await getOne(store(db, STORES.LIKES_META), META_ID);
  return meta || null;
}
async function hasImportedLikes() {
  const meta = await getLikesMeta();
  if (meta?.count > 0) return true;
  const db = await getDb();
  const all = await getAll(store(db, STORES.LIKES));
  return all.length > 0;
}
async function importLikes(entries, opts = {}) {
  const db = await getDb();
  const now = Date.now();
  const sourceName = opts.sourceName || "like.js";
  const replace = opts.replace !== false;
  if (replace) {
    await clearStore(store(db, STORES.LIKES, "readwrite"));
  }
  let startOrder = 0;
  if (!replace) {
    const existing = await getAll(store(db, STORES.LIKES));
    startOrder = existing.reduce((max, row) => Math.max(max, row.sortOrder ?? 0), -1) + 1;
  }
  const likesOs = store(db, STORES.LIKES, "readwrite");
  const seen = /* @__PURE__ */ new Set();
  let imported = 0;
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    if (!e?.tweetId || seen.has(e.tweetId)) continue;
    seen.add(e.tweetId);
    let hidden = false;
    if (!replace) {
      const prev = await getOne(likesOs, e.tweetId);
      if (prev) hidden = !!prev.hidden;
    }
    await putOne(likesOs, {
      tweetId: e.tweetId,
      text: e.text || "",
      fullText: e.fullText || "",
      tcoLinks: e.tcoLinks || [],
      postUrl: e.postUrl || `https://x.com/i/web/status/${e.tweetId}`,
      sortOrder: replace ? i : startOrder + imported,
      hidden,
      importedAt: now
    });
    imported++;
  }
  const metaOs = store(db, STORES.LIKES_META, "readwrite");
  const total = replace ? imported : (await getAll(likesOs)).length;
  await putOne(metaOs, {
    id: META_ID,
    importedAt: now,
    count: total,
    sourceName
  });
  return { imported, total };
}
async function getAllLikes(opts = {}) {
  const db = await getDb();
  const rows = await getAll(store(db, STORES.LIKES));
  const visible = opts.includeHidden ? rows : rows.filter((r) => !r.hidden);
  visible.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  return visible;
}
async function updateLike(tweetId, patch) {
  const db = await getDb();
  const os = store(db, STORES.LIKES, "readwrite");
  const existing = await getOne(os, tweetId);
  if (!existing) return null;
  const next = { ...existing, ...patch, tweetId };
  await putOne(os, next);
  return next;
}
async function hideLike(tweetId) {
  return updateLike(tweetId, { hidden: true });
}
async function deleteLike(tweetId) {
  const db = await getDb();
  await deleteOne(store(db, STORES.LIKES, "readwrite"), tweetId);
  await deleteOne(store(db, STORES.LIKE_THUMBS, "readwrite"), tweetId);
  const remaining = await getAll(store(db, STORES.LIKES));
  const metaOs = store(db, STORES.LIKES_META, "readwrite");
  const meta = await getOne(store(db, STORES.LIKES_META), META_ID) || { id: META_ID };
  await putOne(metaOs, { ...meta, count: remaining.length });
}
async function getAllThumbsMap() {
  const db = await getDb();
  const rows = await getAll(store(db, STORES.LIKE_THUMBS));
  const map = {};
  for (const row of rows) {
    if (row?.tweetId) map[row.tweetId] = row;
  }
  return map;
}
function requestThumbResolve(tweetIds) {
  if (!tweetIds?.length) return Promise.resolve({});
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ action: "RESOLVE_TWEET_MEDIA", tweetIds }, (response) => {
      if (chrome.runtime.lastError) {
        console.warn("Thumb resolve failed:", chrome.runtime.lastError.message);
        resolve({});
        return;
      }
      resolve(response?.cache || {});
    });
  });
}
function createLikeCard(like, thumb, opts = {}) {
  const card = document.createElement("article");
  card.className = "do-like-card";
  card.dataset.tweetId = like.tweetId;
  const mediaUrl = thumb?.mediaUrl;
  const mediaUrls = thumb?.mediaUrls?.length ? thumb.mediaUrls : mediaUrl ? [mediaUrl] : [];
  const mediaType = thumb?.mediaType;
  const hasMedia = mediaType && mediaType !== "none" && mediaUrl;
  const thumbEl = document.createElement("div");
  thumbEl.className = "do-like-thumb";
  if (hasMedia) {
    const img = document.createElement("img");
    img.className = "do-like-img";
    img.src = mediaUrl;
    img.alt = like.text || "Liked post media";
    img.loading = "lazy";
    img.onerror = () => {
      thumbEl.classList.add("do-like-thumb--placeholder");
      img.remove();
    };
    img.addEventListener("click", (e) => {
      e.preventDefault();
      if (opts.onOpenLightbox && mediaUrls.length) {
        opts.onOpenLightbox(mediaUrls, 0);
      } else {
        window.open(like.postUrl, "_blank", "noopener");
      }
    });
    thumbEl.appendChild(img);
  } else {
    thumbEl.classList.add("do-like-thumb--placeholder");
    thumbEl.innerHTML = `<span class="do-like-placeholder-icon" aria-hidden="true">♡</span>`;
    thumbEl.addEventListener("click", () => {
      window.open(like.postUrl, "_blank", "noopener");
    });
  }
  if (hasMedia && (mediaType === "video" || mediaType === "gif")) {
    const badge = document.createElement("span");
    badge.className = "do-like-badge do-like-badge--media";
    badge.textContent = mediaType === "gif" ? "GIF" : "▶";
    badge.setAttribute("aria-label", mediaType === "gif" ? "Animated GIF" : "Video");
    thumbEl.appendChild(badge);
  }
  if (hasMedia && mediaUrls.length > 1) {
    const count = document.createElement("span");
    count.className = "do-like-badge do-like-badge--count";
    count.textContent = `+${mediaUrls.length - 1}`;
    count.setAttribute("aria-label", `${mediaUrls.length} images`);
    thumbEl.appendChild(count);
  }
  const caption = document.createElement("p");
  caption.className = "do-like-caption";
  caption.textContent = like.text || "(no text)";
  caption.title = like.text;
  const link = document.createElement("a");
  link.className = "do-like-link";
  link.href = like.postUrl;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.textContent = "Open on X";
  link.addEventListener("click", (e) => e.stopPropagation());
  const actions = document.createElement("div");
  actions.className = "do-like-actions";
  if (opts.onHide) {
    const hideBtn = document.createElement("button");
    hideBtn.type = "button";
    hideBtn.className = "do-btn do-like-action-btn";
    hideBtn.textContent = "Hide";
    hideBtn.title = "Hide from gallery (keeps in database)";
    hideBtn.onclick = (e) => {
      e.stopPropagation();
      opts.onHide(like.tweetId);
    };
    actions.appendChild(hideBtn);
  }
  if (opts.onDelete) {
    const delBtn = document.createElement("button");
    delBtn.type = "button";
    delBtn.className = "do-btn do-like-action-btn do-like-action-btn--danger";
    delBtn.textContent = "Delete";
    delBtn.title = "Remove from library permanently";
    delBtn.onclick = (e) => {
      e.stopPropagation();
      if (confirm("Remove this like from your library?")) opts.onDelete(like.tweetId);
    };
    actions.appendChild(delBtn);
  }
  card.appendChild(thumbEl);
  card.appendChild(caption);
  card.appendChild(link);
  if (actions.childElementCount) card.appendChild(actions);
  return card;
}
function updateLikeCardThumb(card, like, thumb, opts = {}) {
  const next = createLikeCard(like, thumb, opts);
  card.replaceWith(next);
  return next;
}
const LIKES_PAGE_SIZE = 48;
function filterLikes(likes, query, mediaOnly, thumbCache2) {
  const q = query.trim().toLowerCase();
  return likes.filter((like) => {
    if (mediaOnly) {
      const thumb = thumbCache2[like.tweetId];
      if (!thumb?.resolvedAt) return true;
      if (thumb.mediaType === "none" || !thumb.mediaUrl) return false;
    }
    if (!q) return true;
    return like.text.toLowerCase().includes(q) || like.tweetId.includes(q) || like.postUrl.toLowerCase().includes(q);
  });
}
function renderPaginationBar(el, { page, totalPages, totalItems, pageSize, onPageChange }) {
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
  el.setAttribute("aria-label", "Likes pages");
  const prev = document.createElement("button");
  prev.type = "button";
  prev.className = "do-btn";
  prev.textContent = "← Prev";
  prev.disabled = page <= 1;
  prev.onclick = () => onPageChange(page - 1);
  const info = document.createElement("span");
  info.className = "do-pagination-info";
  const start = (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, totalItems);
  info.textContent = `Page ${page} / ${totalPages} · ${start}–${end} of ${totalItems}`;
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
function ensureLightbox(container) {
  let lb = container.querySelector(".do-likes-lightbox");
  if (lb) return lb;
  lb = document.createElement("div");
  lb.className = "do-likes-lightbox";
  lb.hidden = true;
  lb.innerHTML = `
    <button type="button" class="do-likes-lightbox-close" aria-label="Close">✕</button>
    <button type="button" class="do-likes-lightbox-prev" aria-label="Previous">‹</button>
    <img class="do-likes-lightbox-img" alt="" />
    <button type="button" class="do-likes-lightbox-next" aria-label="Next">›</button>
    <span class="do-likes-lightbox-counter"></span>
  `;
  container.appendChild(lb);
  const img = lb.querySelector(".do-likes-lightbox-img");
  const counter = lb.querySelector(".do-likes-lightbox-counter");
  const state = { urls: [], index: 0 };
  function show() {
    if (!state.urls.length) return;
    img.src = state.urls[state.index];
    counter.textContent = `${state.index + 1} / ${state.urls.length}`;
    lb.hidden = false;
    document.body.classList.add("do-likes-lightbox-open");
  }
  function hide() {
    lb.hidden = true;
    img.src = "";
    document.body.classList.remove("do-likes-lightbox-open");
  }
  lb.querySelector(".do-likes-lightbox-close").onclick = hide;
  lb.querySelector(".do-likes-lightbox-prev").onclick = () => {
    if (state.urls.length < 2) return;
    state.index = (state.index - 1 + state.urls.length) % state.urls.length;
    show();
  };
  lb.querySelector(".do-likes-lightbox-next").onclick = () => {
    if (state.urls.length < 2) return;
    state.index = (state.index + 1) % state.urls.length;
    show();
  };
  lb.addEventListener("click", (e) => {
    if (e.target === lb) hide();
  });
  document.addEventListener("keydown", (e) => {
    if (lb.hidden) return;
    if (e.key === "Escape") hide();
    else if (e.key === "ArrowLeft") lb.querySelector(".do-likes-lightbox-prev").click();
    else if (e.key === "ArrowRight") lb.querySelector(".do-likes-lightbox-next").click();
  });
  lb._open = (urls, index = 0) => {
    state.urls = urls;
    state.index = index;
    show();
  };
  return lb;
}
function renderLikes(opts) {
  const {
    likes,
    query = "",
    mediaOnly = false,
    thumbCache: thumbCache2 = {},
    page = 1,
    gridEl,
    paginationEl: paginationEl2,
    lightboxEl,
    onPageChange,
    onHide,
    onDelete
  } = opts;
  const filtered = filterLikes(likes, query, mediaOnly, thumbCache2);
  const totalItems = filtered.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / LIKES_PAGE_SIZE));
  const currentPage = Math.min(Math.max(1, page), totalPages);
  const start = (currentPage - 1) * LIKES_PAGE_SIZE;
  const pageItems = filtered.slice(start, start + LIKES_PAGE_SIZE);
  if (!gridEl) {
    return { filtered, totalPages, currentPage, pageItems };
  }
  gridEl.innerHTML = "";
  gridEl.className = "do-likes-grid";
  if (totalItems === 0) {
    gridEl.innerHTML = `<div class="empty-state">${query || mediaOnly ? "No likes match your filters." : "No likes loaded."}</div>`;
  } else {
    const lightbox = ensureLightbox(lightboxEl || gridEl.parentElement);
    const openLightbox = (urls, index) => lightbox._open(urls, index);
    for (const like of pageItems) {
      const thumb = thumbCache2[like.tweetId];
      gridEl.appendChild(createLikeCard(like, thumb, { onOpenLightbox: openLightbox, onHide, onDelete }));
    }
  }
  renderPaginationBar(paginationEl2, {
    page: currentPage,
    totalPages,
    totalItems,
    pageSize: LIKES_PAGE_SIZE,
    onPageChange
  });
  return { filtered, totalPages, currentPage, pageItems };
}
function refreshLikeCardThumbs(gridEl, pageItems, thumbCache2, lightboxEl, cardOpts = {}) {
  if (!gridEl) return;
  const lightbox = ensureLightbox(lightboxEl || gridEl.parentElement);
  const openLightbox = (urls, index) => lightbox._open(urls, index);
  const opts = { onOpenLightbox: openLightbox, ...cardOpts };
  for (const like of pageItems) {
    const card = gridEl.querySelector(`[data-tweet-id="${like.tweetId}"]`);
    if (!card) continue;
    const thumb = thumbCache2[like.tweetId];
    if (!thumb?.resolvedAt) continue;
    updateLikeCardThumb(card, like, thumb, opts);
  }
}
const RESOLVE_BATCH = 24;
let likesCache = null;
let thumbCache = {};
let likesPage = 1;
let resolveInFlight = false;
let panelLoaded = false;
function initLikesPanel() {
  const gridEl = document.getElementById("likes-grid");
  const paginationEl2 = document.getElementById("likes-pagination");
  const lightboxEl = document.getElementById("likes-lightbox");
  const searchInput2 = document.getElementById("likes-search-input");
  const mediaOnlyEl = document.getElementById("likes-media-only");
  const progressEl = document.getElementById("likes-progress");
  const countEl = document.getElementById("likes-nav-count");
  const statusEl = document.getElementById("likes-status");
  document.getElementById("likes-import-bar");
  const importBtn = document.getElementById("likes-import-btn");
  const bundledBtn = document.getElementById("likes-import-bundled-btn");
  const reimportBtn = document.getElementById("likes-reimport-btn");
  const fileInput = document.getElementById("likes-file-input");
  const mergeWrap = document.getElementById("likes-merge-wrap");
  const mergeEl = document.getElementById("likes-reimport-merge");
  if (!gridEl) return () => {
  };
  let mediaOnly = mediaOnlyEl?.checked ?? false;
  const cardOpts = () => ({
    onHide: handleHide,
    onDelete: handleDelete
  });
  function updateNavCount(n) {
    if (countEl) countEl.textContent = String(n);
  }
  function updateImportUi(imported) {
    if (importBtn) importBtn.hidden = imported;
    if (bundledBtn) bundledBtn.hidden = imported;
    if (reimportBtn) reimportBtn.hidden = !imported;
    if (mergeWrap) mergeWrap.hidden = !imported;
  }
  function countResolved(cache) {
    return Object.values(cache).filter((e) => e?.resolvedAt).length;
  }
  function countWithMedia(cache) {
    return Object.values(cache).filter((e) => e?.mediaUrl && e.mediaType !== "none").length;
  }
  function updateProgress() {
    if (!progressEl || !likesCache) return;
    const resolved = countResolved(thumbCache);
    const withMedia = countWithMedia(thumbCache);
    progressEl.textContent = `Thumbnails: ${resolved} / ${likesCache.length} resolved · ${withMedia} with media`;
  }
  async function reloadFromDb() {
    likesCache = await getAllLikes();
    thumbCache = await getAllThumbsMap();
    updateNavCount(likesCache.length);
    const meta = await getLikesMeta();
    if (statusEl) {
      const when = meta?.importedAt ? new Date(meta.importedAt).toLocaleDateString() : "—";
      statusEl.textContent = `${likesCache.length} likes in library · imported ${when}`;
    }
    updateImportUi(likesCache.length > 0);
  }
  function renderCurrent() {
    if (!likesCache) return;
    const opts = cardOpts();
    const r = renderLikes({
      likes: likesCache,
      query: searchInput2?.value || "",
      mediaOnly,
      thumbCache,
      page: likesPage,
      gridEl,
      paginationEl: paginationEl2,
      lightboxEl,
      onPageChange: (p) => {
        likesPage = p;
        renderCurrent();
        queueResolveForPage();
      },
      onHide: opts.onHide,
      onDelete: opts.onDelete
    });
    likesPage = r.currentPage;
    updateProgress();
    return r;
  }
  async function resolveNextBatch() {
    if (!likesCache || resolveInFlight) return;
    const allPending = likesCache.map((l) => l.tweetId).filter((id) => !thumbCache[id]?.resolvedAt);
    if (allPending.length === 0) return;
    resolveInFlight = true;
    const batch = allPending.slice(0, RESOLVE_BATCH);
    try {
      const updated = await requestThumbResolve(batch);
      if (updated && Object.keys(updated).length) {
        thumbCache = { ...thumbCache, ...updated };
      }
    } finally {
      resolveInFlight = false;
      updateProgress();
      if (likesCache) {
        const { pageItems } = renderLikes({
          likes: likesCache,
          query: searchInput2?.value || "",
          mediaOnly,
          thumbCache,
          page: likesPage,
          gridEl,
          paginationEl: paginationEl2,
          lightboxEl,
          onPageChange: (p) => {
            likesPage = p;
            renderCurrent();
            queueResolveForPage();
          },
          ...cardOpts()
        });
        refreshLikeCardThumbs(gridEl, pageItems, thumbCache, lightboxEl, cardOpts());
      }
      if (allPending.length > batch.length) {
        setTimeout(resolveNextBatch, 100);
      }
    }
  }
  function queueResolveForPage() {
    if (!likesCache) return;
    const { pageItems } = renderLikes({
      likes: likesCache,
      query: searchInput2?.value || "",
      mediaOnly,
      thumbCache,
      page: likesPage,
      gridEl: null,
      paginationEl: null,
      lightboxEl: null,
      onPageChange: () => {
      }
    });
    const pending = pageItems.map((l) => l.tweetId).filter((id) => !thumbCache[id]?.resolvedAt);
    if (pending.length) {
      requestThumbResolve(pending).then((patch) => {
        if (patch && Object.keys(patch).length) {
          thumbCache = { ...thumbCache, ...patch };
          renderCurrent();
        }
      });
    }
    resolveNextBatch();
  }
  async function handleHide(tweetId) {
    await hideLike(tweetId);
    await reloadFromDb();
    renderCurrent();
  }
  async function handleDelete(tweetId) {
    await deleteLike(tweetId);
    delete thumbCache[tweetId];
    await reloadFromDb();
    renderCurrent();
  }
  async function handleImportFile(file) {
    if (!file) return;
    const text = await file.text();
    const entries = parseLikeArchive(text);
    const merge = mergeEl?.checked ?? false;
    if (!merge && likesCache?.length) {
      if (!confirm("Replace all likes in library with this file? Hidden items will be lost unless you choose Merge.")) {
        return;
      }
    }
    if (statusEl) statusEl.textContent = "Importing…";
    const { total } = await importLikes(entries, { sourceName: file.name, replace: !merge });
    await reloadFromDb();
    likesPage = 1;
    panelLoaded = true;
    renderCurrent();
    queueResolveForPage();
    if (statusEl) statusEl.textContent = `Imported ${total} likes from ${file.name}`;
  }
  function showEmptyImportState() {
    updateImportUi(false);
    if (statusEl) statusEl.textContent = "Import your X archive like.js once — then manage likes here without the file.";
    gridEl.innerHTML = `<div class="empty-state">No likes in library yet. Click <strong>Import like.js</strong> above.</div>`;
    if (paginationEl2) {
      paginationEl2.innerHTML = "";
      paginationEl2.hidden = true;
    }
    updateNavCount(0);
  }
  async function loadLikes() {
    try {
      const imported = await hasImportedLikes();
      if (!imported) {
        panelLoaded = true;
        showEmptyImportState();
        return;
      }
      await reloadFromDb();
      likesPage = 1;
      renderCurrent();
      queueResolveForPage();
      panelLoaded = true;
    } catch (err) {
      if (statusEl) statusEl.textContent = "Failed to load likes library.";
      gridEl.innerHTML = `<div class="empty-state">${err?.message || "IndexedDB error."}</div>`;
      console.error("Likes load failed:", err);
    }
  }
  importBtn?.addEventListener("click", () => fileInput?.click());
  reimportBtn?.addEventListener("click", () => fileInput?.click());
  bundledBtn?.addEventListener("click", async () => {
    try {
      const url = chrome.runtime.getURL("data/like.js");
      const res = await fetch(url);
      if (!res.ok) throw new Error("data/like.js not found in extension — use file import.");
      const text = await res.text();
      const entries = parseLikeArchive(text);
      const merge = mergeEl?.checked ?? false;
      if (!merge && likesCache?.length) {
        if (!confirm("Replace all likes in library with bundled data/like.js?")) return;
      }
      if (statusEl) statusEl.textContent = "Importing bundled like.js…";
      const { total } = await importLikes(entries, { sourceName: "data/like.js", replace: !merge });
      await reloadFromDb();
      likesPage = 1;
      panelLoaded = true;
      renderCurrent();
      queueResolveForPage();
      if (statusEl) statusEl.textContent = `Imported ${total} likes from extension data/like.js`;
    } catch (err) {
      if (statusEl) statusEl.textContent = err?.message || "Bundled import failed.";
    }
  });
  fileInput?.addEventListener("change", () => {
    const file = fileInput.files?.[0];
    handleImportFile(file).finally(() => {
      fileInput.value = "";
    });
  });
  if (searchInput2) {
    searchInput2.addEventListener("input", () => {
      likesPage = 1;
      renderCurrent();
    });
  }
  if (mediaOnlyEl) {
    mediaOnlyEl.addEventListener("change", () => {
      mediaOnly = mediaOnlyEl.checked;
      likesPage = 1;
      renderCurrent();
    });
  }
  return () => {
    if (!panelLoaded) loadLikes();
    else renderCurrent();
  };
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
function initNav(onPanelShow) {
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
    onPanelShow?.(panelId);
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
document.addEventListener("DOMContentLoaded", () => {
  syncManifestVersion();
  const showLikesPanel = initLikesPanel();
  initNav((panelId) => {
    if (panelId === "likes") showLikesPanel?.();
  });
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
