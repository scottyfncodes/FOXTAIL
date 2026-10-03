import { describe, it, expect } from 'vitest';
import { mulberry32 } from '../src/game/engine/Random';
import { findMiniGame } from '../src/game/systems/minigames';
import {
  FAR_EDGE,
  FROG_R,
  JUMP_TIME,
  MAX_JUMP,
  MIN_JUMP,
  NEAR_DEPTH,
  POND_W,
  STAGES,
  FrogRun,
  chargeLength,
  holdFor,
  padAt,
  type FrogEvent,
} from '../src/game/systems/minigames/frogJump';

const STEP = 1 / 120;

/** Sits for `s` seconds (gathering a jump), collecting events. */
function wait(run: FrogRun, s: number, events: FrogEvent[]) {
  for (let i = 0; i < Math.round(s / STEP); i++) events.push(...run.step(STEP));
}

/** Waits for the frog to be ready (landed, paddled back) and steps the stretch over if it's cleared. */
function settle(run: FrogRun, events: FrogEvent[]) {
  for (let i = 0; i < 2000 && !run.done; i++) {
    if (run.cleared) run.nextStage();
    if (run.canJump) return;
    events.push(...run.step(STEP));
  }
}

function gauss(rng: () => number) {
  return Math.sqrt(-2 * Math.log(rng() + 1e-9)) * Math.cos(2 * Math.PI * rng());
}

/**
 * A frog with a sense of where it's going: picks the furthest-up pad in
 * reach (or one with a dragonfly, or the far bank), steers clear of pads
 * that are rocking, leads drifting ones, and lets go roughly on time —
 * `wobble` is how rough "roughly" is, in pond units.
 */
function play(seed: number, wobble: number): { run: FrogRun; jumps: number; seconds: number } {
  const rng = mulberry32(seed);
  const run = new FrogRun();
  const events: FrogEvent[] = [];
  let jumps = 0;
  let seconds = 0;
  while (!run.done && jumps < 200) {
    settle(run, events);
    if (run.done) break;
    const f = run.frog;
    const st = run.stageDef;
    // Thinking time.
    const think = 0.4 + rng() * 0.4;
    wait(run, think, events);
    let goal: { x: number; y: number; hold: number } | null = null;
    // The far bank, if it's in reach.
    if (f.y - (FAR_EDGE - 0.3) <= MAX_JUMP * 0.9) {
      const len = Math.max(MIN_JUMP, f.y - (FAR_EDGE - 0.35));
      goal = { x: f.x, y: f.y - len, hold: holdFor(len) };
    } else {
      let bestScore = -Infinity;
      st.pads.forEach((p, i) => {
        if (i === f.on) return;
        // Guess where it'll be when we land.
        let s = padAt(p, run.t);
        let hold = 0;
        for (let k = 0; k < 3; k++) {
          const len = Math.hypot(s.x - f.x, s.y - f.y);
          hold = holdFor(len);
          s = padAt(p, run.t + hold + JUMP_TIME);
        }
        const len = Math.hypot(s.x - f.x, s.y - f.y);
        if (len > MAX_JUMP * 0.95 || len < MIN_JUMP) return;
        const later = padAt(p, run.t + hold + JUMP_TIME + 1.5);
        if (s.under || s.rock > 0 || later.under) return;
        const fly = st.flies.some((fl, j) => fl.pad === i && !run.caught.has(j));
        const score = (f.y - s.y) * 2 + (fly ? 2.5 : 0) - (run.visited.has(i) ? 6 : 0) - len * 0.3;
        if (score > bestScore) {
          bestScore = score;
          goal = { x: s.x, y: s.y, hold };
        }
      });
    }
    if (!goal) {
      wait(run, 0.5, events);
      continue;
    }
    const g = goal as { x: number; y: number; hold: number };
    const len = Math.hypot(g.x - f.x, g.y - f.y) + gauss(rng) * wobble;
    const ang = Math.atan2(g.y - f.y, g.x - f.x) + gauss(rng) * wobble * 0.15;
    const hold = holdFor(Math.max(MIN_JUMP, Math.min(MAX_JUMP, len)));
    wait(run, Math.max(0, hold - think), events);
    run.jump(Math.cos(ang), Math.sin(ang), hold);
    jumps++;
    wait(run, JUMP_TIME + STEP, events);
    seconds += think + hold + JUMP_TIME;
  }
  return { run, jumps, seconds: run.done ? seconds : Infinity };
}

/** Throws itself at the water: any old direction (mostly forward), any old hold. */
function aimless(seed: number, maxJumps = 60): FrogRun {
  const rng = mulberry32(seed);
  const run = new FrogRun();
  const events: FrogEvent[] = [];
  for (let j = 0; j < maxJumps && !run.done; j++) {
    settle(run, events);
    if (run.done) break;
    const a = -Math.PI / 2 + (rng() - 0.5) * 2.2;
    const hold = rng() * 1.5;
    wait(run, hold, events);
    run.jump(Math.cos(a), Math.sin(a), hold);
    wait(run, JUMP_TIME + STEP, events);
  }
  return run;
}

