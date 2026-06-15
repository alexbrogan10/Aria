import { Score, Part, Measure, ScoreElement, NoteElement, RestElement, Clef, TimeSignature, KeySignature, TempoMarking, Pitch, Accidental, DurationValue, ArticulationType } from '../types';
import { generateId } from './music';

// ─── XML helpers ──────────────────────────────────────────────────────────────
function getText(el: Element, selector: string): string {
  return el.querySelector(selector)?.textContent?.trim() ?? '';
}
function getNum(el: Element, selector: string, fallback = 0): number {
  const t = getText(el, selector);
  return t ? parseFloat(t) : fallback;
}
function getAttr(el: Element, attr: string): string {
  return el.getAttribute(attr) ?? '';
}

// ─── Duration mapping ─────────────────────────────────────────────────────────
const TYPE_MAP: Record<string, DurationValue> = {
  maxima: 'maxima', long: 'long', breve: 'breve',
  whole: 'whole', half: 'half', quarter: 'quarter',
  eighth: 'eighth', '16th': '16th', '32nd': '32nd', '64th': '64th',
};

// ─── Accidental mapping ───────────────────────────────────────────────────────
const ACCIDENTAL_MAP: Record<string, Accidental> = {
  sharp: 'sharp', flat: 'flat', natural: 'natural',
  'double-sharp': 'double-sharp', 'flat-flat': 'double-flat',
  'double-flat': 'double-flat',
};

// ─── Clef parsing ─────────────────────────────────────────────────────────────
function parseClef(clefEl: Element): Clef {
  const sign = getText(clefEl, 'sign') as Clef['sign'] || 'G';
  const line = getNum(clefEl, 'line', sign === 'G' ? 2 : sign === 'F' ? 4 : 3);
  const octaveChange = getNum(clefEl, 'clef-octave-change', 0) as -1 | 0 | 1;
  return { sign, line, octaveChange: octaveChange || undefined };
}

// ─── Note parsing ─────────────────────────────────────────────────────────────
function parseNote(noteEl: Element, _divisions: number): ScoreElement | null {
  const isRest  = !!noteEl.querySelector('rest');
  const isGrace = !!noteEl.querySelector('grace');
  const voice   = (parseInt(getText(noteEl, 'voice')) || 1) as 1 | 2 | 3 | 4;
  const staff   = Math.max(0, getNum(noteEl, 'staff', 1) - 1);
  const durValue: DurationValue = TYPE_MAP[getText(noteEl, 'type')] ?? 'quarter';
  const dots    = noteEl.querySelectorAll('dot').length;

  const articulations: ArticulationType[] = [];
  const artics = noteEl.querySelector('articulations');
  if (artics) {
    if (artics.querySelector('staccato'))      articulations.push('staccato');
    if (artics.querySelector('accent'))        articulations.push('accent');
    if (artics.querySelector('tenuto'))        articulations.push('tenuto');
    if (artics.querySelector('strong-accent')) articulations.push('marcato');
  }
  if (noteEl.querySelector('fermata'))     articulations.push('fermata');
  if (noteEl.querySelector('trill-mark')) articulations.push('trill');

  const stemText = getText(noteEl, 'stem');
  const stem     = stemText === 'up' ? 'up' : stemText === 'down' ? 'down' : 'auto';

  if (isRest) {
    const fullMeasure = noteEl.querySelector('rest')?.getAttribute('measure') === 'yes';
    const rest: RestElement = {
      id: generateId(), type: 'rest',
      duration: { value: fullMeasure ? 'whole' : durValue, dots },
      voice, staff, articulations, fullMeasure,
    };
    return rest;
  }

  const pitchEl = noteEl.querySelector('pitch');
  if (!pitchEl) return null;

  const step   = getText(pitchEl, 'step') as Pitch['step'];
  const octave = getNum(pitchEl, 'octave', 4);
  const alter  = getNum(pitchEl, 'alter', 0);

  let accidental: Accidental = null;
  const accEl = noteEl.querySelector('accidental');
  if (accEl)        accidental = ACCIDENTAL_MAP[accEl.textContent?.trim() ?? ''] ?? null;
  else if (alter === 1)  accidental = 'sharp';
  else if (alter === -1) accidental = 'flat';
  else if (alter === 2)  accidental = 'double-sharp';
  else if (alter === -2) accidental = 'double-flat';

  const tieStart = Array.from(noteEl.querySelectorAll('tie')).some(t => t.getAttribute('type') === 'start');
  const tieEnd   = Array.from(noteEl.querySelectorAll('tie')).some(t => t.getAttribute('type') === 'stop');

  const note: NoteElement = {
    id: generateId(), type: 'note',
    pitch: { step, octave, accidental, alter },
    duration: { value: durValue, dots },
    voice, staff, articulations,
    stem: stem as any,
    tieStart, tieEnd,
    graceNote: isGrace,
  };
  return note;
}

