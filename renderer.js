// renderer.js - ClipVault Renderer Process
console.log('ClipVault renderer initialized');

// Verify bridge API availability
if (window.clipvault) {
  console.log('Secure IPC bridge ready. Exposed methods:', Object.keys(window.clipvault));
}
