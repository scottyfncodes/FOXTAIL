// The Foxtail soundtrack: which music belongs to which part of the game, and
// how each piece is put together.
//
// Every track is built on the same short motif (MOTIF below). A track may
// name a recorded file in `sources`; until one exists — or if it fails to
// load — the track plays its built-in arrangement instead, synthesised live
// from the instruments in instruments.ts. See public/music/README.md for
// where final recordings go and what they should be called.

/** The musical states the game can be in. One track per state. */
export type MusicState = 'menu' | 'home' | 'greenhouse' | 'wild' | 'deepWild' | 'evening';

export type Instrument =
  | 'kalimba'
  | 'marimba'
  | 'glass'
  | 'piano'
  | 'pluck'
  | 'flute'
  | 'strings'
  | 'bass'
  | 'wood'
  | 'drum'
  | 'shaker';

/** Church-mode intervals; the arranger works in scale degrees of one of these. */
export const MODES = {
  ionian: [0, 2, 4, 5, 7, 9, 11],
  lydian: [0, 2, 4, 6, 7, 9, 11],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
} as const;
export type ModeName = keyof typeof MODES;

/**
 * The Foxtail motif: five notes, written as scale degrees (0 = the key's
 * root) with onsets and lengths in beats.
 *
 * Up a fifth, a step higher, then falling to the third and settling on the
 * second — it never comes home to the root. It lands on a question, the way
 * the fox stops and looks back at you. All five notes sit in the pentatonic
 * scale, so it fits every arrangement; in a major mode it's warm, in dorian
 * (the deep wild) the third darkens and it turns quietly mysterious.
 */
export const MOTIF = {
  degrees: [0, 4, 5, 2, 1],
  onsets: [0, 0.5, 1.5, 2, 3],
  lengths: [0.5, 1, 0.5, 1, 2.5],
} as const;

/**
 * What the lead voice does in each two-bar phrase:
 * - motif: the motif itself
 * - motifSeq: the motif, moved to start on the bar's chord
 * - answer: the motif's opening, then a fall home to the chord
 * - fragment: just the motif's last three notes, slowly
 * - free: a melody walked from the pentatonic notes of the mode
 * - rest: nothing — the accompaniment breathes on its own
 */
export type PhraseKind = 'motif' | 'motifSeq' | 'answer' | 'fragment' | 'free' | 'rest';

export interface VoicePart {
  instrument: Instrument;
  /** Octave offset from the track root. */
  octave: number;
  velocity: number;
  /** One entry per phrase; the form loops. */
  form: PhraseKind[];
  /** For free phrases: 0–1, how busy the line is. */
  density?: number;
}

export interface Arrangement {
  tempo: number;
  beatsPerBar: number;
  /** MIDI note of the key's root. */
  root: number;
  mode: ModeName;
  /** Scale degree of each bar's chord; loops. */
  progression: number[];
  lead: VoicePart;
  counter?: VoicePart;
  /** Broken chords: chord-tone index per step (-1 rests), repeated per bar. */
  arp?: { instrument: Instrument; octave: number; velocity: number; stepBeats: number; pattern: number[]; chance?: number };
  bass?: { instrument: Instrument; octave: number; velocity: number; beats: number[]; length: number };
  pad?: { instrument: Instrument; octave: number; velocity: number };
  /** Hand percussion: one character per step — w wood, d drum, s shaker, . rest. */
  perc?: { stepBeats: number; pattern: string; velocity: number; chance?: number };
  /** Reverb send, 0–1. */
  reverb: number;
}

export interface TrackDef {
  id: string;
  title: string;
  state: MusicState;
  /**
   * Final recordings for this track, relative to the app's base URL, in order
   * of preference (the first the browser can play is used). Empty until the
   * soundtrack is recorded; the arrangement plays in the meantime.
   */
  sources: string[];
  /** Level of this track in the music mix, 0–1. */
  gain: number;
  arrangement: Arrangement;
}

