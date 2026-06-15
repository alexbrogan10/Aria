/**
 * useElectron.ts
 *
 * Detects whether we're running inside Electron, exposes the
 * platform-aware API, and wires native menu events into the
 * React store so the web app doesn't need to know about Electron.
 */
import { useEffect, useCallback } from 'react';
import { useStore } from '../store';
import { downloadMusicXml, downloadJson } from '../utils/export';
import type { ElectronAPI } from '../../electron/preload';

// Safe accessor — returns undefined in browser
function getElectronAPI(): ElectronAPI | undefined {
  return (window as unknown as { electronAPI?: ElectronAPI }).electronAPI;
}

export const isElectron = !!getElectronAPI();
export const platform = getElectronAPI()?.platform ?? 'web';

// ─── File save helpers ────────────────────────────────────────────────────────
let currentFilePath: string | null = null;

async function saveToPath(filePath: string, content: string): Promise<boolean> {
  const api = getElectronAPI();
  if (!api) return false;
  const result = await api.writeFile(filePath, content);
  if (result.ok) {
    currentFilePath = filePath;
    await api.setDocumentEdited(false);
  }
  return result.ok;
}

// ─── Main hook ────────────────────────────────────────────────────────────────
export function useElectron() {
  const { state, dispatch } = useStore();
  const api = getElectronAPI();

  // Sync title bar with score name
  useEffect(() => {
    const title = state.score.metadata.title || 'Untitled';
    document.title = `${title} — Aria`;
    api?.setTitle(title);
  }, [state.score.metadata.title, api]);

  // Mark document edited whenever score changes (Mac only: dot in close button)
  useEffect(() => {
    api?.setDocumentEdited(state.history.length > 0);
  }, [state.history.length, api]);

  // ── Save ──────────────────────────────────────────────────────────────────
  const save = useCallback(async () => {
    const json = JSON.stringify(state.score, null, 2);
    if (currentFilePath) {
      await saveToPath(currentFilePath, json);
    } else {
      // No path yet — trigger Save As
      api?.setTitle('Save…');
      if (api) {
        api.onFileSaveAs(async ({ filePath }) => {
          await saveToPath(filePath, json);
        });
      } else {
        downloadJson(state.score);
      }
    }
  }, [state.score, api]);

  // ── Export MusicXML ───────────────────────────────────────────────────────
  const exportMusicXml = useCallback(() => {
    downloadMusicXml(state.score);
  }, [state.score]);

  // ── Wire native menu → store actions ─────────────────────────────────────
  useEffect(() => {
    if (!api) return;

    const cleanups: (() => void)[] = [

      // Edit
      api.onMenuEvent('menu:undo', () => dispatch({ type: 'UNDO' })),
      api.onMenuEvent('menu:redo', () => dispatch({ type: 'REDO' })),
      api.onMenuEvent('menu:delete', () => dispatch({ type: 'DELETE_SELECTED' })),

      // Score
      api.onMenuEvent('menu:new', () => dispatch({ type: 'LOAD_SCORE', score: createEmptyScore() })),
      api.onMenuEvent('menu:add-measure', () => dispatch({ type: 'ADD_MEASURE' })),

      // Notation
      api.onMenuEvent('menu:note-input', () => dispatch({ type: 'SET_TOOL', tool: 'note-input' })),
      api.onMenuEvent('menu:duration-whole', () => dispatch({ type: 'SET_DURATION', duration: 'whole' })),
      api.onMenuEvent('menu:duration-half', () => dispatch({ type: 'SET_DURATION', duration: 'half' })),
      api.onMenuEvent('menu:duration-quarter', () => dispatch({ type: 'SET_DURATION', duration: 'quarter' })),
      api.onMenuEvent('menu:duration-eighth', () => dispatch({ type: 'SET_DURATION', duration: 'eighth' })),
      api.onMenuEvent('menu:duration-16th', () => dispatch({ type: 'SET_DURATION', duration: '16th' })),
      api.onMenuEvent('menu:dot', () =>
        dispatch({ type: 'SET_DOTS', dots: state.editor.noteInputDots === 0 ? 1 : 0 })
      ),

      // Playback
      api.onMenuEvent('menu:play-pause', () =>
        dispatch({ type: 'SET_PLAYING', playing: !state.editor.isPlaying })
      ),
      api.onMenuEvent('menu:stop', () => dispatch({ type: 'SET_PLAYING', playing: false })),
      api.onMenuEvent('menu:mixer', () => dispatch({ type: 'TOGGLE_MIXER' })),

      // View / zoom
      api.onMenuEvent('menu:zoom-in', () => dispatch({ type: 'SET_ZOOM', zoom: state.editor.zoom + 0.1 })),
      api.onMenuEvent('menu:zoom-out', () => dispatch({ type: 'SET_ZOOM', zoom: state.editor.zoom - 0.1 })),
      api.onMenuEvent('menu:zoom-reset', () => dispatch({ type: 'SET_ZOOM', zoom: 1 })),

      // File
      api.onMenuEvent('menu:save', save),
      api.onMenuEvent('menu:export-musicxml', exportMusicXml),

      // File opened from native open dialog
      api.onFileOpened(({ content }) => {
        try {
          const score = JSON.parse(content);
          dispatch({ type: 'LOAD_SCORE', score });
        } catch {
          console.error('Failed to parse opened file');
        }
      }),

      // Save As path received from main process
      api.onFileSaveAs(async ({ filePath }) => {
        const json = JSON.stringify(state.score, null, 2);
        await saveToPath(filePath, json);
      }),
    ];

    return () => cleanups.forEach(c => c());
  }, [api, dispatch, save, exportMusicXml, state.editor, state.score]);

  return { isElectron, platform, save, exportMusicXml };
}

// Minimal empty score factory (avoids circular import with store)
function createEmptyScore() {
  return {
    id: `score-${Date.now()}`,
    metadata: {
      title: 'Untitled Score', composer: '', createdAt: new Date().toISOString(), modifiedAt: new Date().toISOString(),
    },
    parts: [], globalTimeSignature: { beats: 4, beatType: 4 },
    globalKeySignature: { fifths: 0, mode: 'major' as const },
    globalTempo: { bpm: 120, beatUnit: 'quarter' as const, text: 'Moderato' },
    measureCount: 4,
  };
}
