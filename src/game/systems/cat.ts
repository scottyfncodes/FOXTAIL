import type { CatActivity, CatState } from '../state';
import { CAT_SPOTS, findCatSpot, spotPosition, type AnchorOffset, type CatSpotKind } from '../data/catSpots';
import { interiorWaypoint } from '../data/interior';
import { weightedPick } from '../engine/Random';
import { plantRoles } from './beds';

// The house cat: ambient, indoor-only, and indifferent to everyone. He has
// his places — the couch, his bed, the window, the sunny spot among the
// stands — and his own ideas: now and then he goes to sniff at one of the
// plants, tucks himself away behind something big and leafy, or curls up
// in an empty propagation tray. Nobody asks him to.

const TRAVEL_SPEED = 2.6; // tiles/sec — quicker, lower steps than Scott's
const ARRIVE_DIST = 0.25;

const DURATIONS: Record<CatSpotKind, [number, number]> = {
  perch: [20, 45],
  sleep: [60, 150],
  groom: [8, 18],
};

const ACTIVITY_FOR_KIND: Record<CatSpotKind, 'sitting' | 'sleeping' | 'grooming'> = {
  perch: 'sitting',
  sleep: 'sleeping',
  groom: 'grooming',
};

const WHIM_DURATIONS: Partial<Record<CatActivity, [number, number]>> = {
  investigating: [6, 16],
  hiding: [30, 70],
  sleeping: [50, 120],
};

/** Plants he won't go near: anything with teeth, hairs or a cup of something. */
export function catAvoids(defId: string, variantId: string): boolean {
  return plantRoles(defId, variantId).includes('carnivore');
}

/** Somewhere he might take an interest in: a plant, and whether it's big enough to hide behind. */
export interface CatInterest {
  x: number;
  y: number;
  /** Large and leafy enough to disappear behind. */
  big: boolean;
  /** An empty tray or bed, just his size. */
  emptyTray?: boolean;
}

export interface CatTickContext {
  dtSeconds: number;
  now: number; // game-minutes
  rand: () => number;
  /** Plants and trays around the house right now. */
  interests?: CatInterest[];
  /** How far the living-room furniture has been moved, so his spots follow it. */
  offset?: AnchorOffset;
}

function pickWhim(cat: CatState, ctx: CatTickContext): boolean {
  const list = ctx.interests ?? [];
  if (list.length === 0) return false;
  const roll = ctx.rand();
  const pick = <T>(items: T[]) => items[Math.floor(ctx.rand() * items.length)];
  if (roll < 0.22) {
    const plants = list.filter((i) => !i.emptyTray);
    if (!plants.length) return false;
    const it = pick(plants);
    const side = ctx.rand() < 0.5 ? -1 : 1;
    cat.targetX = it.x + side * 0.42;
    cat.targetY = it.y + 0.12;
    cat.lookX = it.x;
    cat.targetActivity = 'investigating';
    return true;
  }
  if (roll < 0.32) {
    const big = list.filter((i) => i.big);
    if (!big.length) return false;
    const it = pick(big);
    // Just behind the plant, so its leaves are drawn over him.
    cat.targetX = it.x + (ctx.rand() - 0.5) * 0.2;
    cat.targetY = it.y - 0.14;
    cat.targetActivity = 'hiding';
    return true;
  }
  if (roll < 0.37) {
    const trays = list.filter((i) => i.emptyTray);
    if (!trays.length) return false;
    const it = pick(trays);
    cat.targetX = it.x;
    cat.targetY = it.y + 0.02;
    cat.targetActivity = 'sleeping';
    return true;
  }
  return false;
}

/** How high he's sitting right now (on the couch, the TV…), in tiles. */
export function catLift(cat: CatState): number {
  if (cat.activity === 'wandering') return 0;
  if (cat.currentSpotId?.startsWith('whim:')) return cat.currentSpotId === 'whim:tray' ? 0.12 : 0;
  return cat.currentSpotId ? findCatSpot(cat.currentSpotId)?.lift ?? 0 : 0;
}

export function tickCat(cat: CatState, ctx: CatTickContext): void {
  if (cat.activity !== 'wandering') {
    // Settled on a piece of furniture that's been moved: he goes with it.
    const here = cat.currentSpotId ? findCatSpot(cat.currentSpotId) : undefined;
    if (here?.anchor) {
      const at = spotPosition(here, ctx.offset);
      cat.x = at.x;
      cat.y = at.y;
    }
    if (ctx.now < cat.nextChangeAt) return;
    cat.targetX = null;
    cat.targetY = null;
    cat.targetActivity = null;
    cat.lookX = null;
    if (!pickWhim(cat, ctx)) {
      const options = CAT_SPOTS.filter((s) => s.id !== cat.currentSpotId);
      const next = weightedPick(options, (s) => s.weight ?? 1, ctx.rand) ?? CAT_SPOTS[0];
      cat.targetSpotId = next.id;
    }
    cat.activity = 'wandering';
    return;
  }

  const whim = cat.targetX != null && cat.targetY != null;
  const spot = whim ? null : findCatSpot(cat.targetSpotId);
  if (!whim && !spot) {
    cat.activity = 'sitting';
    cat.currentSpotId = null;
    cat.nextChangeAt = ctx.now + 10;
    return;
  }
  const at = spot ? spotPosition(spot, ctx.offset) : null;
  const tx = whim ? cat.targetX! : at!.x;
  const ty = whim ? cat.targetY! : at!.y;

  const d = Math.hypot(tx - cat.x, ty - cat.y);
  if (d > ARRIVE_DIST) {
    // Rooms are joined by one doorway: go through it, not through the wall.
    const wp = interiorWaypoint(cat.x, cat.y, tx, ty);
    const wdx = wp.x - cat.x;
    const wdy = wp.y - cat.y;
    const wd = Math.hypot(wdx, wdy) || 1;
    const step = Math.min(TRAVEL_SPEED * ctx.dtSeconds, wd);
    cat.x += (wdx / wd) * step;
    cat.y += (wdy / wd) * step;
    if (Math.abs(wdx) > 0.03 || Math.abs(wdy) > 0.03) {
      cat.facing = Math.abs(wdx) > Math.abs(wdy) ? (wdx > 0 ? 'right' : 'left') : wdy > 0 ? 'down' : 'up';
    }
    return;
  }

  if (whim) {
    const act = cat.targetActivity ?? 'sitting';
    cat.activity = act;
    cat.currentSpotId = act === 'sleeping' ? 'whim:tray' : `whim:${act}`;
    const [minD, maxD] = WHIM_DURATIONS[act] ?? [10, 20];
    cat.nextChangeAt = ctx.now + minD + ctx.rand() * (maxD - minD);
    // Nose toward the plant he's investigating.
    cat.facing = act === 'investigating' && cat.lookX != null ? (cat.lookX > cat.x ? 'right' : 'left') : 'down';
    return;
  }
  cat.currentSpotId = spot!.id;
  cat.activity = ACTIVITY_FOR_KIND[spot!.kind];
  const [minD, maxD] = DURATIONS[spot!.kind];
  cat.nextChangeAt = ctx.now + minD + ctx.rand() * (maxD - minD);
  cat.facing = 'down';
}
