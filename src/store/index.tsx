import { createContext, useContext, useReducer, useCallback, ReactNode } from 'react';
import {
  Score, Part, Measure, ScoreElement, NoteElement, RestElement, ChordElement,
  EditorState, EditorSelection, Tool, DurationValue, Accidental,
  TimeSignature, KeySignature, Clef, TempoMarking, Pitch, ArticulationType
} from '../types';
import { generateId, durationToBeats, pitchToMidi } from '../utils/music';

// ─── Actions ──────────────────────────────────────────────────────────────────
type Action =
  | { type: 'SET_TOOL'; tool: Tool }
  | { type: 'SET_DURATION'; duration: DurationValue }
  | { type: 'SET_DOTS'; dots: number }
  | { type: 'SET_VOICE'; voice: 1 | 2 | 3 | 4 }
  | { type: 'SET_ACCIDENTAL'; accidental: Accidental }
  | { type: 'SELECT_ELEMENTS'; ids: string[] }
  | { type: 'CLEAR_SELECTION' }
  | { type: 'SET_ZOOM'; zoom: number }
  | { type: 'SET_PLAYING'; playing: boolean }
  | { type: 'SET_PLAYHEAD'; measure: number; beat: number }
  | { type: 'TOGGLE_MIXER' }
  | { type: 'TOGGLE_PARTS' }
  | { type: 'INSERT_NOTE'; partId: string; measureId: string; pitch: Pitch; afterElementId?: string }
  | { type: 'INSERT_REST'; partId: string; measureId: string; afterElementId?: string }
  | { type: 'DELETE_SELECTED' }
  | { type: 'SET_ARTICULATION'; elementIds: string[]; articulation: ArticulationType }
  | { type: 'ADD_MEASURE'; partId?: string }
  | { type: 'SET_TITLE'; title: string }
  | { type: 'SET_COMPOSER'; composer: string }
  | { type: 'SET_TEMPO'; bpm: number; text?: string }
  | { type: 'LOAD_SCORE'; score: Score }
  | { type: 'TRANSPOSE_NOTE'; elementIds: string[]; steps: number; semitones: number }
  | { type: 'UNDO' }
  | { type: 'REDO' };

// ─── State ────────────────────────────────────────────────────────────────────
interface AppState {
  score: Score;
  editor: EditorState;
  history: Score[];
  future: Score[];
}

// ─── Initial score ────────────────────────────────────────────────────────────
function makeInitialScore(): Score {
  const now = new Date().toISOString();
  const globalTime: TimeSignature = { beats: 4, beatType: 4 };
  const globalKey: KeySignature = { fifths: -3, mode: 'minor' };
  const globalTempo: TempoMarking = { bpm: 132, beatUnit: 'quarter', text: 'Allegro con brio' };

  const violinPart: Part = {
    id: 'part-vln1',
    instrument: {
      id: 'inst-vln1',
      name: 'Violin I',
      abbreviation: 'Vln. I',
      midiProgram: 40,
    },
    staffCount: 1,
    clefs: [{ sign: 'G', line: 2 }],
    measures: [
      makeMeasure(1, globalTime, globalKey, [{ sign: 'G', line: 2 }], true),
      makeMeasure(2),
      makeMeasure(3),
      makeMeasure(4),
    ],
  };

  const pianoPart: Part = {
    id: 'part-pno',
    instrument: {
      id: 'inst-pno',
      name: 'Piano',
      abbreviation: 'Pno.',
      midiProgram: 0,
    },
    staffCount: 2,
    clefs: [{ sign: 'G', line: 2 }, { sign: 'F', line: 4 }],
    measures: [
      makeMeasure(1, globalTime, globalKey, [{ sign: 'G', line: 2 }, { sign: 'F', line: 4 }], true),
      makeMeasure(2),
      makeMeasure(3),
      makeMeasure(4),
    ],
  };

  return {
    id: generateId(),
    metadata: {
      title: 'Symphony No. 1 in C minor',
      subtitle: 'Movement I',
      composer: 'J. Smith',
      createdAt: now,
      modifiedAt: now,
    },
    parts: [violinPart, pianoPart],
    globalTimeSignature: globalTime,
    globalKeySignature: globalKey,
    globalTempo,
    measureCount: 4,
  };
}

function makeMeasure(
  number: number,
  timeSignature?: TimeSignature,
  keySignature?: KeySignature,
  clefs?: Clef[],
  isFirst?: boolean
): Measure {
  const m: Measure = {
    id: generateId(),
    number,
    elements: [],
    endBarline: { style: 'single' },
  };
  if (isFirst) {
    m.timeSignature = timeSignature;
    m.keySignature = keySignature;
    m.clefs = clefs ? Object.fromEntries(clefs.map((c, i) => [i, c])) : undefined;
    m.startBarline = { style: 'single' };
  }
  return m;
}

