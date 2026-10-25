const { app, BrowserWindow, ipcMain, clipboard } = require('electron');
const path = require('path');
const clipboardMonitor = require('./src/clipboard.js');
const storage = require('./src/storage.js');

let mainWindow = null;

// Register IPC handlers with input validation
function registerIpcHandlers() {
  // Reading history (retrieves stored history from memory/storage)
  ipcMain.handle('clipvault:get-history', async () => {
    return clipboardMonitor.getClips();
  });

  // Copying a selected entry
  ipcMain.handle('clipvault:copy-entry', async (_event, id) => {
    if (typeof id !== 'string' || !id.trim() || id.length > 256) {
      return { success: false, error: 'Invalid argument: id must be a non-empty string' };
    }

    const clips = clipboardMonitor.getClips();
    const entry = clips.find((item) => item.id === id);
    if (entry && entry.text) {
      clipboardMonitor.setLastText(entry.text);
      clipboard.writeText(entry.text);
    }
    return { success: true, id };
  });

  // Updating an entry (persists changes such as pinned state)
  ipcMain.handle('clipvault:update-entry', async (_event, payload) => {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      return { success: false, error: 'Invalid argument: payload must be an object' };
    }

    const { id, updates } = payload;
    if (typeof id !== 'string' || !id.trim() || id.length > 256) {
      return { success: false, error: 'Invalid argument: id must be a non-empty string' };
    }
    if (!updates || typeof updates !== 'object' || Array.isArray(updates)) {
      return { success: false, error: 'Invalid argument: updates must be a non-null object' };
    }

    const updated = await clipboardMonitor.updateClip(id, updates);
    return { success: !!updated, id, updates: updated };
  });

  // Deleting an entry
  ipcMain.handle('clipvault:delete-entry', async (_event, id) => {
    if (typeof id !== 'string' || !id.trim() || id.length > 256) {
      return { success: false, error: 'Invalid argument: id must be a non-empty string' };
    }

    const deleted = await clipboardMonitor.deleteClip(id);
    return { success: deleted, id };
  });

  // Clearing history
  ipcMain.handle('clipvault:clear-history', async () => {
    await clipboardMonitor.clearClips();
    return { success: true };
  });

  // Controlling monitoring
  ipcMain.handle('clipvault:start-monitoring', async () => {
    await clipboardMonitor.start();
    return { success: true, isMonitoring: true };
  });

  ipcMain.handle('clipvault:stop-monitoring', async () => {
    clipboardMonitor.stop();
    return { success: true, isMonitoring: false };
  });

  ipcMain.handle('clipvault:get-monitoring-status', async () => {
    return { isMonitoring: clipboardMonitor.isMonitoring };
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 800,
    height: 560,
    minWidth: 620,
    minHeight: 420,
    title: 'ClipVault',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// App lifecycle
app.whenReady().then(async () => {
  // Load saved history on startup from Electron's userData directory
  const savedHistory = await storage.loadHistory();

  // Initialize monitor with loaded history so existing clipboard content is not captured
  await clipboardMonitor.init(savedHistory);

  // Forward new clips to renderer via clipboard:new channel
  clipboardMonitor.on('new-clip', (clipItem) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('clipboard:new', clipItem);
    }
  });

  // Start clipboard polling (~1000ms)
  await clipboardMonitor.start();

  registerIpcHandlers();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  clipboardMonitor.stop();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
