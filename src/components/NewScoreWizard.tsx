import React, { useState } from 'react';
import type { TimeSignature, KeySignature, TempoMarking, Score, Part, Clef } from '../types';
import { generateId } from '../utils/music';

// ─── Types ────────────────────────────────────────────────────────────────────
interface WizardData {
  title: string;
  composer: string;
  timeSig: TimeSignature;
  keySig: KeySignature;
  tempo: TempoMarking;
  parts: PartDef[];
}

interface PartDef {
  id: string;
  name: string;
  abbreviation: string;
  midiProgram: number;
  staffCount: 1 | 2;
  clefs: Clef[];
  transposition?: { diatonic: number; chromatic: number };
}

interface Props {
  onComplete: (score: Score) => void;
  onCancel: () => void;
}

// ─── Step definitions ─────────────────────────────────────────────────────────
const STEPS = ['Welcome', 'Title & Composer', 'Time Signature', 'Key Signature', 'Tempo', 'Instruments', 'Review'];

// ─── Instrument catalog (same families as InstrumentRoster) ───────────────────
const FAMILIES = ['Keyboard', 'Strings', 'Woodwinds', 'Brass', 'Percussion', 'Voice'] as const;
const FAMILY_ICONS: Record<string, string> = {
  Keyboard: '🎹', Strings: '🎻', Woodwinds: '🎷', Brass: '🎺', Percussion: '🥁', Voice: '🎤',
};

interface InstrumentDef {
  id: string; name: string; abbreviation: string; family: string;
  midiProgram: number; clefs: Clef[]; staffCount: 1 | 2;
  transposition?: { diatonic: number; chromatic: number };
}

