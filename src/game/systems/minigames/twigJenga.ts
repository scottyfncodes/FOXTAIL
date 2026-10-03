// Twig Jenga: the kindling heap beside Scott's woodpile, stacked log-cabin
// fashion, three twigs to a layer, each layer laid across the one below.
// Slide a twig out and drop it on the kindling heap; pull the wrong one and
// the whole lot goes over.
//
// Pure simulation, no DOM, and no rigid bodies either: whether the pile
// stands is a handful of rules you could explain to someone at the
// woodpile. A layer holds if it keeps its middle twig, or both outer ones.
// Leave a layer with only one outer twig and everything above it rests on
// that edge: the pile leans that way, more so low down where the load is.
// Every twig pulled jostles the pile a little too (a crooked one jostles it
// the way it bends), a pile that's leaning settles further with each pull,
// and one balanced on middle twigs alone amplifies whatever lean it has. Past a full lean of 1, or with a layer left with
// nothing in it, over it goes.

import { mulberry32 } from '../../engine/Random';

export type TwigKind = 'plain' | 'crooked' | 'knotty' | 'damp';

export interface Twig {
  kind: TwigKind;
  present: boolean;
  /** How much pulling it nudges the pile's lean (signed: + is right). A crooked twig nudges the way it bends. */
  nudge: number;
  /** A little variety in the bark, 0..1, for drawing. */
  shade: number;
}

export interface Pile {
  name: string;
  /** Bottom first. Three twigs to a layer: left, middle, right (as seen from Scott's side). */
  layers: Twig[][];
  /** The lean it started with: the wonky one was built on a slope. */
  baseLean: number;
  /** The jostling from twigs already pulled. */
  jostle: number;
  removed: number;
  collapsed: boolean;
}

export type LayerHold = 'solid' | 'narrow' | 'edge' | 'empty';

export interface PullResult {
  ok: boolean;
  collapsed: boolean;
  /** Why it went over: the lean got too much, or a layer was left with nothing to carry the load. */
  reason?: 'lean' | 'empty';
  lean: number;
}

/** Past this, the pile goes over. */
export const COLLAPSE_LEAN = 1;
/** Past this it creaks and sways: a warning worth reading. */
export const CREAK_LEAN = 0.55;
/** A layer resting on one outer twig leans the pile this much, plus more for the load above it. */
const EDGE_LEAN = 0.28;
const EDGE_LOAD_LEAN = 0.3;
/** Each layer balanced on its middle twig alone amplifies the lean by this much. */
const NARROW_AMPLIFY = 0.35;
/** Two middle-only layers stacked: the upper one pivots on the crossing point. */
const PIVOT_LEAN = 0.6;
/** And a layer on one edge, even more: everything above it rocks. */
const EDGE_AMPLIFY = 0.35;
/** How much of its lean a leaning pile adds again with each pull: lean begets lean. */
const CREEP = 0.35;
/** What a heavy, damp twig weighs, against a dry one's 1. */
const DAMP_WEIGHT = 2;

export interface PileSpec {
  name: string;
  layers: number;
  baseLean: number;
  /** Chances of each kind of awkward twig. */
  crooked: number;
  knotty: number;
  damp: number;
  /** How hard a plain twig jostles, at most. */
  jostle: number;
}

/** Three piles a session: a neat little one, a taller one, then a wonky one that already leans. */
export const PILE_SPECS: PileSpec[] = [
  { name: 'A neat little pile', layers: 6, baseLean: 0, crooked: 0.08, knotty: 0.08, damp: 0, jostle: 0.05 },
  { name: 'A taller pile', layers: 8, baseLean: 0, crooked: 0.16, knotty: 0.12, damp: 0.1, jostle: 0.07 },
  { name: 'The wonky one', layers: 8, baseLean: 0.14, crooked: 0.3, knotty: 0.16, damp: 0.12, jostle: 0.08 },
];

export function makePile(index: number, seed: number): Pile {
  const spec = PILE_SPECS[Math.min(index, PILE_SPECS.length - 1)];
  const rand = mulberry32((seed ^ (index * 0x9e3779b1)) >>> 0);
  const layers: Twig[][] = [];
  for (let l = 0; l < spec.layers; l++) {
    const layer: Twig[] = [];
    for (let s = 0; s < 3; s++) {
      const r = rand();
      let kind: TwigKind = 'plain';
      if (r < spec.crooked) kind = 'crooked';
      else if (r < spec.crooked + spec.knotty) kind = 'knotty';
      else if (r < spec.crooked + spec.knotty + spec.damp) kind = 'damp';
      const side = rand() < 0.5 ? -1 : 1;
      // Crooked twigs snag on the way out and drag the pile the way they bend;
      // knotty ones catch too. Plain ones barely, and you can't tell which way.
      const size = kind === 'crooked' ? 0.12 + rand() * 0.08 : kind === 'knotty' ? 0.07 + rand() * 0.04 : kind === 'damp' ? 0.06 : 0.01 + rand() * (spec.jostle - 0.01);
      layer.push({ kind, present: true, nudge: side * size, shade: rand() });
    }
    layers.push(layer);
  }
  // The wonky one leans whichever way it was built.
  const baseLean = spec.baseLean * (rand() < 0.5 ? -1 : 1);
  return { name: spec.name, layers, baseLean, jostle: 0, removed: 0, collapsed: false };
}

