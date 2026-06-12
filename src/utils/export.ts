import { Score, Part, Measure, ScoreElement, NoteElement, RestElement, ChordElement, Clef, TimeSignature, KeySignature } from '../types';

function xmlEscape(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function clefXml(clef: Clef, number?: number): string {
  const n = number !== undefined ? ` number="${number + 1}"` : '';
  return `<clef${n}><sign>${clef.sign}</sign><line>${clef.line}</line></clef>`;
}

function timeSigXml(ts: TimeSignature): string {
  return `<time><beats>${ts.beats}</beats><beat-type>${ts.beatType}</beat-type></time>`;
}

function keySigXml(ks: KeySignature): string {
  return `<key><fifths>${ks.fifths}</fifths><mode>${ks.mode}</mode></key>`;
}

function durationXml(value: string, dots: number, divisions = 4): string {
  const divMap: Record<string, number> = {
    whole: divisions * 4, half: divisions * 2, quarter: divisions,
    eighth: divisions / 2, '16th': divisions / 4, '32nd': divisions / 8, '64th': divisions / 16,
    breve: divisions * 8, long: divisions * 16, maxima: divisions * 32,
  };
  const dur = Math.round(divMap[value] ?? divisions);
  let dotXml = '';
  for (let i = 0; i < dots; i++) dotXml += '<dot/>';
  return `<duration>${dur}</duration><type>${value}</type>${dotXml}`;
}

function noteXml(el: NoteElement | ChordElement, isChord = false, divisions = 4): string {
  const pitches = el.type === 'note' ? [(el as NoteElement).pitch] : (el as ChordElement).pitches;
  return pitches.map((pitch, idx) => {
    const chordTag = (isChord || idx > 0) ? '<chord/>' : '';
    const acc = pitch.accidental ? `<accidental>${pitch.accidental}</accidental>` : '';
    return `<note>
      ${chordTag}
      <pitch><step>${pitch.step}</step><octave>${pitch.octave}</octave><alter>${pitch.alter}</alter></pitch>
      ${durationXml(el.duration.value, el.duration.dots, divisions)}
      ${acc}
      <voice>${el.voice}</voice>
      <staff>${(el.staff ?? 0) + 1}</staff>
    </note>`;
  }).join('\n');
}

function restXml(el: RestElement, divisions = 4): string {
  return `<note>
    <rest${el.fullMeasure ? ' measure="yes"' : ''}/>
    ${durationXml(el.duration.value, el.duration.dots, divisions)}
    <voice>${el.voice}</voice>
    <staff>${(el.staff ?? 0) + 1}</staff>
  </note>`;
}

function measureXml(measure: Measure, partIndex: number, isFirst: boolean, divisions = 4): string {
  let attrs = '';
  if (isFirst || measure.timeSignature || measure.keySignature || measure.clefs) {
    const divXml = isFirst ? `<divisions>${divisions}</divisions>` : '';
    const keyXml = measure.keySignature ? keySigXml(measure.keySignature) : '';
    const timeXml = measure.timeSignature ? timeSigXml(measure.timeSignature) : '';
    const clefXmls = measure.clefs ? Object.entries(measure.clefs).map(([i, c]) => clefXml(c, +i)).join('') : '';
    attrs = `<attributes>${divXml}${keyXml}${timeXml}${clefXmls}</attributes>`;
  }

  let tempoDir = '';
  if (measure.tempoMarking) {
    const { bpm, text } = measure.tempoMarking;
    tempoDir = `<direction placement="above"><direction-type><metronome><beat-unit>quarter</beat-unit><per-minute>${bpm}</per-minute></metronome></direction-type></direction>`;
    if (text) {
      tempoDir = `<direction placement="above"><direction-type><words>${xmlEscape(text)}</words></direction-type></direction>` + tempoDir;
    }
  }

  const notesXml = measure.elements.map(el => {
    if (el.type === 'note') return noteXml(el as NoteElement, false, divisions);
    if (el.type === 'chord') return noteXml(el as ChordElement, false, divisions);
    if (el.type === 'rest') return restXml(el as RestElement, divisions);
    return '';
  }).join('\n');

  const barline = measure.endBarline?.style === 'final'
    ? `<barline location="right"><bar-style>light-heavy</bar-style></barline>`
    : '';

  return `<measure number="${measure.number}">${attrs}${tempoDir}${notesXml}${barline}</measure>`;
}

export function exportMusicXml(score: Score): string {
  const partListXml = score.parts.map(p =>
    `<score-part id="${p.id}">
      <part-name>${xmlEscape(p.instrument.name)}</part-name>
      <part-abbreviation>${xmlEscape(p.instrument.abbreviation)}</part-abbreviation>
      <score-instrument id="${p.instrument.id}">
        <instrument-name>${xmlEscape(p.instrument.name)}</instrument-name>
      </score-instrument>
      <midi-instrument id="${p.instrument.id}">
        <midi-program>${p.instrument.midiProgram + 1}</midi-program>
      </midi-instrument>
    </score-part>`
  ).join('\n');

  const partsXml = score.parts.map(p =>
    `<part id="${p.id}">
      ${p.measures.map((m, mi) => measureXml(m, 0, mi === 0)).join('\n')}
    </part>`
  ).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN"
  "http://www.musicxml.org/dtds/partwise.dtd">
<score-partwise version="4.0">
  <work><work-title>${xmlEscape(score.metadata.title)}</work-title></work>
  <identification>
    <creator type="composer">${xmlEscape(score.metadata.composer ?? '')}</creator>
    <encoding>
      <software>Aria Music Notation</software>
      <encoding-date>${new Date().toISOString().slice(0, 10)}</encoding-date>
    </encoding>
  </identification>
  <part-list>${partListXml}</part-list>
  ${partsXml}
</score-partwise>`;
}

export function downloadMusicXml(score: Score) {
  const xml = exportMusicXml(score);
  const blob = new Blob([xml], { type: 'application/vnd.recordare.musicxml+xml' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${score.metadata.title.replace(/\s+/g, '_')}.musicxml`;
  a.click();
  URL.revokeObjectURL(url);
}

export function downloadJson(score: Score) {
  const json = JSON.stringify(score, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${score.metadata.title.replace(/\s+/g, '_')}.aria.json`;
  a.click();
  URL.revokeObjectURL(url);
}
