// Like gallery tile — thumbnail, badges, caption

/**
 * @param {{ tweetId: string; text: string; postUrl: string }} like
 * @param {{ mediaUrl?: string; mediaUrls?: string[]; mediaType?: string }} [thumb]
 * @param {{ onOpenLightbox?: (urls: string[], index: number) => void; onHide?: (tweetId: string) => void; onDelete?: (tweetId: string) => void }} [opts]
 */
export function createLikeCard(like, thumb, opts = {}) {
  const card = document.createElement('article');
  card.className = 'do-like-card';
  card.dataset.tweetId = like.tweetId;

  const mediaUrl = thumb?.mediaUrl;
  const mediaUrls = thumb?.mediaUrls?.length ? thumb.mediaUrls : mediaUrl ? [mediaUrl] : [];
  const mediaType = thumb?.mediaType;
  const hasMedia = mediaType && mediaType !== 'none' && mediaUrl;

  const thumbEl = document.createElement('div');
  thumbEl.className = 'do-like-thumb';

  if (hasMedia) {
    const img = document.createElement('img');
    img.className = 'do-like-img';
    img.src = mediaUrl;
    img.alt = like.text || 'Liked post media';
    img.loading = 'lazy';
    img.onerror = () => {
      thumbEl.classList.add('do-like-thumb--placeholder');
      img.remove();
    };
    img.addEventListener('click', (e) => {
      e.preventDefault();
      if (opts.onOpenLightbox && mediaUrls.length) {
        opts.onOpenLightbox(mediaUrls, 0);
      } else {
        window.open(like.postUrl, '_blank', 'noopener');
      }
    });
    thumbEl.appendChild(img);
  } else {
    thumbEl.classList.add('do-like-thumb--placeholder');
    thumbEl.innerHTML = `<span class="do-like-placeholder-icon" aria-hidden="true">♡</span>`;
    thumbEl.addEventListener('click', () => {
      window.open(like.postUrl, '_blank', 'noopener');
    });
  }

  if (hasMedia && (mediaType === 'video' || mediaType === 'gif')) {
    const badge = document.createElement('span');
    badge.className = 'do-like-badge do-like-badge--media';
    badge.textContent = mediaType === 'gif' ? 'GIF' : '▶';
    badge.setAttribute('aria-label', mediaType === 'gif' ? 'Animated GIF' : 'Video');
    thumbEl.appendChild(badge);
  }

  if (hasMedia && mediaUrls.length > 1) {
    const count = document.createElement('span');
    count.className = 'do-like-badge do-like-badge--count';
    count.textContent = `+${mediaUrls.length - 1}`;
    count.setAttribute('aria-label', `${mediaUrls.length} images`);
    thumbEl.appendChild(count);
  }

  const caption = document.createElement('p');
  caption.className = 'do-like-caption';
  caption.textContent = like.text || '(no text)';
  caption.title = like.text;

  const link = document.createElement('a');
  link.className = 'do-like-link';
  link.href = like.postUrl;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.textContent = 'Open on X';
  link.addEventListener('click', (e) => e.stopPropagation());

  const actions = document.createElement('div');
  actions.className = 'do-like-actions';

  if (opts.onHide) {
    const hideBtn = document.createElement('button');
    hideBtn.type = 'button';
    hideBtn.className = 'do-btn do-like-action-btn';
    hideBtn.textContent = 'Hide';
    hideBtn.title = 'Hide from gallery (keeps in database)';
    hideBtn.onclick = (e) => {
      e.stopPropagation();
      opts.onHide(like.tweetId);
    };
    actions.appendChild(hideBtn);
  }

  if (opts.onDelete) {
    const delBtn = document.createElement('button');
    delBtn.type = 'button';
    delBtn.className = 'do-btn do-like-action-btn do-like-action-btn--danger';
    delBtn.textContent = 'Delete';
    delBtn.title = 'Remove from library permanently';
    delBtn.onclick = (e) => {
      e.stopPropagation();
      if (confirm('Remove this like from your library?')) opts.onDelete(like.tweetId);
    };
    actions.appendChild(delBtn);
  }

  card.appendChild(thumbEl);
  card.appendChild(caption);
  card.appendChild(link);
  if (actions.childElementCount) card.appendChild(actions);

  return card;
}

/**
 * @param {HTMLElement} card
 * @param {{ mediaUrl?: string; mediaUrls?: string[]; mediaType?: string }} thumb
 * @param {{ onOpenLightbox?: (urls: string[], index: number) => void }} [opts]
 */
export function updateLikeCardThumb(card, like, thumb, opts = {}) {
  const next = createLikeCard(like, thumb, opts);
  card.replaceWith(next);
  return next;
}
