// src/storage.js - Persistent Clipboard History Module
const { app } = require('electron');
const fs = require('fs');
const path = require('path');

const MAX_UNPINNED_ENTRIES = 200;
const STORAGE_FILENAME = 'history.json';

/**
 * Resolves the directory path for persistent data.
 * Always targets app.getPath('userData') when running under Electron.
 * @returns {string}
 */
function getStorageDirectory() {
  if (app && typeof app.getPath === 'function') {
    try {
      return app.getPath('userData');
    } catch {
      // Fallback if accessed before app is ready
    }
  }

  // Fallback for standalone scripts / testing
  if (process.platform === 'darwin') {
    return path.join(process.env.HOME || '', 'Library', 'Application Support', 'clipvault');
  } else if (process.platform === 'win32') {
    return path.join(process.env.APPDATA || '', 'clipvault');
  }
  return path.join(process.env.HOME || '', '.config', 'clipvault');
}

/**
 * Returns the absolute path to history.json in userData
 * @returns {string}
 */
function getStorageFilePath() {
  return path.join(getStorageDirectory(), STORAGE_FILENAME);
}

/**
 * Limits ordinary history to 200 entries, preserving all pinned entries.
 * Sorted newest first.
 * @param {Array} entries
 * @param {number} maxUnpinned
 * @returns {Array}
 */
function pruneHistory(entries, maxUnpinned = MAX_UNPINNED_ENTRIES) {
  if (!Array.isArray(entries)) return [];

  const pinned = [];
  const unpinned = [];

  for (const item of entries) {
    if (!item || typeof item !== 'object' || !item.id) continue;
    if (item.pinned) {
      pinned.push(item);
    } else {
      unpinned.push(item);
    }
  }

  // Sort each group newest first
  pinned.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
  unpinned.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

  // Retain all pinned entries, but limit unpinned entries to maxUnpinned
  const retainedUnpinned = unpinned.slice(0, maxUnpinned);

  // Combine and maintain overall newest-first ordering
  return [...pinned, ...retainedUnpinned].sort(
    (a, b) => (b.timestamp || 0) - (a.timestamp || 0)
  );
}

/**
 * Loads saved history from history.json.
 * Safely handles missing files and malformed JSON.
 * Avoids logging sensitive data.
 * @returns {Promise<Array>}
 */
async function loadHistory() {
  const filePath = getStorageFilePath();

  try {
    if (!fs.existsSync(filePath)) {
      return [];
    }

    const data = await fs.promises.readFile(filePath, 'utf8');
    if (!data || !data.trim()) {
      return [];
    }

    const parsed = JSON.parse(data);
    if (!Array.isArray(parsed)) {
      console.warn('[Storage] History file contained non-array root; resetting to empty history.');
      return [];
    }

    return pruneHistory(parsed);
  } catch (err) {
    // Log generic error type without logging file content or sensitive clipboard text
    console.error('[Storage] Error loading history:', err.name || 'ReadError');
    return [];
  }
}

/**
 * Saves history to history.json using atomic file replacement.
 * Writes to a temporary file in the same directory, then renames.
 * @param {Array} entries
 * @returns {Promise<boolean>}
 */
async function saveHistory(entries) {
  const dir = getStorageDirectory();
  const targetPath = getStorageFilePath();
  const tempPath = path.join(
    dir,
    `.${STORAGE_FILENAME}.tmp.${Date.now()}.${Math.random().toString(36).slice(2, 8)}`
  );

  try {
    // Ensure storage directory exists
    await fs.promises.mkdir(dir, { recursive: true });

    // Prune entries before saving: max 200 unpinned, all pinned preserved
    const pruned = pruneHistory(entries);
    const jsonString = JSON.stringify(pruned, null, 2);

    // Write to temporary file first (atomic write pattern)
    await fs.promises.writeFile(tempPath, jsonString, 'utf8');

    // Atomically replace target file
    await fs.promises.rename(tempPath, targetPath);
    return true;
  } catch (err) {
    // Log generic error without revealing entry contents
    console.error('[Storage] Error saving history:', err.name || 'WriteError');

    // Clean up temporary file if left behind
    try {
      if (fs.existsSync(tempPath)) {
        await fs.promises.unlink(tempPath);
      }
    } catch {
      // Ignore cleanup error
    }

    return false;
  }
}

/**
 * Clears persistent history file
 * @returns {Promise<boolean>}
 */
async function clearStorage() {
  const targetPath = getStorageFilePath();
  try {
    if (fs.existsSync(targetPath)) {
      await fs.promises.unlink(targetPath);
    }
    return true;
  } catch (err) {
    console.error('[Storage] Error clearing history:', err.name || 'DeleteError');
    return false;
  }
}

module.exports = {
  loadHistory,
  saveHistory,
  pruneHistory,
  clearStorage,
  getStorageFilePath,
  getStorageDirectory,
  MAX_UNPINNED_ENTRIES
};