describe('frog jump pieces', () => {
  it('the jump swells to full and eases back', () => {
    expect(chargeLength(0)).toBeCloseTo(MIN_JUMP);
    expect(chargeLength(0.75)).toBeCloseTo(MAX_JUMP);
    expect(chargeLength(1.5)).toBeCloseTo(MIN_JUMP);
    for (const len of [1, 1.7, 2.5]) expect(chargeLength(holdFor(len))).toBeCloseTo(len);
  });

  it('every stretch can be crossed: pads in reach of each other, from bank to bank', () => {
    for (const st of STAGES) {
      // Pads (at their base positions) reachable from the near bank, then from each other.
      const reach = MAX_JUMP * 0.9;
      const start = { x: POND_W / 2, y: st.length - NEAR_DEPTH / 2 };
      const seen = new Set<number>();
      let frontier = [start];
      let crossed = false;
      while (frontier.length && !crossed) {
        const next: { x: number; y: number }[] = [];
        for (const p of frontier) {
          if (p.y - FAR_EDGE <= reach) crossed = true;
          st.pads.forEach((pad, i) => {
            if (!seen.has(i) && Math.hypot(pad.x - p.x, pad.y - p.y) <= reach) {
              seen.add(i);
              next.push(pad);
            }
          });
        }
        frontier = next;
      }
      expect(crossed).toBe(true);
      for (const pad of st.pads) {
        expect(pad.x - pad.r).toBeGreaterThan(-0.5);
        expect(pad.x + pad.r).toBeLessThan(POND_W + 0.5);
      }
    }
  });

  it('the stretches get harder: smaller pads', () => {
    const avgR = STAGES.map((s) => s.pads.reduce((a, p) => a + p.r, 0) / s.pads.length);
    expect(avgR[1]).toBeLessThan(avgR[0]);
    expect(avgR[2]).toBeLessThan(avgR[1]);
  });

  it('a hop onto a pad scores; a miss splashes and paddles back, combo gone', () => {
    const run = new FrogRun();
    const ev: FrogEvent[] = [];
    const pad = STAGES[0].pads[0];
    const len = Math.hypot(pad.x - run.frog.x, pad.y - run.frog.y);
    run.jump(pad.x - run.frog.x, pad.y - run.frog.y, holdFor(len));
    wait(run, JUMP_TIME + 0.05, ev);
    expect(ev.some((e) => e.type === 'hop' && e.points > 0)).toBe(true);
    expect(run.frog.on).toBe(0);
    expect(run.combo).toBe(1);
    const score = run.score;
    // Straight sideways into open water.
    run.jump(-1, 0, holdFor(1.6));
    wait(run, JUMP_TIME + 0.05, ev);
    expect(ev.some((e) => e.type === 'splash')).toBe(true);
    expect(run.combo).toBe(0);
    expect(run.score).toBe(score);
    expect(run.canJump).toBe(false);
    settle(run, ev);
    expect(run.frog.on).toBe(0);
    expect(Math.hypot(run.frog.x - padAt(pad, run.t).x, run.frog.y - pad.y)).toBeLessThan(FROG_R);
  });

  it('a flowering pad goes under and dunks a frog that lingers', () => {
    const st = STAGES[1];
    const i = st.pads.findIndex((p) => p.kind === 'flower');
    const p = st.pads[i];
    let wasRocking = false;
    let wentUnder = false;
    for (let t = 0; t < p.bob!.period; t += 0.05) {
      const s = padAt(p, t);
      if (s.rock > 0) wasRocking = true;
      if (s.under) {
        wentUnder = true;
        // It always rocks before it goes.
        expect(wasRocking).toBe(true);
      }
    }
    expect(wentUnder).toBe(true);
  });

  it('re-landing on a pad already visited scores nothing', () => {
    const run = new FrogRun();
    const ev: FrogEvent[] = [];
    const pad = STAGES[0].pads[0];
    run.jump(pad.x - run.frog.x, pad.y - run.frog.y, holdFor(Math.hypot(pad.x - run.frog.x, pad.y - run.frog.y)));
    wait(run, JUMP_TIME + 0.05, ev);
    const s = run.score;
    // A tiny hop on the spot, back onto the same pad.
    run.jump(0, -1, 0);
    wait(run, JUMP_TIME + 0.05, ev);
    expect(run.frog.on).toBe(0);
    expect(run.score).toBe(s);
  });
});

describe('frog jump sessions', () => {
  const goal = findMiniGame('frogJump')!.goal;

  it('a decent player reaches the goal most of the time, in a short session', () => {
    const runs = Array.from({ length: 20 }, (_, i) => play(i + 1, 0.3));
    const scores = runs.map((r) => r.run.score);
    expect(runs.every((r) => r.run.done)).toBe(true);
    expect(scores.filter((s) => s >= goal).length).toBeGreaterThanOrEqual(12);
    // Roughly a minute or two of jumping (plus banners).
    for (const r of runs) expect(r.seconds).toBeLessThan(150);
  });

  it('a sharp player does well but the score stays bounded', () => {
    for (let i = 1; i <= 10; i++) {
      const r = play(i, 0.08);
      expect(r.run.done).toBe(true);
      expect(r.run.score).toBeGreaterThan(goal);
      expect(r.run.score).toBeLessThan(140);
    }
  });

  it('flinging about without looking does not get there', () => {
    for (let i = 1; i <= 30; i++) expect(aimless(i).score).toBeLessThan(goal);
  });
});
