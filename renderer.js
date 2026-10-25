// renderer.js - ClipVault Renderer Process (Stage 6)
// Handles dynamic history rendering, safe textContent escaping, empty state, and live clipboard:new updates

let clips = [];

// DOM Element References
let clipList = null;
let emptyState = null;
let contentSubtitle = null;
let countAllClips = null;
let countPinned = null;

/**
 * Format timestamp into readable relative time
 * @param {number} timestamp
 * @returns {string}
 */
function formatTimestamp(timestamp) {
  if (!timestamp) return 'Just now';
  const diff = Math.max(0, Date.now() - timestamp);
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (seconds < 45) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;

  const date = new Date(timestamp);
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

/**
 * Update UI counts for header and navigation badges
 */
function updateCounts() {
  const total = clips.length;
  const pinned = clips.filter((c) => c.pinned).length;

  if (contentSubtitle) {
    contentSubtitle.textContent = `${total} clip${total === 1 ? '' : 's'} stored`;
  }
  if (countAllClips) {
    countAllClips.textContent = total;
    countAllClips.setAttribute('aria-label', `${total} items`);
  }
  if (countPinned) {
    countPinned.textContent = pinned;
    countPinned.setAttribute('aria-label', `${pinned} pinned items`);
  }
}

/**
 * Toggle between the history list and the empty state
 */
function toggleEmptyState() {
  const isEmpty = clips.length === 0;
  if (emptyState) {
    emptyState.hidden = !isEmpty;
  }
  if (clipList) {
    clipList.hidden = isEmpty;
  }
}

/**
 * Copies a clip's text to the clipboard via the secure IPC bridge
 * @param {string} id
 * @param {HTMLElement} btn
 */
async function copyClip(id, btn) {
  if (!window.clipvault) return;
  try {
    const res = await window.clipvault.copyEntry(id);
    if (res && res.success && btn) {
      btn.classList.add('copied');
      btn.title = 'Copied!';
      btn.setAttribute('aria-label', 'Copied to clipboard');
      setTimeout(() => {
        btn.classList.remove('copied');
        btn.title = 'Copy to clipboard';
        btn.setAttribute('aria-label', 'Copy to clipboard');
      }, 1200);
    }
  } catch (err) {
    console.error('Failed to copy clip:', err);
  }
}

/**
 * Toggles the pinned state of an entry
 * @param {string} id
 */
async function togglePin(id) {
  if (!window.clipvault) return;
  const clip = clips.find((c) => c.id === id);
  if (!clip) return;

  const nextState = !clip.pinned;
  try {
    await window.clipvault.updateEntry(id, { pinned: nextState });
    clip.pinned = nextState;

    const oldEl = document.querySelector(`.clip-item[data-id="${id}"]`);
    if (oldEl) {
      const newEl = createClipElement(clip);
      oldEl.replaceWith(newEl);
    }
    updateCounts();
  } catch (err) {
    console.error('Failed to update pin state:', err);
  }
}

/**
 * Builds a DOM element for a clip item safely using textContent
 * @param {Object} clip
 * @returns {HTMLLIElement}
 */
function createClipElement(clip) {
  const li = document.createElement('li');
  li.className = `clip-item${clip.pinned ? ' is-pinned' : ''}`;
  li.dataset.id = clip.id;

  // Header Row
  const header = document.createElement('div');
  header.className = 'clip-item-header';

  // Meta Information
  const meta = document.createElement('div');
  meta.className = 'clip-meta';

  // Type badge
  const badge = document.createElement('span');
  const typeName = clip.type || 'text';
  badge.className = `badge badge-${typeName}`;
  badge.textContent = typeName;
  meta.appendChild(badge);

  // Pin status indicator
  if (clip.pinned) {
    const pinStatus = document.createElement('span');
    pinStatus.className = 'pin-status';
    pinStatus.title = 'Pinned item';
    pinStatus.innerHTML = `
      <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1" aria-hidden="true">
        <line x1="12" y1="17" x2="12" y2="22"></line>
        <path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.89A2 2 0 0 1 15 10.77V6a3 3 0 0 0-6 0v4.77a2 2 0 0 1-1.11 1.79l-1.78.89A2 2 0 0 0 5 15.24Z"></path>
      </svg>
      Pinned
    `;
    meta.appendChild(pinStatus);
  }

  // Relative timestamp
  const time = document.createElement('time');
  time.className = 'clip-time';
  time.dateTime = new Date(clip.timestamp || Date.now()).toISOString();
  time.textContent = formatTimestamp(clip.timestamp);
  meta.appendChild(time);

  // Action Buttons (Pin, Copy)
  const actions = document.createElement('div');
  actions.className = 'clip-actions';

  const pinBtn = document.createElement('button');
  pinBtn.type = 'button';
  pinBtn.className = `btn-action${clip.pinned ? ' active' : ''}`;
  pinBtn.title = clip.pinned ? 'Unpin clip' : 'Pin clip';
  pinBtn.setAttribute('aria-label', pinBtn.title);
  pinBtn.innerHTML = `
    <svg width="14" height="14" viewBox="0 0 24 24" fill="${clip.pinned ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <line x1="12" y1="17" x2="12" y2="22"></line>
      <path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.89A2 2 0 0 1 15 10.77V6a3 3 0 0 0-6 0v4.77a2 2 0 0 1-1.11 1.79l-1.78.89A2 2 0 0 0 5 15.24Z"></path>
    </svg>
  `;
  pinBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    togglePin(clip.id);
  });
  actions.appendChild(pinBtn);

  const copyBtn = document.createElement('button');
  copyBtn.type = 'button';
  copyBtn.className = 'btn-action';
  copyBtn.title = 'Copy to clipboard';
  copyBtn.setAttribute('aria-label', 'Copy to clipboard');
  copyBtn.innerHTML = `
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
    </svg>
  `;
  copyBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    copyClip(clip.id, copyBtn);
  });
  actions.appendChild(copyBtn);

  header.appendChild(meta);
  header.appendChild(actions);
  li.appendChild(header);

  // Content Preview (SAFETY: using textContent strictly to prevent injection)
  const body = document.createElement('div');
  body.className = 'clip-item-body';

  if (clip.type === 'code') {
    const pre = document.createElement('pre');
    pre.className = 'clip-code';
    const code = document.createElement('code');
    code.textContent = clip.text; // Escaped safely via textContent
    pre.appendChild(code);
    body.appendChild(pre);
  } else if (clip.type === 'link') {
    const p = document.createElement('p');
    p.className = 'clip-text';
    const a = document.createElement('a');
    a.className = 'clip-url';
    a.href = '#';
    a.textContent = clip.text; // Escaped safely via textContent
    a.addEventListener('click', (e) => {
      e.preventDefault();
      copyClip(clip.id, copyBtn);
    });
    p.appendChild(a);
    body.appendChild(p);
  } else {
    const p = document.createElement('p');
    p.className = 'clip-text';
    p.textContent = clip.text; // Escaped safely via textContent
    body.appendChild(p);
  }
  li.appendChild(body);

  // Footer with Unique Entry ID and Character Count
  const footer = document.createElement('div');
  footer.className = 'clip-item-footer';

  const idLabel = document.createElement('span');
  idLabel.className = 'clip-id-label';
  idLabel.title = `Unique Entry ID: ${clip.id}`;
  idLabel.textContent = `ID: ${clip.id}`;
  footer.appendChild(idLabel);

  const detail = document.createElement('span');
  detail.className = 'clip-detail';
  const charCount = typeof clip.characterCount === 'number' ? clip.characterCount : (clip.text ? clip.text.length : 0);
  detail.textContent = `${charCount} character${charCount === 1 ? '' : 's'}`;
  footer.appendChild(detail);

  li.appendChild(footer);

  return li;
}

