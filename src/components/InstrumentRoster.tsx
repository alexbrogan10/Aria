import React, { useState } from 'react';
import { Part, Clef } from '../types';
import { generateId } from '../utils/music';

// ─── Instrument catalog ───────────────────────────────────────────────────────
interface InstrumentDef {
  id: string;
  name: string;
  abbreviation: string;
  family: string;
  midiProgram: number;
  clefs: Clef[];
  staffCount: 1 | 2;
  transposition?: { diatonic: number; chromatic: number };
}

const INSTRUMENT_CATALOG: InstrumentDef[] = [
  // ── Keyboards ──
  { id: 'piano',        name: 'Piano',           abbreviation: 'Pno.',   family: 'Keyboard',   midiProgram: 0,  staffCount: 2, clefs: [{ sign: 'G', line: 2 }, { sign: 'F', line: 4 }] },
  { id: 'organ',        name: 'Organ',           abbreviation: 'Org.',   family: 'Keyboard',   midiProgram: 19, staffCount: 2, clefs: [{ sign: 'G', line: 2 }, { sign: 'F', line: 4 }] },
  { id: 'harpsichord',  name: 'Harpsichord',     abbreviation: 'Hpsd.', family: 'Keyboard',   midiProgram: 6,  staffCount: 2, clefs: [{ sign: 'G', line: 2 }, { sign: 'F', line: 4 }] },
  { id: 'celesta',      name: 'Celesta',         abbreviation: 'Cel.',   family: 'Keyboard',   midiProgram: 8,  staffCount: 1, clefs: [{ sign: 'G', line: 2 }] },

  // ── Strings ──
  { id: 'violin',       name: 'Violin',          abbreviation: 'Vln.',   family: 'Strings',    midiProgram: 40, staffCount: 1, clefs: [{ sign: 'G', line: 2 }] },
  { id: 'viola',        name: 'Viola',           abbreviation: 'Vla.',   family: 'Strings',    midiProgram: 41, staffCount: 1, clefs: [{ sign: 'C', line: 3 }] },
  { id: 'cello',        name: 'Cello',           abbreviation: 'Vc.',    family: 'Strings',    midiProgram: 42, staffCount: 1, clefs: [{ sign: 'F', line: 4 }] },
  { id: 'doublebass',   name: 'Double Bass',     abbreviation: 'D.B.',   family: 'Strings',    midiProgram: 43, staffCount: 1, clefs: [{ sign: 'F', line: 4 }], transposition: { diatonic: -7, chromatic: -12 } },
  { id: 'harp',         name: 'Harp',            abbreviation: 'Hp.',    family: 'Strings',    midiProgram: 46, staffCount: 2, clefs: [{ sign: 'G', line: 2 }, { sign: 'F', line: 4 }] },
  { id: 'guitar',       name: 'Guitar',          abbreviation: 'Gtr.',   family: 'Strings',    midiProgram: 25, staffCount: 1, clefs: [{ sign: 'G', line: 2 }], transposition: { diatonic: -7, chromatic: -12 } },
  { id: 'bass_guitar',  name: 'Bass Guitar',     abbreviation: 'B.Gtr.', family: 'Strings',    midiProgram: 33, staffCount: 1, clefs: [{ sign: 'F', line: 4 }], transposition: { diatonic: -7, chromatic: -12 } },

  // ── Woodwinds ──
  { id: 'flute',        name: 'Flute',           abbreviation: 'Fl.',    family: 'Woodwinds',  midiProgram: 73, staffCount: 1, clefs: [{ sign: 'G', line: 2 }] },
  { id: 'piccolo',      name: 'Piccolo',         abbreviation: 'Picc.',  family: 'Woodwinds',  midiProgram: 72, staffCount: 1, clefs: [{ sign: 'G', line: 2 }], transposition: { diatonic: 7, chromatic: 12 } },
  { id: 'oboe',         name: 'Oboe',            abbreviation: 'Ob.',    family: 'Woodwinds',  midiProgram: 68, staffCount: 1, clefs: [{ sign: 'G', line: 2 }] },
  { id: 'englishhorn',  name: 'English Horn',    abbreviation: 'E.H.',   family: 'Woodwinds',  midiProgram: 69, staffCount: 1, clefs: [{ sign: 'G', line: 2 }], transposition: { diatonic: -4, chromatic: -7 } },
  { id: 'clarinet_bb',  name: 'Clarinet in B♭',  abbreviation: 'Cl.',    family: 'Woodwinds',  midiProgram: 71, staffCount: 1, clefs: [{ sign: 'G', line: 2 }], transposition: { diatonic: 1, chromatic: 2 } },
  { id: 'clarinet_a',   name: 'Clarinet in A',   abbreviation: 'Cl.',    family: 'Woodwinds',  midiProgram: 71, staffCount: 1, clefs: [{ sign: 'G', line: 2 }], transposition: { diatonic: 2, chromatic: 3 } },
  { id: 'bassclarinet', name: 'Bass Clarinet',   abbreviation: 'B.Cl.', family: 'Woodwinds',  midiProgram: 71, staffCount: 1, clefs: [{ sign: 'G', line: 2 }], transposition: { diatonic: -6, chromatic: -14 } },
  { id: 'bassoon',      name: 'Bassoon',         abbreviation: 'Bsn.',   family: 'Woodwinds',  midiProgram: 70, staffCount: 1, clefs: [{ sign: 'F', line: 4 }] },
  { id: 'contrabassoon',name: 'Contrabassoon',   abbreviation: 'C.Bn.', family: 'Woodwinds',  midiProgram: 70, staffCount: 1, clefs: [{ sign: 'F', line: 4 }], transposition: { diatonic: -7, chromatic: -12 } },
  { id: 'soprano_sax',  name: 'Soprano Sax',     abbreviation: 'S.Sx.', family: 'Woodwinds',  midiProgram: 64, staffCount: 1, clefs: [{ sign: 'G', line: 2 }], transposition: { diatonic: 1, chromatic: 2 } },
  { id: 'alto_sax',     name: 'Alto Sax',        abbreviation: 'A.Sx.', family: 'Woodwinds',  midiProgram: 65, staffCount: 1, clefs: [{ sign: 'G', line: 2 }], transposition: { diatonic: 3, chromatic: 9 } },
  { id: 'tenor_sax',    name: 'Tenor Sax',       abbreviation: 'T.Sx.', family: 'Woodwinds',  midiProgram: 66, staffCount: 1, clefs: [{ sign: 'G', line: 2 }], transposition: { diatonic: 1, chromatic: 2 } },
  { id: 'bari_sax',     name: 'Baritone Sax',    abbreviation: 'B.Sx.', family: 'Woodwinds',  midiProgram: 67, staffCount: 1, clefs: [{ sign: 'G', line: 2 }], transposition: { diatonic: 3, chromatic: 9 } },

  // ── Brass ──
  { id: 'trumpet_bb',   name: 'Trumpet in B♭',   abbreviation: 'Tpt.',   family: 'Brass',      midiProgram: 56, staffCount: 1, clefs: [{ sign: 'G', line: 2 }], transposition: { diatonic: 1, chromatic: 2 } },
  { id: 'trumpet_c',    name: 'Trumpet in C',    abbreviation: 'Tpt.',   family: 'Brass',      midiProgram: 56, staffCount: 1, clefs: [{ sign: 'G', line: 2 }] },
  { id: 'frenchhorn',   name: 'French Horn in F',abbreviation: 'Hn.',    family: 'Brass',      midiProgram: 60, staffCount: 1, clefs: [{ sign: 'G', line: 2 }], transposition: { diatonic: 4, chromatic: 7 } },
  { id: 'trombone',     name: 'Trombone',        abbreviation: 'Tbn.',   family: 'Brass',      midiProgram: 57, staffCount: 1, clefs: [{ sign: 'F', line: 4 }] },
  { id: 'bass_trombone',name: 'Bass Trombone',   abbreviation: 'B.Tbn.', family: 'Brass',      midiProgram: 57, staffCount: 1, clefs: [{ sign: 'F', line: 4 }] },
  { id: 'euphonium',    name: 'Euphonium',       abbreviation: 'Euph.',  family: 'Brass',      midiProgram: 58, staffCount: 1, clefs: [{ sign: 'F', line: 4 }] },
  { id: 'tuba',         name: 'Tuba',            abbreviation: 'Tba.',   family: 'Brass',      midiProgram: 58, staffCount: 1, clefs: [{ sign: 'F', line: 4 }] },

  // ── Percussion ──
  { id: 'timpani',      name: 'Timpani',         abbreviation: 'Timp.',  family: 'Percussion', midiProgram: 47, staffCount: 1, clefs: [{ sign: 'F', line: 4 }] },
  { id: 'snare',        name: 'Snare Drum',      abbreviation: 'S.D.',   family: 'Percussion', midiProgram: 115, staffCount: 1, clefs: [{ sign: 'percussion', line: 2 }] },
  { id: 'bass_drum',    name: 'Bass Drum',       abbreviation: 'B.D.',   family: 'Percussion', midiProgram: 116, staffCount: 1, clefs: [{ sign: 'percussion', line: 2 }] },
  { id: 'drum_kit',     name: 'Drum Kit',        abbreviation: 'Dr.',    family: 'Percussion', midiProgram: 118, staffCount: 1, clefs: [{ sign: 'percussion', line: 2 }] },
  { id: 'xylophone',    name: 'Xylophone',       abbreviation: 'Xyl.',   family: 'Percussion', midiProgram: 13, staffCount: 1, clefs: [{ sign: 'G', line: 2 }], transposition: { diatonic: 7, chromatic: 12 } },
  { id: 'marimba',      name: 'Marimba',         abbreviation: 'Mar.',   family: 'Percussion', midiProgram: 12, staffCount: 2, clefs: [{ sign: 'G', line: 2 }, { sign: 'F', line: 4 }] },
  { id: 'vibraphone',   name: 'Vibraphone',      abbreviation: 'Vib.',   family: 'Percussion', midiProgram: 11, staffCount: 1, clefs: [{ sign: 'G', line: 2 }] },
  { id: 'glockenspiel', name: 'Glockenspiel',    abbreviation: 'Glock.', family: 'Percussion', midiProgram: 9,  staffCount: 1, clefs: [{ sign: 'G', line: 2 }], transposition: { diatonic: 14, chromatic: 24 } },

  // ── Voice ──
  { id: 'soprano',      name: 'Soprano',         abbreviation: 'S.',     family: 'Voice',      midiProgram: 52, staffCount: 1, clefs: [{ sign: 'G', line: 2 }] },
  { id: 'mezzosoprano', name: 'Mezzo-Soprano',   abbreviation: 'M.S.',   family: 'Voice',      midiProgram: 52, staffCount: 1, clefs: [{ sign: 'G', line: 2 }] },
  { id: 'alto_voice',   name: 'Alto',            abbreviation: 'A.',     family: 'Voice',      midiProgram: 52, staffCount: 1, clefs: [{ sign: 'G', line: 2 }] },
  { id: 'tenor_voice',  name: 'Tenor',           abbreviation: 'T.',     family: 'Voice',      midiProgram: 52, staffCount: 1, clefs: [{ sign: 'G', line: 2 }], transposition: { diatonic: -7, chromatic: -12 } },
  { id: 'baritone_voice',name:'Baritone',        abbreviation: 'Bar.',   family: 'Voice',      midiProgram: 52, staffCount: 1, clefs: [{ sign: 'F', line: 4 }] },
  { id: 'bass_voice',   name: 'Bass',            abbreviation: 'B.',     family: 'Voice',      midiProgram: 52, staffCount: 1, clefs: [{ sign: 'F', line: 4 }] },
];

