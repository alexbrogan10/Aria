import { DurationValue, Pitch, NoteName, Accidental, TimeSignature } from '../types';

// ─── ID generation ────────────────────────────────────────────────────────────
let _idCounter = 0;
export function generateId(): string {
  return `el-${Date.now()}-${++_idCounter}`;
}

// ─── Duration math ────────────────────────────────────────────────────────────
const DURATION_BEATS: Record<DurationValue, number> = {
  maxima: 32, long: 16, breve: 8,
  whole: 4, half: 2, quarter: 1,
  eighth: 0.5, '16th': 0.25, '32nd': 0.125, '64th': 0.0625,
};

export function durationToBeats(value: DurationValue, dots = 0): number {
  let beats = DURATION_BEATS[value];
  let dot = beats / 2;
  for (let i = 0; i < dots; i++) {
    beats += dot;
    dot /= 2;
  }
  return beats;
}

export function beatsToSeconds(beats: number, bpm: number, beatUnit: DurationValue = 'quarter'): number {
  const beatBeats = DURATION_BEATS[beatUnit];
  return (beats / beatBeats) * (60 / bpm);
}

// ─── Pitch math ───────────────────────────────────────────────────────────────
const STEP_SEMITONES: Record<NoteName, number> = {
  C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11,
};

export function pitchToMidi(pitch: Pitch): number {
  const base = (pitch.octave + 1) * 12 + STEP_SEMITONES[pitch.step];
  return base + (pitch.alter ?? 0);
}

export function midiToPitch(midi: number): Pitch {
  const noteNames: NoteName[] = ['C', 'D', 'D', 'E', 'E', 'F', 'F', 'G', 'G', 'A', 'A', 'B'];
  const accidentals: Accidental[] = [null, null, 'sharp', null, 'sharp', null, 'sharp', null, null, null, 'sharp', null];
  const alters = [0, 0, 1, 0, 1, 0, 1, 0, 0, 0, 1, 0];
  const pc = midi % 12;
  const octave = Math.floor(midi / 12) - 1;
  return {
    step: noteNames[pc],
    octave,
    accidental: accidentals[pc],
    alter: alters[pc],
  };
}

export function pitchToStaffPosition(pitch: Pitch, clefSign: 'G' | 'F' | 'C'): number {
  // Returns half-steps from the middle line of the staff (line 3 = 0)
  const DIATONIC: Record<NoteName, number> = { C: 0, D: 1, E: 2, F: 3, G: 4, A: 5, B: 6 };
  const diatonicPos = pitch.octave * 7 + DIATONIC[pitch.step];

  let referencePos: number;
  if (clefSign === 'G') referencePos = 4 * 7 + 4; // G4 sits on line 2 (position 1 from bottom)
  else if (clefSign === 'F') referencePos = 3 * 7 + 5; // F3 sits on line 4 (position -1 from middle)
  else referencePos = 4 * 7 + 0; // C4 sits on middle line

  // Staff middle line is line 3; in G clef that's B4
  const staffMiddle = clefSign === 'G' ? 4 * 7 + 6
                    : clefSign === 'F' ? 2 * 7 + 6
                    : 4 * 7 + 0;

  return diatonicPos - staffMiddle;
}

// ─── Key signature helpers ────────────────────────────────────────────────────
const SHARP_ORDER: NoteName[] = ['F', 'C', 'G', 'D', 'A', 'E', 'B'];
const FLAT_ORDER: NoteName[] = ['B', 'E', 'A', 'D', 'G', 'C', 'F'];

export function getKeyAccidentals(fifths: number): { step: NoteName; accidental: Accidental }[] {
  if (fifths > 0) {
    return SHARP_ORDER.slice(0, fifths).map(step => ({ step, accidental: 'sharp' }));
  } else if (fifths < 0) {
    return FLAT_ORDER.slice(0, -fifths).map(step => ({ step, accidental: 'flat' }));
  }
  return [];
}

