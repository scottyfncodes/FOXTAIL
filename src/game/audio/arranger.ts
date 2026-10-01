import { mulberry32, hashString } from '../engine/Random';
import { MODES, MOTIF, type Arrangement, type Instrument, type PhraseKind, type VoicePart } from './soundtrack';

// Turns a track's arrangement into notes, two bars (one phrase) at a time.
// Pure and deterministic for a given track, phrase index and cycle, so a
// track always unfolds the same way from the same place — and tests can
// check what it plays without any audio.

export type Part = 'lead' | 'counter' | 'arp' | 'bass' | 'pad' | 'perc';

export interface NoteEvent {
  part: Part;
  /** Beats from the start of the phrase. */
  at: number;
  /** Length in beats. */
  length: number;
  instrument: Instrument;
  midi: number;
  velocity: number;
}

export const BARS_PER_PHRASE = 2;

/** The MIDI note of a scale degree (any integer; 7 is the root an octave up). */
export function degreeToMidi(root: number, mode: readonly number[], degree: number): number {
  const oct = Math.floor(degree / mode.length);
  const idx = ((degree % mode.length) + mode.length) % mode.length;
  return root + oct * 12 + mode[idx];
}

/** The pentatonic degrees of a seven-note mode: 1 2 3 5 6. */
const PENTA = [0, 1, 2, 4, 5];

/** Moves `steps` notes along the pentatonic scale from (near) `degree`. */
function stepPenta(degree: number, steps: number): number {
  const d = nearestPenta(degree);
  const oct = Math.floor(d / 7);
  const i = oct * PENTA.length + PENTA.indexOf(((d % 7) + 7) % 7) + steps;
  return Math.floor(i / PENTA.length) * 7 + PENTA[((i % PENTA.length) + PENTA.length) % PENTA.length];
}

function nearestPenta(degree: number): number {
  let best = degree;
  let bestDist = Infinity;
  for (let d = degree - 2; d <= degree + 2; d++) {
    const idx = ((d % 7) + 7) % 7;
    if (!PENTA.includes(idx)) continue;
    const dist = Math.abs(d - degree);
    if (dist < bestDist) {
      best = d;
      bestDist = dist;
    }
  }
  return best;
}

/** Chord tones of the chord built on `rootDegree`: root, third, fifth, seventh, ninth. */
export function chordTones(rootDegree: number): number[] {
  return [rootDegree, rootDegree + 2, rootDegree + 4, rootDegree + 6, rootDegree + 8];
}

export function phraseLengthBeats(a: Arrangement): number {
  return a.beatsPerBar * BARS_PER_PHRASE;
}

export function secondsPerBeat(a: Arrangement): number {
  return 60 / a.tempo;
}

/** The scale degree of the chord in bar `bar` (counting from the track's start). */
export function chordAt(a: Arrangement, bar: number): number {
  return a.progression[((bar % a.progression.length) + a.progression.length) % a.progression.length];
}

