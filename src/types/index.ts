// ─── Pitch ────────────────────────────────────────────────────────────────────
export type NoteName = 'C' | 'D' | 'E' | 'F' | 'G' | 'A' | 'B';
export type Accidental = 'sharp' | 'flat' | 'natural' | 'double-sharp' | 'double-flat' | null;

export interface Pitch {
  step: NoteName;
  octave: number;        // 0–8, middle C = C4
  accidental: Accidental;
  alter: number;         // semitone offset: -2,-1,0,1,2
}

// ─── Duration ─────────────────────────────────────────────────────────────────
export type DurationValue =
  | 'maxima' | 'long' | 'breve'
  | 'whole' | 'half' | 'quarter'
  | 'eighth' | '16th' | '32nd' | '64th';

export interface Duration {
  value: DurationValue;
  dots: number;          // 0, 1, or 2
  tuplet?: TupletInfo;
}

export interface TupletInfo {
  actual: number;        // e.g. 3 in triplet
  normal: number;        // e.g. 2 in triplet
}

// ─── Note / Rest / Chord ──────────────────────────────────────────────────────
export type ElementType = 'note' | 'rest' | 'chord';

export interface BaseElement {
  id: string;
  type: ElementType;
  duration: Duration;
  voice: 1 | 2 | 3 | 4;
  staff: number;
  beamGroup?: string;    // shared id for beamed notes
  articulations: ArticulationType[];
  dynamics?: DynamicType;
  lyrics?: Lyric[];
}

export interface NoteElement extends BaseElement {
  type: 'note';
  pitch: Pitch;
  stem?: 'up' | 'down' | 'auto';
  tieStart?: boolean;
  tieEnd?: boolean;
  slurStart?: boolean;
  slurEnd?: boolean;
  graceNote?: boolean;
}

export interface ChordElement extends BaseElement {
  type: 'chord';
  pitches: Pitch[];
  stem?: 'up' | 'down' | 'auto';
}

export interface RestElement extends BaseElement {
  type: 'rest';
  fullMeasure?: boolean;
}

export type ScoreElement = NoteElement | ChordElement | RestElement;

// ─── Articulations & Dynamics ─────────────────────────────────────────────────
export type ArticulationType =
  | 'staccato' | 'accent' | 'tenuto' | 'marcato'
  | 'fermata' | 'trill' | 'mordent' | 'turn'
  | 'snap-pizzicato' | 'harmonics';

export type DynamicType = 'pppp' | 'ppp' | 'pp' | 'p' | 'mp' | 'mf' | 'f' | 'ff' | 'fff' | 'ffff' | 'sfz' | 'sfp' | 'fp';

export interface Lyric {
  syllabic: 'single' | 'begin' | 'middle' | 'end';
  text: string;
  verse: number;
}

// ─── Measure ──────────────────────────────────────────────────────────────────
export interface TimeSignature {
  beats: number;
  beatType: number;
}

export interface KeySignature {
  fifths: number;        // -7 to 7 (negative = flats, positive = sharps)
  mode: 'major' | 'minor';
}

export interface Clef {
  sign: 'G' | 'F' | 'C' | 'percussion';
  line: number;
  octaveChange?: -1 | 0 | 1;
}

export interface Barline {
  style: 'single' | 'double' | 'final' | 'repeat-start' | 'repeat-end' | 'dashed' | 'dotted';
}

export interface Measure {
  id: string;
  number: number;
  elements: ScoreElement[];
  timeSignature?: TimeSignature;   // only if changed
  keySignature?: KeySignature;     // only if changed
  clefs?: Record<number, Clef>;    // staffIndex -> clef (only if changed)
  startBarline?: Barline;
  endBarline?: Barline;
  tempoMarking?: TempoMarking;
  rehearsalMark?: string;
  width?: number;                  // override auto-layout
}

export interface TempoMarking {
  bpm: number;
  beatUnit: DurationValue;
  text?: string;                   // e.g. "Allegro con brio"
}

// ─── Part / Staff ─────────────────────────────────────────────────────────────
export interface Instrument {
  id: string;
  name: string;
  abbreviation: string;
  midiProgram: number;
  transposition?: { diatonic: number; chromatic: number };
}

export interface Part {
  id: string;
  instrument: Instrument;
  staffCount: 1 | 2;              // 1 for most, 2 for piano
  clefs: Clef[];                  // one per staff
  measures: Measure[];
  color?: string;
}

// ─── Score ────────────────────────────────────────────────────────────────────
export interface ScoreMetadata {
  title: string;
  subtitle?: string;
  composer?: string;
  lyricist?: string;
  copyright?: string;
  createdAt: string;
  modifiedAt: string;
}

export interface Score {
  id: string;
  metadata: ScoreMetadata;
  parts: Part[];
  globalTimeSignature: TimeSignature;
  globalKeySignature: KeySignature;
  globalTempo: TempoMarking;
  measureCount: number;
}

// ─── Editor State ─────────────────────────────────────────────────────────────
export type Tool = 'select' | 'note-input' | 'erase' | 'dynamics' | 'text';

export interface SelectionRange {
  partId: string;
  measureStart: number;
  measureEnd: number;
  beatStart?: number;
  beatEnd?: number;
}

export interface EditorSelection {
  elementIds: string[];
  range?: SelectionRange;
}

export interface EditorState {
  activeTool: Tool;
  noteInputDuration: DurationValue;
  noteInputDots: number;
  noteInputVoice: 1 | 2 | 3 | 4;
  activeAccidental: Accidental;
  selection: EditorSelection;
  playheadMeasure: number;
  playheadBeat: number;
  isPlaying: boolean;
  zoom: number;            // 0.5 – 2.0
  showMixer: boolean;
  showParts: boolean;
}

// ─── Layout ───────────────────────────────────────────────────────────────────
export interface LayoutSystem {
  partIds: string[];
  measureRange: [number, number];  // inclusive
  y: number;
  height: number;
}

export interface LayoutPage {
  index: number;
  systems: LayoutSystem[];
}
