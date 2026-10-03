import type { GameState } from '../state';
import { CURIOSITIES } from './curiosities';
import { INTERIOR_W, IMPLIED_DOORWAYS, LIVING_WINDOWS } from './interior';

// Curiosities can't be brought home — most of them are alive — but once
// one's been found it turns up in the house anyway: Ellen's sketch of it,
// framed on the living room wall, or (for the two that are only things) the
// thing itself, put somewhere it belongs.

export type KeepsakePlace =
  /** A framed sketch on the north wall, `at` tiles across, `span` wide. */
  | { kind: 'frame'; wall: 'north'; at: number; span: number }
  /** A framed sketch on the east wall, `at` tiles down, `span` tall. */
  | { kind: 'frame'; wall: 'east'; at: number; span: number }
  /** Set on the bookshelf, among the books. */
  | { kind: 'bookshelf' }
  /** On a tee by the putting mat: Scott's, of course. */
  | { kind: 'puttingMat' };

export interface Keepsake {
  curiosityId: string;
  place: KeepsakePlace;
  /** Said once, the first time it's found. */
  note: string;
}

export const KEEPSAKES: Keepsake[] = [
  { curiosityId: 'treeFrog', place: { kind: 'frame', wall: 'north', at: 19.8, span: 0.4 }, note: 'Ellen sketches it from memory that evening and hangs it in the living room.' },
  { curiosityId: 'hedgehog', place: { kind: 'frame', wall: 'north', at: 20.26, span: 0.4 }, note: 'A sketch of it goes up on the living room wall.' },
  { curiosityId: 'foxDen', place: { kind: 'frame', wall: 'north', at: 22.12, span: 1.06 }, note: 'Ellen draws it, roots and all, and gives it the best spot on the living room wall.' },
  { curiosityId: 'swallowtail', place: { kind: 'frame', wall: 'east', at: 1.15, span: 0.55 }, note: 'A sketch of it goes up on the living room wall.' },
  { curiosityId: 'emeraldDragonfly', place: { kind: 'frame', wall: 'east', at: 1.85, span: 0.55 }, note: 'A sketch of it goes up on the living room wall.' },
  { curiosityId: 'jewelBeetle', place: { kind: 'frame', wall: 'east', at: 2.55, span: 0.55 }, note: 'A sketch of it goes up on the living room wall.' },
  { curiosityId: 'fireSalamander', place: { kind: 'frame', wall: 'east', at: 5.25, span: 0.55 }, note: 'A sketch of it goes up on the living room wall.' },
  { curiosityId: 'lunaMoth', place: { kind: 'frame', wall: 'east', at: 5.95, span: 0.6 }, note: 'Ellen paints it in pale green and hangs it in the living room.' },
  { curiosityId: 'glowworms', place: { kind: 'frame', wall: 'east', at: 9.2, span: 0.6 }, note: 'Ellen paints them, and the paint catches the lamplight in the living room after dark.' },
  { curiosityId: 'splitGeode', place: { kind: 'bookshelf' }, note: 'The two halves come home and sit on the living room bookshelf.' },
  { curiosityId: 'lostGolfBall', place: { kind: 'puttingMat' }, note: 'It comes home on a tee by Scott’s putting mat. He swears it isn’t his.' },
];

export function findKeepsake(curiosityId: string): Keepsake | undefined {
  return KEEPSAKES.find((k) => k.curiosityId === curiosityId);
}

/** The keepsakes that are on show: one for every curiosity found. */
export function keepsakesOnShow(state: GameState): Keepsake[] {
  return KEEPSAKES.filter((k) => !!state.curiosities[k.curiosityId]);
}

export function hasKeepsake(state: GameState, curiosityId: string): boolean {
  return !!state.curiosities[curiosityId] && !!findKeepsake(curiosityId);
}

/** Every curiosity has a place; no two frames overlap, nor a frame and a window or doorway. */
export function keepsakeLayoutProblems(): string[] {
  const problems: string[] = [];
  for (const c of CURIOSITIES) if (!findKeepsake(c.id)) problems.push(`${c.id} has no keepsake`);
  const frames = KEEPSAKES.flatMap((k) => (k.place.kind === 'frame' ? [{ id: k.curiosityId, ...k.place }] : []));
  const overlaps = (a0: number, a1: number, b0: number, b1: number) => a0 < b1 && b0 < a1;
  for (let i = 0; i < frames.length; i++) {
    const f = frames[i];
    for (const g of frames.slice(i + 1)) {
      if (f.wall === g.wall && overlaps(f.at, f.at + f.span, g.at, g.at + g.span)) problems.push(`${f.id} overlaps ${g.id}`);
    }
    for (const w of LIVING_WINDOWS) {
      const [w0, w1] = w.wall === 'north' ? [w.x, w.x + w.span] : [w.y, w.y + w.span];
      if (w.wall === f.wall && overlaps(f.at, f.at + f.span, w0, w1)) problems.push(`${f.id} covers a window`);
    }
    for (const d of IMPLIED_DOORWAYS) {
      const [d0, d1] = d.wall === 'north' ? [d.x!, d.x! + d.span] : [d.y!, d.y! + d.span];
      if (d.wall === f.wall && overlaps(f.at, f.at + f.span, d0, d1)) problems.push(`${f.id} covers a doorway`);
    }
    if (f.wall === 'north' && (f.at < 18 || f.at + f.span > INTERIOR_W - 1)) problems.push(`${f.id} is off the living room wall`);
  }
  return problems;
}
