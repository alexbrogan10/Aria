# Aria — Music Notation Software

A professional-grade music notation editor built with React, TypeScript, and Electron. Aria runs as both a web app in the browser and a native desktop application on Mac and Windows, with real OS-native menus, file associations, and keyboard shortcuts.

---

## Overview

Aria was built to bring a clean, modern music composition experience to the desktop. The app supports multi-part score editing, real-time audio playback via the Web Audio API, MusicXML export, and a full suite of notation tools — all rendered as SVG directly in the browser.

The project is web-first by design: the React app runs fully in a browser with no Electron dependency, and the Electron layer wraps it into a native desktop experience without changing any of the core logic.

---

## Tech Stack

| Category | Tools |
|---|---|
| Frontend | React 18, TypeScript |
| Desktop | Electron 31 |
| Build | Vite, electron-builder |
| Audio | Web Audio API |
| Notation Rendering | SVG (custom StaffRenderer component) |
| State Management | useReducer |
| Export | MusicXML, JSON |
| CI/CD | GitHub Actions (Mac + Windows builds) |

---

## Architecture

```
aria/
├── src/                        # React web app (primary codebase)
│   ├── types/index.ts          # TypeScript types — Score, Note, Part, etc.
│   ├── store/index.tsx         # useReducer-based state management
│   ├── utils/
│   │   ├── music.ts            # Pitch math, duration, layout helpers
│   │   ├── playback.ts         # Web Audio API playback engine
│   │   └── export.ts           # MusicXML + JSON export
│   ├── hooks/
│   │   ├── useKeyboard.ts      # Global keyboard shortcuts
│   │   └── useElectron.ts      # Electron IPC bridge (graceful no-ops in browser)
│   └── components/
│       └── StaffRenderer.tsx   # SVG notation rendering
│
├── electron/                   # Electron main process (desktop only)
│   ├── main.ts                 # Window management, native menus, file I/O
│   └── preload.ts              # Secure IPC bridge via contextBridge
│
├── build-assets/               # Icons, DMG background, entitlements
├── vite.config.ts
├── tsconfig.json               # React app TypeScript config
└── tsconfig.electron.json      # Electron main process TypeScript config
```

---

## Features

- SVG-based staff rendering with real-time notation display
- Note input mode with duration selection (whole through 16th notes), augmentation dots, and keyboard-driven entry
- Web Audio API playback engine with play/pause/stop controls
- MusicXML and JSON export
- Native OS menus on Mac (with ⌘ shortcuts) and Windows (with Ctrl shortcuts)
- File associations for `.aria.json` and `.musicxml` formats
- Mac-specific niceties: hidden inset title bar, represented filename in title bar, unsaved changes dot on close button, Dock recents integration
- Windows-specific niceties: NSIS installer with optional per-user install, portable `.exe` build, desktop and Start Menu shortcuts
- Context isolation enforced — Node.js never leaks into the renderer; all communication goes through a typed preload bridge
- Dual build targets: deploy as a static web app or package as a native desktop installer

---

## Getting Started

### Prerequisites

- Node.js >= 18
- npm >= 9

### Run in the browser

```bash
npm install
npm run dev
# Open http://localhost:5173
```

### Run as a desktop app (Electron with hot reload)

```bash
npm install
npm run electron:dev
```

---

## Building

```bash
# Web app only (output → dist/)
npm run build:web

# Desktop — package for current platform (no installer, for testing)
npm run electron:pack

# Desktop — build distributable installers
npm run electron:dist:mac    # → release/*.dmg + *.zip (Intel + Apple Silicon)
npm run electron:dist:win    # → release/*.exe (NSIS installer)
npm run electron:dist        # → all platforms
```

---

## Keyboard Shortcuts

| Action | Mac | Windows |
|---|---|---|
| New Score | ⌘N | Ctrl+N |
| Open | ⌘O | Ctrl+O |
| Save | ⌘S | Ctrl+S |
| Export MusicXML | ⌘⇧E | Ctrl+Shift+E |
| Undo | ⌘Z | Ctrl+Z |
| Redo | ⌘⇧Z | Ctrl+Y |
| Note Input | N | N |
| Duration (1–7) | 1–7 | 1–7 |
| Augmentation Dot | . | . |
| Play / Pause | Space | Space |
| Zoom In / Out | ⌘+/− | Ctrl+/− |
| Delete Selected | ⌫ | Delete |

---

## Roadmap

- MusicXML import parser
- PDF export via Electron's `printToPDF`
- MIDI file export
- Auto-update via `electron-updater`
- Cloud sync (optional, behind feature flag)
- Plugin API

---

## Author

**Alex Brogan**  
B.S. Applied Computer Science | Hiram College, 2025  
Minor: Music Composition  
[alex.brogan10@gmail.com](mailto:alex.brogan10@gmail.com) | [github.com/alexbrogan](https://github.com/alexbrogan)
