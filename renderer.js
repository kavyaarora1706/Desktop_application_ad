// renderer.js - ClipVault Renderer Process
console.log('ClipVault renderer initialized');

if (window.clipvault) {
  console.log('Secure IPC bridge ready. Exposed methods:', Object.keys(window.clipvault));

  // Subscribe to newly captured clipboard entries
  window.clipvault.onNewClip((clip) => {
    console.log('New clipboard entry captured from system:', clip);
  });
}
