import Soundfont from 'soundfont-player';
import { Score, NoteElement, ChordElement, DurationValue } from '../types';
import { pitchToMidi, durationToBeats, beatsToSeconds } from './music';

// ─── MIDI program → soundfont instrument name ─────────────────────────────────
const MIDI_TO_INSTRUMENT: Record<number, string> = {
  0:  'acoustic_grand_piano',  1:  'bright_acoustic_piano',
  2:  'electric_grand_piano',  3:  'honkytonk_piano',
  4:  'electric_piano_1',      5:  'electric_piano_2',
  6:  'harpsichord',           7:  'clavinet',
  8:  'celesta',               9:  'glockenspiel',
  10: 'music_box',             11: 'vibraphone',
  12: 'marimba',               13: 'xylophone',
  14: 'tubular_bells',         15: 'dulcimer',
  16: 'drawbar_organ',         17: 'percussive_organ',
  18: 'rock_organ',            19: 'church_organ',
  20: 'reed_organ',            21: 'accordion',
  22: 'harmonica',             23: 'tango_accordion',
  24: 'acoustic_guitar_nylon', 25: 'acoustic_guitar_steel',
  26: 'electric_guitar_jazz',  27: 'electric_guitar_clean',
  28: 'electric_guitar_muted', 29: 'overdriven_guitar',
  30: 'distortion_guitar',     31: 'guitar_harmonics',
  32: 'acoustic_bass',         33: 'electric_bass_finger',
  34: 'electric_bass_pick',    35: 'fretless_bass',
  36: 'slap_bass_1',           37: 'slap_bass_2',
  38: 'synth_bass_1',          39: 'synth_bass_2',
  40: 'violin',                41: 'viola',
  42: 'cello',                 43: 'contrabass',
  44: 'tremolo_strings',       45: 'pizzicato_strings',
  46: 'orchestral_harp',       47: 'timpani',
  48: 'string_ensemble_1',     49: 'string_ensemble_2',
  50: 'synth_strings_1',       51: 'synth_strings_2',
  52: 'choir_aahs',            53: 'voice_oohs',
  54: 'synth_voice',           55: 'orchestra_hit',
  56: 'trumpet',               57: 'trombone',
  58: 'tuba',                  59: 'muted_trumpet',
  60: 'french_horn',           61: 'brass_section',
  62: 'synth_brass_1',         63: 'synth_brass_2',
  64: 'soprano_sax',           65: 'alto_sax',
  66: 'tenor_sax',             67: 'baritone_sax',
  68: 'oboe',                  69: 'english_horn',
  70: 'bassoon',               71: 'clarinet',
  72: 'piccolo',               73: 'flute',
  74: 'recorder',              75: 'pan_flute',
  76: 'blown_bottle',          77: 'shakuhachi',
  78: 'whistle',               79: 'ocarina',
  80: 'lead_1_square',         81: 'lead_2_sawtooth',
  115: 'woodblock',            116: 'taiko_drum',
  117: 'melodic_tom',          118: 'synth_drum',
};

function instName(midiProgram: number): string {
  return MIDI_TO_INSTRUMENT[midiProgram] ?? 'acoustic_grand_piano';
}

// MIDI note number → note name string (e.g. 60 → 'C4', 61 → 'Db4')
function midiToNote(midi: number): string {
  const NAMES = ['C','Db','D','Eb','E','F','F#','G','Ab','A','Bb','B'];
  return `${NAMES[midi % 12]}${Math.floor(midi / 12) - 1}`;
}

// ─── Scheduled event ──────────────────────────────────────────────────────────
interface ScheduledNote {
  player:    any;      // soundfont-player instance
  note:      string;   // e.g. 'C4'
  startTime: number;   // AudioContext time
  duration:  number;   // seconds
  gain:      number;   // 0–1
  node?:     any;      // returned by player.play(), used to stop early
}

// ─── PlaybackEngine ───────────────────────────────────────────────────────────
export class PlaybackEngine {
  private ctx:        AudioContext | null = null;
  private masterGain: GainNode    | null = null;

  // Instrument cache: name → soundfont player instance
  private cache   = new Map<string, any>();
  private loading = new Map<string, Promise<any>>();

  // Currently active note nodes (for stopping mid-playback)
  private activeNodes: any[] = [];

  private animFrame  = 0;
  private isRunning  = false;
  private startTime  = 0;          // AudioContext time when playback began
  private startBeat  = 0;          // which beat we started from
  private totalBeats = 0;          // total beats in score from fromMeasure

  private onBeatCb?: (beat: number, measure: number) => void;

  // ── AudioContext ─────────────────────────────────────────────────────────────
  private ctx_(): AudioContext {
    if (!this.ctx) {
      this.ctx        = new AudioContext();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = 0.8;
      this.masterGain.connect(this.ctx.destination);
    }
    return this.ctx;
  }

  async resume() {
    if (this.ctx?.state === 'suspended') await this.ctx.resume();
  }

  // ── Load one instrument ───────────────────────────────────────────────────────
  private async load(name: string): Promise<any> {
    if (this.cache.has(name))   return this.cache.get(name)!;
    if (this.loading.has(name)) return this.loading.get(name)!;

    const ctx = this.ctx_();
    const p   = Soundfont.instrument(ctx, name as any, {
      format:     'mp3',
      soundfont:  'MusyngKite',
      destination: this.masterGain!,
    })
    .then((player: any) => {
      this.cache.set(name, player);
      this.loading.delete(name);
      return player;
    })
    .catch(() => {
      this.loading.delete(name);
      // Fall back to piano if the instrument fails
      if (name !== 'acoustic_grand_piano')
        return this.load('acoustic_grand_piano');
      throw new Error('Could not load piano soundfont');
    });

    this.loading.set(name, p);
    return p;
  }

