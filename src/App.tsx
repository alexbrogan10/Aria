import React, { useCallback, useState, useMemo, useRef } from 'react';
import { ScoreProvider, useStore, useScore, useEditor } from './store';
import { StaffRenderer } from './components/StaffRenderer';
import { NewScoreWizard } from './components/NewScoreWizard';
import { InstrumentRoster } from './components/InstrumentRoster';
import { MenuBar } from './components/MenuBar';
import { ScoreHeader } from './components/ScoreHeader';
import type { MenuDef } from './components/MenuBar';
import { useKeyboardShortcuts } from './hooks/useKeyboard';
import { useElectron, isElectron } from './hooks/useElectron';
import { playbackEngine } from './utils/playback';
import { downloadMusicXml, downloadJson } from './utils/export';
import { openMusicXmlDialog, readMusicXmlFile } from './utils/import';
import { DURATION_LABELS, formatPitch, durationToBeats } from './utils/music';
import type { DurationValue, Accidental, NoteElement, Pitch, Score, Part } from './types';

// ─── Page geometry ────────────────────────────────────────────────────────────
const DURATIONS: DurationValue[] = ['whole', 'half', 'quarter', 'eighth', '16th', '32nd'];
const PAGE_W        = 900;
const PAGE_H        = 1100;
const PAGE_PAD_X    = 40;
const PAGE_PAD_Y    = 20;
const PART_LABEL_W  = 56;
const CONTENT_W_VAL = PAGE_W - PAGE_PAD_X * 2 - PART_LABEL_W;

// ─── Dynamic scaling ──────────────────────────────────────────────────────────
const BASE_LS = 7;
const MIN_LS  = 1.6;

function partBlockH(staffCount: number, ls: number): number {
  // Staff lines: ls*4. Stem headroom: ls*2.5 above + ls*2.5 below.
  // Grand staff: two staves + inner gap (ls*3) + shared stem headroom.
  return staffCount === 2
    ? ls * 4 * 2 + ls * 3 + ls * 5   // two staves + inner gap + stem room
    : ls * 4 + ls * 5;                // one staff + stem room (ls*2.5 each side)
}

function calcTotalSysH(parts: Part[], ls: number, partGap: number): number {
  return parts.reduce(
    (h, p, i) => h + partBlockH(p.staffCount, ls) + (i < parts.length - 1 ? partGap : 0), 0);
}

function fitLineSpacing(parts: Part[], numSystems: number, usableH: number): { ls: number; partGap: number; sysGap: number } {
  if (parts.length === 0 || numSystems === 0 || usableH <= 0)
    return { ls: BASE_LS, partGap: 6, sysGap: 24 };

  // Step 1: find largest ls where pure staff blocks fit (no gaps yet)
  const pureStaffH = (ls: number) =>
    parts.reduce((h, p) => h + partBlockH(p.staffCount, ls), 0);

  let lo = MIN_LS, hi = BASE_LS;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (pureStaffH(mid) * numSystems <= usableH) lo = mid; else hi = mid;
  }
  const ls = lo;

  // Step 2: distribute ALL remaining space as gaps
  const staffOnlyH   = pureStaffH(ls) * numSystems;
  const remaining    = usableH - staffOnlyH;

  // Gaps: partGaps (between parts within each system) + sysGaps (between systems)
  const numPartGaps = Math.max(0, parts.length - 1) * numSystems;
  const numSysGaps  = Math.max(0, numSystems - 1);
  const totalGapSlots = numPartGaps + numSysGaps;

  // Give sysGaps 3× weight of partGaps so systems are visually separated
  const partGapUnit = totalGapSlots > 0 ? remaining / (numPartGaps + numSysGaps * 3) : 0;
  const partGap = Math.max(0, partGapUnit);
  const sysGap  = Math.max(0, partGapUnit * 3);

  return { ls, partGap, sysGap };
}

function calcPartOffsets(parts: Part[], ls: number, partGap: number): number[] {
  const out: number[] = []; let y = 0;
  parts.forEach((p, i) => { out.push(y); y += partBlockH(p.staffCount, ls) + (i < parts.length - 1 ? partGap : 0); });
  return out;
}

export default function App() {
  return <ScoreProvider><AppInner /></ScoreProvider>;
}