// ─── Measure parsing ──────────────────────────────────────────────────────────
interface ParseState {
  divisions: number;
  clefs: Record<number, Clef>;
  timeSig: TimeSignature;
  keySig: KeySignature;
  tempo: TempoMarking;
}

function parseMeasure(measureEl: Element, measureNumber: number, state: ParseState): Measure {
  let timeSignature: TimeSignature | undefined;
  let keySignature:  KeySignature  | undefined;
  let clefs: Record<number, Clef>  | undefined;

  const attrsEl = measureEl.querySelector('attributes');
  if (attrsEl) {
    const divEl = attrsEl.querySelector('divisions');
    if (divEl) state.divisions = parseFloat(divEl.textContent ?? '4');

    const timeEl = attrsEl.querySelector('time');
    if (timeEl) {
      timeSignature = { beats: getNum(timeEl, 'beats', 4), beatType: getNum(timeEl, 'beat-type', 4) };
      state.timeSig = timeSignature;
    }

    const keyEl = attrsEl.querySelector('key');
    if (keyEl) {
      keySignature = { fifths: getNum(keyEl, 'fifths', 0), mode: (getText(keyEl, 'mode') || 'major') as 'major' | 'minor' };
      state.keySig = keySignature;
    }

    attrsEl.querySelectorAll('clef').forEach(clefEl => {
      const num = parseInt(clefEl.getAttribute('number') ?? '1') - 1;
      state.clefs[num] = parseClef(clefEl);
      if (!clefs) clefs = {};
      clefs[num] = state.clefs[num];
    });
  }

  let tempoMarking: TempoMarking | undefined;
  measureEl.querySelectorAll('direction').forEach(dir => {
    const metronome = dir.querySelector('metronome');
    const sound     = dir.querySelector('sound');
    const words     = dir.querySelector('words');
    if (metronome) {
      tempoMarking = { bpm: getNum(metronome, 'per-minute', 120), beatUnit: (getText(metronome, 'beat-unit') || 'quarter') as DurationValue, text: words?.textContent?.trim() ?? '' };
      state.tempo  = tempoMarking;
    } else if (sound?.getAttribute('tempo')) {
      tempoMarking = { bpm: parseFloat(sound.getAttribute('tempo')!), beatUnit: 'quarter', text: words?.textContent?.trim() ?? '' };
      state.tempo  = tempoMarking;
    }
  });

  const barlineEl  = measureEl.querySelector('barline[location="right"]');
  const barStyle   = getText(barlineEl ?? document.createElement('x'), 'bar-style');
  const endBarline = barStyle === 'light-heavy' ? { style: 'final'  as const }
                   : barStyle === 'light-light'  ? { style: 'double' as const }
                   : { style: 'single' as const };

  const elements: ScoreElement[] = [];
  Array.from(measureEl.querySelectorAll('note')).forEach(noteEl => {
    const parsed = parseNote(noteEl, state.divisions);
    if (parsed) elements.push(parsed);
  });

  const measure: Measure = { id: generateId(), number: measureNumber, elements, endBarline };
  if (timeSignature) measure.timeSignature = timeSignature;
  if (keySignature)  measure.keySignature  = keySignature;
  if (clefs)         measure.clefs         = clefs;
  if (tempoMarking)  measure.tempoMarking  = tempoMarking;
  return measure;
}

// ─── Part parsing ─────────────────────────────────────────────────────────────
function parsePart(partEl: Element, partInfo: { name: string; abbreviation: string; midiProgram: number }): Part {
  const partId = getAttr(partEl, 'id') || generateId();
  const state: ParseState = {
    divisions: 4,
    clefs:   { 0: { sign: 'G', line: 2 } },
    timeSig: { beats: 4, beatType: 4 },
    keySig:  { fifths: 0, mode: 'major' },
    tempo:   { bpm: 120, beatUnit: 'quarter', text: '' },
  };

  const measures: Measure[] = Array.from(partEl.querySelectorAll('measure')).map((el, i) =>
    parseMeasure(el, parseInt(el.getAttribute('number') ?? String(i + 1)), state)
  );

  let maxStaff = 0;
  measures.forEach(m => m.elements.forEach(el => { if (el.staff > maxStaff) maxStaff = el.staff; }));
  const staffCount = (maxStaff + 1) as 1 | 2;

  const firstClefs = measures[0]?.clefs ?? {};
  const clefsArray: Clef[] = Array.from({ length: staffCount }, (_, i) =>
    firstClefs[i] ?? state.clefs[i] ?? { sign: i === 0 ? 'G' : 'F', line: i === 0 ? 2 : 4 }
  );

  return {
    id: partId,
    instrument: { id: generateId(), name: partInfo.name, abbreviation: partInfo.abbreviation, midiProgram: partInfo.midiProgram },
    staffCount, clefs: clefsArray, measures,
  };
}

