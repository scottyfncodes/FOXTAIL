import type { GameState, MysteryRecord } from '../state';
import { hasFound } from './collection';

// The valley's last mysteries: three forms that a player can reach the end
// of everything else without ever having been shown the way to. Nothing here
// changes how they're found. It only lets the valley teach it, a little at a
// time, to someone who has been looking a while:
//
//   0  nothing at all: explore.
//   1  something odd, out in the world, if you're there to see it.
//   2  the odd thing points somewhere: a place, a time, a plant.
//   3  Ellen all but says what kind of thing to try.
//   4  a guess written small in the journal, to read only if you choose to.
//
// Each step waits on real time actually spent playing after the form before
// it was found, and the clock runs slow while the player is already doing
// the right thing, so someone who is getting there isn't told.

export type MysteryId = 'mooncap' | 'moonflower' | 'hoya';

export interface MysteryDef {
  id: MysteryId;
  defId: string;
  /** The form that has to be found first: the step before the last. */
  before: string;
  /** The last form: what the hints are about. */
  target: string;
  /** Short name for the toast that says the journal has a guess in it. */
  about: string;
  /** Lives on the October page of the journal (rather than its species' page). */
  october: boolean;
  /** Journal lines, one per step (1, 2, 3). */
  notes: [string, string, string];
  /** The worked-out answer, behind a tap. */
  solution: string;
  /** Added to the answer when the October look is off and part of it needs it. */
  classicNote?: string;
}

/** Real seconds of play, after the form before was found, until each step (index = step). */
export const STAGE_AFTER = [0, 12 * 60, 40 * 60, 90 * 60, 180 * 60] as const;
/** Doing the right thing slows the hints down for this long… */
export const ON_TRACK_SECONDS = 10 * 60;
/** …to this fraction of their usual pace. */
export const ON_TRACK_PACE = 1 / 3;
/** The most a single tick may count, so a long pause or a dropped frame never leaps a step. */
const MAX_TICK = 1;

export const MYSTERIES: Record<MysteryId, MysteryDef> = {
  mooncap: {
    id: 'mooncap',
    defId: 'mooncap',
    before: 'harvest',
    target: 'eclipse',
    about: 'the mooncaps',
    october: true,
    notes: [
      'Mooncaps: pale, and then the amber Harvest. One night an amber one went dark in the middle and stayed lit only round its rim, like the moon slipping behind something. Then it was amber again.',
      'Pale moon, harvest moon… and then? If there’s a darker mooncap it comes after the amber one, the way every form comes after the last. The Harvest ones I grow might throw it. Or one of the lanterns that drift off into the trees on October nights might know where one is growing.',
      'Every form comes from the one before. Cuttings from a Harvest mooncap, again and again (the bigger the plant, the likelier something different comes up). And when a lantern drifts away into the dark, follow it all the way to where it stops.',
    ],
    solution:
      'The last mooncap is Eclipse, and it comes after Harvest. Three ways to it. Take a cutting from a Harvest mooncap each time it has recovered: now and then one comes out Eclipse, more often from a bigger plant, and twice as often with a rooting kit. On an October night, when a lantern starts drifting off, stay within a few steps of it until it stops: half the time it leaves something of the season there, most often a form you haven’t found. And after dark in October, mooncaps come up wild in patches in the woods, the damp forest and along the creek, very occasionally as Eclipse.',
    classicNote: 'The lanterns and the wild mooncaps only come in the October look (Season, under the ♪ button). Cuttings work in either.',
  },
  moonflower: {
    id: 'moonflower',
    defId: 'moonflower',
    before: 'silverEdge',
    target: 'paleVisitor',
    about: 'the moonflowers',
    october: true,
    notes: [
      'The small pale thing that comes out after dark is carrying a little white flower, folded shut. Where did it get that? Nothing that colour grows round the house.',
      'It won’t let me near it. Except once, when it sat beside a lit jack-o’-lantern and didn’t run. It only looked at me. The flower it carries is a moonflower, I’m sure of it now.',
      'Some things can’t be found, only given. If it sits by a jack-o’-lantern again after dark, I won’t chase it. I’ll just go and sit with it. (Or a big old Silver Edge might throw something like it, the way big plants do.)',
    ],
    solution:
      'The moonflower nobody planted is the Pale Visitor. Carve one of the pumpkins round the house (on the porch, by the greenhouse, by the stall or in the patch) and stay near it after full dark. Every few minutes the small pale thing turns up, and often it sits down beside a lit jack-o’-lantern and doesn’t run. Walk right up to it and say hello. Once a night it leaves a Pale Visitor coming up where it sat; pick it before it fades, in a day or so. Or grow a Silver Edge moonflower to Large and take cuttings from it: now and then one comes out Pale Visitor.',
    classicNote: 'The pumpkins and the small pale thing only come in the October look (Season, under the ♪ button). The Silver Edge cuttings work in either.',
  },
  hoya: {
    id: 'hoya',
    defId: 'hoya',
    before: 'compacta',
    target: 'starCluster',
    about: 'the wax plant',
    october: false,
    notes: [
      'The Hindu Rope smells of honey after dark. Deep in the big one’s curled leaves, something glinted, like a star caught in there.',
      'Wax plants only flower once they’re old, and the big Hindu Rope glints after dark as if it’s keeping something. Every plant in the valley has one form nobody has ever listed, and it’s always a big plant that throws it.',
      'Whatever the Hindu Rope is hiding won’t be found growing wild. It will come from the plant itself: a cutting from a big, old one. Maybe more than one cutting. Maybe more than one plant.',
    ],
    solution:
      'The last wax plant is Star Cluster, and it never grows wild. Grow a Hindu Rope to Large or Specimen, then take a cutting from it each time it has recovered: now and then one comes out Star Cluster. A rooting kit from the stall doubles the odds and halves the wait, and every big Hindu Rope is another try a day. A Hindu Rope planted out in a lively garden bed may throw one as a seedling, too.',
  },
};

