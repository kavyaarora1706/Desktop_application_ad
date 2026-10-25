// renderer.js - ClipVault Renderer Process (Stage 10)
// Features: Live clipboard history, pinned sorting/views, persistence survival, instant search, copy feedback

let clips = [];
let searchQuery = '';
let currentView = 'all'; // 'all' | 'pinned'
let currentCategory = 'all'; // 'all' | 'link' | 'code' | 'text'

// DOM Element References
let clipList = null;
let emptyState = null;
let emptyStatePinned = null;
let noResultsState = null;
let noResultsText = null;
let btnResetSearch = null;
let contentTitle = null;
let contentSubtitle = null;
let countAllClips = null;
let countPinned = null;
let searchInput = null;
let searchClearBtn = null;
let navAllClips = null;
let navPinned = null;
let btnClearHistory = null;
let clearConfirmModal = null;
let btnCancelClear = null;
let btnConfirmClear = null;
let checkKeepPinned = null;
let modalPinnedCount = null;
let modalPinnedOption = null;
let categoryFilterBtns = null;
let countCatAll = null;
let countCatLink = null;
let countCatCode = null;
let countCatText = null;

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
 * Sorts clips for the "All Clips" view:
 * 1. Pinned entries first (newest to oldest)
 * 2. Unpinned entries second (newest to oldest)
 * @param {Array} items
 * @returns {Array}
 */
function sortClips(items) {
  return [...items].sort((a, b) => {
    // Pinned entries shown first
    if (a.pinned && !b.pinned) return -1;
    if (!a.pinned && b.pinned) return 1;
    // Newest first within same pinned status
    return (b.timestamp || 0) - (a.timestamp || 0);
  });
}

/**
 * Returns filtered clips based on current navigation view and search query
 * @returns {Array}
 */
function getVisibleClips() {
  // Step 1: Filter by sidebar view (all vs pinned)
  let baseItems = currentView === 'pinned'
    ? clips.filter((c) => c.pinned)
    : clips;

  // Step 2: Filter by category if not 'all'
  if (currentCategory !== 'all') {
    baseItems = baseItems.filter((clip) => {
      const type = clip.type || 'text';
      return type === currentCategory;
    });
  }

  // Step 3: Filter by search query if active
  const query = searchQuery.trim().toLowerCase();
  if (query) {
    baseItems = baseItems.filter((clip) => {
      const text = typeof clip.text === 'string' ? clip.text.toLowerCase() : '';
      return text.includes(query);
    });
  }

  // Step 4: Sort: pinned entries first in All Clips, newest first in Pinned
  if (currentView === 'all') {
    return sortClips(baseItems);
  }
  // For Pinned view, all items are pinned, sort newest first
  return [...baseItems].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
}

/**
 * Update UI counts for header and navigation badges
 * @param {number} visibleCount
 */
function updateCounts(visibleCount) {
  const total = clips.length;
  const pinnedTotal = clips.filter((c) => c.pinned).length;

  if (countAllClips) {
    countAllClips.textContent = total;
    countAllClips.setAttribute('aria-label', `${total} items`);
  }
  if (countPinned) {
    countPinned.textContent = pinnedTotal;
    countPinned.setAttribute('aria-label', `${pinnedTotal} pinned items`);
  }

  if (btnClearHistory) {
    btnClearHistory.disabled = total === 0;
  }

  // Update dynamic category button counts
  updateCategoryCounts();

  if (contentSubtitle) {
    const activeQuery = searchQuery.trim();
    const catLabel = currentCategory !== 'all' ? ` ${currentCategory}` : '';
    if (currentView === 'pinned') {
      if (activeQuery) {
        contentSubtitle.textContent = `${visibleCount} of ${pinnedTotal} pinned${catLabel} clip${pinnedTotal === 1 ? '' : 's'} matching`;
      } else {
        contentSubtitle.textContent = `${visibleCount} pinned${catLabel} clip${visibleCount === 1 ? '' : 's'} stored`;
      }
    } else {
      if (activeQuery) {
        contentSubtitle.textContent = `${visibleCount} of ${total}${catLabel} clip${total === 1 ? '' : 's'} matching`;
      } else {
        contentSubtitle.textContent = `${visibleCount}${catLabel} clip${visibleCount === 1 ? '' : 's'} stored`;
      }
    }
  }
}

