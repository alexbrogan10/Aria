# Aria — Music Notation Software

Professional music notation editor built with React + TypeScript, deployable as a web app or a native desktop app (Mac & Windows) via Electron.

---

## Architecture Overview

```
aria/
├── src/                    # React web app (the primary codebase)
│   ├── types/index.ts      # All TypeScript types (Score, Note, Part, etc.)
│   ├── store/index.tsx     # useReducer-based state management
│   ├── utils/
│   │   ├── music.ts        # Pitch math, duration, layout helpers
│   │   ├── playback.ts     # Web Audio API playback engine
│   │   └── export.ts       # MusicXML + JSON export
│   ├── hooks/
│   │   ├── useKeyboard.ts  # Global keyboard shortcuts
│   │   └── useElectron.ts  # Electron IPC bridge (no-ops in browser)
│   └── components/
│       └── StaffRenderer.tsx  # SVG notation rendering
│
├── electron/               # Electron main process (desktop only)
│   ├── main.ts             # Window, native menus, file I/O
│   └── preload.ts          # Secure IPC bridge via contextBridge
│
├── build-assets/           # Icons, DMG background, entitlements
├── vite.config.ts
├── tsconfig.json           # React app TS config
└── tsconfig.electron.json  # Electron main process TS config
```

---

## Prerequisites

- **Node.js** ≥ 18
- **npm** ≥ 9
- macOS (to build `.dmg` / `.app`)
- Windows (to build `.exe` / NSIS installer) — or use a CI runner

---

## Development

### Run as web app (browser)
```bash
npm install
npm run dev
# Open http://localhost:5173
```

### Run as desktop app (Electron, with hot reload)
```bash
npm install
npm run electron:dev
# Electron window opens pointing at the Vite dev server
```

---

## Building

### Web app only
```bash
npm run build:web
# Output → dist/
# Deploy dist/ to any static host (Vercel, Netlify, S3, etc.)
```

### Desktop app (both platforms)
```bash
# Build everything
npm run build:electron

# Package for current platform only (no installer, for testing)
npm run electron:pack

# Build distributable installers
npm run electron:dist:mac    # → release/*.dmg + *.zip (x64 + arm64)
npm run electron:dist:win    # → release/*.exe (NSIS installer)
npm run electron:dist        # → all platforms
```

---

## Mac Distribution

Output: `release/Aria-x.x.x.dmg` (Intel) + `release/Aria-x.x.x-arm64.dmg` (Apple Silicon)

For App Store / Gatekeeper notarization, set these env vars before building:
```bash
export APPLE_ID="you@example.com"
export APPLE_APP_SPECIFIC_PASSWORD="xxxx-xxxx-xxxx-xxxx"
export APPLE_TEAM_ID="XXXXXXXXXX"
npm run electron:dist:mac
```

---

## Windows Distribution

Output: `release/Aria Setup x.x.x.exe` (NSIS installer with optional per-user install)

For code signing on Windows:
```bash
export CSC_LINK="path/to/certificate.pfx"
export CSC_KEY_PASSWORD="your-cert-password"
npm run electron:dist:win
```

Cross-compiling Windows from Mac requires Wine + `mono`. Recommended: use GitHub Actions with a `windows-latest` runner instead.

---

## File Associations

After installation, Aria registers itself as the default handler for:
- `.aria.json` — native Aria score format
- `.musicxml` / `.mxl` — MusicXML import/export

---

## Key Design Decisions

### Web-first
The React app works fully in a browser with no Electron dependency. The `useElectron` hook detects whether it's running inside Electron and gracefully falls back — e.g. file save uses `<a download>` in the browser and `fs.writeFileSync` in Electron.

### Context isolation
`nodeIntegration: false` + `contextIsolation: true` means Node.js never leaks into the renderer. All communication goes through the typed `preload.ts` bridge.

### Native menus
Electron's `Menu.buildFromTemplate` produces real OS-native menus (not web dropdowns), so the app feels native on both Mac (with ⌘ shortcuts) and Windows (with Ctrl shortcuts). Menu events are forwarded to the React store via IPC.

### Mac niceties
- `titleBarStyle: 'hiddenInset'` → traffic lights overlap the toolbar
- `setRepresentedFilename` → file icon in the title bar
- `setDocumentEdited` → dot in the close button when unsaved
- `app.addRecentDocument` → file appears in the Dock's recents menu

### Windows niceties
- NSIS installer with optional per-user install (no admin required)
- Desktop + Start Menu shortcuts
- Portable `.exe` build option for no-install usage

---

## Keyboard Shortcuts

| Action | Mac | Windows |
|---|---|---|
| New | ⌘N | Ctrl+N |
| Open | ⌘O | Ctrl+O |
| Save | ⌘S | Ctrl+S |
| Export MusicXML | ⌘⇧E | Ctrl+Shift+E |
| Undo | ⌘Z | Ctrl+Z |
| Redo | ⌘⇧Z | Ctrl+Y |
| Note input | N | N |
| Duration 1–7 | 1–7 | 1–7 |
| Dot | . | . |
| Play/Pause | Space | Space |
| Zoom In/Out | ⌘+/− | Ctrl+/− |
| Delete selected | ⌫ | Delete |

---

## Roadmap

- [ ] MusicXML import parser
- [ ] PDF export via `mainWindow.webContents.printToPDF`
- [ ] MIDI file export
- [ ] Auto-update via `electron-updater`
- [ ] Cloud sync (optional, behind feature flag)
- [ ] Plugin API