/**
 * Render all clips currently in the clips array (newest first)
 */
function renderAllClips() {
  if (!clipList) return;
  clipList.innerHTML = '';

  toggleEmptyState();

  if (clips.length > 0) {
    for (const clip of clips) {
      const itemEl = createClipElement(clip);
      clipList.appendChild(itemEl);
    }
  }

  updateCounts();
}

/**
 * Handle a new clip captured from clipboard:new event
 * Immediately prepends the new item to the top of the UI
 * @param {Object} newClip
 */
function handleNewClip(newClip) {
  if (!newClip || !newClip.id) return;

  // Prevent duplicate if ID already present
  if (clips.some((c) => c.id === newClip.id)) return;

  // Add to top of in-memory list (newest first)
  clips.unshift(newClip);

  toggleEmptyState();

  if (clipList) {
    const itemEl = createClipElement(newClip);
    clipList.prepend(itemEl);
  }

  updateCounts();
}

/**
 * Initialize renderer on DOM load
 */
async function initRenderer() {
  clipList = document.getElementById('clip-list');
  emptyState = document.getElementById('empty-state');
  contentSubtitle = document.getElementById('content-subtitle');
  countAllClips = document.getElementById('count-all-clips');
  countPinned = document.getElementById('count-pinned');

  // Load existing history from Electron main process
  if (window.clipvault) {
    try {
      const fetched = await window.clipvault.getHistory();
      clips = Array.isArray(fetched)
        ? [...fetched].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
        : [];
      renderAllClips();
    } catch (err) {
      console.error('Failed to load clipboard history:', err);
      renderAllClips();
    }

    // Subscribe to real-time clipboard:new events
    if (typeof window.clipvault.onNewClip === 'function') {
      window.clipvault.onNewClip(handleNewClip);
    } else if (typeof window.clipvault.onClipboardNew === 'function') {
      window.clipvault.onClipboardNew(handleNewClip);
    }
  } else {
    renderAllClips();
  }
}

// Ensure execution once DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initRenderer);
} else {
  initRenderer();
}