/**
 * Update counts for category filter buttons
 */
function updateCategoryCounts() {
  const base = currentView === 'pinned'
    ? clips.filter((c) => c.pinned)
    : clips;

  const allCount = base.length;
  const linkCount = base.filter((c) => (c.type || 'text') === 'link').length;
  const codeCount = base.filter((c) => (c.type || 'text') === 'code').length;
  const textCount = base.filter((c) => (c.type || 'text') === 'text').length;

  if (countCatAll) countCatAll.textContent = allCount;
  if (countCatLink) countCatLink.textContent = linkCount;
  if (countCatCode) countCatCode.textContent = codeCount;
  if (countCatText) countCatText.textContent = textCount;
}

/**
 * Switches the active category filter (all, link, code, text)
 * @param {'all' | 'link' | 'code' | 'text'} category
 */
function switchCategory(category) {
  if (currentCategory === category) return;
  currentCategory = category;

  if (categoryFilterBtns) {
    categoryFilterBtns.forEach((btn) => {
      const isActive = btn.dataset.category === category;
      btn.classList.toggle('active', isActive);
      btn.setAttribute('aria-pressed', String(isActive));
    });
  }

  renderClipsView();
}

/**
 * Switches the active sidebar view between 'all' and 'pinned'
 * @param {'all' | 'pinned'} view
 */
function switchView(view) {
  if (currentView === view) return;
  currentView = view;

  // Update navigation button active states
  if (navAllClips) {
    const isAll = currentView === 'all';
    navAllClips.classList.toggle('active', isAll);
    if (isAll) navAllClips.setAttribute('aria-current', 'page');
    else navAllClips.removeAttribute('aria-current');
  }

  if (navPinned) {
    const isPinned = currentView === 'pinned';
    navPinned.classList.toggle('active', isPinned);
    if (isPinned) navPinned.setAttribute('aria-current', 'page');
    else navPinned.removeAttribute('aria-current');
  }

  // Update section title
  if (contentTitle) {
    contentTitle.textContent = currentView === 'pinned' ? 'Pinned' : 'All Clips';
  }

  renderClipsView();
}

/**
 * Clears current search query and resets the view
 */
function clearSearch() {
  searchQuery = '';
  if (searchInput) {
    searchInput.value = '';
  }
  if (searchClearBtn) {
    searchClearBtn.hidden = true;
  }
  renderClipsView();
}

/**
 * Copies a clip's text to the clipboard via the secure IPC bridge
 * @param {string} id
 * @param {HTMLElement} btn
 */
async function copyClip(id, btn) {
  // Handle missing or invalid entry IDs safely
  if (typeof id !== 'string' || !id.trim()) {
    console.warn('[ClipVault] Cannot copy entry: missing or invalid ID');
    return;
  }
  if (!window.clipvault) return;

  try {
    const res = await window.clipvault.copyEntry(id);
    if (res && res.success && btn) {
      if (btn._copyTimeout) {
        clearTimeout(btn._copyTimeout);
      }

      btn.classList.add('copied');
      btn.title = 'Copied!';
      btn.setAttribute('aria-label', 'Copied to clipboard');

      btn._copyTimeout = setTimeout(() => {
        btn.classList.remove('copied');
        btn.title = 'Copy to clipboard';
        btn.setAttribute('aria-label', 'Copy to clipboard');
        btn._copyTimeout = null;
      }, 1400);
    } else if (res && !res.success) {
      console.warn('[ClipVault] Copy failed:', res.error);
    }
  } catch (err) {
    console.error('Failed to copy clip:', err);
  }
}

/**
 * Toggles the pinned state of an entry and persists to storage
 * @param {string} id
 */