  // ── Preload all instruments in a score (call before play for instant start) ──
  async preload(score: Score): Promise<void> {
    const names = new Set(score.parts.map(p => instName(p.instrument.midiProgram)));
    await Promise.all([...names].map(n => this.load(n)));
  }

  // ── Play ─────────────────────────────────────────────────────────────────────
  async play(
    score:       Score,
    fromMeasure  = 0,
    onBeat?:     (beat: number, measure: number) => void,
  ): Promise<void> {
    this.stop();
    await this.resume();

    this.onBeatCb = onBeat;
    this.isRunning = true;

    const ctx  = this.ctx_();
    const { bpm, beatUnit } = score.globalTempo;
    const ts   = score.globalTimeSignature;
    const measBeats = ts.beats * (4 / ts.beatType);

    // Give 120ms startup buffer so first notes aren't clipped
    this.startTime  = ctx.currentTime + 0.12;
    this.startBeat  = fromMeasure * measBeats;
    this.totalBeats = score.measureCount * measBeats - this.startBeat;

    // Collect ALL scheduled notes across ALL parts, then play them
    const scheduled: ScheduledNote[] = [];

    await Promise.all(score.parts.map(async part => {
      const player = await this.load(instName(part.instrument.midiProgram));
      let beatPos  = 0; // beats from start of score

      for (let mi = 0; mi < part.measures.length; mi++) {
        const meas     = part.measures[mi];
        const mTs      = meas.timeSignature ?? score.globalTimeSignature;
        const mBeats   = mTs.beats * (4 / mTs.beatType);

        if (mi < fromMeasure) { beatPos += mBeats; continue; }

        for (const el of meas.elements) {
          const elBeats  = durationToBeats(el.duration.value, el.duration.dots);
          const relBeats = beatPos - this.startBeat;
          const startSec = this.startTime + beatsToSeconds(relBeats, bpm, beatUnit);
          const durSec   = Math.max(0.05, beatsToSeconds(elBeats, bpm, beatUnit) * 0.92);

          if (el.type === 'note') {
            const midi = pitchToMidi((el as NoteElement).pitch);
            if (midi >= 0 && midi <= 127) {
              scheduled.push({ player, note: midiToNote(midi), startTime: startSec, duration: durSec, gain: 0.82 });
            }
          } else if (el.type === 'chord') {
            for (const pitch of (el as ChordElement).pitches) {
              const midi = pitchToMidi(pitch);
              if (midi >= 0 && midi <= 127) {
                scheduled.push({ player, note: midiToNote(midi), startTime: startSec, duration: durSec, gain: 0.75 });
              }
            }
          }

          beatPos += elBeats;
        }

        // Advance past any unused space in the measure
        const used = meas.elements.reduce(
          (s, el) => s + durationToBeats(el.duration.value, el.duration.dots), 0);
        beatPos += Math.max(0, mBeats - used);
      }
    }));

    // Fire all notes using soundfont-player's play() method with exact timing
    this.activeNodes = [];
    for (const s of scheduled) {
      const offsetFromNow = s.startTime - ctx.currentTime;
      if (offsetFromNow < -0.05) continue; // skip notes already in the past
      // player.play(note, audioContextTime, options)
      const node = s.player.play(s.note, s.startTime, {
        duration: s.duration,
        gain:     s.gain,
      });
      if (node) this.activeNodes.push(node);
    }

    // Start playhead animation
    this.tick(score, fromMeasure, bpm, beatUnit, measBeats);
  }

  // ── Playhead ticker ───────────────────────────────────────────────────────────
  private tick(
    score:      Score,
    fromMeasure: number,
    bpm:        number,
    beatUnit:   DurationValue,
    measBeats:  number,
  ) {
    if (!this.isRunning || !this.ctx) return;

    const elapsed      = Math.max(0, this.ctx.currentTime - this.startTime);
    const beatsElapsed = elapsed * (bpm / 60) * durationToBeats(beatUnit);

    const absoluteBeat  = this.startBeat + beatsElapsed;
    const currentMeasure = Math.min(
      Math.floor(absoluteBeat / measBeats),
      score.measureCount - 1,
    );
    const currentBeat   = absoluteBeat % measBeats;

    this.onBeatCb?.(currentBeat, currentMeasure);

    if (beatsElapsed >= this.totalBeats) {
      this.isRunning = false;
      this.onBeatCb?.(-1, -1);
      return;
    }

    this.animFrame = requestAnimationFrame(() =>
      this.tick(score, fromMeasure, bpm, beatUnit, measBeats));
  }

  // ── Stop ──────────────────────────────────────────────────────────────────────
  stop() {
    this.isRunning = false;
    cancelAnimationFrame(this.animFrame);

    // Stop all active note nodes
    for (const node of this.activeNodes) {
      try { node.stop?.(); } catch {}
    }
    this.activeNodes = [];

    // Also call stop on each cached player to clear their internal queues
    this.cache.forEach(player => {
      try { player.stop?.(); } catch {}
    });
  }

  // ── Volume (0–1) ──────────────────────────────────────────────────────────────
  setVolume(v: number) {
    if (this.masterGain)
      this.masterGain.gain.value = Math.max(0, Math.min(1, v));
  }

  // ── Is loading? ───────────────────────────────────────────────────────────────
  get isLoading(): boolean {
    return this.loading.size > 0;
  }
}

export const playbackEngine = new PlaybackEngine();
