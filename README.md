# ClipVault

ClipVault is a smart clipboard history manager for macOS built using Electron, HTML, CSS, vanilla JavaScript, and Node.js.

## Stage 1: Project Setup & Minimal Window
- Initialized npm project with Electron and electron-builder as dev dependencies.
- Configured entry point `main.js` and `npm start` script.
- Configured secure Electron window (`contextIsolation: true`, `nodeIntegration: false`, `preload.js`).
- Created project structure:
  - `main.js` - Main Electron process
  - `preload.js` - Preload script with context isolation
  - `index.html` - Minimal UI displaying "ClipVault"
  - `style.css` - Application styling
  - `renderer.js` - Renderer process script
  - `src/clipboard.js` - Clipboard logic skeleton
  - `src/storage.js` - Storage logic skeleton
  - `.gitignore` - Ignoring `node_modules`, `dist`, and `.DS_Store`

## Getting Started

### Install Dependencies
```bash
npm install
```

### Run the App
```bash
npm start
```
