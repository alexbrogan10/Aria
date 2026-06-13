"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * preload.ts — runs in renderer context but with Node access.
 * Exposes a safe, typed API to the React app via contextBridge.
 * Nothing from Node/Electron leaks into the renderer directly.
 */
const electron_1 = require("electron");
const api = {
    // ── Platform info ──────────────────────────────────────────────────────────
    platform: process.platform,
    isElectron: true,
    // ── File operations ────────────────────────────────────────────────────────
    writeFile: (filePath, content) => electron_1.ipcRenderer.invoke('file:write', filePath, content),
    readFile: (filePath) => electron_1.ipcRenderer.invoke('file:read', filePath),
    savePdfDialog: () => electron_1.ipcRenderer.invoke('dialog:save-pdf'),
    // ── Window state ───────────────────────────────────────────────────────────
    setTitle: (title) => electron_1.ipcRenderer.invoke('window:set-title', title),
    setDocumentEdited: (edited) => electron_1.ipcRenderer.invoke('window:set-document-edited', edited),
    // ── Menu event listeners ───────────────────────────────────────────────────
    // Each returns a cleanup function to remove the listener
    onMenuEvent: (channel, handler) => {
        const wrapped = (_, data) => handler(data);
        electron_1.ipcRenderer.on(channel, wrapped);
        return () => electron_1.ipcRenderer.removeListener(channel, wrapped);
    },
    // ── File open / save-as (triggered from native menu) ───────────────────────
    onFileOpened: (handler) => {
        const wrapped = (_, payload) => handler(payload);
        electron_1.ipcRenderer.on('file:opened', wrapped);
        return () => electron_1.ipcRenderer.removeListener('file:opened', wrapped);
    },
    onFileSaveAs: (handler) => {
        const wrapped = (_, payload) => handler(payload);
        electron_1.ipcRenderer.on('file:save-as', wrapped);
        return () => electron_1.ipcRenderer.removeListener('file:save-as', wrapped);
    },
};
electron_1.contextBridge.exposeInMainWorld('electronAPI', api);
