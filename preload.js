// preload.js - ClipVault Preload Script
// Exposes a minimal, secure bridge to the renderer process
const { contextBridge, ipcRenderer } = require('electron');

const clipvaultApi = {
  // Reading history
  getHistory: () => ipcRenderer.invoke('clipvault:get-history'),

  // Copying a selected entry
  copyEntry: (id) => ipcRenderer.invoke('clipvault:copy-entry', id),

  // Updating an entry (e.g. pin/unpin or tags)
  updateEntry: (id, updates) => ipcRenderer.invoke('clipvault:update-entry', { id, updates }),

  // Deleting an entry
  deleteEntry: (id) => ipcRenderer.invoke('clipvault:delete-entry', id),

  // Clearing all history
  clearHistory: () => ipcRenderer.invoke('clipvault:clear-history'),

  // Controlling clipboard monitoring
  startMonitoring: () => ipcRenderer.invoke('clipvault:start-monitoring'),
  stopMonitoring: () => ipcRenderer.invoke('clipvault:stop-monitoring'),
  getMonitoringStatus: () => ipcRenderer.invoke('clipvault:get-monitoring-status'),
  setMonitoring: (enabled) => ipcRenderer.invoke(enabled ? 'clipvault:start-monitoring' : 'clipvault:stop-monitoring'),

  // Safe event listeners with unsubscribe handlers
  onClipAdded: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const subscription = (_event, clip) => callback(clip);
    ipcRenderer.on('clipvault:clip-added', subscription);
    return () => ipcRenderer.removeListener('clipvault:clip-added', subscription);
  },
  onHistoryUpdated: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const subscription = (_event, history) => callback(history);
    ipcRenderer.on('clipvault:history-updated', subscription);
    return () => ipcRenderer.removeListener('clipvault:history-updated', subscription);
  }
};

// Expose explicit window.clipvault API to renderer
contextBridge.exposeInMainWorld('clipvault', clipvaultApi);
// Backwards-compatible camelCase alias
contextBridge.exposeInMainWorld('clipVault', clipvaultApi);