async function togglePin(id) {
  if (!id || typeof id !== 'string' || !id.trim()) {
    console.warn('[ClipVault] Cannot toggle pin: missing or invalid ID');
    return;
  }
  if (!window.clipvault) return;

  const clip = clips.find((c) => c.id === id);
  if (!clip) return;

  const nextState = !clip.pinned;
  try {
    const res = await window.clipvault.updateEntry(id, { pinned: nextState });
    if (res && res.success) {
      clip.pinned = nextState;
      // Re-render view to preserve pinned-first sorting and update sidebar views
      renderClipsView();
    }
  } catch (err) {
    console.error('Failed to update pin state:', err);
  }
}

/**
 * Deletes an individual clipboard entry by ID and updates UI and storage immediately
 * @param {string} id
 */
async function deleteClip(id) {
  if (typeof id !== 'string' || !id.trim()) {
    console.warn('[ClipVault] Cannot delete clip: missing or invalid ID');
    return;
  }
  if (!window.clipvault) return;

  try {
    const res = await window.clipvault.deleteEntry(id);
    if (res && res.success) {
      const index = clips.findIndex((c) => c.id === id);
      if (index !== -1) {
        clips.splice(index, 1);
        renderClipsView();
      }
    } else {
      console.warn('[ClipVault] Delete failed:', res ? res.error : 'Unknown error');
    }
  } catch (err) {
    console.error('Failed to delete clip:', err);
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

  // Small Category Label Badge
  const badge = document.createElement('span');
  const typeName = ['link', 'code', 'text'].includes(clip.type) ? clip.type : 'text';
  badge.className = `badge badge-${typeName}`;
  const categoryLabels = { link: 'Link', code: 'Code', text: 'Text' };
  badge.textContent = categoryLabels[typeName] || 'Text';
  badge.title = `Category: ${categoryLabels[typeName] || 'Text'}`;
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

  // Visible, accessible Pin control
  const pinBtn = document.createElement('button');
  pinBtn.type = 'button';
  pinBtn.className = `btn-action btn-pin${clip.pinned ? ' active' : ''}`;
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

  // Copy button with subtle feedback
  const copyBtn = document.createElement('button');
  copyBtn.type = 'button';
  copyBtn.className = 'btn-action btn-copy';
  copyBtn.title = 'Copy to clipboard';
  copyBtn.setAttribute('aria-label', 'Copy to clipboard');
  copyBtn.innerHTML = `
    <svg class="icon-copy-default" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
    </svg>
    <svg class="icon-copied" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <polyline points="20 6 9 17 4 12"></polyline>
    </svg>
    <span class="copy-feedback-label" aria-live="polite">Copied!</span>
  `;
  copyBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    copyClip(clip.id, copyBtn);
  });
  actions.appendChild(copyBtn);

  // Delete button operating directly on entry ID
  const deleteBtn = document.createElement('button');
  deleteBtn.type = 'button';
  deleteBtn.className = 'btn-action btn-delete';
  deleteBtn.title = 'Delete clip';
  deleteBtn.setAttribute('aria-label', 'Delete clip');
  deleteBtn.innerHTML = `
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <polyline points="3 6 5 6 21 6"></polyline>
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
    </svg>
  `;
  deleteBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    deleteClip(clip.id);
  });
  actions.appendChild(deleteBtn);

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
 * Renders the clipboard history view based on current clips, view tab, and search query
 */
