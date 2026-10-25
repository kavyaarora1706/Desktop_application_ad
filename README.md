# ClipVault

ClipVault is a smart, private desktop clipboard history manager for macOS built using **Electron**, **HTML**, **CSS**, **Vanilla JavaScript**, and **Node.js**.

Designed with a modern dark desktop aesthetic featuring charcoal/near-black backgrounds and subtle emerald green accents, ClipVault captures copied items automatically, categorizes them, and provides instant search, pinning, individual deletion, and customizable history limits.

---

## Features

- **Automatic Clipboard Capture**: Continuously monitors the system clipboard and saves newly copied items (text, links, code snippets) with relative timestamps and character counts.
- **Privacy & Monitoring Pause/Resume**: Easily pause clipboard capture anytime via the sidebar status indicator or Settings panel. Content copied while monitoring is paused is never stored or captured upon resume.
- **Sensitive Data Notice & Privacy-First Architecture**: Stores all history locally on your machine in Electron's secure `userData` directory (`history.json` and `settings.json`). Zero analytics, zero cloud dependencies, and zero sensitive data logged.
- **Rule-Based Categorization**: Automatically categorizes entries into:
  - **Links**: Validated using standard URL parsing rules (`http://`, `https://`, `ftp://`, `www.`).
  - **Code**: Detected using syntax patterns (JS, TS, Python, HTML/XML, SQL, CSS, JSON, shell commands) and multiline indentation.
  - **Text**: Default fallback for standard conversational text and uncertain content.
- **Category Filter Buttons**: Instant pill filters (`All`, `Links`, `Code`, `Text`) with live counter badges showing item counts per category in the current view.
- **Pin & Unpin**: Pin important entries to keep them at the top of the All Clips list and access them in the dedicated **Pinned** view. Pin states survive app restarts.
- **Instant Search**: Real-time, case-insensitive keyword filtering with a one-click clear button and `Escape` key shortcut. Synergizes with active category and pinned views.
- **One-Click Copy**: Copy button on every card with subtle `"Copied!"` green pill feedback. Copying an entry within ClipVault never creates a duplicate or alters its position.
- **Safe Deletion & Clear History**:
  - Individual trash button on each card operating directly on unique entry IDs.
  - **Clear History** action protected by a confirmation modal dialog with an option to retain pinned clips.
- **Configurable History Limit**: User-selectable storage cap (50, 100, 200, 500, 1000 clips) for unpinned items, while pinned clips are always preserved.
- **Security & XSS Protection**: Built with `contextIsolation: true`, `nodeIntegration: false`, strict IPC validation via `preload.js`, and safe `textContent` DOM escaping.

---

## Technology Stack

- **Framework**: Electron (^45.0.0)
- **Frontend**: Vanilla HTML5, Vanilla CSS3 (Custom design system, zero CSS frameworks), Vanilla JavaScript (ES6+)
- **Storage**: Node.js `fs` & `path` with atomic write operations (`.tmp` file + rename) in Electron's `userData` directory
- **Packaging**: `electron-builder` (^26.18.0) generating native macOS `.dmg` disk images

---

## Getting Started

### Prerequisites

- macOS (Apple Silicon arm64 or Intel x64)
- Node.js (v18+) and npm

### Installation

Clone the repository and install dev dependencies:

```bash
git clone https://github.com/kavyaarora1706/Desktop_application_ad.git
cd Desktop_application_ad
npm install
```

### Run Locally (Development)

Launch the application in development mode:

```bash
npm start
```

---

## Building the macOS DMG

ClipVault can be packaged into a standalone `.dmg` installer without requiring paid Apple Developer signing credentials:

```bash
npm run dist
```

The installer will be generated inside the `dist/` directory:
- **Installer path**: `dist/ClipVault-1.0.0-arm64.dmg` (or `dist/ClipVault-1.0.0.dmg`)
- **Packaged application**: `dist/mac-arm64/ClipVault.app`

The packaged app runs independently of the development environment and does **not** require users to have Node.js installed.

---

## Security & Storage Architecture

1. **Local Storage Location**:
   - macOS: `~/Library/Application Support/ClipVault/history.json` and `settings.json`
2. **Context Isolation**:
   - The renderer process cannot access Node.js APIs or the filesystem directly.
   - All operations are gated through a minimal `window.clipvault` API exposed via `preload.js` with IPC argument validation in `main.js`.
3. **Atomic File Writes**:
   - History and settings are written to randomized temporary dot-files before being renamed atomically, preventing data corruption during power loss or abrupt exits.