const INSTRUMENT_CATALOG: InstrumentDef[] = [
  { id: 'piano',         name: 'Piano',            abbreviation: 'Pno.',   family: 'Keyboard',   midiProgram: 0,   staffCount: 2, clefs: [{ sign: 'G', line: 2 }, { sign: 'F', line: 4 }] },
  { id: 'organ',         name: 'Organ',            abbreviation: 'Org.',   family: 'Keyboard',   midiProgram: 19,  staffCount: 2, clefs: [{ sign: 'G', line: 2 }, { sign: 'F', line: 4 }] },
  { id: 'harpsichord',   name: 'Harpsichord',      abbreviation: 'Hpsd.', family: 'Keyboard',   midiProgram: 6,   staffCount: 2, clefs: [{ sign: 'G', line: 2 }, { sign: 'F', line: 4 }] },
  { id: 'celesta',       name: 'Celesta',          abbreviation: 'Cel.',   family: 'Keyboard',   midiProgram: 8,   staffCount: 1, clefs: [{ sign: 'G', line: 2 }] },
  { id: 'violin',        name: 'Violin',           abbreviation: 'Vln.',   family: 'Strings',    midiProgram: 40,  staffCount: 1, clefs: [{ sign: 'G', line: 2 }] },
  { id: 'viola',         name: 'Viola',            abbreviation: 'Vla.',   family: 'Strings',    midiProgram: 41,  staffCount: 1, clefs: [{ sign: 'C', line: 3 }] },
  { id: 'cello',         name: 'Cello',            abbreviation: 'Vc.',    family: 'Strings',    midiProgram: 42,  staffCount: 1, clefs: [{ sign: 'F', line: 4 }] },
  { id: 'doublebass',    name: 'Double Bass',      abbreviation: 'D.B.',   family: 'Strings',    midiProgram: 43,  staffCount: 1, clefs: [{ sign: 'F', line: 4 }], transposition: { diatonic: -7, chromatic: -12 } },
  { id: 'harp',          name: 'Harp',             abbreviation: 'Hp.',    family: 'Strings',    midiProgram: 46,  staffCount: 2, clefs: [{ sign: 'G', line: 2 }, { sign: 'F', line: 4 }] },
  { id: 'guitar',        name: 'Guitar',           abbreviation: 'Gtr.',   family: 'Strings',    midiProgram: 25,  staffCount: 1, clefs: [{ sign: 'G', line: 2 }], transposition: { diatonic: -7, chromatic: -12 } },
  { id: 'bass_guitar',   name: 'Bass Guitar',      abbreviation: 'B.Gtr.', family: 'Strings',    midiProgram: 33,  staffCount: 1, clefs: [{ sign: 'F', line: 4 }], transposition: { diatonic: -7, chromatic: -12 } },
  { id: 'flute',         name: 'Flute',            abbreviation: 'Fl.',    family: 'Woodwinds',  midiProgram: 73,  staffCount: 1, clefs: [{ sign: 'G', line: 2 }] },
  { id: 'piccolo',       name: 'Piccolo',          abbreviation: 'Picc.',  family: 'Woodwinds',  midiProgram: 72,  staffCount: 1, clefs: [{ sign: 'G', line: 2 }], transposition: { diatonic: 7, chromatic: 12 } },
  { id: 'oboe',          name: 'Oboe',             abbreviation: 'Ob.',    family: 'Woodwinds',  midiProgram: 68,  staffCount: 1, clefs: [{ sign: 'G', line: 2 }] },
  { id: 'englishhorn',   name: 'English Horn',     abbreviation: 'E.H.',   family: 'Woodwinds',  midiProgram: 69,  staffCount: 1, clefs: [{ sign: 'G', line: 2 }], transposition: { diatonic: -4, chromatic: -7 } },
  { id: 'clarinet_bb',   name: 'Clarinet in B♭',   abbreviation: 'Cl.',    family: 'Woodwinds',  midiProgram: 71,  staffCount: 1, clefs: [{ sign: 'G', line: 2 }], transposition: { diatonic: 1, chromatic: 2 } },
  { id: 'bassoon',       name: 'Bassoon',          abbreviation: 'Bsn.',   family: 'Woodwinds',  midiProgram: 70,  staffCount: 1, clefs: [{ sign: 'F', line: 4 }] },
  { id: 'alto_sax',      name: 'Alto Sax',         abbreviation: 'A.Sx.', family: 'Woodwinds',  midiProgram: 65,  staffCount: 1, clefs: [{ sign: 'G', line: 2 }], transposition: { diatonic: 3, chromatic: 9 } },
  { id: 'tenor_sax',     name: 'Tenor Sax',        abbreviation: 'T.Sx.', family: 'Woodwinds',  midiProgram: 66,  staffCount: 1, clefs: [{ sign: 'G', line: 2 }], transposition: { diatonic: 1, chromatic: 2 } },
  { id: 'trumpet_bb',    name: 'Trumpet in B♭',    abbreviation: 'Tpt.',   family: 'Brass',      midiProgram: 56,  staffCount: 1, clefs: [{ sign: 'G', line: 2 }], transposition: { diatonic: 1, chromatic: 2 } },
  { id: 'trumpet_c',     name: 'Trumpet in C',     abbreviation: 'Tpt.',   family: 'Brass',      midiProgram: 56,  staffCount: 1, clefs: [{ sign: 'G', line: 2 }] },
  { id: 'frenchhorn',    name: 'French Horn in F', abbreviation: 'Hn.',    family: 'Brass',      midiProgram: 60,  staffCount: 1, clefs: [{ sign: 'G', line: 2 }], transposition: { diatonic: 4, chromatic: 7 } },
  { id: 'trombone',      name: 'Trombone',         abbreviation: 'Tbn.',   family: 'Brass',      midiProgram: 57,  staffCount: 1, clefs: [{ sign: 'F', line: 4 }] },
  { id: 'tuba',          name: 'Tuba',             abbreviation: 'Tba.',   family: 'Brass',      midiProgram: 58,  staffCount: 1, clefs: [{ sign: 'F', line: 4 }] },
  { id: 'timpani',       name: 'Timpani',          abbreviation: 'Timp.',  family: 'Percussion', midiProgram: 47,  staffCount: 1, clefs: [{ sign: 'F', line: 4 }] },
  { id: 'drum_kit',      name: 'Drum Kit',         abbreviation: 'Dr.',    family: 'Percussion', midiProgram: 118, staffCount: 1, clefs: [{ sign: 'percussion', line: 2 }] },
  { id: 'marimba',       name: 'Marimba',          abbreviation: 'Mar.',   family: 'Percussion', midiProgram: 12,  staffCount: 2, clefs: [{ sign: 'G', line: 2 }, { sign: 'F', line: 4 }] },
  { id: 'vibraphone',    name: 'Vibraphone',       abbreviation: 'Vib.',   family: 'Percussion', midiProgram: 11,  staffCount: 1, clefs: [{ sign: 'G', line: 2 }] },
  { id: 'soprano',       name: 'Soprano',          abbreviation: 'S.',     family: 'Voice',      midiProgram: 52,  staffCount: 1, clefs: [{ sign: 'G', line: 2 }] },
  { id: 'alto_voice',    name: 'Alto',             abbreviation: 'A.',     family: 'Voice',      midiProgram: 52,  staffCount: 1, clefs: [{ sign: 'G', line: 2 }] },
  { id: 'tenor_voice',   name: 'Tenor',            abbreviation: 'T.',     family: 'Voice',      midiProgram: 52,  staffCount: 1, clefs: [{ sign: 'G', line: 2 }], transposition: { diatonic: -7, chromatic: -12 } },
  { id: 'bass_voice',    name: 'Bass',             abbreviation: 'B.',     family: 'Voice',      midiProgram: 52,  staffCount: 1, clefs: [{ sign: 'F', line: 4 }] },
];