const initialEditorState: EditorState = {
  activeTool: 'note-input',
  noteInputDuration: 'quarter',
  noteInputDots: 0,
  noteInputVoice: 1,
  activeAccidental: null,
  selection: { elementIds: [] },
  playheadMeasure: 0,
  playheadBeat: 0,
  isPlaying: false,
  zoom: 1,
  showMixer: false,
  showParts: true,
};

const initialState: AppState = {
  score: makeInitialScore(),
  editor: initialEditorState,
  history: [],
  future: [],
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function updateScore(state: AppState, newScore: Score): AppState {
  return {
    ...state,
    score: { ...newScore, metadata: { ...newScore.metadata, modifiedAt: new Date().toISOString() } },
    history: [...state.history.slice(-49), state.score],
    future: [],
  };
}

function updatePart(score: Score, partId: string, updater: (p: Part) => Part): Score {
  return { ...score, parts: score.parts.map(p => p.id === partId ? updater(p) : p) };
}

function updateMeasure(part: Part, measureId: string, updater: (m: Measure) => Measure): Part {
  return { ...part, measures: part.measures.map(m => m.id === measureId ? updater(m) : m) };
}

// ─── Reducer ──────────────────────────────────────────────────────────────────
function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {

    case 'SET_TOOL':
      return { ...state, editor: { ...state.editor, activeTool: action.tool } };

    case 'SET_DURATION':
      return { ...state, editor: { ...state.editor, noteInputDuration: action.duration } };

    case 'SET_DOTS':
      return { ...state, editor: { ...state.editor, noteInputDots: action.dots } };

    case 'SET_VOICE':
      return { ...state, editor: { ...state.editor, noteInputVoice: action.voice } };

    case 'SET_ACCIDENTAL':
      return { ...state, editor: { ...state.editor, activeAccidental: action.accidental } };

    case 'SELECT_ELEMENTS':
      return { ...state, editor: { ...state.editor, selection: { elementIds: action.ids } } };

    case 'CLEAR_SELECTION':
      return { ...state, editor: { ...state.editor, selection: { elementIds: [] } } };

    case 'SET_ZOOM':
      return { ...state, editor: { ...state.editor, zoom: Math.max(0.5, Math.min(2, action.zoom)) } };

    case 'SET_PLAYING':
      return { ...state, editor: { ...state.editor, isPlaying: action.playing } };

    case 'SET_PLAYHEAD':
      return { ...state, editor: { ...state.editor, playheadMeasure: action.measure, playheadBeat: action.beat } };

    case 'TOGGLE_MIXER':
      return { ...state, editor: { ...state.editor, showMixer: !state.editor.showMixer } };

    case 'TOGGLE_PARTS':
      return { ...state, editor: { ...state.editor, showParts: !state.editor.showParts } };

    case 'INSERT_NOTE': {
      const { partId, measureId, pitch } = action;
      const { noteInputDuration: value, noteInputDots: dots, noteInputVoice: voice } = state.editor;

      // Check beat capacity before inserting
      const targetPart = state.score.parts.find(p => p.id === partId);
      const targetMeasure = targetPart?.measures.find(m => m.id === measureId);
      if (targetMeasure) {
        const ts = targetMeasure.timeSignature ?? state.score.globalTimeSignature;
        const capacity = ts.beats * (4 / ts.beatType);
        const used = targetMeasure.elements.reduce((s, el) =>
          s + durationToBeats(el.duration.value, el.duration.dots), 0);
        const noteBeats = durationToBeats(value, dots);
        if (noteBeats > capacity - used + 0.001) return state; // silently block
      }
      const newNote: NoteElement = {
        id: generateId(),
        type: 'note',
        pitch: { ...pitch, accidental: state.editor.activeAccidental },
        duration: { value, dots },
        voice,
        staff: 0,
        articulations: [],
      };
      const newScore = updatePart(state.score, partId, part =>
        updateMeasure(part, measureId, measure => ({
          ...measure,
          elements: [...measure.elements, newNote],
        }))
      );
      return {
        ...updateScore(state, newScore),
        editor: { ...state.editor, selection: { elementIds: [newNote.id] } },
      };
    }

    case 'INSERT_REST': {
      const { partId, measureId } = action;
      const { noteInputDuration: value, noteInputDots: dots, noteInputVoice: voice } = state.editor;
      const newRest: RestElement = {
        id: generateId(),
        type: 'rest',
        duration: { value, dots },
        voice,
        staff: 0,
        articulations: [],
      };
      const newScore = updatePart(state.score, partId, part =>
        updateMeasure(part, measureId, measure => ({
          ...measure,
          elements: [...measure.elements, newRest],
        }))
      );
      return updateScore(state, newScore);
    }

    case 'DELETE_SELECTED': {
      const ids = new Set(state.editor.selection.elementIds);
      if (ids.size === 0) return state;
      const newScore = {
        ...state.score,
        parts: state.score.parts.map(part => ({
          ...part,
          measures: part.measures.map(measure => ({
            ...measure,
            elements: measure.elements.filter(el => !ids.has(el.id)),
          })),
        })),
      };
      return { ...updateScore(state, newScore), editor: { ...state.editor, selection: { elementIds: [] } } };
    }

    case 'SET_ARTICULATION': {
      const ids = new Set(action.elementIds);
      const newScore = {
        ...state.score,
        parts: state.score.parts.map(part => ({
          ...part,
          measures: part.measures.map(measure => ({
            ...measure,
            elements: measure.elements.map(el => {
              if (!ids.has(el.id)) return el;
              const has = el.articulations.includes(action.articulation);
              return {
                ...el,
                articulations: has
                  ? el.articulations.filter(a => a !== action.articulation)
                  : [...el.articulations, action.articulation],
              };
            }),
          })),
        })),
      };
      return updateScore(state, newScore);
    }

    case 'ADD_MEASURE': {
      const nextNum = state.score.measureCount + 1;
      const newScore = {
        ...state.score,
        measureCount: nextNum,
        parts: state.score.parts.map(part => ({
          ...part,
          measures: [...part.measures, makeMeasure(nextNum)],
        })),
      };
      return updateScore(state, newScore);
    }

    case 'SET_TITLE': {
      const newScore = { ...state.score, metadata: { ...state.score.metadata, title: action.title } };
      return updateScore(state, newScore);
    }

    case 'SET_COMPOSER': {
      const newScore = { ...state.score, metadata: { ...state.score.metadata, composer: action.composer } };
      return updateScore(state, newScore);
    }

    case 'SET_TEMPO': {
      const newScore = { ...state.score, globalTempo: { ...state.score.globalTempo, bpm: action.bpm, text: action.text ?? state.score.globalTempo.text } };
      return updateScore(state, newScore);
    }

    case 'LOAD_SCORE':
      return { ...state, score: action.score, history: [], future: [] };

    case 'TRANSPOSE_NOTE': {
      const ids = new Set(action.elementIds);
      if (ids.size === 0) return state;

      // Diatonic step order
      const STEPS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'] as const;
      type StepName = typeof STEPS[number];

      function transposePitch(pitch: { step: StepName; octave: number; accidental: any; alter: number }, diatonicSteps: number) {
        const currentIdx = STEPS.indexOf(pitch.step);
        const totalSteps = currentIdx + pitch.octave * 7 + diatonicSteps;
        const newOctave = Math.floor(totalSteps / 7);
        const newStepIdx = ((totalSteps % 7) + 7) % 7;
        return {
          ...pitch,
          step: STEPS[newStepIdx],
          octave: Math.max(0, Math.min(8, newOctave)),
          // Clear accidental on plain arrow move; hold Shift+Arrow to keep
          accidental: null as any,
          alter: 0,
        };
      }

      const newScore = {
        ...state.score,
        parts: state.score.parts.map(part => ({
          ...part,
          measures: part.measures.map(measure => ({
            ...measure,
            elements: measure.elements.map(el => {
              if (!ids.has(el.id) || el.type !== 'note') return el;
              const note = el as NoteElement;
              return {
                ...note,
                pitch: transposePitch(note.pitch as any, action.steps),
              };
            }),
          })),
        })),
      };
      return updateScore(state, newScore);
    }

    case 'UNDO': {
      if (state.history.length === 0) return state;
      const prev = state.history[state.history.length - 1];
      return {
        ...state,
        score: prev,
        history: state.history.slice(0, -1),
        future: [state.score, ...state.future.slice(0, 49)],
      };
    }

    case 'REDO': {
      if (state.future.length === 0) return state;
      const next = state.future[0];
      return {
        ...state,
        score: next,
        history: [...state.history.slice(-49), state.score],
        future: state.future.slice(1),
      };
    }

    default:
      return state;
  }
}

// ─── Context ──────────────────────────────────────────────────────────────────
interface StoreContext {
  state: AppState;
  dispatch: React.Dispatch<Action>;
}

const Context = createContext<StoreContext | null>(null);

export function ScoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  return <Context.Provider value={{ state, dispatch }}>{children}</Context.Provider>;
}

export function useStore() {
  const ctx = useContext(Context);
  if (!ctx) throw new Error('useStore must be used within ScoreProvider');
  return ctx;
}

export function useScore() {
  return useStore().state.score;
}

export function useEditor() {
  return useStore().state.editor;
}