function AppInner() {
  useKeyboardShortcuts();
  const { save } = useElectron();
  const { state, dispatch } = useStore();
  const score  = useScore();
  const editor = useEditor();

  // ── UI state ───────────────────────────────────────────────────────────────
  const [showWizard,        setShowWizard]        = useState(true);
  const [showNewScore,      setShowNewScore]       = useState(false);
  const [showRoster,        setShowRoster]         = useState(false);
  const [showMixer,         setShowMixer]          = useState(false);
  const [flashMeasure,      setFlashMeasure]       = useState<string | null>(null);
  const [isDragging,        setIsDragging]         = useState(false);
  const [importError,       setImportError]        = useState<string | null>(null);
  const [measuresPerSystem, setMeasuresPerSystem]  = useState(4);
  const [currentPage,       setCurrentPage]        = useState(0);
  const pageScrollRef = useRef<HTMLDivElement>(null);

  // ── File open ──────────────────────────────────────────────────────────────
  const handleOpenFile = useCallback(async () => {
    const s = await openMusicXmlDialog();
    if (s) { dispatch({ type: 'LOAD_SCORE', score: s }); setShowWizard(false); }
  }, [dispatch]);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault(); setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (!file) return;
    const n = file.name.toLowerCase();
    if (!n.endsWith('.musicxml') && !n.endsWith('.xml') && !n.endsWith('.mxl') && !n.endsWith('.mxml')) {
      setImportError('Please drop a MusicXML file (.musicxml, .xml, .mxl)');
      setTimeout(() => setImportError(null), 3000); return;
    }
    try {
      const s = await readMusicXmlFile(file);
      dispatch({ type: 'LOAD_SCORE', score: s }); setShowWizard(false);
    } catch (err) {
      setImportError(`Could not open: ${(err as Error).message}`);
      setTimeout(() => setImportError(null), 4000);
    }
  }, [dispatch]);

  // ── Wizard / roster ────────────────────────────────────────────────────────
  const handleWizardComplete = useCallback((newScore: Score) => {
    dispatch({ type: 'LOAD_SCORE', score: newScore }); setShowNewScore(false);
  }, [dispatch]);

  const handleRosterSave = useCallback((parts: Part[]) => {
    const synced = parts.map(p => ({
      ...p,
      measures: Array.from({ length: score.measureCount }, (_, i) =>
        p.measures[i] ?? {
          id: `${p.id}-m${i}`, number: i + 1, elements: [],
          endBarline: { style: (i === score.measureCount - 1 ? 'final' : 'single') as any },
          ...(i === 0 ? { timeSignature: score.globalTimeSignature, keySignature: score.globalKeySignature, clefs: Object.fromEntries(p.clefs.map((c, ci) => [ci, c])) } : {}),
        }),
    }));
    dispatch({ type: 'LOAD_SCORE', score: { ...score, parts: synced } });
    setShowRoster(false);
  }, [score, dispatch]);

  // ── Playback ───────────────────────────────────────────────────────────────
  const handlePlayPause = useCallback(async () => {
    await playbackEngine.resume();
    if (editor.isPlaying) {
      playbackEngine.stop(); dispatch({ type: 'SET_PLAYING', playing: false });
    } else {
      dispatch({ type: 'SET_PLAYING', playing: true });
      playbackEngine.play(score, editor.playheadMeasure, (beat, measure) => {
        if (beat === -1) { dispatch({ type: 'SET_PLAYING', playing: false }); dispatch({ type: 'SET_PLAYHEAD', measure: 0, beat: 0 }); }
        else dispatch({ type: 'SET_PLAYHEAD', measure, beat });
      });
    }
  }, [editor.isPlaying, editor.playheadMeasure, score, dispatch]);

  // ── Selection ──────────────────────────────────────────────────────────────
  const handleElementClick = useCallback((id: string, e: React.MouseEvent) => {
    const ids = e.shiftKey
      ? editor.selection.elementIds.includes(id) ? editor.selection.elementIds.filter(i => i !== id) : [...editor.selection.elementIds, id]
      : [id];
    dispatch({ type: 'SELECT_ELEMENTS', ids });
  }, [editor.selection.elementIds, dispatch]);

  // ── Note insertion ─────────────────────────────────────────────────────────
  // Full usable content width (label column excluded)
  const MEAS_W = useMemo(() => CONTENT_W_VAL / measuresPerSystem, [measuresPerSystem]);

  const handleStaffClick = useCallback((partId: string, measureId: string, staffIdx: number, e: React.MouseEvent) => {
    if (editor.activeTool !== 'note-input') return;
    const part    = score.parts.find(p => p.id === partId);
    const measure = part?.measures.find(m => m.id === measureId);
    if (!measure) return;
    const ts       = measure.timeSignature ?? score.globalTimeSignature;
    const capacity = ts.beats * (4 / ts.beatType);
    const used     = measure.elements.reduce((s, el) => s + durationToBeats(el.duration.value, el.duration.dots), 0);
    if (durationToBeats(editor.noteInputDuration, editor.noteInputDots) > capacity - used + 0.001) {
      setFlashMeasure(measureId); setTimeout(() => setFlashMeasure(null), 600); return;
    }
    const svg = (e.currentTarget as SVGElement).ownerSVGElement;
    if (!svg) return;
    const relY = e.clientY - svg.getBoundingClientRect().top;
    const steps: { step: string; octave: number }[] = [
      { step: 'C', octave: 6 }, { step: 'B', octave: 5 }, { step: 'A', octave: 5 },
      { step: 'G', octave: 5 }, { step: 'F', octave: 5 }, { step: 'E', octave: 5 },
      { step: 'D', octave: 5 }, { step: 'C', octave: 5 }, { step: 'B', octave: 4 },
      { step: 'A', octave: 4 }, { step: 'G', octave: 4 }, { step: 'F', octave: 4 },
      { step: 'E', octave: 4 }, { step: 'D', octave: 4 }, { step: 'C', octave: 4 },
    ];
    const stepsForStaff = staffIdx === 1 ? steps.map(s => ({ ...s, octave: s.octave - 2 })) : steps;
    const idx = Math.max(0, Math.min(stepsForStaff.length - 1, Math.floor(relY / (BASE_LS / 2))));
    const { step, octave } = stepsForStaff[idx];
    const pitch: Pitch = { step: step as Pitch['step'], octave, accidental: editor.activeAccidental, alter: editor.activeAccidental === 'sharp' ? 1 : editor.activeAccidental === 'flat' ? -1 : 0 };
    dispatch({ type: 'INSERT_NOTE', partId, measureId, pitch });
  }, [editor, score, dispatch, MEAS_W]);

  // ── Selected element ───────────────────────────────────────────────────────
  const selectedId = editor.selection.elementIds[0];
  const selectedElement = selectedId
    ? score.parts.flatMap(p => p.measures.flatMap(m => m.elements)).find(el => el.id === selectedId)
    : null;

  const activeMeasureInfo = useMemo(() => {
    if (!selectedId) return null;
    for (const part of score.parts) {
      for (const measure of part.measures) {
        if (measure.elements.some(el => el.id === selectedId)) {
          const ts = measure.timeSignature ?? score.globalTimeSignature;
          const capacity = ts.beats * (4 / ts.beatType);
          const used = measure.elements.reduce((s, el) => s + durationToBeats(el.duration.value, el.duration.dots), 0);
          return { capacity, used, remaining: capacity - used, measureNum: measure.number };
        }
      }
    }
    return null;
  }, [selectedId, score]);

  // ── Layout ─────────────────────────────────────────────────────────────────
  // baseline sys height used for page-fitting calculation
  const baseTotalSysH = useMemo(() =>
    calcTotalSysH(score.parts, BASE_LS, 6), [score.parts]);

  // Static offsets for note-insertion math (use baseline)
  const partYOffsets = useMemo(() => calcPartOffsets(score.parts, BASE_LS, 6), [score.parts]);

  // All systems (each = array of measure indices)
  const allSystems = useMemo(() => {
    const res: number[][] = [];
    for (let i = 0; i < score.measureCount; i += measuresPerSystem)
      res.push(Array.from({ length: Math.min(measuresPerSystem, score.measureCount - i) }, (_, j) => i + j));
    return res;
  }, [score.measureCount, measuresPerSystem]);

  // Systems per page
  // How many systems fit per page
  const sysOnFirst = Math.max(1, Math.floor((PAGE_H - PAGE_PAD_Y * 2 - 180) / (baseTotalSysH + 24)));
  const sysPerPage = Math.max(1, Math.floor((PAGE_H - PAGE_PAD_Y * 2 - 24)  / (baseTotalSysH + 24)));

  // Pages: array of arrays of systems
  const pages = useMemo(() => {
    const res: number[][][] = []; let si = 0;
    while (si < allSystems.length) {
      const isFirst = res.length === 0;
      const cap     = isFirst ? sysOnFirst : sysPerPage;
      res.push(allSystems.slice(si, si + cap));
      si += cap;
    }
    return res;
  }, [allSystems, sysOnFirst, sysPerPage]);

  const scrollToPage = (idx: number) => {
    setCurrentPage(idx);
    document.getElementById(`aria-page-${idx}`)?.scrollIntoView({ behavior: 'smooth', inline: 'start', block: 'nearest' });
  };

  // ── Per-page scaling: compute ls/partGap/sysGap that fit all systems ─────────
  const getPageSpacing = useCallback((pageIdx: number) => {
    const isFirst = pageIdx === 0;
    // Reserve space for: title block + measure number rows + bottom padding safety
    // Use a generous header estimate so staves never overflow
    const headerReserve = isFirst ? 180 : 24;
    const usableH = PAGE_H - PAGE_PAD_Y * 2 - headerReserve;
    const numSys  = pages[pageIdx]?.length ?? 1;
    return fitLineSpacing(score.parts, numSys, usableH);
  }, [pages, score.parts]);

  // ── Menus ──────────────────────────────────────────────────────────────────
  const menus: MenuDef[] = useMemo(() => [
    { label: 'File', items: [
      { type: 'action', icon: '🎼', label: 'New Score…',     shortcut: 'Ctrl+N', onClick: () => setShowNewScore(true) },
      { type: 'separator' },
      { type: 'action', icon: '📂', label: 'Open…',          shortcut: 'Ctrl+O', onClick: handleOpenFile },
      { type: 'action', icon: '💾', label: 'Save',            shortcut: 'Ctrl+S', onClick: save },
      { type: 'action', icon: '💾', label: 'Save As…',        shortcut: 'Ctrl+Shift+S', onClick: () => {} },
      { type: 'separator' },
      { type: 'submenu', icon: '📤', label: 'Export', children: [
        { type: 'action', label: 'Export as MusicXML…', shortcut: 'Ctrl+Shift+E', onClick: () => downloadMusicXml(score) },
        { type: 'action', label: 'Export as JSON…',     onClick: () => downloadJson(score) },
        { type: 'action', label: 'Export as PDF…',      disabled: true, onClick: () => {} },
        { type: 'action', label: 'Export as MIDI…',     disabled: true, onClick: () => {} },
      ]},
    ]},
    { label: 'Edit', items: [
      { type: 'action', icon: '↩', label: 'Undo', shortcut: 'Ctrl+Z', disabled: state.history.length === 0, onClick: () => dispatch({ type: 'UNDO' }) },
      { type: 'action', icon: '↪', label: 'Redo', shortcut: 'Ctrl+Y', disabled: state.future.length === 0,  onClick: () => dispatch({ type: 'REDO' }) },
      { type: 'separator' },
      { type: 'action', icon: '🗑', label: 'Delete Selected', shortcut: 'Del', disabled: editor.selection.elementIds.length === 0, onClick: () => dispatch({ type: 'DELETE_SELECTED' }) },
      { type: 'separator' },
      { type: 'action', label: 'Deselect All', shortcut: 'Escape', onClick: () => dispatch({ type: 'CLEAR_SELECTION' }) },
    ]},
    { label: 'Score', items: [
      { type: 'action', icon: '🎼', label: 'Instruments…', onClick: () => setShowRoster(true) },
      { type: 'separator' },
      { type: 'action', icon: '+', label: 'Add Measure', shortcut: 'Ctrl+B', onClick: () => dispatch({ type: 'ADD_MEASURE' }) },
      { type: 'separator' },
      { type: 'submenu', label: 'Transpose', children: [
        { type: 'action', label: 'Up a step',   onClick: () => { if (editor.selection.elementIds.length) dispatch({ type: 'TRANSPOSE_NOTE', elementIds: editor.selection.elementIds, steps: 1, semitones: 1 }); } },
        { type: 'action', label: 'Down a step', onClick: () => { if (editor.selection.elementIds.length) dispatch({ type: 'TRANSPOSE_NOTE', elementIds: editor.selection.elementIds, steps: -1, semitones: -1 }); } },
        { type: 'action', label: 'Up an octave',   shortcut: 'Ctrl+↑', onClick: () => { if (editor.selection.elementIds.length) dispatch({ type: 'TRANSPOSE_NOTE', elementIds: editor.selection.elementIds, steps: 7, semitones: 12 }); } },
        { type: 'action', label: 'Down an octave', shortcut: 'Ctrl+↓', onClick: () => { if (editor.selection.elementIds.length) dispatch({ type: 'TRANSPOSE_NOTE', elementIds: editor.selection.elementIds, steps: -7, semitones: -12 }); } },
      ]},
    ]},
    { label: 'Notation', items: [
      { type: 'checkbox', label: 'Note Input', shortcut: 'N', checked: editor.activeTool === 'note-input', onClick: () => dispatch({ type: 'SET_TOOL', tool: editor.activeTool === 'note-input' ? 'select' : 'note-input' }) },
      { type: 'separator' },
      { type: 'submenu', label: 'Duration', children: [
        { type: 'action', label: 'Whole',   shortcut: '1', onClick: () => dispatch({ type: 'SET_DURATION', duration: 'whole' }) },
        { type: 'action', label: 'Half',    shortcut: '2', onClick: () => dispatch({ type: 'SET_DURATION', duration: 'half' }) },
        { type: 'action', label: 'Quarter', shortcut: '3', onClick: () => dispatch({ type: 'SET_DURATION', duration: 'quarter' }) },
        { type: 'action', label: 'Eighth',  shortcut: '4', onClick: () => dispatch({ type: 'SET_DURATION', duration: 'eighth' }) },
        { type: 'action', label: '16th',    shortcut: '5', onClick: () => dispatch({ type: 'SET_DURATION', duration: '16th' }) },
        { type: 'action', label: '32nd',    shortcut: '6', onClick: () => dispatch({ type: 'SET_DURATION', duration: '32nd' }) },
        { type: 'separator' },
        { type: 'action', label: 'Dot', shortcut: '.', onClick: () => dispatch({ type: 'SET_DOTS', dots: editor.noteInputDots > 0 ? 0 : 1 }) },
      ]},
      { type: 'submenu', label: 'Articulations', children: [
        { type: 'action', label: 'Staccato', onClick: () => { if (editor.selection.elementIds.length) dispatch({ type: 'SET_ARTICULATION', elementIds: editor.selection.elementIds, articulation: 'staccato' }); } },
        { type: 'action', label: 'Accent',   onClick: () => { if (editor.selection.elementIds.length) dispatch({ type: 'SET_ARTICULATION', elementIds: editor.selection.elementIds, articulation: 'accent' }); } },
        { type: 'action', label: 'Fermata',  onClick: () => { if (editor.selection.elementIds.length) dispatch({ type: 'SET_ARTICULATION', elementIds: editor.selection.elementIds, articulation: 'fermata' }); } },
      ]},
    ]},
    { label: 'Playback', items: [
      { type: 'action', icon: editor.isPlaying ? '⏸' : '▶', label: editor.isPlaying ? 'Pause' : 'Play', shortcut: 'Space', onClick: handlePlayPause },
      { type: 'action', icon: '⏹', label: 'Stop', onClick: () => { playbackEngine.stop(); dispatch({ type: 'SET_PLAYING', playing: false }); dispatch({ type: 'SET_PLAYHEAD', measure: 0, beat: 0 }); } },
      { type: 'separator' },
      { type: 'submenu', label: 'Tempo', children: [
        { type: 'action', label: 'Largo (♩=48)',     onClick: () => dispatch({ type: 'SET_TEMPO', bpm: 48,  text: 'Largo' }) },
        { type: 'action', label: 'Andante (♩=80)',   onClick: () => dispatch({ type: 'SET_TEMPO', bpm: 80,  text: 'Andante' }) },
        { type: 'action', label: 'Moderato (♩=100)', onClick: () => dispatch({ type: 'SET_TEMPO', bpm: 100, text: 'Moderato' }) },
        { type: 'action', label: 'Allegro (♩=132)',  onClick: () => dispatch({ type: 'SET_TEMPO', bpm: 132, text: 'Allegro' }) },
        { type: 'action', label: 'Presto (♩=184)',   onClick: () => dispatch({ type: 'SET_TEMPO', bpm: 184, text: 'Presto' }) },
      ]},
    ]},
    { label: 'View', items: [
      { type: 'submenu', label: 'Zoom', children: [
        { type: 'action', label: 'Zoom In',     shortcut: 'Ctrl++', onClick: () => dispatch({ type: 'SET_ZOOM', zoom: editor.zoom + 0.1 }) },
        { type: 'action', label: 'Zoom Out',    shortcut: 'Ctrl+−', onClick: () => dispatch({ type: 'SET_ZOOM', zoom: editor.zoom - 0.1 }) },
        { type: 'action', label: 'Actual Size', shortcut: 'Ctrl+0', onClick: () => dispatch({ type: 'SET_ZOOM', zoom: 1 }) },
        { type: 'separator' },
        ...[50,75,100,125,150,200].map(pct => ({ type: 'action' as const, label: `${pct}%`, onClick: () => dispatch({ type: 'SET_ZOOM', zoom: pct / 100 }) })),
      ]},
      { type: 'separator' },
      { type: 'submenu', label: 'Measures per System', children: [
        ...[2,3,4,5,6,8,10,12].map(n => ({ type: 'action' as const, label: `${n} measures`, onClick: () => setMeasuresPerSystem(n) })),
      ]},
      { type: 'checkbox', label: 'Show Mixer', checked: showMixer, onClick: () => setShowMixer(v => !v) },
    ]},
  ], [state.history.length, state.future.length, editor.selection.elementIds, editor.activeTool,
      editor.noteInputDots, editor.isPlaying, editor.zoom, score, showMixer,
      dispatch, save, handleOpenFile, handlePlayPause]);

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div style={S.app}>

      {/* ── Welcome screen ── */}
      {showWizard && (
        <div style={S.overlay}
          onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}>
          <div style={S.welcomeCard}>
            <div style={S.welcomeHeader}>
              <div style={{ fontSize: 36, marginBottom: 6 }}>♩</div>
              <div style={{ fontSize: 22, fontWeight: 700 }}>Aria</div>
              <div style={{ fontSize: 12, opacity: 0.75, marginTop: 2 }}>Professional Music Notation</div>
            </div>
            <div style={{ padding: '24px 28px 20px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
                <button style={S.welcomeBtnPrimary} onClick={() => { setShowWizard(false); setShowNewScore(true); }}>
                  <span style={{ fontSize: 22 }}>🎼</span>
                  <span style={{ fontWeight: 600 }}>New Score</span>
                  <span style={{ fontSize: 11, opacity: 0.8 }}>Start from scratch</span>
                </button>
                <button style={S.welcomeBtnSecondary} onClick={handleOpenFile}>
                  <span style={{ fontSize: 22 }}>📂</span>
                  <span style={{ fontWeight: 600 }}>Open File</span>
                  <span style={{ fontSize: 11, color: '#888' }}>MusicXML, .aria.json</span>
                </button>
              </div>
              <div style={{ ...S.dropZone, ...(isDragging ? S.dropZoneActive : {}) }}
                onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}>
                <div style={{ fontSize: 20, marginBottom: 4 }}>{isDragging ? '⬇️' : '📄'}</div>
                <div style={{ fontSize: 12, color: isDragging ? '#185FA5' : '#999', fontWeight: isDragging ? 600 : 400 }}>
                  {isDragging ? 'Drop to open' : 'Drag a MusicXML file here'}
                </div>
                <div style={{ fontSize: 10, color: '#bbb', marginTop: 2 }}>.musicxml · .xml · .mxl</div>
              </div>
              {importError && <div style={S.errorBanner}>⚠️ {importError}</div>}
              <div style={{ borderTop: '0.5px solid #eee', marginTop: 16, paddingTop: 12 }}>
                <div style={{ fontSize: 10, color: '#aaa', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>Recent Files</div>
                <div style={{ fontSize: 12, color: '#bbb', fontStyle: 'italic' }}>No recent files yet.</div>
              </div>
            </div>
            <div style={S.welcomeFooter}>
              <span style={{ fontSize: 11, color: '#aaa' }}>Aria v0.1.0</span>
              <button style={S.textBtn} onClick={() => setShowWizard(false)}>Continue without opening</button>
            </div>
          </div>
        </div>
      )}

      {/* ── New Score Wizard ── */}
      {showNewScore && (
        <NewScoreWizard
          onComplete={s => { handleWizardComplete(s); setShowWizard(false); }}
          onCancel={() => { setShowNewScore(false); if (score.parts.length === 0) setShowWizard(true); }}
        />
      )}

      {/* ── Instrument Roster ── */}
      {showRoster && (
        <InstrumentRoster currentParts={score.parts} onSave={handleRosterSave} onCancel={() => setShowRoster(false)} />
      )}

      {/* ── Menu bar ── */}
      <MenuBar
        menus={menus}
        left={<span style={S.menuLogo}>♩ Aria</span>}
        right={<span style={S.menuStatus}>{score.metadata.title || 'Untitled'} · Autosaved</span>}
      />

      {/* ── Toolbar ── */}
      <div style={S.toolbar}>
        <div style={S.toolGroup}>
          {(['select','note-input','erase'] as const).map(tool => (
            <button key={tool} title={tool}
              style={{ ...S.toolBtn, ...(editor.activeTool === tool ? S.toolBtnActive : {}) }}
              onClick={() => dispatch({ type: 'SET_TOOL', tool })}>
              {tool === 'select' ? '▷' : tool === 'note-input' ? '♩' : '✕'}
            </button>
          ))}
        </div>
        <div style={S.toolGroup}>
          {DURATIONS.map((d, i) => (
            <button key={d} title={DURATION_LABELS[d]}
              style={{ ...S.toolBtn, ...(editor.noteInputDuration === d ? S.toolBtnActive : {}) }}
              onClick={() => dispatch({ type: 'SET_DURATION', duration: d })}>{i + 1}</button>
          ))}
          <button title="Dot" style={{ ...S.toolBtn, ...(editor.noteInputDots > 0 ? S.toolBtnActive : {}), fontWeight: 700 }}
            onClick={() => dispatch({ type: 'SET_DOTS', dots: editor.noteInputDots > 0 ? 0 : 1 })}>.</button>
        </div>
        <div style={S.toolGroup}>
          {([['flat','♭'],['natural','♮'],['sharp','♯']] as [Accidental,string][]).map(([acc,sym]) => (
            <button key={String(acc)} style={{ ...S.toolBtn, ...(editor.activeAccidental === acc ? S.toolBtnActive : {}) }}
              onClick={() => dispatch({ type: 'SET_ACCIDENTAL', accidental: editor.activeAccidental === acc ? null : acc })}>{sym}</button>
          ))}
        </div>
        <div style={S.toolGroup}>
          <button style={S.toolBtn} onClick={() => dispatch({ type: 'UNDO' })} disabled={state.history.length === 0}>↩</button>
          <button style={S.toolBtn} onClick={() => dispatch({ type: 'REDO' })} disabled={state.future.length === 0}>↪</button>
        </div>
        <div style={S.toolGroup}>
          <button style={S.toolBtn} onClick={() => dispatch({ type: 'SET_ZOOM', zoom: editor.zoom - 0.1 })}>−</button>
          <span style={{ fontSize: 11, color: '#888', padding: '0 4px', minWidth: 36, textAlign: 'center' }}>{Math.round(editor.zoom * 100)}%</span>
          <button style={S.toolBtn} onClick={() => dispatch({ type: 'SET_ZOOM', zoom: editor.zoom + 0.1 })}>+</button>
        </div>
        <div style={S.toolGroup}>
          <button style={S.toolBtn} title="Add Measure" onClick={() => dispatch({ type: 'ADD_MEASURE' })}>+𝄚</button>
          <button style={{ ...S.toolBtn, fontSize: 11 }} onClick={() => setShowRoster(true)}>🎼</button>
        </div>
        {/* Measures per system control */}
        <div style={{ ...S.toolGroup, gap: 4, alignItems: 'center' }}>
          <span style={{ fontSize: 10, color: '#888' }}>Meas/sys</span>
          <button style={S.toolBtn} onClick={() => setMeasuresPerSystem(m => Math.max(1, m - 1))}>−</button>
          <span style={{ fontSize: 11, fontWeight: 600, color: '#555', minWidth: 16, textAlign: 'center' }}>{measuresPerSystem}</span>
          <button style={S.toolBtn} onClick={() => setMeasuresPerSystem(m => Math.min(16, m + 1))}>+</button>
        </div>
        <div style={S.toolGroup}>
          <button style={{ ...S.toolBtn, fontSize: 10 }} onClick={() => downloadMusicXml(score)}>MusicXML</button>
          <button style={{ ...S.toolBtn, fontSize: 10 }} onClick={() => downloadJson(score)}>JSON</button>
        </div>
      </div>

      {/* ── Main ── */}
      <div style={S.main}>

        {/* ── Left palette ── */}
        <div style={S.leftPanel}>
          <PaletteSection title="Notes">
            {DURATIONS.map((d, i) => (
              <div key={d} style={{ ...S.palItem, ...(editor.noteInputDuration === d ? S.palItemActive : {}) }}
                onClick={() => dispatch({ type: 'SET_DURATION', duration: d })} title={DURATION_LABELS[d]}>{i + 1}</div>
            ))}
          </PaletteSection>
          <PaletteSection title="Dynamics">
            {['pp','p','mp','mf','f','ff'].map(d => (
              <div key={d} style={{ ...S.palItem, fontStyle: 'italic', fontSize: 11 }}>{d}</div>
            ))}
          </PaletteSection>
          <PaletteSection title="Articulations">
            {[['staccato','•'],['accent','>'],['tenuto','—'],['marcato','^'],['fermata','𝄐'],['trill','tr']].map(([a,sym]) => (
              <div key={a} style={S.palItem} title={a}
                onClick={() => { if (editor.selection.elementIds.length) dispatch({ type: 'SET_ARTICULATION', elementIds: editor.selection.elementIds, articulation: a as any }); }}>{sym}</div>
            ))}
          </PaletteSection>
          <PaletteSection title="Lines">
            {[['slur','⌢'],['cresc','<'],['dim','>'],['8va','8va']].map(([n,s]) => (
              <div key={n} style={S.palItem} title={n}>{s}</div>
            ))}
          </PaletteSection>
          <div style={{ padding: '8px' }}>
            <button style={{ width: '100%', padding: '6px 0', borderRadius: 6, border: '1px solid #ddd', background: '#fff', fontSize: 11, cursor: 'pointer', color: '#555' }}
              onClick={() => setShowRoster(true)}>🎼 Instruments</button>
          </div>
        </div>

        {/* ── Score: page rail + horizontal scroll ── */}
        <div style={S.scoreWrapper}>

          {/* Page indicator rail */}
          {pages.length > 1 && (
            <div style={S.pageRail}>
              {pages.map((_, i) => (
                <button key={i}
                  style={{ ...S.pageBtn, ...(currentPage === i ? S.pageBtnActive : {}) }}
                  onClick={() => scrollToPage(i)}>{i + 1}</button>
              ))}
            </div>
          )}

          {/* Horizontal page scroll */}
          <div ref={pageScrollRef} style={S.pageScroll}
            onClick={() => dispatch({ type: 'CLEAR_SELECTION' })}
            onScroll={e => {
              const el = e.currentTarget;
              const pageWidth = PAGE_W * editor.zoom + 40;
              const idx = Math.round(el.scrollLeft / pageWidth);
              setCurrentPage(idx);
            }}>

            {pages.map((pageSystems, pageIdx) => {
              const { ls, partGap, sysGap } = getPageSpacing(pageIdx);
              const dynPartOffsets = calcPartOffsets(score.parts, ls, partGap);
              const dynSysH        = calcTotalSysH(score.parts, ls, partGap);
              const staffH         = ls * 4;
              return (
              <div key={pageIdx} id={`aria-page-${pageIdx}`}
                style={{ ...S.scorePageOuter, transform: `scale(${editor.zoom})`, transformOrigin: 'top left' }}>
              <div style={S.scorePage}>

                {/* Title block — first page only */}
                {pageIdx === 0 && <ScoreHeader />}

                {/* Page number top-right */}
                {pageIdx > 0 && (
                  <div style={{ textAlign: 'right', fontSize: 10, color: '#ccc', marginBottom: 8 }}>{pageIdx + 1}</div>
                )}

                {/* Systems */}
                {pageSystems.map((measureIndices, sysIdx) => {
                  const firstMI  = measureIndices[0];
                  const measCnt  = measureIndices.length;
                  const sysMeasW = CONTENT_W_VAL / measCnt;
                  const svgW     = PART_LABEL_W + CONTENT_W_VAL;
                  const isLastSys = pageIdx === pages.length - 1 && sysIdx === pageSystems.length - 1;

                  return (
                    <div key={sysIdx} style={{ marginBottom: sysGap }}>
                      {/* Measure numbers */}
                      <div style={{ display: 'flex', paddingLeft: PART_LABEL_W, marginBottom: 2 }}>
                        {measureIndices.map(mi => (
                          <div key={mi} style={{ width: sysMeasW, fontSize: 9, color: '#ccc', paddingLeft: 4 }}>{mi + 1}</div>
                        ))}
                      </div>

                      <svg width={svgW} height={dynSysH} style={{ display: 'block', overflow: 'visible' }}>
                        {/* System bracket */}
                        {score.parts.length > 1 && (() => {
                          const lp  = score.parts[score.parts.length - 1];
                          const lpY = dynPartOffsets[score.parts.length - 1];
                          return <line x1={PART_LABEL_W} y1={ls} x2={PART_LABEL_W} y2={lpY + partBlockH(lp.staffCount, ls) - ls} stroke="#3a3a38" strokeWidth={1.5} />;
                        })()}

                        {score.parts.map((part, partIdx) => {
                          const baseY = dynPartOffsets[partIdx];
                          return (
                            <g key={part.id}>
                              {/* Part label */}
                              <text x={PART_LABEL_W - 5} y={baseY + partBlockH(part.staffCount, ls) / 2 + 4}
                                fontSize={7.5} fill="#777" textAnchor="end" style={{ userSelect: 'none' }}>
                                {(pageIdx === 0 && sysIdx === 0) ? part.instrument.name : part.instrument.abbreviation}
                              </text>

                              {/* Grand staff brace */}
                              {part.staffCount === 2 && (
                                <text x={PART_LABEL_W - 1} y={baseY + partBlockH(2, ls) / 2 + 10}
                                  fontSize={partBlockH(2, ls) * 0.8} fill="#3a3a38" textAnchor="middle" fontFamily="serif"
                                  style={{ userSelect: 'none' }}>{'{'}</text>
                              )}

                              {/* Each staff */}
                              {Array.from({ length: part.staffCount }, (_, si) => {
                                // Staff lines sit in the center of the block (ls*2.5 stem room each side)
                                const singleStaffBlock = staffH + ls * 5; // = ls*9
                                const staffY = baseY + si * singleStaffBlock + ls * 2.5;
                                return (
                                  <g key={si}>
                                    {measureIndices.map((mi, li) => {
                                      const meas = part.measures[mi];
                                      if (!meas) return null;
                                      const mx  = PART_LABEL_W + li * sysMeasW;
                                      const ts  = meas.timeSignature ?? score.globalTimeSignature;
                                      const cap = ts.beats * (4 / ts.beatType);
                                      const used = meas.elements.reduce((s, el) => s + durationToBeats(el.duration.value, el.duration.dots), 0);
                                      const full = used >= cap - 0.001;
                                      return (
                                        <g key={`${meas.id}-s${si}`}>
                                          {flashMeasure === meas.id && (
                                            <rect x={mx} y={staffY} width={sysMeasW} height={staffH} fill="rgba(220,60,60,0.18)" rx={2} />
                                          )}
                                          {full && si === 0 && (
                                            <circle cx={mx + sysMeasW / 2} cy={staffY - 5} r={2.5} fill="#5a9c2c" opacity={0.7} />
                                          )}
                                          <StaffRenderer
                                            part={part} measure={meas}
                                            measureIndex={mi} systemFirstIndex={firstMI}
                                            staffIndex={si} x={mx} y={staffY}
                                            width={sysMeasW} staffHeight={staffH} lineSpacing={ls}
                                            clipId={`clip-${pageIdx}-${sysIdx}-${partIdx}-${si}-${mi}`}
                                            blockHeight={partBlockH(part.staffCount, ls)}
                                            isSelected={id => editor.selection.elementIds.includes(id)}
                                            onElementClick={handleElementClick}
                                            onStaffClick={(pId, mId, e) => handleStaffClick(pId, mId, si, e)}
                                          />
                                        </g>
                                      );
                                    })}

                                    {/* Grand staff connector barline */}
                                    {part.staffCount === 2 && si === 0 && (() => {
                                      const bot  = baseY + (staffH + ls * 5) + ls * 2.5;
                                      const endX = PART_LABEL_W + measCnt * sysMeasW;
                                      return (
                                        <g>
                                          <line x1={endX} y1={staffY} x2={endX} y2={bot + staffH} stroke="#3a3a38" strokeWidth={isLastSys ? 3 : 1} />
                                          {isLastSys && <line x1={endX - 3} y1={staffY} x2={endX - 3} y2={bot + staffH} stroke="#3a3a38" strokeWidth={1} />}
                                        </g>
                                      );
                                    })()}
                                  </g>
                                );
                              })}
                            </g>
                          );
                        })}
                      </svg>
                    </div>
                  );
                })}

                {/* Page number footer */}
                <div style={{ textAlign: 'center', fontSize: 10, color: '#ddd', marginTop: 12 }}>{pageIdx + 1}</div>
              </div>
              </div>
              );
            })}
          </div>
        </div>

        {/* ── Properties panel ── */}
        <div style={S.rightPanel}>
          <div style={S.propsHeader}>{selectedElement ? `Properties — ${selectedElement.type}` : 'Properties'}</div>

          {activeMeasureInfo && (
            <div style={{ padding: '8px 12px', background: '#f8f8f6', borderBottom: '0.5px solid #eee' }}>
              <div style={{ fontSize: 10, color: '#aaa', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 4 }}>Measure {activeMeasureInfo.measureNum}</div>
              <div style={{ fontSize: 11, color: '#555', marginBottom: 4 }}>
                <b>{activeMeasureInfo.used.toFixed(2)}</b> / {activeMeasureInfo.capacity} beats
              </div>
              <div style={{ height: 4, background: '#e8e8e5', borderRadius: 2, overflow: 'hidden' }}>
                <div style={{ height: '100%', borderRadius: 2, transition: 'width 0.15s',
                  width: `${Math.min(100, (activeMeasureInfo.used / activeMeasureInfo.capacity) * 100)}%`,
                  background: activeMeasureInfo.remaining < 0.001 ? '#5a9c2c' : '#185FA5' }} />
              </div>
              <div style={{ fontSize: 10, color: '#aaa', marginTop: 3 }}>
                {activeMeasureInfo.remaining < 0.001 ? '✓ Full' : `${activeMeasureInfo.remaining.toFixed(2)} remaining`}
              </div>
            </div>
          )}

          {selectedElement?.type === 'note' && (() => {
            const note = selectedElement as NoteElement;
            return (
              <>
                <PropGroup label="Pitch">
                  <PropRow name="Note" value={<Badge>{formatPitch(note.pitch)}</Badge>} />
                </PropGroup>
                <PropGroup label="Duration">
                  <PropRow name="Value" value={<Badge>{DURATION_LABELS[note.duration.value]}</Badge>} />
                  <PropRow name="Dots"  value={note.duration.dots > 0 ? '●'.repeat(note.duration.dots) : '—'} />
                </PropGroup>
                <PropGroup label="Actions">
                  <button style={S.miniBtn} onClick={() => dispatch({ type: 'DELETE_SELECTED' })}>🗑 Delete</button>
                </PropGroup>
              </>
            );
          })()}

          {!selectedElement && (
            <div style={{ padding: '14px 12px', fontSize: 11, color: '#aaa', lineHeight: 1.7 }}>
              Click a note to see properties.
              <br /><br />
              <b style={{ color: '#888' }}>Shortcuts</b><br />
              N — Note input<br />1–6 — Duration<br />. — Dot<br />
              ↑↓ — Transpose<br />Ctrl+↑↓ — Octave<br />
              Space — Play<br />Del — Delete<br />Ctrl+Z — Undo
            </div>
          )}

          <div style={{ marginTop: 'auto', padding: '10px 12px', borderTop: '0.5px solid #e5e5e5' }}>
            <div style={{ fontSize: 10, color: '#aaa', marginBottom: 5, textTransform: 'uppercase', letterSpacing: 0.4 }}>Score</div>
            <div style={{ fontSize: 11, color: '#555', marginBottom: 2 }}>{score.parts.length} parts</div>
            <div style={{ fontSize: 11, color: '#555', marginBottom: 2 }}>{score.measureCount} measures</div>
            <div style={{ fontSize: 11, color: '#555', marginBottom: 2 }}>{pages.length} pages</div>
            <div style={{ fontSize: 11, color: '#555' }}>♩={score.globalTempo.bpm} {score.globalTempo.text}</div>
            <button style={{ ...S.miniBtn, marginTop: 8, width: '100%' }} onClick={() => setShowRoster(true)}>🎼 Instruments…</button>
          </div>
        </div>
      </div>

      {/* ── Playback bar ── */}
      <div style={S.playbar}>
        <button style={S.playBtn} onClick={handlePlayPause}>{editor.isPlaying ? '⏸' : '▶'}</button>
        <span style={{ fontSize: 11, color: '#888', minWidth: 40 }}>M{editor.playheadMeasure + 1} / P{currentPage + 1}</span>
        <div style={S.playTrack}>
          <div style={{ ...S.playFill, width: `${(editor.playheadMeasure / Math.max(score.measureCount - 1, 1)) * 100}%` }} />
        </div>
        <div style={{ fontSize: 11, color: '#666' }}>♩ = <b>{score.globalTempo.bpm}</b></div>
        <span style={{ fontSize: 11, color: '#aaa', fontStyle: 'italic' }}>{score.globalTempo.text}</span>
      </div>

      {/* ── Status bar ── */}
      <div style={S.statusbar}>
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#5a9c2c', display: 'inline-block', marginRight: 6 }} />
        <span>Ready</span>
        <span style={{ margin: '0 12px', color: '#ddd' }}>|</span>
        {selectedElement?.type === 'note'
          ? <span>Selected: {formatPitch((selectedElement as NoteElement).pitch)} · {DURATION_LABELS[(selectedElement as NoteElement).duration.value]}</span>
          : <span>Tool: {editor.activeTool}</span>}
        <span style={{ flex: 1 }} />
        <span>{score.parts.length} parts · {score.measureCount} measures · {pages.length} pages · {measuresPerSystem} meas/sys</span>
      </div>
    </div>
  );
}