const TIME_PRESETS: { label: string; value: TimeSignature }[] = [
  { label: '4/4 — Common time',        value: { beats: 4, beatType: 4 } },
  { label: '3/4 — Waltz',              value: { beats: 3, beatType: 4 } },
  { label: '2/4 — March',              value: { beats: 2, beatType: 4 } },
  { label: '6/8 — Compound duple',     value: { beats: 6, beatType: 8 } },
  { label: '9/8 — Compound triple',    value: { beats: 9, beatType: 8 } },
  { label: '12/8 — Compound quad.',    value: { beats: 12, beatType: 8 } },
  { label: '5/4 — Irregular',          value: { beats: 5, beatType: 4 } },
  { label: '7/8 — Irregular',          value: { beats: 7, beatType: 8 } },
  { label: 'Custom',                   value: { beats: 4, beatType: 4 } },
];

const KEY_PRESETS: { label: string; fifths: number; mode: 'major' | 'minor' }[] = [
  { label: 'C major / A minor',   fifths: 0,  mode: 'major' },
  { label: 'G major / E minor',   fifths: 1,  mode: 'major' },
  { label: 'D major / B minor',   fifths: 2,  mode: 'major' },
  { label: 'A major / F♯ minor',  fifths: 3,  mode: 'major' },
  { label: 'E major / C♯ minor',  fifths: 4,  mode: 'major' },
  { label: 'B major / G♯ minor',  fifths: 5,  mode: 'major' },
  { label: 'F♯ major / D♯ minor', fifths: 6,  mode: 'major' },
  { label: 'F major / D minor',   fifths: -1, mode: 'major' },
  { label: 'B♭ major / G minor',  fifths: -2, mode: 'major' },
  { label: 'E♭ major / C minor',  fifths: -3, mode: 'major' },
  { label: 'A♭ major / F minor',  fifths: -4, mode: 'major' },
  { label: 'D♭ major / B♭ minor', fifths: -5, mode: 'major' },
  { label: 'G♭ major / E♭ minor', fifths: -6, mode: 'major' },
];

const TEMPO_PRESETS: { label: string; bpm: number; text: string }[] = [
  { label: 'Largo',      bpm: 48,  text: 'Largo' },
  { label: 'Adagio',     bpm: 66,  text: 'Adagio' },
  { label: 'Andante',    bpm: 80,  text: 'Andante' },
  { label: 'Moderato',   bpm: 100, text: 'Moderato' },
  { label: 'Allegretto', bpm: 116, text: 'Allegretto' },
  { label: 'Allegro',    bpm: 132, text: 'Allegro' },
  { label: 'Vivace',     bpm: 156, text: 'Vivace' },
  { label: 'Presto',     bpm: 184, text: 'Presto' },
  { label: 'Custom',     bpm: 120, text: '' },
];

// ─── Helper: convert PartDef → Part ──────────────────────────────────────────
function partDefToPart(def: PartDef, timeSig: TimeSignature, keySig: KeySignature, tempo: TempoMarking): Part {
  return {
    id: def.id,
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
      ...(i === 0 ? {
        timeSignature: timeSig,
        keySignature: keySig,
        clefs: Object.fromEntries(def.clefs.map((c, ci) => [ci, c])),
        startBarline: { style: 'single' as const },
        tempoMarking: tempo,
      } : {}),
      endBarline: { style: i === 3 ? 'final' as const : 'single' as const },
    })),
  };
}