// ─── Core XML → Score ─────────────────────────────────────────────────────────
export function parseMusicXml(xmlString: string): Score {
  const parser = new DOMParser();
  const doc    = parser.parseFromString(xmlString, 'application/xml');

  if (doc.querySelector('parsererror'))
    throw new Error('Invalid MusicXML: could not parse the file.');

  const title    = doc.querySelector('work-title')?.textContent?.trim()
                ?? doc.querySelector('movement-title')?.textContent?.trim()
                ?? 'Untitled Score';
  const subtitle = doc.querySelector('movement-title')?.textContent?.trim() ?? '';
  const composer = doc.querySelector('creator[type="composer"]')?.textContent?.trim()
                ?? doc.querySelector('creator')?.textContent?.trim() ?? '';
  const now = new Date().toISOString();

  const partInfoMap: Record<string, { name: string; abbreviation: string; midiProgram: number }> = {};
  doc.querySelectorAll('score-part').forEach(el => {
    const id = getAttr(el, 'id');
    partInfoMap[id] = {
      name:         getText(el, 'part-name')         || id,
      abbreviation: getText(el, 'part-abbreviation') || id.slice(0, 4),
      midiProgram:  Math.max(0, getNum(el, 'midi-program', 1) - 1),
    };
  });

  const parts: Part[] = Array.from(doc.querySelectorAll('part')).map(partEl => {
    const id   = getAttr(partEl, 'id');
    const info = partInfoMap[id] ?? { name: id, abbreviation: id.slice(0, 4), midiProgram: 0 };
    return parsePart(partEl, info);
  });

  if (parts.length === 0) throw new Error('No parts found in MusicXML file.');

  const firstMeasure        = parts[0].measures[0];
  const globalTimeSignature = firstMeasure?.timeSignature ?? { beats: 4, beatType: 4 };
  const globalKeySignature  = firstMeasure?.keySignature  ?? { fifths: 0, mode: 'major' as const };
  const globalTempo         = firstMeasure?.tempoMarking  ?? { bpm: 120, beatUnit: 'quarter' as DurationValue, text: '' };
  const measureCount        = Math.max(...parts.map(p => p.measures.length));

  parts.forEach(part => {
    while (part.measures.length < measureCount)
      part.measures.push({ id: generateId(), number: part.measures.length + 1, elements: [], endBarline: { style: 'single' } });
  });

  return {
    id: generateId(),
    metadata: { title, subtitle, composer, createdAt: now, modifiedAt: now },
    parts, globalTimeSignature, globalKeySignature, globalTempo, measureCount,
  };
}

// ─── MXL (compressed ZIP) support ────────────────────────────────────────────
async function loadJSZip(): Promise<any> {
  if ((window as any).JSZip) return (window as any).JSZip;
  return new Promise((resolve, reject) => {
    const script  = document.createElement('script');
    script.src    = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
    script.onload = () => resolve((window as any).JSZip);
    script.onerror = () => reject(new Error('Could not load JSZip'));
    document.head.appendChild(script);
  });
}

async function extractMxl(file: File): Promise<string> {
  const JSZip = await loadJSZip();
  const zip   = await JSZip.loadAsync(file);

  // Find root file via META-INF/container.xml
  let rootPath: string | null = null;
  const containerFile = zip.file('META-INF/container.xml');
  if (containerFile) {
    const xml    = await containerFile.async('string');
    const doc    = new DOMParser().parseFromString(xml, 'application/xml');
    rootPath     = doc.querySelector('rootfile')?.getAttribute('full-path') ?? null;
  }

  // Fallback: first .musicxml or .xml file
  if (!rootPath) {
    const xmlFiles = Object.keys(zip.files).filter(n =>
      (n.endsWith('.musicxml') || n.endsWith('.xml')) && !n.startsWith('META-INF') && n !== 'mimetype'
    );
    if (xmlFiles.length === 0) throw new Error('No MusicXML file found inside the .mxl archive.');
    rootPath = xmlFiles[0];
  }

  const xmlFile = zip.file(rootPath);
  if (!xmlFile) throw new Error(`Could not find "${rootPath}" inside the .mxl archive.`);
  return xmlFile.async('string');
}

// ─── Public API ───────────────────────────────────────────────────────────────
export async function readMusicXmlFile(file: File): Promise<Score> {
  const name = file.name.toLowerCase();
  const xml  = (name.endsWith('.mxl') || name.endsWith('.mxml'))
    ? await extractMxl(file)
    : await file.text();
  return parseMusicXml(xml);
}

export function openMusicXmlDialog(): Promise<Score | null> {
  return new Promise(resolve => {
    const input    = document.createElement('input');
    input.type     = 'file';
    input.accept   = '.musicxml,.xml,.mxl,.mxml';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) { resolve(null); return; }
      try   { resolve(await readMusicXmlFile(file)); }
      catch (err) { alert(`Could not open file:\n${(err as Error).message}`); resolve(null); }
    };
    input.click();
  });
}