function leadLine(kind: PhraseKind, part: VoicePart, a: Arrangement, phrase: number, rand: () => number): { degree: number; at: number; length: number }[] {
  const bpb = a.beatsPerBar;
  const total = bpb * BARS_PER_PHRASE;
  const firstChord = chordAt(a, phrase * BARS_PER_PHRASE);
  const lastChord = chordAt(a, phrase * BARS_PER_PHRASE + 1);
  const motif = (shift: number) =>
    MOTIF.degrees.map((d, i) => ({ degree: d + shift, at: MOTIF.onsets[i], length: Math.min(MOTIF.lengths[i], total - MOTIF.onsets[i]) }));

  switch (kind) {
    case 'rest':
      return [];
    case 'motif':
      return motif(0);
    case 'motifSeq': {
      // Start on the chord of the bar, folded into the octave around the root
      // — or, over the home chord, from the fifth below, so it's never a plain repeat.
      let shift = firstChord || 4;
      if (shift > 3) shift -= 7;
      return motif(shift);
    }
    case 'answer': {
      // The motif's rising opening, then a stepwise fall onto the second bar's chord.
      const open = motif(0).slice(0, 3);
      const target = lastChord > 3 ? lastChord - 7 : lastChord;
      const from = MOTIF.degrees[2];
      const mid = nearestPenta(Math.round((from + target) / 2) + (rand() < 0.5 ? 0 : 1));
      return [...open, { degree: mid, at: 2, length: 1 }, { degree: target, at: 3, length: total - 3 }];
    }
    case 'fragment': {
      // The motif's falling tail, stretched — 6, 3, 2 — like an echo of it.
      const tail = MOTIF.degrees.slice(2);
      const step = total / 3;
      return tail.map((d, i) => ({ degree: d, at: i * step, length: i === 2 ? step : step * 0.9 }));
    }
    case 'free': {
      // A pentatonic walk on an eighth-note grid, landing long on a chord tone.
      const density = part.density ?? 0.5;
      const notes: { degree: number; at: number; length: number }[] = [];
      let degree = nearestPenta(chordTones(firstChord)[Math.floor(rand() * 3)] % 7);
      if (degree > 5) degree -= 7;
      const endAt = total - 2;
      for (let t = rand() < 0.4 ? 0.5 : 0; t < endAt; t += 0.5) {
        const onBeat = t % 1 === 0;
        if (rand() > density * (onBeat ? 1.3 : 0.7)) continue;
        const r = rand();
        const step = r < 0.35 ? 1 : r < 0.7 ? -1 : r < 0.85 ? 2 : -2;
        degree = stepPenta(degree, degree >= 7 ? -Math.abs(step) : degree <= -3 ? Math.abs(step) : step);
        notes.push({ degree, at: t, length: 0.5 });
      }
      // Each note lasts until the next one, so the line sings rather than ticks.
      for (let i = 0; i < notes.length - 1; i++) notes[i].length = Math.min(1.5, notes[i + 1].at - notes[i].at);
      const tones = chordTones(lastChord).slice(0, 3);
      const land = tones.reduce((best, d) => {
        const dd = d > 5 ? d - 7 : d;
        return Math.abs(dd - degree) < Math.abs(best - degree) ? dd : best;
      }, tones[0] > 5 ? tones[0] - 7 : tones[0]);
      notes.push({ degree: land, at: endAt, length: 2 });
      return notes;
    }
  }
}

/**
 * Every note of one phrase of a track. `phrase` counts from the moment the
 * track first started, so the progression and form keep their place.
 */
