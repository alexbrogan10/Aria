"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
// ─── Environment ──────────────────────────────────────────────────────────────
const isDev = process.env.NODE_ENV === 'development';
const isMac = process.platform === 'darwin';
// ─── Window management ────────────────────────────────────────────────────────
let mainWindow = null;
function createWindow() {
    mainWindow = new electron_1.BrowserWindow({
        width: 1440,
        height: 900,
        minWidth: 900,
        minHeight: 600,
        titleBarStyle: isMac ? 'hiddenInset' : 'default', // Mac: traffic lights inside frame
        backgroundColor: '#F4F3EF',
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true, // security: keep renderer isolated
            nodeIntegration: false,
        },
        // Windows-specific: show app icon in title bar
        icon: path.join(__dirname, '../public/icon.png'),
    });
    // Dev: load Vite dev server; prod: load built index.html
    if (isDev) {
        mainWindow.loadURL('http://localhost:5173');
        mainWindow.webContents.openDevTools();
    }
    else {
        mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
    }
    mainWindow.on('closed', () => { mainWindow = null; });
    // Prevent external links from opening in the app window
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        electron_1.shell.openExternal(url);
        return { action: 'deny' };
    });
    buildMenu();
}
// ─── Native Menu ──────────────────────────────────────────────────────────────
function buildMenu() {
    const send = (channel) => mainWindow?.webContents.send(channel);
    const template = [
        // Mac app menu
        ...(isMac ? [{
                label: electron_1.app.name,
                submenu: [
                    { role: 'about' },
                    { type: 'separator' },
                    {
                        label: 'Preferences…',
                        accelerator: 'CmdOrCtrl+,',
                        click: () => send('menu:preferences'),
                    },
                    { type: 'separator' },
                    { role: 'services' },
                    { type: 'separator' },
                    { role: 'hide' },
                    { role: 'hideOthers' },
                    { role: 'unhide' },
                    { type: 'separator' },
                    { role: 'quit' },
                ],
            }] : []),
        // File menu
        {
            label: 'File',
            submenu: [
                {
                    label: 'New Score',
                    accelerator: 'CmdOrCtrl+N',
                    click: () => send('menu:new'),
                },
                { type: 'separator' },
                {
                    label: 'Open…',
                    accelerator: 'CmdOrCtrl+O',
                    click: () => openFile(),
                },
                {
                    label: 'Open Recent',
                    role: 'recentDocuments',
                    submenu: [{ role: 'clearRecentDocuments' }],
                },
                { type: 'separator' },
                {
                    label: 'Save',
                    accelerator: 'CmdOrCtrl+S',
                    click: () => send('menu:save'),
                },
                {
                    label: 'Save As…',
                    accelerator: 'CmdOrCtrl+Shift+S',
                    click: () => saveFileAs(),
                },
                { type: 'separator' },
                {
                    label: 'Export',
                    submenu: [
                        {
                            label: 'Export as MusicXML…',
                            accelerator: 'CmdOrCtrl+Shift+E',
                            click: () => send('menu:export-musicxml'),
                        },
                        {
                            label: 'Export as PDF…',
                            click: () => send('menu:export-pdf'),
                        },
                        {
                            label: 'Export as MIDI…',
                            click: () => send('menu:export-midi'),
                        },
                    ],
                },
                { type: 'separator' },
                // Windows/Linux: Quit is in File menu; Mac: it's in the app menu
                ...(!isMac ? [{ role: 'quit' }] : []),
            ],
        },
        // Edit menu
        {
            label: 'Edit',
            submenu: [
                { label: 'Undo', accelerator: 'CmdOrCtrl+Z', click: () => send('menu:undo') },
                { label: 'Redo', accelerator: 'CmdOrCtrl+Shift+Z', click: () => send('menu:redo') },
                { type: 'separator' },
                { role: 'cut' },
                { role: 'copy' },
                { role: 'paste' },
                { role: 'selectAll' },
                { type: 'separator' },
                {
                    label: 'Select All in Measure',
                    accelerator: 'CmdOrCtrl+A',
                    click: () => send('menu:select-measure'),
                },
                {
                    label: 'Delete Selected',
                    accelerator: 'Backspace',
                    click: () => send('menu:delete'),
                },
            ],
        },
        // Score menu
        {
            label: 'Score',
            submenu: [
                {
                    label: 'Add Measure',
                    accelerator: 'CmdOrCtrl+B',
                    click: () => send('menu:add-measure'),
                },
                {
                    label: 'Score Properties…',
                    click: () => send('menu:score-properties'),
                },
                { type: 'separator' },
                {
                    label: 'Transpose…',
                    click: () => send('menu:transpose'),
                },
                {
                    label: 'Change Time Signature…',
                    click: () => send('menu:time-signature'),
                },
                {
                    label: 'Change Key Signature…',
                    click: () => send('menu:key-signature'),
                },
            ],
        },
        // Notation menu
        {
            label: 'Notation',
            submenu: [
                { label: 'Note Input', accelerator: 'N', click: () => send('menu:note-input') },
                { type: 'separator' },
                { label: 'Whole Note', accelerator: '1', click: () => send('menu:duration-whole') },
                { label: 'Half Note', accelerator: '2', click: () => send('menu:duration-half') },
                { label: 'Quarter Note', accelerator: '3', click: () => send('menu:duration-quarter') },
                { label: 'Eighth Note', accelerator: '4', click: () => send('menu:duration-eighth') },
                { label: '16th Note', accelerator: '5', click: () => send('menu:duration-16th') },
                { type: 'separator' },
                { label: 'Augmentation Dot', accelerator: '.', click: () => send('menu:dot') },
            ],
        },
        // Playback menu
        {
            label: 'Playback',
            submenu: [
                {
                    label: 'Play / Pause',
                    accelerator: 'Space',
                    click: () => send('menu:play-pause'),
                },
                {
                    label: 'Stop',
                    accelerator: 'Escape',
                    click: () => send('menu:stop'),
                },
                { type: 'separator' },
                {
                    label: 'Show Mixer',
                    accelerator: 'CmdOrCtrl+M',
                    click: () => send('menu:mixer'),
                },
            ],
        },
        // View menu
        {
            label: 'View',
            submenu: [
                { role: 'reload' },
                { role: 'forceReload' },
                { type: 'separator' },
                {
                    label: 'Zoom In',
                    accelerator: 'CmdOrCtrl+=',
                    click: () => send('menu:zoom-in'),
                },
                {
                    label: 'Zoom Out',
                    accelerator: 'CmdOrCtrl+-',
                    click: () => send('menu:zoom-out'),
                },
                {
                    label: 'Actual Size',
                    accelerator: 'CmdOrCtrl+0',
                    click: () => send('menu:zoom-reset'),
                },
                { type: 'separator' },
                { role: 'togglefullscreen' },
                ...(isDev ? [{ type: 'separator' }, { role: 'toggleDevTools' }] : []),
            ],
        },
        // Window menu
        {
            label: 'Window',
            submenu: [
                { role: 'minimize' },
                { role: 'zoom' },
                ...(isMac
                    ? [{ type: 'separator' }, { role: 'front' }]
                    : [{ role: 'close' }]),
            ],
        },
        // Help menu
        {
            role: 'help',
            submenu: [
                {
                    label: 'Keyboard Shortcuts',
                    click: () => send('menu:shortcuts'),
                },
                {
                    label: 'View on GitHub',
                    click: () => electron_1.shell.openExternal('https://github.com/your-org/aria'),
                },
                ...(!isMac ? [{ label: 'About Aria', click: () => electron_1.app.showAboutPanel() }] : []),
            ],
        },
    ];
    const menu = electron_1.Menu.buildFromTemplate(template);
    electron_1.Menu.setApplicationMenu(menu);
}
// ─── File I/O via IPC ─────────────────────────────────────────────────────────
async function openFile() {
    if (!mainWindow)
        return;
    const { canceled, filePaths } = await electron_1.dialog.showOpenDialog(mainWindow, {
        title: 'Open Score',
        filters: [
            { name: 'Aria Score', extensions: ['aria.json', 'json'] },
            { name: 'MusicXML', extensions: ['musicxml', 'mxl', 'xml'] },
        ],
        properties: ['openFile'],
    });
    if (canceled || filePaths.length === 0)
        return;
    const filePath = filePaths[0];
    try {
        const content = fs.readFileSync(filePath, 'utf-8');
        mainWindow.webContents.send('file:opened', { filePath, content });
        electron_1.app.addRecentDocument(filePath);
        mainWindow.setRepresentedFilename(filePath); // Mac: show file in title bar
    }
    catch (err) {
        electron_1.dialog.showErrorBox('Open Failed', `Could not read file:\n${err.message}`);
    }
}
async function saveFileAs() {
    if (!mainWindow)
        return;
    const { canceled, filePath } = await electron_1.dialog.showSaveDialog(mainWindow, {
        title: 'Save Score As',
        defaultPath: 'Untitled.aria.json',
        filters: [
            { name: 'Aria Score', extensions: ['aria.json', 'json'] },
            { name: 'MusicXML', extensions: ['musicxml'] },
        ],
    });
    if (canceled || !filePath)
        return;
    mainWindow.webContents.send('file:save-as', { filePath });
}
// ─── IPC handlers (renderer → main) ──────────────────────────────────────────
electron_1.ipcMain.handle('file:write', async (_event, filePath, content) => {
    try {
        fs.writeFileSync(filePath, content, 'utf-8');
        mainWindow?.setRepresentedFilename(filePath);
        electron_1.app.addRecentDocument(filePath);
        return { ok: true };
    }
    catch (err) {
        return { ok: false, error: err.message };
    }
});
electron_1.ipcMain.handle('file:read', async (_event, filePath) => {
    try {
        const content = fs.readFileSync(filePath, 'utf-8');
        return { ok: true, content };
    }
    catch (err) {
        return { ok: false, error: err.message };
    }
});
electron_1.ipcMain.handle('dialog:save-pdf', async () => {
    if (!mainWindow)
        return { canceled: true };
    return electron_1.dialog.showSaveDialog(mainWindow, {
        title: 'Export PDF',
        defaultPath: 'Score.pdf',
        filters: [{ name: 'PDF', extensions: ['pdf'] }],
    });
});
electron_1.ipcMain.handle('window:set-title', (_event, title) => {
    mainWindow?.setTitle(`${title} — Aria`);
});
electron_1.ipcMain.handle('window:set-document-edited', (_event, edited) => {
    mainWindow?.setDocumentEdited(edited); // Mac: dot in close button when unsaved
});
// ─── App lifecycle ────────────────────────────────────────────────────────────
electron_1.app.whenReady().then(() => {
    createWindow();
    // Mac: re-open window when clicking dock icon with no windows open
    electron_1.app.on('activate', () => {
        if (electron_1.BrowserWindow.getAllWindows().length === 0)
            createWindow();
    });
});
// Windows/Linux: quit when all windows closed
electron_1.app.on('window-all-closed', () => {
    if (!isMac)
        electron_1.app.quit();
});
// Mac: about panel
electron_1.app.setAboutPanelOptions({
    applicationName: 'Aria',
    applicationVersion: electron_1.app.getVersion(),
    version: electron_1.app.getVersion(),
    copyright: '© 2025 Your Name',
    website: 'https://github.com/your-org/aria',
});
