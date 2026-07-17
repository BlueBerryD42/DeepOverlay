/**
 * @param {HTMLElement} el
 * @param {{
 *   page: number;
 *   totalPages: number;
 *   totalItems: number;
 *   pageSize: number;
 *   onPageChange: (p: number) => void;
 *   ariaLabel?: string;
 * }} opts
 */
function renderPaginationBarInto(el, opts) {
  const {
    page,
    totalPages,
    totalItems,
    pageSize,
    onPageChange,
    ariaLabel = 'Pages',
  } = opts;

  if (!onPageChange) return;
  if (totalPages <= 1) {
    el.innerHTML = '';
    el.hidden = true;
    return;
  }

  el.hidden = false;
  el.innerHTML = '';
  if (!el.classList.contains('do-pagination')) {
    el.classList.add('do-pagination');
  }
  el.setAttribute('role', 'navigation');
  el.setAttribute('aria-label', ariaLabel);

  const prev = document.createElement('button');
  prev.type = 'button';
  prev.className = 'do-btn';
  prev.textContent = '← Prev';
  prev.disabled = page <= 1;
  prev.onclick = () => onPageChange(page - 1);

  const info = document.createElement('span');
  info.className = 'do-pagination-info';

  const start = (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, totalItems);

  info.append('Page ');

  const pageInput = document.createElement('input');
  pageInput.type = 'number';
  pageInput.className = 'do-pagination-page-input';
  pageInput.min = '1';
  pageInput.max = String(totalPages);
  pageInput.value = String(page);
  pageInput.setAttribute('aria-label', 'Jump to page');

  const jump = () => {
    let next = parseInt(pageInput.value, 10);
    if (!Number.isFinite(next)) {
      pageInput.value = String(page);
      return;
    }
    next = Math.min(Math.max(1, next), totalPages);
    pageInput.value = String(next);
    if (next !== page) onPageChange(next);
  };

  pageInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      jump();
      pageInput.blur();
    }
  });
  pageInput.addEventListener('change', jump);

  info.append(pageInput, ` / ${totalPages} · ${start}–${end} of ${totalItems}`);

  const next = document.createElement('button');
  next.type = 'button';
  next.className = 'do-btn';
  next.textContent = 'Next →';
  next.disabled = page >= totalPages;
  next.onclick = () => onPageChange(page + 1);

  el.appendChild(prev);
  el.appendChild(info);
  el.appendChild(next);
}

/**
 * Shared pagination bar with page number jump input.
 * @param {HTMLElement | HTMLElement[] | null} el
 * @param {{
 *   page: number;
 *   totalPages: number;
 *   totalItems: number;
 *   pageSize: number;
 *   onPageChange: (p: number) => void;
 *   ariaLabel?: string;
 * }} opts
 */
export function renderPaginationBar(el, opts) {
  if (!el) return;
  const targets = Array.isArray(el) ? el : [el];
  for (const target of targets) {
    if (target) renderPaginationBarInto(target, opts);
  }
}