export const MYSTERY_IDS = Object.keys(MYSTERIES) as MysteryId[];

/** The form before the last has been found, and the last one hasn't. */
export function mysteryOpen(state: GameState, id: MysteryId): boolean {
  const m = MYSTERIES[id];
  return hasFound(state, m.defId, m.before) && !hasFound(state, m.defId, m.target);
}

export function mysteryRecord(state: GameState, id: MysteryId): MysteryRecord {
  let r = state.mysteries[id];
  if (!r || typeof r.played !== 'number' || !Number.isFinite(r.played)) {
    r = { played: 0, stage: 0, onTrack: 0, told: 0, read: false };
    state.mysteries[id] = r;
  }
  return r;
}

/** How far along the hints are for this one: 0 while it's closed (not yet open, or solved). */
export function mysteryStage(state: GameState, id: MysteryId): number {
  if (!mysteryOpen(state, id)) return 0;
  return state.mysteries[id]?.stage ?? 0;
}

function stageFor(played: number): number {
  let s = 0;
  while (s < STAGE_AFTER.length - 1 && played >= STAGE_AFTER[s + 1]) s++;
  return s;
}

/**
 * Counts a moment of play toward each open mystery. Returns the ones whose
 * hints just moved on a step. Nothing counts before the form before the last
 * is found, or after the last one is.
 */
export function tickMysteries(state: GameState, dtSeconds: number): MysteryId[] {
  const dt = Math.max(0, Math.min(MAX_TICK, dtSeconds));
  const up: MysteryId[] = [];
  for (const id of MYSTERY_IDS) {
    if (!mysteryOpen(state, id)) continue;
    const r = mysteryRecord(state, id);
    const pace = r.onTrack > 0 ? ON_TRACK_PACE : 1;
    r.onTrack = Math.max(0, r.onTrack - dt);
    r.played += dt * pace;
    const s = stageFor(r.played);
    if (s > r.stage) {
      r.stage = s;
      up.push(id);
    }
  }
  return up;
}

/** The player just did the thing that leads there: the hints hold back a while. */
export function markOnTrack(state: GameState, id: MysteryId) {
  if (!mysteryOpen(state, id)) return;
  mysteryRecord(state, id).onTrack = ON_TRACK_SECONDS;
}

/** The step whose observation hasn't been shown in the world yet (1–3), or 0. Only the latest counts. */
export function pendingNudge(state: GameState, id: MysteryId): number {
  const stage = mysteryStage(state, id);
  const r = state.mysteries[id];
  if (!r || stage < 1 || stage > 3 || r.told >= stage) return 0;
  return stage;
}

export function markNudged(state: GameState, id: MysteryId, stage: number) {
  const r = mysteryRecord(state, id);
  r.told = Math.max(r.told, stage);
}

/** The guess at the bottom of the page is there to read (step 4), and hasn't been announced yet. */
export function solutionUnannounced(state: GameState, id: MysteryId): boolean {
  return mysteryStage(state, id) >= 4 && (state.mysteries[id]?.told ?? 0) < 4;
}