function renderClipsView() {
  if (!clipList) return;
  clipList.innerHTML = '';

  const activeQuery = searchQuery.trim();
  const totalInView = currentView === 'pinned'
    ? clips.filter((c) => c.pinned).length
    : clips.length;

  // Case 1: Active view has 0 clips total
  if (totalInView === 0) {
    if (currentView === 'pinned') {
      if (emptyStatePinned) emptyStatePinned.hidden = false;
      if (emptyState) emptyState.hidden = true;
    } else {
      if (emptyState) emptyState.hidden = false;
      if (emptyStatePinned) emptyStatePinned.hidden = true;
    }
    if (noResultsState) noResultsState.hidden = true;
    clipList.hidden = true;
    updateCounts(0);
    return;
  }

  // Base clips exist in this view, so hide view-level empty states
  if (emptyState) emptyState.hidden = true;
  if (emptyStatePinned) emptyStatePinned.hidden = true;

  const visibleClips = getVisibleClips();

  // Case 2: Clips exist in this view, but none match the search query or category filter
  if (visibleClips.length === 0) {
    if (noResultsState) {
      noResultsState.hidden = false;
      if (noResultsText) {
        const catName = currentCategory !== 'all' ? `${currentCategory} ` : '';
        const viewLabel = currentView === 'pinned' ? `pinned ${catName}clips` : `${catName}clips`;
        if (activeQuery) {
          noResultsText.textContent = `No ${viewLabel} match "${activeQuery}". Try a different keyword.`;
        } else {
          noResultsText.textContent = `No ${viewLabel} found in this view.`;
        }
      }
    }
    clipList.hidden = true;
    updateCounts(0);
    return;
  }

  // Case 3: Display matching visible clips
  if (noResultsState) noResultsState.hidden = true;
  clipList.hidden = false;

  for (const clip of visibleClips) {
    const itemEl = createClipElement(clip);
    clipList.appendChild(itemEl);
  }

  updateCounts(visibleClips.length);
}

/**
 * Handle a new clip captured from clipboard:new event
 * Adds to global history list and updates the current view
 * @param {Object} newClip
 */
function handleNewClip(newClip) {
  if (!newClip || !newClip.id) return;

  // Prevent duplicate if ID already present
  if (clips.some((c) => c.id === newClip.id)) return;

  // Add to top of in-memory list (newest first)
  clips.unshift(newClip);

  // Update view (preserves pinned-first sorting in All Clips)
  renderClipsView();
}

/**
 * Set up search input event listeners
 */
function setupSearchListeners() {
  if (!searchInput) return;

  // Instant filtering as user types
  searchInput.addEventListener('input', (e) => {
    searchQuery = e.target.value;
    if (searchClearBtn) {
      searchClearBtn.hidden = !searchQuery;
    }
    renderClipsView();
  });

  // Handle Escape key to clear search
  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      clearSearch();
    }
  });

  // Native search cancel event
  searchInput.addEventListener('search', () => {
    searchQuery = searchInput.value;
    if (searchClearBtn) {
      searchClearBtn.hidden = !searchQuery;
    }
    renderClipsView();
  });

  // Clear button click inside search box
  if (searchClearBtn) {
    searchClearBtn.addEventListener('click', () => {
      clearSearch();
      searchInput.focus();
    });
  }

  // Clear button click inside "No matching clips" empty state
  if (btnResetSearch) {
    btnResetSearch.addEventListener('click', () => {
      clearSearch();
      if (currentCategory !== 'all') {
        switchCategory('all');
      }
      searchInput.focus();
    });
  }
}

/**
 * Set up category filter button event listeners
 */
function setupCategoryListeners() {
  if (categoryFilterBtns) {
    categoryFilterBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        const cat = btn.dataset.category || 'all';
        switchCategory(cat);
      });
    });
  }
}

/**
 * Set up sidebar navigation event listeners
 */
function setupNavigationListeners() {
  if (navAllClips) {
    navAllClips.addEventListener('click', () => switchView('all'));
  }
  if (navPinned) {
    navPinned.addEventListener('click', () => switchView('pinned'));
  }
}

/**
 * Opens clear history confirmation modal
 */
function openClearModal() {
  if (clips.length === 0) return;

  const pinnedCount = clips.filter((c) => c.pinned).length;
  if (modalPinnedCount) {
    modalPinnedCount.textContent = pinnedCount;
  }
  if (modalPinnedOption) {
    modalPinnedOption.style.display = pinnedCount > 0 ? 'block' : 'none';
  }
  if (checkKeepPinned) {
    checkKeepPinned.checked = pinnedCount > 0;
    checkKeepPinned.disabled = pinnedCount === 0;
  }

  if (clearConfirmModal) {
    clearConfirmModal.hidden = false;
  }
  if (btnCancelClear) {
    btnCancelClear.focus();
  }
}

/**
 * Closes clear history confirmation modal
 */
function closeClearModal() {
  if (clearConfirmModal) {
    clearConfirmModal.hidden = true;
  }
  if (btnClearHistory) {
    btnClearHistory.focus();
  }
}