// ─── Wizard ───────────────────────────────────────────────────────────────────
export function NewScoreWizard({ onComplete, onCancel }: Props) {
  const [step, setStep] = useState(0);
  const [data, setData] = useState<WizardData>({
    title: '',
    composer: '',
    timeSig: { beats: 4, beatType: 4 },
    keySig: { fifths: 0, mode: 'major' },
    tempo: { bpm: 120, beatUnit: 'quarter', text: 'Moderato' },
    parts: [],   // no default — user picks instruments
  });
  const [customTime, setCustomTime] = useState(false);
  const [customTempo, setCustomTempo] = useState(false);
  const [selectedFamily, setSelectedFamily] = useState<string>('Keyboard');
  const [searchQuery, setSearchQuery] = useState('');

  const update = (patch: Partial<WizardData>) => setData(d => ({ ...d, ...patch }));

  const canNext = () => {
    if (step === 1) return data.title.trim().length > 0;
    if (step === 5) return data.parts.length > 0;  // must have at least one instrument
    return true;
  };

  const next = () => { if (step < STEPS.length - 1) setStep(s => s + 1); };
  const back = () => { if (step > 0) setStep(s => s - 1); };

  const addInstrument = (def: InstrumentDef) => {
    const newPart: PartDef = {
      id: generateId(),
      name: def.name,
      abbreviation: def.abbreviation,
      midiProgram: def.midiProgram,
      staffCount: def.staffCount,
      clefs: def.clefs,
      transposition: def.transposition,
    };
    update({ parts: [...data.parts, newPart] });
  };

  const removeInstrument = (id: string) => {
    update({ parts: data.parts.filter(p => p.id !== id) });
  };

  const moveInstrument = (id: string, dir: -1 | 1) => {
    const idx = data.parts.findIndex(p => p.id === id);
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= data.parts.length) return;
    const arr = [...data.parts];
    [arr[idx], arr[newIdx]] = [arr[newIdx], arr[idx]];
    update({ parts: arr });
  };

  const finish = () => {
    const now = new Date().toISOString();
    const score: Score = {
      id: generateId(),
      metadata: {
        title: data.title.trim(),
        composer: data.composer.trim(),
        createdAt: now,
        modifiedAt: now,
      },
      parts: data.parts.map(def => partDefToPart(def, data.timeSig, data.keySig, data.tempo)),
      globalTimeSignature: data.timeSig,
      globalKeySignature: data.keySig,
      globalTempo: data.tempo,
      measureCount: 4,
    };
    onComplete(score);
  };

  const filteredInstruments = INSTRUMENT_CATALOG.filter(inst =>
    searchQuery
      ? inst.name.toLowerCase().includes(searchQuery.toLowerCase())
      : inst.family === selectedFamily
  );

  return (
    <div style={S.overlay}>
      <div style={S.dialog}>
        {/* Header */}
        <div style={S.header}>
          <div style={S.headerIcon}>♩</div>
          <div>
            <div style={S.headerTitle}>New Score</div>
            <div style={S.headerSub}>Step {step + 1} of {STEPS.length} — {STEPS[step]}</div>
          </div>
        </div>

        {/* Step indicators */}
        <div style={S.stepBar}>
          {STEPS.map((s, i) => (
            <div key={s} style={{ ...S.stepDot, ...(i === step ? S.stepDotActive : i < step ? S.stepDotDone : {}) }}>
              {i < step ? '✓' : i + 1}
            </div>
          ))}
          <div style={{ ...S.stepLine, width: `${(step / (STEPS.length - 1)) * 100}%` }} />
        </div>

        {/* Step content */}
        <div style={S.body}>

          {/* ── Step 0: Welcome ── */}
          {step === 0 && (
            <div style={S.welcomePane}>
              <div style={{ fontSize: 48, marginBottom: 16 }}>🎼</div>
              <div style={S.welcomeTitle}>Welcome to Aria</div>
              <div style={S.welcomeSub}>
                This wizard will guide you through setting up your new score.
                You can change any of these settings later from the Score menu.
              </div>
              <div style={S.featureList}>
                {['Set your title and composer', 'Choose a time signature', 'Select a key signature', 'Set your tempo', 'Add your instruments'].map(f => (
                  <div key={f} style={S.featureItem}>
                    <span style={S.featureCheck}>✓</span> {f}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Step 1: Title & Composer ── */}
          {step === 1 && (
            <div style={S.formPane}>
              <div style={S.fieldGroup}>
                <label style={S.label}>Score Title <span style={{ color: '#e55' }}>*</span></label>
                <input style={S.input} placeholder="e.g. Symphony No. 1 in C minor"
                  value={data.title} onChange={e => update({ title: e.target.value })} autoFocus />
                {data.title.trim().length === 0 && <div style={S.fieldHint}>Required</div>}
              </div>
              <div style={S.fieldGroup}>
                <label style={S.label}>Composer</label>
                <input style={S.input} placeholder="e.g. J. Smith"
                  value={data.composer} onChange={e => update({ composer: e.target.value })} />
              </div>
            </div>
          )}

          {/* ── Step 2: Time Signature ── */}
          {step === 2 && (
            <div style={S.formPane}>
              <div style={S.label}>Choose a time signature</div>
              <div style={S.presetGrid}>
                {TIME_PRESETS.map(p => {
                  const isCustom = p.label === 'Custom';
                  const active = isCustom ? customTime
                    : !customTime && data.timeSig.beats === p.value.beats && data.timeSig.beatType === p.value.beatType;
                  return (
                    <div key={p.label} style={{ ...S.presetCard, ...(active ? S.presetCardActive : {}) }}
                      onClick={() => { if (isCustom) setCustomTime(true); else { setCustomTime(false); update({ timeSig: p.value }); } }}>
                      {!isCustom && <div style={S.timeSigPreview}><span>{p.value.beats}</span><span>{p.value.beatType}</span></div>}
                      {isCustom && <div style={{ fontSize: 22, marginBottom: 4 }}>✎</div>}
                      <div style={S.presetLabel}>{p.label}</div>
                    </div>
                  );
                })}
              </div>
              {customTime && (
                <div style={{ display: 'flex', gap: 12, marginTop: 16, alignItems: 'center' }}>
                  <div style={S.fieldGroup}>
                    <label style={S.label}>Beats</label>
                    <input type="number" min={1} max={32} style={{ ...S.input, width: 80 }}
                      value={data.timeSig.beats} onChange={e => update({ timeSig: { ...data.timeSig, beats: +e.target.value } })} />
                  </div>
                  <div style={{ fontSize: 24, marginTop: 16, color: '#aaa' }}>/</div>
                  <div style={S.fieldGroup}>
                    <label style={S.label}>Beat type</label>
                    <select style={{ ...S.input, width: 80 }} value={data.timeSig.beatType}
                      onChange={e => update({ timeSig: { ...data.timeSig, beatType: +e.target.value } })}>
                      {[2, 4, 8, 16].map(v => <option key={v} value={v}>{v}</option>)}
                    </select>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Step 3: Key Signature ── */}
          {step === 3 && (
            <div style={S.formPane}>
              <div style={S.label}>Choose a key signature</div>
              <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                {(['major', 'minor'] as const).map(m => (
                  <button key={m} style={{ ...S.modeBtn, ...(data.keySig.mode === m ? S.modeBtnActive : {}) }}
                    onClick={() => update({ keySig: { ...data.keySig, mode: m } })}>
                    {m.charAt(0).toUpperCase() + m.slice(1)}
                  </button>
                ))}
              </div>
              <div style={S.keyGrid}>
                {KEY_PRESETS.map(k => {
                  const active = data.keySig.fifths === k.fifths;
                  const accCount = Math.abs(k.fifths);
                  const accType = k.fifths > 0 ? '♯' : k.fifths < 0 ? '♭' : '';
                  return (
                    <div key={k.fifths} style={{ ...S.keyCard, ...(active ? S.presetCardActive : {}) }}
                      onClick={() => update({ keySig: { fifths: k.fifths, mode: data.keySig.mode } })}>
                      <div style={S.keyAccidentals}>{accCount === 0 ? '○' : accType.repeat(accCount)}</div>
                      <div style={S.presetLabel}>{k.label.split(' / ')[data.keySig.mode === 'major' ? 0 : 1]}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── Step 4: Tempo ── */}
          {step === 4 && (
            <div style={S.formPane}>
              <div style={S.label}>Choose a tempo</div>
              <div style={S.presetGrid}>
                {TEMPO_PRESETS.map(p => {
                  const isCustom = p.label === 'Custom';
                  const active = isCustom ? customTempo : !customTempo && data.tempo.text === p.text;
                  return (
                    <div key={p.label} style={{ ...S.presetCard, ...(active ? S.presetCardActive : {}) }}
                      onClick={() => { if (isCustom) setCustomTempo(true); else { setCustomTempo(false); update({ tempo: { bpm: p.bpm, beatUnit: 'quarter', text: p.text } }); } }}>
                      <div style={{ fontSize: 16, fontWeight: 600, color: active ? '#185FA5' : '#333' }}>{p.bpm}</div>
                      <div style={S.presetLabel}>{p.label}</div>
                    </div>
                  );
                })}
              </div>
              {customTempo && (
                <div style={{ marginTop: 16, display: 'flex', gap: 12, alignItems: 'flex-end' }}>
                  <div style={S.fieldGroup}>
                    <label style={S.label}>♩ = BPM</label>
                    <input type="number" min={20} max={400} style={{ ...S.input, width: 80 }}
                      value={data.tempo.bpm} onChange={e => update({ tempo: { ...data.tempo, bpm: +e.target.value } })} />
                  </div>
                  <div style={S.fieldGroup}>
                    <label style={S.label}>Marking (optional)</label>
                    <input style={{ ...S.input, width: 160 }} placeholder="e.g. Allegro con brio"
                      value={data.tempo.text ?? ''} onChange={e => update({ tempo: { ...data.tempo, text: e.target.value } })} />
                  </div>
                </div>
              )}
              <div style={{ marginTop: 16 }}>
                <input type="range" min={20} max={280} value={data.tempo.bpm}
                  style={{ width: '100%', accentColor: '#185FA5' }}
                  onChange={e => { setCustomTempo(true); update({ tempo: { ...data.tempo, bpm: +e.target.value } }); }} />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#aaa' }}>
                  <span>Slow (20)</span><span>Medium (120)</span><span>Fast (280)</span>
                </div>
              </div>
            </div>
          )}

          {/* ── Step 5: Instruments ── */}
          {step === 5 && (
            <div style={{ display: 'flex', gap: 12, height: 320 }}>
              {/* Browser */}
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                <div style={S.label}>Instrument Library</div>
                <input style={{ ...S.input, marginTop: 6, marginBottom: 6 }} placeholder="Search…"
                  value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
                {!searchQuery && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, marginBottom: 6 }}>
                    {FAMILIES.map(f => (
                      <div key={f}
                        style={{ ...S.familyTab, ...(selectedFamily === f ? S.familyTabActive : {}) }}
                        onClick={() => setSelectedFamily(f)}>
                        {FAMILY_ICONS[f]} {f}
                      </div>
                    ))}
                  </div>
                )}
                <div style={{ flex: 1, overflowY: 'auto' }}>
                  {filteredInstruments.map(inst => (
                    <div key={inst.id} style={S.instRow}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 12, fontWeight: 500, color: '#1a1a18' }}>{inst.name}</div>
                        <div style={{ fontSize: 10, color: '#aaa' }}>
                          {inst.staffCount === 2 ? 'Grand staff' : inst.clefs[0]?.sign === 'F' ? 'Bass clef' : inst.clefs[0]?.sign === 'C' ? 'Alto/Tenor clef' : 'Treble clef'}
                          {inst.transposition ? ' · Transposing' : ''}
                        </div>
                      </div>
                      <button style={S.addBtn} onClick={() => addInstrument(inst)}>+</button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Roster */}
              <div style={{ width: 180, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                <div style={S.label}>Your Score ({data.parts.length})</div>
                {data.parts.length === 0 && (
                  <div style={{ marginTop: 12, fontSize: 11, color: '#bbb', textAlign: 'center', lineHeight: 1.6 }}>
                    No instruments yet.<br />Add from the library.
                  </div>
                )}
                <div style={{ flex: 1, overflowY: 'auto', marginTop: 6 }}>
                  {data.parts.map((p, idx) => (
                    <div key={p.id} style={S.rosterRow}>
                      <div style={S.rosterNum}>{idx + 1}</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 11, fontWeight: 500, color: '#1a1a18', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</div>
                        <div style={{ fontSize: 9, color: '#aaa' }}>{p.staffCount === 2 ? 'Grand staff' : '1 staff'}</div>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                        <button style={S.iconBtn} onClick={() => moveInstrument(p.id, -1)} disabled={idx === 0}>↑</button>
                        <button style={S.iconBtn} onClick={() => moveInstrument(p.id, 1)} disabled={idx === data.parts.length - 1}>↓</button>
                        <button style={{ ...S.iconBtn, color: '#c44' }} onClick={() => removeInstrument(p.id)}>✕</button>
                      </div>
                    </div>
                  ))}
                </div>
                {data.parts.length === 0 && (
                  <div style={{ fontSize: 10, color: '#e55', marginTop: 4 }}>At least one instrument required</div>
                )}
              </div>
            </div>
          )}

          {/* ── Step 6: Review ── */}
          {step === 6 && (
            <div style={S.formPane}>
              <div style={{ fontSize: 13, color: '#555', marginBottom: 16 }}>Review your score before creating:</div>
              <div style={S.reviewCard}>
                {[
                  ['Title', data.title || '—'],
                  ['Composer', data.composer || '—'],
                  ['Time Signature', `${data.timeSig.beats}/${data.timeSig.beatType}`],
                  ['Key Signature', `${data.keySig.fifths === 0 ? 'C major / A minor' : Math.abs(data.keySig.fifths) + (data.keySig.fifths > 0 ? ' sharps' : ' flats')} (${data.keySig.mode})`],
                  ['Tempo', `♩ = ${data.tempo.bpm}${data.tempo.text ? ` (${data.tempo.text})` : ''}`],
                  ['Instruments', data.parts.map(p => p.name).join(', ') || '—'],
                ].map(([label, value]) => (
                  <div key={label} style={S.reviewRow}>
                    <span style={S.reviewLabel}>{label}</span>
                    <span style={{ ...S.reviewValue, maxWidth: 280, textAlign: 'right' }}>{value}</span>
                  </div>
                ))}
              </div>
              <div style={{ fontSize: 11, color: '#aaa', marginTop: 12 }}>
                Click "Create Score" to open the editor. You can add or remove instruments at any time from the Score menu.
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={S.footer}>
          <button style={S.btnSecondary} onClick={onCancel}>Cancel</button>
          <div style={{ display: 'flex', gap: 8 }}>
            {step > 0 && <button style={S.btnSecondary} onClick={back}>← Back</button>}
            {step < STEPS.length - 1
              ? <button style={{ ...S.btnPrimary, ...(!canNext() ? S.btnDisabled : {}) }} onClick={next} disabled={!canNext()}>
                  Next →
                </button>
              : <button style={S.btnPrimary} onClick={finish}>🎼 Create Score</button>
            }
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const S: Record<string, React.CSSProperties> = {
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, backdropFilter: 'blur(2px)' },
  dialog: { background: '#fff', borderRadius: 12, width: 620, maxHeight: '92vh', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 64px rgba(0,0,0,0.22)', overflow: 'hidden' },
  header: { display: 'flex', alignItems: 'center', gap: 14, padding: '18px 24px 14px', borderBottom: '0.5px solid #eee', background: '#fafaf8', flexShrink: 0 },
  headerIcon: { width: 38, height: 38, borderRadius: 10, background: '#185FA5', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, color: 'white', flexShrink: 0 },
  headerTitle: { fontSize: 15, fontWeight: 600, color: '#1a1a18' },
  headerSub: { fontSize: 12, color: '#888', marginTop: 2 },
  stepBar: { position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 24px', borderBottom: '0.5px solid #eee', background: '#f8f8f6', flexShrink: 0 },
  stepDot: { width: 22, height: 22, borderRadius: '50%', background: '#e8e8e5', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 600, color: '#aaa', zIndex: 1, position: 'relative' },
  stepDotActive: { background: '#185FA5', color: 'white' },
  stepDotDone: { background: '#5a9c2c', color: 'white' },
  stepLine: { position: 'absolute', left: 24, top: '50%', height: 2, background: '#185FA5', transition: 'width 0.3s', zIndex: 0 },
  body: { flex: 1, overflowY: 'auto', padding: '20px 24px' },
  footer: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 24px', borderTop: '0.5px solid #eee', background: '#fafaf8', flexShrink: 0 },

  welcomePane: { display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', padding: '8px 0' },
  welcomeTitle: { fontSize: 22, fontWeight: 600, color: '#1a1a18', marginBottom: 8 },
  welcomeSub: { fontSize: 13, color: '#666', lineHeight: 1.6, maxWidth: 380, marginBottom: 24 },
  featureList: { textAlign: 'left', width: '100%', maxWidth: 280 },
  featureItem: { fontSize: 13, color: '#444', padding: '5px 0', borderBottom: '0.5px solid #f0f0ee' },
  featureCheck: { color: '#5a9c2c', fontWeight: 700, marginRight: 8 },

  formPane: { display: 'flex', flexDirection: 'column', gap: 4 },
  fieldGroup: { display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 16 },
  label: { fontSize: 12, fontWeight: 500, color: '#555', marginBottom: 2 },
  input: { padding: '7px 10px', border: '1px solid #ddd', borderRadius: 6, fontSize: 13, outline: 'none', width: '100%' },
  fieldHint: { fontSize: 11, color: '#e55' },

  presetGrid: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginTop: 8 },
  presetCard: { padding: '10px 8px', border: '1.5px solid #e8e8e5', borderRadius: 8, cursor: 'pointer', textAlign: 'center', background: '#fafaf8', transition: 'all 0.12s' },
  presetCardActive: { borderColor: '#185FA5', background: '#E6F1FB' },
  presetLabel: { fontSize: 11, color: '#666', marginTop: 2 },
  timeSigPreview: { display: 'flex', flexDirection: 'column', alignItems: 'center', lineHeight: 1, fontSize: 18, fontWeight: 700, color: '#1a1a18' },

  keyGrid: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6, marginTop: 8 },
  keyCard: { padding: '8px 4px', border: '1.5px solid #e8e8e5', borderRadius: 8, cursor: 'pointer', textAlign: 'center', background: '#fafaf8', transition: 'all 0.12s' },
  keyAccidentals: { fontSize: 13, color: '#1a1a18', marginBottom: 2, letterSpacing: -1 },
  modeBtn: { padding: '5px 18px', borderRadius: 20, border: '1.5px solid #ddd', background: '#fafaf8', fontSize: 12, cursor: 'pointer', fontWeight: 500, color: '#555' },
  modeBtnActive: { borderColor: '#185FA5', background: '#E6F1FB', color: '#185FA5' },

  familyTab: { fontSize: 10, padding: '3px 7px', borderRadius: 10, cursor: 'pointer', border: '1px solid #e0e0de', background: '#fafaf8', color: '#666', whiteSpace: 'nowrap' },
  familyTabActive: { background: '#185FA5', color: 'white', borderColor: '#185FA5' },
  instRow: { display: 'flex', alignItems: 'center', padding: '6px 8px', borderRadius: 6, marginBottom: 2, background: '#fafaf8', border: '0.5px solid #ededea' },
  addBtn: { width: 22, height: 22, borderRadius: 5, border: 'none', background: '#185FA5', color: 'white', fontSize: 15, cursor: 'pointer', lineHeight: 1, paddingBottom: 1, flexShrink: 0 },
  rosterRow: { display: 'flex', alignItems: 'center', gap: 6, padding: '5px 6px', borderRadius: 5, marginBottom: 3, border: '0.5px solid #ededea', background: '#fafaf8' },
  rosterNum: { width: 18, height: 18, borderRadius: '50%', background: '#e8e8e5', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 600, color: '#666', flexShrink: 0 },
  iconBtn: { width: 18, height: 18, border: '0.5px solid #ddd', borderRadius: 3, background: '#fff', fontSize: 9, cursor: 'pointer', color: '#555', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 },

  reviewCard: { background: '#f8f8f6', borderRadius: 8, border: '0.5px solid #e8e8e5', overflow: 'hidden' },
  reviewRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '9px 14px', borderBottom: '0.5px solid #eee' },
  reviewLabel: { fontSize: 12, color: '#888', fontWeight: 500, flexShrink: 0 },
  reviewValue: { fontSize: 12, color: '#1a1a18', fontWeight: 500 },

  btnPrimary: { padding: '8px 20px', borderRadius: 6, background: '#185FA5', color: 'white', border: 'none', fontSize: 13, fontWeight: 500, cursor: 'pointer' },
  btnSecondary: { padding: '8px 16px', borderRadius: 6, background: 'transparent', color: '#555', border: '1px solid #ddd', fontSize: 13, cursor: 'pointer' },
  btnDisabled: { opacity: 0.4, cursor: 'not-allowed' },
};