export interface MysteryNotes {
  id: MysteryId;
  lines: string[];
  /** The answer, once it's on offer; shown only once the player asks to read it. */
  solution: string | null;
  read: boolean;
}

/** What Ellen has written down about one mystery so far, or null while there's nothing. */
export function mysteryNotes(state: GameState, id: MysteryId, october: boolean): MysteryNotes | null {
  const stage = mysteryStage(state, id);
  if (stage < 1) return null;
  const m = MYSTERIES[id];
  const lines = m.notes.slice(0, Math.min(3, stage));
  const solution = stage >= 4 ? (m.classicNote && !october ? `${m.solution} ${m.classicNote}` : m.solution) : null;
  return { id, lines, solution, read: !!state.mysteries[id]?.read };
}

export function markSolutionRead(state: GameState, id: MysteryId) {
  if (mysteryStage(state, id) >= 4) mysteryRecord(state, id).read = true;
}

/**
 * Where an observation can come to the player: what they're near, or doing,
 * when they notice it. Each has a line for steps 1, 2 and 3.
 */
export type NudgeContext = 'plant' | 'smallPlant' | 'woods' | 'lantern' | 'ghost' | 'pumpkin' | 'litPumpkin';

export const NUDGES: Record<MysteryId, Partial<Record<NudgeContext, [string, string, string]>>> = {
  mooncap: {
    plant: [
      'Just for a moment the amber mooncap goes dark in the middle, lit only round its rim. Then it’s amber again.',
      'The Harvest mooncap’s light slips to its rim again. Pale moon, harvest moon… and after that?',
      'Every form comes from the one before. Not every cutting from this Harvest mooncap has to come out amber.',
    ],
    woods: [
      'Low in the leaf litter, a mooncap’s light goes out in the middle and stays lit round the rim. When you look again, it isn’t there.',
      'Somewhere in these woods a mooncap is darker than the amber ones. The October lanterns drift this way sometimes.',
      'If a lantern drifts off between the trees tonight, it might be worth following all the way.',
    ],
    lantern: [
      'The lantern’s light is the same cold colour as the mooncaps’.',
      'The lantern drifts off between the trees, slow enough to follow, as if it knows where something is growing.',
      'Lanterns like this one stop somewhere. Sometimes something of the season is growing where they do.',
    ],
  },
  moonflower: {
    ghost: [
      'The small pale thing is carrying something white: a flower, folded shut, no bigger than a thumbnail.',
      'It’s holding that white flower again. It only seems to sit still where there’s a jack-o’-lantern lit.',
      'If it sits by a lit jack-o’-lantern, maybe don’t chase it. Maybe just go and keep it company.',
    ],
    litPumpkin: [
      'The jack-o’-lantern throws a warm ring of light on the ground.',
      'The jack-o’-lantern’s ring of light is just the size for something small to sit in.',
      'Something small and pale likes the jack-o’-lanterns after dark. It might stay, if you came over quietly.',
    ],
    pumpkin: [
      'A pumpkin by the house, dark and uncarved.',
      'Lit, this pumpkin would throw a warm ring of light, just the size for something small to sit in.',
      'A jack-o’-lantern here would keep someone company after dark. Something small and pale, maybe.',
    ],
  },
  hoya: {
    plant: [
      'The Hindu Rope smells of honey after dark. Deep in its curled leaves something glints, like a star caught in there.',
      'The big Hindu Rope is glinting again. Only the big ones do it.',
      'Whatever’s glinting in there is part of the plant. A cutting from it might carry it.',
    ],
    smallPlant: [
      'The Hindu Rope smells faintly of honey after dark.',
      'Wax plants only flower once they’re big. This one has a way to go.',
      'This Hindu Rope is still small. The big ones are the ones that glint.',
    ],
  },
};

/** The observation for this mystery's latest step, in this context, if there is one. */
export function nudgeText(id: MysteryId, context: NudgeContext, stage: number): string | null {
  return NUDGES[id][context]?.[stage - 1] ?? null;
}

/** The right thing to be doing, for each: a cutting from this form, of at least this size (stage index). */
export const ON_TRACK_CUTTING: Record<MysteryId, { variantId: string; minStage: number }> = {
  mooncap: { variantId: 'harvest', minStage: 0 },
  moonflower: { variantId: 'silverEdge', minStage: 3 },
  hoya: { variantId: 'compacta', minStage: 3 },
};
