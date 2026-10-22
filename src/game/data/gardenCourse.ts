import type { Hole, Obstacle } from '../systems/putting';

// Scott's garden course: nine holes cut into the moss under the last oaks
// at the woodland's edge, with an old tin can sunk at the end of each and
// a flag on a garden cane. Where the living-room mat is a course of things
// left lying about, this one is the garden's own: roots, toadstools, the
// creek and its log bridge, a hollow log, the ferny banks, a hedgehog who
// lives here and doesn't care that you're putting, and the fairy dell.
//
// Each hole has one idea, and a choice: the safe way round, or the shot
// that's there for anyone who can play it. Holes are 5 wide and 9 long in
// course units (the mat is 3.6), tee at the bottom, cup at the top; the
// fairway is the polygon inside its edging, and everything outside it is
// garden, drawn but out of play.

type P = { x: number; y: number };

/** A winding fairway: the band `half` either side of a centre line, as a closed outline. */
export function ribbon(line: P[], half: number): P[] {
  const left: P[] = [];
  const right: P[] = [];
  for (let i = 0; i < line.length; i++) {
    const prev = line[Math.max(0, i - 1)];
    const next = line[Math.min(line.length - 1, i + 1)];
    // The normal at a joint is the average of its two segments', stretched to keep the band's width round a bend.
    const d1 = norm(line[i].x - prev.x, line[i].y - prev.y);
    const d2 = norm(next.x - line[i].x, next.y - line[i].y);
    const dx = i === 0 ? d2.x : i === line.length - 1 ? d1.x : d1.x + d2.x;
    const dy = i === 0 ? d2.y : i === line.length - 1 ? d1.y : d1.y + d2.y;
    const t = norm(dx, dy);
    const nx = -t.y;
    const ny = t.x;
    const cos = i === 0 || i === line.length - 1 ? 1 : Math.max(0.55, nx * -d1.y + ny * d1.x);
    const k = half / cos;
    left.push({ x: line[i].x + nx * k, y: line[i].y + ny * k });
    right.push({ x: line[i].x - nx * k, y: line[i].y - ny * k });
  }
  return [...left, ...right.reverse()];
}

/** An oval fairway, as an outline of `n` points. */
export function oval(cx: number, cy: number, rx: number, ry: number, n = 28): P[] {
  return Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    return { x: cx + Math.cos(a) * rx, y: cy + Math.sin(a) * ry };
  });
}

/** A box with its corners cut, so the edging reads as hand-laid rather than ruled. */
export function softBox(x0: number, y0: number, x1: number, y1: number, cut = 0.45): P[] {
  return [
    { x: x0 + cut, y: y0 },
    { x: x1 - cut, y: y0 },
    { x: x1, y: y0 + cut },
    { x: x1, y: y1 - cut },
    { x: x1 - cut, y: y1 },
    { x: x0 + cut, y: y1 },
    { x: x0, y: y1 - cut },
    { x: x0, y: y0 + cut },
  ];
}

function norm(x: number, y: number): P {
  const l = Math.hypot(x, y) || 1;
  return { x: x / l, y: y / l };
}

/** A ring of toadstools round (cx, cy), one every `step` degrees, with the gaps left at the angles given. */
function toadstoolRing(cx: number, cy: number, R: number, step: number, gaps: number[]): Obstacle[] {
  const out: Obstacle[] = [];
  for (let deg = 0; deg < 360; deg += step) {
    if (gaps.some((g) => Math.abs(((deg - g + 540) % 360) - 180) < 1)) continue;
    const a = (deg * Math.PI) / 180;
    out.push({ shape: 'circle', kind: 'toadstool', x: cx + Math.cos(a) * R, y: cy + Math.sin(a) * R, r: 0.17, bounce: 0.9 });
  }
  return out;
}

export const GARDEN_W = 5;
export const GARDEN_L = 9;

const flat = { x: 0, y: 0 };

