import { Score, Part, NoteElement, ChordElement, DurationValue } from '../types';
import { pitchToMidi, durationToBeats, beatsToSeconds } from './music';

// ─── Audio Engine ─────────────────────────────────────────────────────────────
export class PlaybackEngine {
  private ctx: AudioContext | null = null;
  private scheduledNodes: AudioBufferSourceNode[] = [];
  private gainNode: GainNode | null = null;
  private startTime = 0;
  private startBeat = 0;
  private onBeatCallback?: (beat: number, measure: number) => void;
  private animFrame = 0;
  private isRunning = false;

  private getContext(): AudioContext {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.gainNode = this.ctx.createGain();
      this.gainNode.connect(this.ctx.destination);
      this.gainNode.gain.value = 0.6;
    }
    return this.ctx;
  }

  // Synthesize a simple plucked string / piano-ish tone
  private scheduleNote(
    midi: number,
    startSec: number,
    durationSec: number,
    velocity = 0.7
  ) {
    const ctx = this.getContext();
    if (!this.gainNode) return;

    const freq = 440 * Math.pow(2, (midi - 69) / 12);
    const env = ctx.createGain();
    env.connect(this.gainNode);

    // Oscillator stack for richer tone
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    osc1.type = 'triangle';
    osc2.type = 'sine';
    osc1.frequency.value = freq;
    osc2.frequency.value = freq * 2.01;

    const mix = ctx.createGain();
    mix.gain.value = 0.7;
    osc1.connect(mix);
    const mix2 = ctx.createGain();
    mix2.gain.value = 0.3;
    osc2.connect(mix2);
    mix.connect(env);
    mix2.connect(env);

    // ADSR-like envelope
    const attack = 0.005;
    const release = Math.min(durationSec * 0.4, 0.8);
    env.gain.setValueAtTime(0, startSec);
    env.gain.linearRampToValueAtTime(velocity, startSec + attack);
    env.gain.setValueAtTime(velocity * 0.8, startSec + attack + 0.02);
    env.gain.exponentialRampToValueAtTime(0.001, startSec + durationSec);

    osc1.start(startSec);
    osc2.start(startSec);
    osc1.stop(startSec + durationSec + release);
    osc2.stop(startSec + durationSec + release);
  }

  play(score: Score, fromMeasure = 0, onBeat?: (beat: number, measure: number) => void) {
    this.stop();
    const ctx = this.getContext();
    this.onBeatCallback = onBeat;
    this.isRunning = true;

    const { bpm, beatUnit } = score.globalTempo;
    this.startTime = ctx.currentTime + 0.05;
    let globalBeat = 0;

    for (const part of score.parts) {
      let measureBeat = 0;
      for (let mi = fromMeasure; mi < part.measures.length; mi++) {
        const measure = part.measures[mi];
        const ts = measure.timeSignature ?? score.globalTimeSignature;
        const measureCapacity = ts.beats * (4 / ts.beatType);

        for (const el of measure.elements) {
          const elBeats = durationToBeats(el.duration.value, el.duration.dots);
          const startSec = this.startTime + beatsToSeconds(measureBeat + (mi * measureCapacity), bpm, beatUnit);
          const durSec = beatsToSeconds(elBeats, bpm, beatUnit);

          if (el.type === 'note') {
            const midi = pitchToMidi((el as NoteElement).pitch);
            this.scheduleNote(midi, startSec, durSec);
          } else if (el.type === 'chord') {
            for (const pitch of (el as ChordElement).pitches) {
              const midi = pitchToMidi(pitch);
              this.scheduleNote(midi, startSec, durSec);
            }
          }
        }
      }
    }

    this.tickPlayhead(score, fromMeasure, bpm, beatUnit);
  }

  private tickPlayhead(score: Score, fromMeasure: number, bpm: number, beatUnit: DurationValue) {
    if (!this.isRunning || !this.ctx) return;
    const ctx = this.ctx;
    const elapsed = ctx.currentTime - this.startTime;
    const beatsElapsed = elapsed * (bpm / 60) * (durationToBeats(beatUnit));

    // Calculate current measure and beat
    const { beats, beatType } = score.globalTimeSignature;
    const measureBeats = beats * (4 / beatType);
    const totalMeasures = score.measureCount;
    const currentMeasure = Math.min(fromMeasure + Math.floor(beatsElapsed / measureBeats), totalMeasures - 1);
    const currentBeat = beatsElapsed % measureBeats;

    this.onBeatCallback?.(currentBeat, currentMeasure);

    if (currentMeasure >= totalMeasures - 1 && currentBeat >= measureBeats - 0.01) {
      this.isRunning = false;
      this.onBeatCallback?.(-1, -1); // signal stop
      return;
    }

    this.animFrame = requestAnimationFrame(() => this.tickPlayhead(score, fromMeasure, bpm, beatUnit));
  }

  stop() {
    this.isRunning = false;
    cancelAnimationFrame(this.animFrame);
    if (this.ctx && this.gainNode) {
      this.gainNode.gain.setTargetAtTime(0, this.ctx.currentTime, 0.05);
    }
    setTimeout(() => {
      if (this.gainNode && this.ctx) {
        this.gainNode.gain.value = 0.6;
      }
    }, 200);
  }

  setVolume(v: number) {
    if (this.gainNode) this.gainNode.gain.value = Math.max(0, Math.min(1, v));
  }

  async resume() {
    if (this.ctx?.state === 'suspended') await this.ctx.resume();
  }
}

export const playbackEngine = new PlaybackEngine();