const FAMILIES = ['Keyboard', 'Strings', 'Woodwinds', 'Brass', 'Percussion', 'Voice'];

const FAMILY_ICONS: Record<string, string> = {
  Keyboard: '🎹', Strings: '🎻', Woodwinds: '🎷', Brass: '🎺', Percussion: '🥁', Voice: '🎤',
};

// ─── Component ────────────────────────────────────────────────────────────────
interface Props {
  currentParts: Part[];
  onSave: (parts: Part[]) => void;
  onCancel: () => void;
}

function defToPart(def: InstrumentDef): Part {
  return {
    id: generateId(),
    instrument: {
      id: generateId(),
      name: def.name,
      abbreviation: def.abbreviation,
      midiProgram: def.midiProgram,
      transposition: def.transposition,
    },
    staffCount: def.staffCount,
    clefs: def.clefs,
    measures: Array.from({ length: 4 }, (_, i) => ({
      id: generateId(),
      number: i + 1,
      elements: [],
      endBarline: { style: i === 3 ? 'final' as const : 'single' as const },
    })),
  };
}

export function InstrumentRoster({ currentParts, onSave, onCancel }: Props) {
  const [selectedFamily, setSelectedFamily] = useState('Strings');
  const [searchQuery, setSearchQuery] = useState('');
  const [parts, setParts] = useState<Part[]>(currentParts);
  const [selectedPartId, setSelectedPartId] = useState<string | null>(parts[0]?.id ?? null);

  const filteredInstruments = INSTRUMENT_CATALOG.filter(inst => {
    const matchesFamily = inst.family === selectedFamily;
    const matchesSearch = searchQuery === '' ||
      inst.name.toLowerCase().includes(searchQuery.toLowerCase());
    return searchQuery ? matchesSearch : matchesFamily;
  });

  const addInstrument = (def: InstrumentDef) => {
    const newPart = defToPart(def);
    setParts(p => [...p, newPart]);
    setSelectedPartId(newPart.id);
  };

  const removePart = (id: string) => {
    if (parts.length <= 1) return; // keep at least one
    const idx = parts.findIndex(p => p.id === id);
    const next = parts[idx + 1] ?? parts[idx - 1];
    setParts(p => p.filter(p2 => p2.id !== id));
    setSelectedPartId(next?.id ?? null);
  };

  const movePart = (id: string, dir: -1 | 1) => {
    const idx = parts.findIndex(p => p.id === id);
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= parts.length) return;
    const arr = [...parts];
    [arr[idx], arr[newIdx]] = [arr[newIdx], arr[idx]];
    setParts(arr);
  };

  return (
    <div style={S.overlay}>
      <div style={S.dialog}>
        {/* Header */}
        <div style={S.header}>
          <div style={S.headerIcon}>🎼</div>
          <div>
            <div style={S.headerTitle}>Score Setup — Instruments</div>
            <div style={S.headerSub}>Add, remove, and reorder the instruments in your score</div>
          </div>
        </div>

        <div style={S.body}>
          {/* ── Left: instrument browser ── */}
          <div style={S.browserPane}>
            <div style={S.browserTitle}>Instrument Library</div>

            {/* Search */}
            <input style={S.searchBox} placeholder="Search instruments…"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)} />

            {/* Family tabs */}
            {!searchQuery && (
              <div style={S.familyTabs}>
                {FAMILIES.map(f => (
                  <div key={f}
                    style={{ ...S.familyTab, ...(selectedFamily === f ? S.familyTabActive : {}) }}
                    onClick={() => setSelectedFamily(f)}>
                    <span style={{ marginRight: 4 }}>{FAMILY_ICONS[f]}</span>{f}
                  </div>
                ))}
              </div>
            )}

            {/* Instrument list */}
            <div style={S.instrumentList}>
              {filteredInstruments.map(inst => (
                <div key={inst.id} style={S.instrumentRow}>
                  <div style={S.instrumentInfo}>
                    <div style={S.instrumentName}>{inst.name}</div>
                    <div style={S.instrumentMeta}>
                      {inst.staffCount === 2 ? 'Grand staff' : inst.clefs[0]?.sign === 'F' ? 'Bass clef' : inst.clefs[0]?.sign === 'C' ? 'Alto/Tenor clef' : 'Treble clef'}
                      {inst.transposition ? ' · Transposing' : ''}
                    </div>
                  </div>
                  <button style={S.addBtn} onClick={() => addInstrument(inst)} title="Add to score">+</button>
                </div>
              ))}
            </div>
          </div>

          {/* ── Right: current roster ── */}
          <div style={S.rosterPane}>
            <div style={S.browserTitle}>Score Roster ({parts.length} part{parts.length !== 1 ? 's' : ''})</div>

            {parts.length === 0 && (
              <div style={{ padding: 20, textAlign: 'center', color: '#aaa', fontSize: 12 }}>
                No instruments yet.<br />Add from the library on the left.
              </div>
            )}

            <div style={S.rosterList}>
              {parts.map((part, idx) => {
                const isSelected = part.id === selectedPartId;
                return (
                  <div key={part.id}
                    style={{ ...S.rosterRow, ...(isSelected ? S.rosterRowActive : {}) }}
                    onClick={() => setSelectedPartId(part.id)}>
                    {/* Order number */}
                    <div style={S.rosterNum}>{idx + 1}</div>

                    {/* Info */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={S.rosterName}>{part.instrument.name}</div>
                      <div style={S.rosterMeta}>{part.instrument.abbreviation} · {part.staffCount === 2 ? 'Grand staff' : '1 staff'}</div>
                    </div>

                    {/* Controls */}
                    <div style={S.rosterControls} onClick={e => e.stopPropagation()}>
                      <button style={S.iconBtn} title="Move up" onClick={() => movePart(part.id, -1)} disabled={idx === 0}>↑</button>
                      <button style={S.iconBtn} title="Move down" onClick={() => movePart(part.id, 1)} disabled={idx === parts.length - 1}>↓</button>
                      <button style={{ ...S.iconBtn, color: '#c44' }} title="Remove" onClick={() => removePart(part.id)} disabled={parts.length <= 1}>✕</button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Tips */}
            <div style={S.tip}>
              <b>Tips:</b> Use ↑↓ to reorder parts. The top part is highest in the score.<br />
              Double-click a part to rename it.
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={S.footer}>
          <button style={S.btnSecondary} onClick={onCancel}>Cancel</button>
          <button style={S.btnPrimary} onClick={() => onSave(parts)}>
            ✓ Apply to Score
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const S: Record<string, React.CSSProperties> = {
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, backdropFilter: 'blur(2px)' },
  dialog: { background: '#fff', borderRadius: 12, width: 720, height: 560, display: 'flex', flexDirection: 'column', boxShadow: '0 24px 64px rgba(0,0,0,0.22)', overflow: 'hidden' },
  header: { display: 'flex', alignItems: 'center', gap: 14, padding: '16px 24px', borderBottom: '0.5px solid #eee', background: '#fafaf8', flexShrink: 0 },
  headerIcon: { width: 36, height: 36, borderRadius: 8, background: '#185FA5', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 },
  headerTitle: { fontSize: 15, fontWeight: 600, color: '#1a1a18' },
  headerSub: { fontSize: 11, color: '#888', marginTop: 1 },
  body: { display: 'flex', flex: 1, overflow: 'hidden' },

  browserPane: { width: 320, borderRight: '0.5px solid #eee', display: 'flex', flexDirection: 'column', overflow: 'hidden' },
  browserTitle: { padding: '10px 14px 6px', fontSize: 11, fontWeight: 600, color: '#888', textTransform: 'uppercase', letterSpacing: 0.5, flexShrink: 0 },
  searchBox: { margin: '0 10px 6px', padding: '6px 10px', border: '1px solid #ddd', borderRadius: 6, fontSize: 12, outline: 'none', flexShrink: 0 },
  familyTabs: { display: 'flex', flexWrap: 'wrap', gap: 4, padding: '0 10px 8px', flexShrink: 0 },
  familyTab: { fontSize: 11, padding: '3px 8px', borderRadius: 12, cursor: 'pointer', border: '1px solid #e0e0de', background: '#fafaf8', color: '#666', whiteSpace: 'nowrap' },
  familyTabActive: { background: '#185FA5', color: 'white', borderColor: '#185FA5' },
  instrumentList: { flex: 1, overflowY: 'auto', padding: '0 10px 10px' },
  instrumentRow: { display: 'flex', alignItems: 'center', padding: '7px 8px', borderRadius: 6, marginBottom: 2, cursor: 'default', background: '#fafaf8', border: '0.5px solid #ededea' },
  instrumentInfo: { flex: 1, minWidth: 0 },
  instrumentName: { fontSize: 12, fontWeight: 500, color: '#1a1a18' },
  instrumentMeta: { fontSize: 10, color: '#aaa', marginTop: 1 },
  addBtn: { width: 24, height: 24, borderRadius: 6, border: 'none', background: '#185FA5', color: 'white', fontSize: 16, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, lineHeight: 1, paddingBottom: 1 },

  rosterPane: { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' },
  rosterList: { flex: 1, overflowY: 'auto', padding: '0 10px 8px' },
  rosterRow: { display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 6, marginBottom: 3, cursor: 'pointer', border: '1px solid #ededea', background: '#fafaf8' },
  rosterRowActive: { background: '#E6F1FB', borderColor: '#B5D4F4' },
  rosterNum: { width: 20, height: 20, borderRadius: '50%', background: '#e8e8e5', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 600, color: '#666', flexShrink: 0 },
  rosterName: { fontSize: 12, fontWeight: 500, color: '#1a1a18' },
  rosterMeta: { fontSize: 10, color: '#aaa', marginTop: 1 },
  rosterControls: { display: 'flex', gap: 2, flexShrink: 0 },
  iconBtn: { width: 22, height: 22, border: '0.5px solid #ddd', borderRadius: 4, background: '#fff', fontSize: 11, cursor: 'pointer', color: '#555', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  tip: { padding: '8px 14px 10px', fontSize: 10, color: '#aaa', lineHeight: 1.5, borderTop: '0.5px solid #eee', flexShrink: 0 },

  footer: { display: 'flex', justifyContent: 'space-between', padding: '12px 20px', borderTop: '0.5px solid #eee', background: '#fafaf8', flexShrink: 0 },
  btnPrimary: { padding: '8px 20px', borderRadius: 6, background: '#185FA5', color: 'white', border: 'none', fontSize: 13, fontWeight: 500, cursor: 'pointer' },
  btnSecondary: { padding: '8px 16px', borderRadius: 6, background: 'transparent', color: '#555', border: '1px solid #ddd', fontSize: 13, cursor: 'pointer' },
};