export function getKeyName(fifths: number, mode: 'major' | 'minor'): string {
  const majorKeys: Record<number, string> = {
    0: 'C', 1: 'G', 2: 'D', 3: 'A', 4: 'E', 5: 'B', 6: 'F♯',
    '-1': 'F', '-2': 'B♭', '-3': 'E♭', '-4': 'A♭', '-5': 'D♭', '-6': 'G♭',
  };
  const minorKeys: Record<number, string> = {
    0: 'A', 1: 'E', 2: 'B', 3: 'F♯', 4: 'C♯', 5: 'G♯', 6: 'D♯',
    '-1': 'D', '-2': 'G', '-3': 'C', '-4': 'F', '-5': 'B♭', '-6': 'E♭',
  };
  const keys = mode === 'major' ? majorKeys : minorKeys;
  return `${keys[fifths] ?? '?'} ${mode}`;
}

// ─── Measure beat counting ────────────────────────────────────────────────────
export function getMeasureBeats(elements: { duration: { value: DurationValue; dots: number } }[]): number {
  return elements.reduce((sum, el) => sum + durationToBeats(el.duration.value, el.duration.dots), 0);
}

export function isMeasureFull(elements: { duration: { value: DurationValue; dots: number } }[], ts: TimeSignature): boolean {
  const total = getMeasureBeats(elements);
  const capacity = ts.beats * (4 / ts.beatType);
  return Math.abs(total - capacity) < 0.001;
}

// ─── Duration display names ───────────────────────────────────────────────────
export const DURATION_LABELS: Record<DurationValue, string> = {
  maxima: 'Maxima', long: 'Long', breve: 'Breve',
  whole: 'Whole', half: 'Half', quarter: 'Quarter',
  eighth: 'Eighth', '16th': '16th', '32nd': '32nd', '64th': '64th',
};

export const DURATION_UNICODE: Record<DurationValue, string> = {
  maxima: '𝅜', long: '𝅜', breve: '𝅝',
  whole: '𝅝', half: '𝅗𝅥', quarter: '♩',
  eighth: '♪', '16th': '𝅘𝅥𝅯', '32nd': '𝅘𝅥𝅰', '64th': '𝅘𝅥𝅱',
};

// ─── MIDI note name ───────────────────────────────────────────────────────────
export function formatPitch(pitch: Pitch): string {
  const acc = pitch.accidental === 'sharp' ? '♯'
    : pitch.accidental === 'flat' ? '♭'
    : pitch.accidental === 'natural' ? '♮'
    : pitch.accidental === 'double-sharp' ? '𝄪'
    : pitch.accidental === 'double-flat' ? '𝄫'
    : '';
  return `${pitch.step}${acc}${pitch.octave}`;
}

// ─── Note layout: x position within measure ──────────────────────────────────
export function layoutElementsInMeasure(
  elements: { id: string; duration: { value: DurationValue; dots: number } }[],
  measureWidth: number,
  startX: number,
  headerWidth: number
): { id: string; x: number }[] {
  const usable = measureWidth - headerWidth - 8;
  const totalBeats = elements.reduce((s, e) => s + durationToBeats(e.duration.value, e.duration.dots), 0);
  if (totalBeats === 0) return elements.map(el => ({ id: el.id, x: startX + headerWidth }));

  let cursor = startX + headerWidth;
  return elements.map(el => {
    const beats = durationToBeats(el.duration.value, el.duration.dots);
    const x = cursor;
    cursor += (beats / totalBeats) * usable;
    return { id: el.id, x };
  });
}

// ─── Stem direction ──────────────────────────────────────────────────────────
export function autoStemDirection(staffPos: number): 'up' | 'down' {
  // Above middle line → stem down; below → stem up
  return staffPos >= 0 ? 'down' : 'up';
}

// ─── Accidental symbols ───────────────────────────────────────────────────────
export const ACCIDENTAL_SYMBOL: Record<string, string> = {
  sharp: '♯', flat: '♭', natural: '♮', 'double-sharp': '𝄪', 'double-flat': '𝄫',
};