export function arrangePhrase(trackId: string, a: Arrangement, phrase: number): NoteEvent[] {
  const mode = MODES[a.mode];
  const cycle = Math.floor(phrase / a.lead.form.length);
  const rand = mulberry32(hashString(`${trackId}:${phrase % 64}:${cycle % 4}`));
  const events: NoteEvent[] = [];
  const bpb = a.beatsPerBar;
  const human = () => (rand() - 0.5) * 0.02;
  const vel = (v: number) => Math.max(0.05, Math.min(1, v * (0.88 + rand() * 0.24)));

  const voice = (name: 'lead' | 'counter', part: VoicePart | undefined, kind: PhraseKind) => {
    if (!part) return;
    for (const n of leadLine(kind, part, a, phrase, rand)) {
      events.push({
        part: name,
        at: Math.max(0, n.at + human()),
        length: n.length,
        instrument: part.instrument,
        midi: degreeToMidi(a.root + part.octave * 12, mode, n.degree),
        velocity: vel(part.velocity),
      });
    }
  };
  const formAt = (form: PhraseKind[]) => form[phrase % form.length];
  const leadKind = formAt(a.lead.form);
  voice('lead', a.lead, leadKind);
  if (a.counter) voice('counter', a.counter, formAt(a.counter.form));

  // A resting lead lets the accompaniment thin out too, so the music breathes.
  const breathing = leadKind === 'rest';

  for (let b = 0; b < BARS_PER_PHRASE; b++) {
    const bar = phrase * BARS_PER_PHRASE + b;
    const chord = chordAt(a, bar);
    const tones = chordTones(chord);
    const barAt = b * bpb;

    if (a.pad && (b === 0 || chordAt(a, bar - 1) !== chord)) {
      // Held across both bars when the chord doesn't change.
      const holds = b === 0 && chordAt(a, bar + 1) === chord ? 2 : 1;
      for (const d of [tones[0], tones[1], tones[2], tones[4]]) {
        events.push({ part: 'pad', at: barAt, length: bpb * holds, instrument: a.pad.instrument, midi: degreeToMidi(a.root + a.pad.octave * 12, mode, d), velocity: a.pad.velocity * (d === tones[4] ? 0.5 : 1) });
      }
    }

    if (a.bass) {
      for (const beat of a.bass.beats) {
        if (beat >= bpb) continue;
        const degree = beat === 0 ? chord : rand() < 0.5 ? chord + 4 : chord;
        events.push({ part: 'bass', at: barAt + beat, length: a.bass.length, instrument: a.bass.instrument, midi: degreeToMidi(a.root + a.bass.octave * 12, mode, degree), velocity: vel(a.bass.velocity) });
      }
    }

    if (a.arp) {
      const steps = Math.round(bpb / a.arp.stepBeats);
      const chance = (a.arp.chance ?? 1) * (breathing ? 0.7 : 1);
      for (let s = 0; s < steps; s++) {
        const idx = a.arp.pattern[s % a.arp.pattern.length];
        if (idx < 0) continue;
        if (s > 0 && rand() > chance) continue;
        events.push({
          part: 'arp',
          at: Math.max(0, barAt + s * a.arp.stepBeats + human()),
          length: a.arp.stepBeats * 2,
          instrument: a.arp.instrument,
          midi: degreeToMidi(a.root + a.arp.octave * 12, mode, tones[idx]),
          velocity: vel(a.arp.velocity * (s === 0 ? 1.1 : 1)),
        });
      }
    }

    if (a.perc) {
      // The first phrase of each cycle keeps its percussion light, easing in.
      const chance = (a.perc.chance ?? 1) * (phrase % a.lead.form.length === 0 ? 0.5 : 1);
      const steps = Math.round(bpb / a.perc.stepBeats);
      for (let s = 0; s < steps; s++) {
        const ch = a.perc.pattern[s % a.perc.pattern.length];
        const instrument: Instrument | null = ch === 'w' ? 'wood' : ch === 'd' ? 'drum' : ch === 's' ? 'shaker' : null;
        if (!instrument) continue;
        if (s > 0 && rand() > chance) continue;
        events.push({ part: 'perc', at: Math.max(0, barAt + s * a.perc.stepBeats + human()), length: 0.25, instrument, midi: instrument === 'wood' ? (s % 2 ? 79 : 74) : 48, velocity: vel(a.perc.velocity) });
      }
    }
  }
  return events.sort((x, y) => x.at - y.at);
}

/** Tempo of the discovery stinger, whatever track it plays over. */
export const STINGER_TEMPO = 100;

/** The motif as a short stinger in a track's key, for a meaningful discovery. */
export function motifStinger(a: Arrangement): NoteEvent[] {
  const mode = MODES[a.mode];
  const root = a.root + 12;
  const events: NoteEvent[] = [];
  MOTIF.degrees.forEach((d, i) => {
    const at = MOTIF.onsets[i];
    events.push({ part: 'lead', at, length: MOTIF.lengths[i], instrument: 'kalimba', midi: degreeToMidi(root, mode, d), velocity: 0.6 });
    if (i === MOTIF.degrees.length - 1) events.push({ part: 'counter', at, length: 3, instrument: 'glass', midi: degreeToMidi(root + 12, mode, d), velocity: 0.35 });
  });
  return events;
}