/**
 * Handles confirmed clear history action
 */
async function handleConfirmClear() {
  if (!window.clipvault) return;

  const keepPinned = Boolean(checkKeepPinned && checkKeepPinned.checked && !checkKeepPinned.disabled);

  try {
    const res = await window.clipvault.clearHistory({ keepPinned });
    if (res && res.success) {
      if (keepPinned) {
        clips = clips.filter((c) => c.pinned);
      } else {
        clips = [];
      }
      closeClearModal();
      renderClipsView();
    } else {
      console.warn('[ClipVault] Clear history failed:', res ? res.error : 'Unknown error');
    }
  } catch (err) {
    console.error('Failed to clear history:', err);
  }
}

/**
 * Set up clear history event listeners
 */
function setupClearHistoryListeners() {
  if (btnClearHistory) {
    btnClearHistory.addEventListener('click', openClearModal);
  }
  if (btnCancelClear) {
    btnCancelClear.addEventListener('click', closeClearModal);
  }
  if (btnConfirmClear) {
    btnConfirmClear.addEventListener('click', handleConfirmClear);
  }
  if (clearConfirmModal) {
    clearConfirmModal.addEventListener('click', (e) => {
      if (e.target === clearConfirmModal) {
        closeClearModal();
      }
    });
  }
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && clearConfirmModal && !clearConfirmModal.hidden) {
      closeClearModal();
    }
  });
}

/**
 * Initialize renderer on DOM load
 */
async function initRenderer() {
  clipList = document.getElementById('clip-list');
  emptyState = document.getElementById('empty-state');
  emptyStatePinned = document.getElementById('empty-state-pinned');
  noResultsState = document.getElementById('no-results-state');
  noResultsText = document.getElementById('no-results-text');
  btnResetSearch = document.getElementById('btn-reset-search');
  contentTitle = document.getElementById('content-title');
  contentSubtitle = document.getElementById('content-subtitle');
  countAllClips = document.getElementById('count-all-clips');
  countPinned = document.getElementById('count-pinned');
  searchInput = document.getElementById('search-input');
  searchClearBtn = document.getElementById('search-clear-btn');
  navAllClips = document.getElementById('nav-all-clips');
  navPinned = document.getElementById('nav-pinned');
  btnClearHistory = document.getElementById('btn-clear-history');
  clearConfirmModal = document.getElementById('clear-confirm-modal');
  btnCancelClear = document.getElementById('btn-cancel-clear');
  btnConfirmClear = document.getElementById('btn-confirm-clear');
  checkKeepPinned = document.getElementById('check-keep-pinned');
  modalPinnedCount = document.getElementById('modal-pinned-count');
  modalPinnedOption = document.getElementById('modal-pinned-option');
  categoryFilterBtns = document.querySelectorAll('.category-filter-btn');
  countCatAll = document.getElementById('count-cat-all');
  countCatLink = document.getElementById('count-cat-link');
  countCatCode = document.getElementById('count-cat-code');
  countCatText = document.getElementById('count-cat-text');

  setupSearchListeners();
  setupNavigationListeners();
  setupCategoryListeners();
  setupClearHistoryListeners();

  // Load existing history from Electron main process
  if (window.clipvault) {
    try {
      const fetched = await window.clipvault.getHistory();
      clips = Array.isArray(fetched)
        ? fetched.map((item) => {
            // Guarantee valid category on every clip for backwards compatibility
            if (!item.type || !['link', 'code', 'text'].includes(item.type)) {
              item.type = 'text';
            }
            return item;
          }).sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
        : [];
      renderClipsView();
    } catch (err) {
      console.error('Failed to load clipboard history:', err);
      renderClipsView();
    }

    // Subscribe to real-time clipboard:new events
    if (typeof window.clipvault.onNewClip === 'function') {
      window.clipvault.onNewClip(handleNewClip);
    } else if (typeof window.clipvault.onClipboardNew === 'function') {
      window.clipvault.onClipboardNew(handleNewClip);
    }
  } else {
    renderClipsView();
  }
}

// Ensure execution once DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initRenderer);
} else {
  initRenderer();
}
