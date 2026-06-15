/**
 * preload.ts — runs in renderer context but with Node access.
 * Exposes a safe, typed API to the React app via contextBridge.
 * Nothing from Node/Electron leaks into the renderer directly.
 */
import { contextBridge, ipcRenderer } from 'electron';

// ─── Types exposed to renderer ────────────────────────────────────────────────
export type ElectronAPI = typeof api;

const api = {
  // ── Platform info ──────────────────────────────────────────────────────────
  platform: process.platform as 'darwin' | 'win32' | 'linux',
  isElectron: true as const,

  // ── File operations ────────────────────────────────────────────────────────
  writeFile: (filePath: string, content: string) =>
    ipcRenderer.invoke('file:write', filePath, content) as Promise<{ ok: boolean; error?: string }>,

  readFile: (filePath: string) =>
    ipcRenderer.invoke('file:read', filePath) as Promise<{ ok: boolean; content?: string; error?: string }>,

  savePdfDialog: () =>
    ipcRenderer.invoke('dialog:save-pdf') as Promise<{ canceled: boolean; filePath?: string }>,

  // ── Window state ───────────────────────────────────────────────────────────
  setTitle: (title: string) =>
    ipcRenderer.invoke('window:set-title', title),

  setDocumentEdited: (edited: boolean) =>
    ipcRenderer.invoke('window:set-document-edited', edited),

  // ── Menu event listeners ───────────────────────────────────────────────────
  // Each returns a cleanup function to remove the listener
  onMenuEvent: (
    channel: string,
    handler: (data?: unknown) => void
  ): (() => void) => {
    const wrapped = (_: unknown, data?: unknown) => handler(data);
    ipcRenderer.on(channel, wrapped);
    return () => ipcRenderer.removeListener(channel, wrapped);
  },

  // ── File open / save-as (triggered from native menu) ───────────────────────
  onFileOpened: (handler: (payload: { filePath: string; content: string }) => void): (() => void) => {
    const wrapped = (_: unknown, payload: { filePath: string; content: string }) => handler(payload);
    ipcRenderer.on('file:opened', wrapped);
    return () => ipcRenderer.removeListener('file:opened', wrapped);
  },

  onFileSaveAs: (handler: (payload: { filePath: string }) => void): (() => void) => {
    const wrapped = (_: unknown, payload: { filePath: string }) => handler(payload);
    ipcRenderer.on('file:save-as', wrapped);
    return () => ipcRenderer.removeListener('file:save-as', wrapped);
  },
};

contextBridge.exposeInMainWorld('electronAPI', api);
