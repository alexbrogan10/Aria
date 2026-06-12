import { useEffect } from 'react';
import { useStore } from '../store';
import { DurationValue, Accidental } from '../types';

const DURATION_KEYS: Record<string, DurationValue> = {
  '1': 'whole', '2': 'half', '3': 'quarter', '4': 'eighth',
  '5': '16th', '6': '32nd', '7': '64th',
};

export function useKeyboardShortcuts() {
  const { state, dispatch } = useStore();

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement).tagName)) return;

      const key = e.key;
      const keyLower = key.toLowerCase();
      const ctrl = e.ctrlKey || e.metaKey;
      const shift = e.shiftKey;
      const alt = e.altKey;

      // ── Undo / Redo ──────────────────────────────────────────────────────────
      if (ctrl && keyLower === 'z' && !shift) { e.preventDefault(); dispatch({ type: 'UNDO' }); return; }
      if (ctrl && (keyLower === 'y' || (keyLower === 'z' && shift))) { e.preventDefault(); dispatch({ type: 'REDO' }); return; }
      // ── Arrow keys: transpose selected notes ─────────────────────────────────
      const selectedIds = state.editor.selection.elementIds;
      if (selectedIds.length > 0 && (key === 'ArrowUp' || key === 'ArrowDown')) {
        e.preventDefault();
        const direction = key === 'ArrowUp' ? 1 : -1;

        if (ctrl) {
          // Ctrl+Arrow: move by octave (7 diatonic steps)
          dispatch({ type: 'TRANSPOSE_NOTE', elementIds: selectedIds, steps: direction * 7, semitones: direction * 12 });
        } else if (alt) {
          // Alt+Arrow: move by chromatic half step (enharmonic respell)
          // For simplicity map to nearest diatonic step with accidental
          dispatch({ type: 'TRANSPOSE_NOTE', elementIds: selectedIds, steps: direction, semitones: direction });
        } else {
          // Plain Arrow: move by one diatonic step
          dispatch({ type: 'TRANSPOSE_NOTE', elementIds: selectedIds, steps: direction, semitones: direction });
        }
        return;
      }

      // ── Arrow keys with no selection: do nothing special ────────────────────
      if (key === 'ArrowUp' || key === 'ArrowDown' || key === 'ArrowLeft' || key === 'ArrowRight') {
        // Let browser handle if nothing selected
        return;
      }

      // ── Tool switching ───────────────────────────────────────────────────────
      if (keyLower === 'escape') { dispatch({ type: 'SET_TOOL', tool: 'select' }); return; }
      if (keyLower === 'n' && !ctrl) { dispatch({ type: 'SET_TOOL', tool: 'note-input' }); return; }
      if (keyLower === 'e' && !ctrl) { dispatch({ type: 'SET_TOOL', tool: 'erase' }); return; }

      // ── Duration ─────────────────────────────────────────────────────────────
      if (DURATION_KEYS[key]) {
        dispatch({ type: 'SET_DURATION', duration: DURATION_KEYS[key] });
        return;
      }

      // ── Dots ─────────────────────────────────────────────────────────────────
      if (keyLower === '.') {
        dispatch({ type: 'SET_DOTS', dots: state.editor.noteInputDots === 0 ? 1 : 0 });
        return;
      }

      // ── Accidentals ──────────────────────────────────────────────────────────
      if (key === 'ArrowUp' && alt)   { dispatch({ type: 'SET_ACCIDENTAL', accidental: 'sharp' }); return; }
      if (key === 'ArrowDown' && alt) { dispatch({ type: 'SET_ACCIDENTAL', accidental: 'flat' }); return; }
      if (key === '0' && !ctrl)       { dispatch({ type: 'SET_ACCIDENTAL', accidental: null }); return; }

      // ── Voice ────────────────────────────────────────────────────────────────
      if (ctrl && ['1','2','3','4'].includes(key)) {
        e.preventDefault();
        dispatch({ type: 'SET_VOICE', voice: +key as 1|2|3|4 });
        return;
      }

      // ── Delete ───────────────────────────────────────────────────────────────
      if (keyLower === 'delete' || keyLower === 'backspace') {
        e.preventDefault();
        dispatch({ type: 'DELETE_SELECTED' });
        return;
      }

      // ── Playback ─────────────────────────────────────────────────────────────
      if (key === ' ' && !ctrl) {
        e.preventDefault();
        dispatch({ type: 'SET_PLAYING', playing: !state.editor.isPlaying });
        return;
      }

      // ── Zoom ─────────────────────────────────────────────────────────────────
      if (ctrl && (keyLower === '=' || keyLower === '+')) { e.preventDefault(); dispatch({ type: 'SET_ZOOM', zoom: state.editor.zoom + 0.1 }); return; }
      if (ctrl && keyLower === '-') { e.preventDefault(); dispatch({ type: 'SET_ZOOM', zoom: state.editor.zoom - 0.1 }); return; }
      if (ctrl && keyLower === '0') { e.preventDefault(); dispatch({ type: 'SET_ZOOM', zoom: 1 }); return; }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [state.editor, dispatch]);
}
