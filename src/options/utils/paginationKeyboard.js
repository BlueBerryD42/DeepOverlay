/** @typedef {{ panelId: string; page: number; totalPages: number; onPageChange: (p: number) => void }} PaginationKeyboardBinding */

/** @type {PaginationKeyboardBinding | null} */
let binding = null;

/**
 * @param {EventTarget | null} target
 */
function isTypingTarget(target) {
  if (!target || !(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  return target.isContentEditable;
}

/**
 * @param {string} panelId
 */
function isPanelActive(panelId) {
  const panel = document.getElementById(`panel-${panelId}`);
  return panel?.classList.contains('active') ?? false;
}

/** @returns {boolean} */
export function isLikesLightboxOpen() {
  return document.body.classList.contains('do-likes-lightbox-open');
}

/** @param {PaginationKeyboardBinding | null} next */
export function syncPaginationKeyboard(next) {
  binding = next;
}

let initialized = false;

export function initPaginationKeyboard() {
  if (initialized) return;
  initialized = true;

  document.addEventListener('keydown', (e) => {
    if (!binding || !isPanelActive(binding.panelId)) return;
    if (isLikesLightboxOpen()) return;
    if (isTypingTarget(e.target)) return;
    if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;

    const { page, totalPages, onPageChange } = binding;
    if (e.key === 'ArrowLeft' && page > 1) {
      e.preventDefault();
      onPageChange(page - 1);
    } else if (e.key === 'ArrowRight' && page < totalPages) {
      e.preventDefault();
      onPageChange(page + 1);
    }
  });
}