// ─── Small components ─────────────────────────────────────────────────────────
function PaletteSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ borderBottom: '0.5px solid #e8e8e5' }}>
      <div style={{ padding: '7px 10px 3px', fontSize: 10, fontWeight: 500, color: '#aaa', textTransform: 'uppercase', letterSpacing: 0.5 }}>{title}</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 2, padding: '0 6px 7px' }}>{children}</div>
    </div>
  );
}
function PropGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ padding: '7px 12px', borderBottom: '0.5px solid #f0f0ee' }}>
      <div style={{ fontSize: 10, fontWeight: 500, color: '#aaa', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 5 }}>{label}</div>
      {children}
    </div>
  );
}
function PropRow({ name, value }: { name: string; value: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
      <span style={{ fontSize: 12, color: '#666' }}>{name}</span>
      <span style={{ fontSize: 12, fontWeight: 500 }}>{value}</span>
    </div>
  );
}
function Badge({ children }: { children: React.ReactNode }) {
  return <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 10, background: '#E6F1FB', color: '#185FA5', fontWeight: 500 }}>{children}</span>;
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const S: Record<string, React.CSSProperties> = {
  app:        { display: 'flex', flexDirection: 'column', height: '100vh', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', background: '#fafaf8' },
  overlay:    { position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(3px)' },
  welcomeCard: { background: '#fff', borderRadius: 14, width: 540, boxShadow: '0 24px 64px rgba(0,0,0,0.25)', overflow: 'hidden' },
  welcomeHeader: { background: '#185FA5', padding: '24px 28px 20px', color: 'white', textAlign: 'center' },
  welcomeBtnPrimary:   { padding: 14, borderRadius: 10, border: '2px solid #185FA5', background: '#185FA5', color: 'white', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 },
  welcomeBtnSecondary: { padding: 14, borderRadius: 10, border: '2px solid #e0e0de', background: '#fafaf8', color: '#1a1a18', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 },
  dropZone:       { border: '2px dashed #ddd', borderRadius: 10, padding: 18, textAlign: 'center', background: '#fafaf8', cursor: 'default', transition: 'all 0.15s' },
  dropZoneActive: { border: '2px dashed #185FA5', background: '#E6F1FB' },
  errorBanner:    { marginTop: 10, padding: '8px 12px', borderRadius: 6, background: '#FEE2E2', color: '#B91C1C', fontSize: 12 },
  welcomeFooter:  { padding: '10px 28px', background: '#f8f8f6', borderTop: '0.5px solid #eee', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  textBtn:        { fontSize: 11, color: '#888', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' },
  menuLogo:   { fontWeight: 600, fontSize: 13, color: '#1a1a18', padding: '0 10px', letterSpacing: -0.3 },
  menuStatus: { fontSize: 11, color: '#aaa', padding: '0 10px' },
  toolbar:    { display: 'flex', alignItems: 'center', gap: 2, padding: '3px 8px', height: 42, background: '#fff', borderBottom: '0.5px solid #e8e8e5', flexShrink: 0 },
  toolGroup:  { display: 'flex', alignItems: 'center', gap: 1, paddingRight: 6, marginRight: 3, borderRight: '0.5px solid #e8e8e5' },
  toolBtn:    { width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 4, cursor: 'pointer', fontSize: 12, color: '#555', border: '0.5px solid transparent', background: 'transparent' },
  toolBtnActive: { background: '#E6F1FB', color: '#185FA5', borderColor: '#B5D4F4' },
  main:       { display: 'flex', flex: 1, overflow: 'hidden' },
  leftPanel:  { width: 168, borderRight: '0.5px solid #e8e8e5', background: '#f8f8f6', flexShrink: 0, overflowY: 'auto' },
  palItem:    { aspectRatio: '1', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 4, cursor: 'pointer', fontSize: 13, border: '0.5px solid transparent', background: '#fff' },
  palItemActive: { background: '#E6F1FB', borderColor: '#B5D4F4', color: '#185FA5' },

  // Score layout
  scoreWrapper: { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#e8e7e3' },
  pageRail:     { display: 'flex', alignItems: 'center', gap: 4, padding: '6px 12px', background: '#f0efeb', borderBottom: '0.5px solid #ddd', flexShrink: 0 },
  pageBtn:      { width: 24, height: 24, borderRadius: 4, border: '0.5px solid #ddd', background: '#fff', fontSize: 11, cursor: 'pointer', color: '#555' },
  pageBtnActive: { background: '#185FA5', color: 'white', borderColor: '#185FA5' },
  pageScroll:   { flex: 1, display: 'flex', flexDirection: 'row', overflowX: 'auto', overflowY: 'auto', padding: '24px 20px', gap: 24, scrollSnapType: 'x mandatory' },
  scorePageOuter: { width: PAGE_W, height: PAGE_H, flexShrink: 0, scrollSnapAlign: 'start', position: 'relative' },
  scorePage:    { background: 'white', padding: `${PAGE_PAD_Y}px ${PAGE_PAD_X}px`, width: PAGE_W, height: PAGE_H, overflow: 'hidden', borderRadius: 2, border: '0.5px solid #ccc', boxShadow: '0 2px 8px rgba(0,0,0,0.08)', position: 'absolute', top: 0, left: 0 },

  rightPanel: { width: 190, borderLeft: '0.5px solid #e8e8e5', background: '#f8f8f6', display: 'flex', flexDirection: 'column', flexShrink: 0, overflowY: 'auto' },
  propsHeader: { padding: '9px 12px 7px', fontSize: 11, fontWeight: 500, color: '#666', borderBottom: '0.5px solid #e8e8e5' },
  playbar:    { display: 'flex', alignItems: 'center', gap: 10, padding: '0 12px', height: 36, background: '#fff', borderTop: '0.5px solid #e8e8e5', flexShrink: 0 },
  playBtn:    { width: 26, height: 26, borderRadius: '50%', background: '#185FA5', border: 'none', color: 'white', fontSize: 11, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  playTrack:  { flex: 1, height: 3, background: '#e8e8e5', borderRadius: 2 },
  playFill:   { height: '100%', background: '#185FA5', borderRadius: 2, transition: 'width 0.1s' },
  statusbar:  { display: 'flex', alignItems: 'center', padding: '0 12px', height: 22, background: '#f0efeb', borderTop: '0.5px solid #e0dfdb', fontSize: 10, color: '#888', flexShrink: 0 },
  miniBtn:    { fontSize: 11, padding: '4px 10px', borderRadius: 4, border: '0.5px solid #ddd', background: '#fff', cursor: 'pointer', color: '#555' },
};