export function clonePile(p: Pile): Pile {
  return { ...p, layers: p.layers.map((l) => l.map((t) => ({ ...t }))) };
}

/** How a layer's holding up: solid, on its middle twig alone, on one edge, or not at all. */
export function layerHold(layer: Twig[]): LayerHold {
  const [l, m, r] = layer.map((t) => t.present);
  if (m && (l || r)) return 'solid';
  if (l && r) return 'solid';
  if (m) return 'narrow';
  if (l || r) return 'edge';
  return 'empty';
}

function weight(t: Twig): number {
  return t.present ? (t.kind === 'damp' ? DAMP_WEIGHT : 1) : 0;
}

/** How far the pile leans: + to the right. 1 either way and it's over. */
export function leanOf(p: Pile): number {
  const n = p.layers.length;
  // The most anything could weigh on a layer: a full pile above the bottom one.
  let full = 0;
  for (let i = 1; i < n; i++) for (const t of p.layers[i]) full += t.kind === 'damp' ? DAMP_WEIGHT : 1;
  let lean = p.baseLean + p.jostle;
  let narrow = 0;
  let edges = 0;
  for (let i = 0; i < n - 1; i++) {
    const layer = p.layers[i];
    const hold = layerHold(layer);
    if (hold === 'narrow') narrow++;
    if (hold !== 'edge') continue;
    edges++;
    let above = 0;
    for (let j = i + 1; j < n; j++) for (const t of p.layers[j]) above += weight(t);
    const side = layer[0].present ? -1 : 1;
    const holder = layer[side < 0 ? 0 : 2];
    // A knotty twig bites into the ones above it and holds; a crooked one rocks.
    const grip = holder.kind === 'knotty' ? 0.6 : holder.kind === 'crooked' ? 1.35 : 1;
    lean += side * (EDGE_LEAN + EDGE_LOAD_LEAN * (above / Math.max(1, full))) * grip;
  }
  // A middle-only layer on another one crosses it at a single point and
  // pivots there: it tips whichever way the pile already leans.
  let pivots = 0;
  for (let i = 1; i < n - 1; i++) if (layerHold(p.layers[i]) === 'narrow' && layerHold(p.layers[i - 1]) === 'narrow') pivots++;
  lean += pivots * PIVOT_LEAN * (lean < 0 ? -1 : 1);
  return lean * (1 + NARROW_AMPLIFY * narrow + EDGE_AMPLIFY * edges);
}

/** Whether there's a twig here to pull. The top layer holds the rest down, so it stays. */
export function canPull(p: Pile, layer: number, slot: number): boolean {
  if (p.collapsed) return false;
  if (layer < 0 || layer >= p.layers.length - 1) return false;
  return !!p.layers[layer][slot]?.present;
}

/**
 * Slides a twig out. If the pile can't stand without it, it goes over, and
 * that twig goes with it (it doesn't count).
 */
export function pull(p: Pile, layer: number, slot: number): PullResult {
  if (!canPull(p, layer, slot)) return { ok: false, collapsed: p.collapsed, lean: leanOf(p) };
  const twig = p.layers[layer][slot];
  // A pile that's already leaning settles a little further with every pull.
  p.jostle += CREEP * leanOf(p);
  twig.present = false;
  p.jostle += twig.nudge;
  const lean = leanOf(p);
  if (layerHold(p.layers[layer]) === 'empty') {
    p.collapsed = true;
    return { ok: true, collapsed: true, reason: 'empty', lean };
  }
  if (Math.abs(lean) >= COLLAPSE_LEAN) {
    p.collapsed = true;
    return { ok: true, collapsed: true, reason: 'lean', lean };
  }
  p.removed += 1;
  return { ok: true, collapsed: false, lean };
}

/** What the lean would be after pulling this one (without pulling it). */
export function leanAfter(p: Pile, layer: number, slot: number): PullResult {
  return pull(clonePile(p), layer, slot);
}

/**
 * What you can see coming before you pull: the lean afterwards, counting a
 * crooked twig's drag (you can see which way it bends) but not a plain
 * one's little jostle. A guide, not the whole answer.
 */
export function leanGuess(p: Pile, layer: number, slot: number): PullResult {
  const q = clonePile(p);
  const t = q.layers[layer]?.[slot];
  if (t && t.kind !== 'crooked') t.nudge = 0;
  return pull(q, layer, slot);
}

/** Every twig that can be pulled right now. */
export function pullable(p: Pile): { layer: number; slot: number }[] {
  const out: { layer: number; slot: number }[] = [];
  for (let l = 0; l < p.layers.length - 1; l++) for (let s = 0; s < 3; s++) if (canPull(p, l, s)) out.push({ layer: l, slot: s });
  return out;
}

export const SESSION_PILES = PILE_SPECS.length;

/** A session's seed: different every time you sit down at the heap, the same for the same number. */
export function sessionSeed(plays: number): number {
  return (Math.imul(plays + 1, 2654435761) ^ 0x5eed) >>> 0;
}
