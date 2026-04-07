/* empty css                   */
const MAX_CHARS = 5e3;
const PARA_SEP = "\n\n";
const PREVIEW_LEN = 200;
const DEBOUNCE_MS = 350;
function normalize(text) {
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}
function findBreakIndex(window, maxLen) {
  const minStart = Math.floor(maxLen * 0.35);
  for (let i = maxLen - 1; i >= minStart; i--) {
    if (window[i] === "\n") return i + 1;
  }
  for (let i = maxLen - 1; i >= minStart; i--) {
    const ch = window[i];
    if (ch === "." || ch === "!" || ch === "?") {
      if (i + 1 < maxLen && window[i + 1] === " ") return i + 2;
      if (i + 1 >= maxLen) return i + 1;
    }
  }
  return maxLen;
}
function splitOversizedBlock(block) {
  if (block.length <= MAX_CHARS) return [block];
  const out = [];
  let rest = block;
  while (rest.length > MAX_CHARS) {
    const window = rest.slice(0, MAX_CHARS);
    let breakIdx = findBreakIndex(window, MAX_CHARS);
    if (breakIdx < 1) breakIdx = MAX_CHARS;
    let piece = rest.slice(0, breakIdx).trimEnd();
    if (piece.length === 0) {
      out.push(rest.slice(0, MAX_CHARS));
      rest = rest.slice(MAX_CHARS).trimStart();
      continue;
    }
    out.push(piece);
    rest = rest.slice(breakIdx).trimStart();
  }
  if (rest.length) out.push(rest);
  return out;
}
function splitTextToChunks(text) {
  const normalized = normalize(text);
  if (!normalized.trim()) return [];
  const rawParagraphs = normalized.split(/\n\n+/);
  const paragraphs = rawParagraphs.map((p) => p.trim()).filter((p) => p.length > 0);
  const units = [];
  for (const p of paragraphs) {
    units.push(...splitOversizedBlock(p));
  }
  const chunks = [];
  let current = [];
  let len = 0;
  for (const unit of units) {
    const sepLen = current.length ? PARA_SEP.length : 0;
    const addLen = sepLen + unit.length;
    if (len + addLen <= MAX_CHARS) {
      current.push(unit);
      len += addLen;
    } else {
      if (current.length) {
        chunks.push(current.join(PARA_SEP));
      }
      current = [unit];
      len = unit.length;
    }
  }
  if (current.length) {
    chunks.push(current.join(PARA_SEP));
  }
  return chunks.filter((c) => c.length > 0);
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
function escapeHtml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function preview(text) {
  if (text.length <= PREVIEW_LEN) return text;
  return `${text.slice(0, PREVIEW_LEN)}…`;
}
function renderParts(chunks) {
  const section = document.getElementById("parts-section");
  const list = document.getElementById("parts-list");
  const summary = document.getElementById("summary");
  list.innerHTML = "";
  if (chunks.length === 0) {
    section.classList.add("hidden");
    summary.textContent = "";
    return;
  }
  section.classList.remove("hidden");
  const total = chunks.reduce((a, c) => a + c.length, 0);
  summary.textContent = `${chunks.length} part${chunks.length === 1 ? "" : "s"} · ${total.toLocaleString()} characters total`;
  chunks.forEach((chunk, i) => {
    const li = document.createElement("li");
    li.className = "part-card";
    li.innerHTML = `
      <div class="part-card-header">
        <span class="part-label">Part ${i + 1}</span>
        <span class="part-count">${chunk.length.toLocaleString()} chars</span>
      </div>
      <div class="part-actions">
        <button type="button" class="copy-btn" data-index="${i}">Copy</button>
        <span class="copy-feedback" id="copy-feedback-${i}" hidden>Copied</span>
      </div>
      <pre class="part-preview">${escapeHtml(preview(chunk))}</pre>
    `;
    list.appendChild(li);
  });
  list.querySelectorAll(".copy-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const idx = Number(btn.getAttribute("data-index"));
      const text = chunks[idx];
      try {
        await navigator.clipboard.writeText(text);
        const fb = document.getElementById(`copy-feedback-${idx}`);
        if (fb) {
          fb.hidden = false;
          setTimeout(() => {
            fb.hidden = true;
          }, 1500);
        }
      } catch {
        const ta = document.createElement("textarea");
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
    });
  });
}
let debounceTimer;
function runSplit() {
  const raw = document.getElementById("input-text").value;
  const chunks = splitTextToChunks(raw);
  renderParts(chunks);
}
document.addEventListener("DOMContentLoaded", () => {
  initTheme();
  document.getElementById("theme-toggle").addEventListener("click", toggleTheme);
  document.getElementById("back-dashboard").addEventListener("click", () => {
    chrome.runtime.openOptionsPage();
  });
  document.getElementById("split-btn").addEventListener("click", runSplit);
  const input = document.getElementById("input-text");
  input.addEventListener("input", () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(runSplit, DEBOUNCE_MS);
  });
});