export const GARDEN_HOLES: Hole[] = [
  {
    // A gentle S of moss between two old roots, and a soft dip round the cup that gathers a good putt in.
    id: 'g-moss',
    name: 'Moss Run',
    par: 2,
    tip: 'Follow the moss. The dip by the cup helps a gentle putt.',
    w: GARDEN_W,
    l: GARDEN_L,
    tee: { x: 1.55, y: 8.2 },
    cup: { x: 3.05, y: 1.5 },
    slope: flat,
    boundary: ribbon(
      [
        { x: 1.55, y: 9.3 },
        { x: 1.55, y: 6.8 },
        { x: 2.5, y: 5.0 },
        { x: 3.3, y: 3.3 },
        { x: 3.05, y: 1.2 },
        { x: 3.0, y: -0.3 },
      ],
      1.0
    ),
    obstacles: [
      // The roots reach in at the bends: a bank shot off either is fair.
      { shape: 'capsule', kind: 'root', a: { x: -0.2, y: 5.4 }, b: { x: 1.35, y: 4.95 }, r: 0.17 },
      { shape: 'capsule', kind: 'root', a: { x: 5.2, y: 5.2 }, b: { x: 3.85, y: 5.1 }, r: 0.15 },
    ],
    zones: [{ kind: 'hill', x: 2.2, y: 0.75, w: 1.7, h: 1.5, pull: -0.7 }],
  },
  {
    // A great root lies right across. Round the end is easy; it's split in the middle, right in line with the cup.
    id: 'g-root',
    name: 'The Old Root',
    par: 2,
    tip: 'Round the end, or thread the split in the root.',
    w: GARDEN_W,
    l: GARDEN_L,
    tee: { x: 2.59, y: 8.2 },
    cup: { x: 2.59, y: 1.35 },
    slope: flat,
    boundary: softBox(0.4, 0.3, 4.6, 8.8, 0.6),
    obstacles: [
      { shape: 'capsule', kind: 'root', a: { x: -0.3, y: 4.85 }, b: { x: 2.11, y: 4.45 }, r: 0.24 },
      { shape: 'capsule', kind: 'root', a: { x: 3.07, y: 4.45 }, b: { x: 3.85, y: 4.65 }, r: 0.22 },
    ],
    // Long grass past the root's end: the safe way pays for it.
    zones: [{ kind: 'rough', x: 3.55, y: 2.6, w: 1.1, h: 1.6 }],
  },
  {
    // A grove of toadstools, springy as anything, and a ring of them round the cup with two ways in.
    id: 'g-toadstools',
    name: 'Toadstool Grove',
    par: 3,
    tip: 'The caps are springy. Two ways into the ring.',
    w: GARDEN_W,
    l: GARDEN_L,
    tee: { x: 2.5, y: 8.25 },
    cup: { x: 2.5, y: 1.95 },
    slope: flat,
    boundary: oval(2.5, 4.65, 2.3, 4.35),
    obstacles: [
      ...toadstoolRing(2.5, 1.95, 0.95, 30, [270, 30]),
      { shape: 'circle', kind: 'toadstool', x: 1.35, y: 5.6, r: 0.24, bounce: 0.9 },
      { shape: 'circle', kind: 'toadstool', x: 3.55, y: 4.7, r: 0.28, bounce: 0.9 },
      { shape: 'circle', kind: 'toadstool', x: 2.35, y: 6.55, r: 0.2, bounce: 0.9 },
    ],
  },
  {
    // The creek. A railed log bridge off to the left, or the narrow plank straight to the cup.
    id: 'g-bridge',
    name: 'Log Bridge',
    par: 3,
    tip: 'The log bridge is safe. The plank is quicker, if you stay on it.',
    w: GARDEN_W,
    l: GARDEN_L,
    tee: { x: 3.37, y: 8.2 },
    cup: { x: 3.37, y: 1.35 },
    slope: flat,
    boundary: softBox(0.3, 0.3, 4.7, 8.8, 0.5),
    obstacles: [
      // The log bridge's rails.
      { shape: 'capsule', kind: 'rail', a: { x: 0.62, y: 3.9 }, b: { x: 0.62, y: 5.2 }, r: 0.06 },
      { shape: 'capsule', kind: 'rail', a: { x: 1.62, y: 3.9 }, b: { x: 1.62, y: 5.2 }, r: 0.06 },
    ],
    zones: [
      { kind: 'water', x: 0, y: 4.0, w: GARDEN_W, h: 1.1 },
      { kind: 'bridge', x: 0.62, y: 3.85, w: 1.0, h: 1.4 },
      { kind: 'bridge', x: 3.14, y: 3.9, w: 0.46, h: 1.3 },
    ],
  },
  {
    // A dogleg round a bed of ferns, and a hollow log through it from one leg to the other.
    id: 'g-log',
    name: 'Hollow Log',
    par: 3,
    tip: 'Up and round, or straight through the hollow log.',
    w: GARDEN_W,
    l: GARDEN_L,
    tee: { x: 3.9, y: 8.2 },
    cup: { x: 1.4, y: 1.1 },
    slope: flat,
    boundary: [
      { x: 2.9, y: 8.8 },
      { x: 4.8, y: 8.8 },
      { x: 4.8, y: 0.8 },
      { x: 4.2, y: 0.25 },
      { x: 0.7, y: 0.25 },
      { x: 0.2, y: 0.8 },
      { x: 0.2, y: 2.5 },
      { x: 2.9, y: 2.5 },
    ],
    obstacles: [{ shape: 'circle', kind: 'stump', x: 3.62, y: 4.3, r: 0.3 }],
    tubes: [{ a: { x: 3.13, y: 5.4 }, b: { x: 1.6, y: 2.05 } }],
  },
  {
    // Two ferny banks to climb, the cup on the top terrace with a bank behind it — and a path under the ferns down the side.
    id: 'g-ferns',
    name: 'Fern Terraces',
    par: 3,
    tip: 'Firm up the banks. Something rustles in the ferns on the right.',
    w: GARDEN_W,
    l: GARDEN_L,
    tee: { x: 2.1, y: 8.2 },
    cup: { x: 2.1, y: 1.5 },
    slope: flat,
    boundary: softBox(0.3, 0.3, 4.8, 8.8, 0.4),
    obstacles: [
      // A hedge of fern stems between the terraces and the hidden path.
      { shape: 'capsule', kind: 'fern', a: { x: 4.1, y: 7.4 }, b: { x: 4.1, y: 1.9 }, r: 0.12 },
    ],
    zones: [
      { kind: 'ramp', x: 0.3, y: 5.4, w: 3.68, h: 0.8, slope: { x: 0, y: 0.95 } },
      { kind: 'ramp', x: 0.3, y: 3.0, w: 3.68, h: 0.8, slope: { x: 0, y: 0.95 } },
      // The bank behind the cup turns a firm putt back toward it.
      { kind: 'ramp', x: 0.3, y: 0.3, w: 3.68, h: 0.6, slope: { x: 0, y: 0.8 } },
      // Under the ferns, old flagstones: quick going.
      { kind: 'slick', x: 4.22, y: 1.9, w: 0.58, h: 5.5 },
    ],
  },
  {
    // Two great stones and a gap between, and the hedgehog who lives here trundling to and fro across it.
    id: 'g-hedgehog',
    name: 'Hedgehog Crossing',
    par: 3,
    tip: 'Mind the hedgehog. He keeps to his own time.',
    w: GARDEN_W,
    l: GARDEN_L,
    tee: { x: 2.5, y: 8.2 },
    cup: { x: 2.5, y: 1.4 },
    slope: flat,
    boundary: softBox(0.3, 0.3, 4.7, 8.8, 0.5),
    obstacles: [
      { shape: 'circle', kind: 'stone', x: 1.0, y: 4.6, r: 0.75 },
      { shape: 'circle', kind: 'stone', x: 4.0, y: 4.6, r: 0.75 },
      { shape: 'circle', kind: 'hedgehog', x: 2.5, y: 4.6, r: 0.3, swing: { dx: 0.55, dy: 0, period: 4.8 } },
    ],
    zones: [
      { kind: 'rough', x: 0.3, y: 5.5, w: 1.3, h: 1.6 },
      { kind: 'rough', x: 3.4, y: 5.5, w: 1.3, h: 1.6 },
    ],
  },
  {
    // A mossy mound between the tee and the dell the cup sits in. Dead straight and firm goes over the top; anything else is turned aside.
    id: 'g-dell',
    name: 'The Fairy Dell',
    par: 3,
    tip: 'Over the mound, dead straight, or round it.',
    w: GARDEN_W,
    l: GARDEN_L,
    tee: { x: 2.5, y: 8.2 },
    cup: { x: 2.5, y: 1.55 },
    slope: flat,
    boundary: oval(2.5, 4.65, 2.25, 4.3),
    obstacles: [],
    zones: [
      { kind: 'hill', x: 1.15, y: 3.3, w: 2.7, h: 2.3, pull: 1.25 },
      { kind: 'hill', x: 1.55, y: 0.75, w: 1.9, h: 1.6, pull: -1.0 },
    ],
  },
  {
    // The way home: a long winding path, a branch swinging low across it, and the pond waiting on the inside of the last bend.
    id: 'g-home',
    name: 'The Long Way Home',
    par: 4,
    tip: 'Time the branch. Don’t cut the last bend too fine.',
    w: GARDEN_W,
    l: GARDEN_L,
    tee: { x: 3.9, y: 8.3 },
    cup: { x: 3.7, y: 1.1 },
    slope: flat,
    boundary: ribbon(
      [
        { x: 3.9, y: 9.3 },
        { x: 3.9, y: 6.9 },
        { x: 2.6, y: 5.6 },
        { x: 1.25, y: 4.3 },
        { x: 1.3, y: 2.3 },
        { x: 2.5, y: 1.15 },
        { x: 3.7, y: 1.0 },
        { x: 5.3, y: 1.0 },
      ],
      0.9
    ),
    obstacles: [
      // Hanging off the oak at the first bend, swinging slow and low.
      { shape: 'capsule', kind: 'branch', a: { x: 4.4, y: 4.1 }, b: { x: 2.6, y: 5.5 }, r: 0.1, pendulum: { amp: 0.55, period: 4.2 } },
    ],
    zones: [{ kind: 'water', x: 1.95, y: 1.75, w: 1.3, h: 1.3, round: true }],
  },
];

export const GARDEN_COURSE_ID = 'garden-9';