export const TRACKS: TrackDef[] = [
  {
    id: 'foxtail-theme',
    title: 'Foxtail',
    state: 'menu',
    sources: [],
    gain: 0.9,
    // The motif at its plainest: kalimba over a picked guitar and a string bed.
    arrangement: {
      tempo: 74,
      beatsPerBar: 4,
      root: 62, // D
      mode: 'ionian',
      progression: [0, 5, 3, 4, 0, 5, 3, 1],
      lead: { instrument: 'kalimba', octave: 0, velocity: 0.75, form: ['motif', 'answer', 'motif', 'fragment', 'free', 'rest', 'motifSeq', 'rest'], density: 0.45 },
      counter: { instrument: 'flute', octave: 0, velocity: 0.35, form: ['rest', 'rest', 'rest', 'rest', 'rest', 'fragment', 'rest', 'answer'] },
      arp: { instrument: 'pluck', octave: -1, velocity: 0.42, stepBeats: 0.5, pattern: [0, 2, 1, 2, 3, 2, 1, 2] },
      bass: { instrument: 'bass', octave: -2, velocity: 0.5, beats: [0, 2.5], length: 1.6 },
      pad: { instrument: 'strings', octave: -1, velocity: 0.32 },
      reverb: 0.4,
    },
  },
  {
    id: 'home',
    title: 'The Kettle’s On',
    state: 'home',
    sources: [],
    gain: 0.85,
    // Warm and melodic: felt piano singing over guitar, a shaker now and then.
    arrangement: {
      tempo: 84,
      beatsPerBar: 4,
      root: 67, // G
      mode: 'ionian',
      progression: [0, 3, 5, 4, 0, 3, 1, 4],
      lead: { instrument: 'piano', octave: 0, velocity: 0.7, form: ['motif', 'answer', 'free', 'rest', 'motifSeq', 'free', 'fragment', 'rest'], density: 0.55 },
      counter: { instrument: 'kalimba', octave: 1, velocity: 0.3, form: ['rest', 'rest', 'fragment', 'rest', 'rest', 'rest', 'rest', 'answer'] },
      arp: { instrument: 'pluck', octave: -1, velocity: 0.4, stepBeats: 0.5, pattern: [0, -1, 2, 1, 3, -1, 2, 1] },
      bass: { instrument: 'bass', octave: -2, velocity: 0.5, beats: [0, 2], length: 1.5 },
      pad: { instrument: 'strings', octave: -1, velocity: 0.22 },
      perc: { stepBeats: 0.5, pattern: '..s...s.', velocity: 0.35, chance: 0.6 },
      reverb: 0.3,
    },
  },
  {
    id: 'greenhouse',
    title: 'Under Glass',
    state: 'greenhouse',
    sources: [],
    gain: 0.8,
    // Delicate and intricate: marimba and glass in a slow three, lydian light.
    arrangement: {
      tempo: 96,
      beatsPerBar: 3,
      root: 69, // A
      mode: 'lydian',
      progression: [0, 1, 0, 4, 5, 1, 3, 4],
      lead: { instrument: 'glass', octave: 0, velocity: 0.55, form: ['motif', 'rest', 'answer', 'free', 'motifSeq', 'rest', 'fragment', 'free'], density: 0.5 },
      counter: { instrument: 'marimba', octave: 0, velocity: 0.35, form: ['rest', 'free', 'rest', 'rest', 'rest', 'free', 'rest', 'rest'], density: 0.35 },
      arp: { instrument: 'marimba', octave: -1, velocity: 0.38, stepBeats: 0.5, pattern: [0, 2, 4, 3, 1, 2], chance: 0.85 },
      bass: { instrument: 'bass', octave: -2, velocity: 0.4, beats: [0], length: 2.6 },
      pad: { instrument: 'strings', octave: -1, velocity: 0.18 },
      reverb: 0.5,
    },
  },
  {
    id: 'wild',
    title: 'Off the Path',
    state: 'wild',
    sources: [],
    gain: 0.8,
    // Exploratory and rhythmic: a marimba ostinato, hand percussion, and a flute that goes looking.
    arrangement: {
      tempo: 100,
      beatsPerBar: 4,
      root: 64, // E
      mode: 'mixolydian',
      progression: [0, 0, 6, 3, 0, 4, 6, 3],
      lead: { instrument: 'flute', octave: 0, velocity: 0.5, form: ['rest', 'motif', 'free', 'rest', 'answer', 'free', 'motifSeq', 'rest'], density: 0.5 },
      counter: { instrument: 'kalimba', octave: 0, velocity: 0.38, form: ['free', 'rest', 'rest', 'fragment', 'rest', 'rest', 'rest', 'free'], density: 0.4 },
      arp: { instrument: 'marimba', octave: -1, velocity: 0.42, stepBeats: 0.5, pattern: [0, 2, 0, 3, 1, 2, 0, 3], chance: 0.9 },
      bass: { instrument: 'pluck', octave: -2, velocity: 0.45, beats: [0, 1.5, 3], length: 0.8 },
      pad: { instrument: 'strings', octave: -1, velocity: 0.14 },
      perc: { stepBeats: 0.5, pattern: 'd.w.s.ww', velocity: 0.42, chance: 0.75 },
      reverb: 0.3,
    },
  },
  {
    id: 'deep-wild',
    title: 'Where the Fox Goes',
    state: 'deepWild',
    sources: [],
    gain: 0.85,
    // Atmospheric and mysterious, never dark: a low string drone, a far-off flute, kalimba drops.
    arrangement: {
      tempo: 60,
      beatsPerBar: 4,
      root: 62, // D
      mode: 'dorian',
      progression: [0, 0, 6, 6, 3, 3, 0, 4],
      lead: { instrument: 'kalimba', octave: 0, velocity: 0.5, form: ['fragment', 'rest', 'motif', 'rest', 'free', 'rest', 'fragment', 'rest'], density: 0.3 },
      counter: { instrument: 'flute', octave: -1, velocity: 0.34, form: ['rest', 'free', 'rest', 'fragment', 'rest', 'answer', 'rest', 'rest'], density: 0.25 },
      arp: { instrument: 'glass', octave: 0, velocity: 0.22, stepBeats: 1, pattern: [4, -1, 2, -1], chance: 0.55 },
      bass: { instrument: 'bass', octave: -2, velocity: 0.4, beats: [0], length: 3.8 },
      pad: { instrument: 'strings', octave: -1, velocity: 0.3 },
      reverb: 0.7,
    },
  },
  {
    id: 'evening',
    title: 'Lamps Lit',
    state: 'evening',
    sources: [],
    gain: 0.75,
    // Soft and close: piano alone with the strings, the motif slowed right down.
    arrangement: {
      tempo: 64,
      beatsPerBar: 4,
      root: 65, // F
      mode: 'ionian',
      progression: [0, 2, 3, 0, 5, 3, 1, 4],
      lead: { instrument: 'piano', octave: 0, velocity: 0.5, form: ['motif', 'rest', 'free', 'rest', 'answer', 'rest', 'fragment', 'rest'], density: 0.35 },
      counter: { instrument: 'kalimba', octave: 1, velocity: 0.22, form: ['rest', 'rest', 'rest', 'fragment', 'rest', 'rest', 'rest', 'rest'] },
      arp: { instrument: 'piano', octave: -1, velocity: 0.28, stepBeats: 1, pattern: [0, 2, 1, 2], chance: 0.8 },
      bass: { instrument: 'bass', octave: -2, velocity: 0.35, beats: [0], length: 3.5 },
      pad: { instrument: 'strings', octave: -1, velocity: 0.24 },
      reverb: 0.5,
    },
  },
];

export const TRACK_FOR_STATE: Record<MusicState, TrackDef> = Object.fromEntries(TRACKS.map((t) => [t.state, t])) as Record<MusicState, TrackDef>;

export function findTrack(id: string): TrackDef | undefined {
  return TRACKS.find((t) => t.id === id);
}
