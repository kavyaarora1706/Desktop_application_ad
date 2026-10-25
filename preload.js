// preload.js - ClipVault preload script
const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('clipVault', {
  appVersion: '1.0.0'
});
