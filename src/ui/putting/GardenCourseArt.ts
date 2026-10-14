import { hashString, mulberry32 } from '../../game/engine/Random';
import { EDGE_R, TUBE_R, holeL, holeW, type CapsuleObstacle, type Hole, type Obstacle, type Tube, type Zone } from '../../game/systems/putting';

// How Scott's garden course looks: a fairway of close-cropped moss inside
// its timber edging, the garden spilling up to it on every side (ferns,
// clover, a few flowers and toadstools — all out of play), and the hole's
// own feature drawn so it reads at a glance on a phone: the springy red
// caps, the creek and its bridges, the hollow log, the hedgehog.
//
// The still parts of a hole are painted once into a backdrop canvas and
// reused every frame; only what moves (water, the hedgehog, a swinging
// branch, a cap that's just been hit) is drawn live.

type Ctx = CanvasRenderingContext2D;
type P = { x: number; y: number };

export const GARDEN_COLORS = {
  soil: '#3c3322',
  bed: '#47552f',
  bedDark: '#3a4727',
  moss: '#5f8f43',
  mossLight: '#6fa04d',
  mossDark: '#4f7d38',
  edging: '#6b4a2e',
  edgingTop: '#9a7149',
  rough: '#557f35',
  water: '#4f86a0',
  waterDeep: '#3d6f88',
  stone: '#9a9586',
  stoneDark: '#77725f',
  bark: '#6b4a2e',
  barkDark: '#4e3420',
  cap: '#c8473a',
  stalk: '#efe6d2',
};

const C = GARDEN_COLORS;

export function pointInPolygon(poly: P[], x: number, y: number): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/** Whether (x, y) is on the hole's fairway (inside the box, and inside the edging if it has one). */
export function onFairway(hole: Hole, x: number, y: number): boolean {
  if (x < 0 || y < 0 || x > holeW(hole) || y > holeL(hole)) return false;
  return hole.boundary ? pointInPolygon(hole.boundary, x, y) : true;
}

function polyPath(ctx: Ctx, poly: P[], X: (x: number) => number, Y: (y: number) => number) {
  ctx.beginPath();
  poly.forEach((p, i) => (i ? ctx.lineTo(X(p.x), Y(p.y)) : ctx.moveTo(X(p.x), Y(p.y))));
  ctx.closePath();
}

/**
 * Paints the still parts of a garden hole into a canvas `pw` × `ph` CSS px
 * (at `dpr`), where the box's top-left is at (ox, oy) and a course unit is
 * `s` px.
 */
export function paintGardenBackdrop(hole: Hole, pw: number, ph: number, ox: number, oy: number, s: number, dpr: number): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = Math.max(1, Math.round(pw * dpr));
  cv.height = Math.max(1, Math.round(ph * dpr));
  const ctx = cv.getContext('2d');
  if (!ctx) return cv;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const X = (x: number) => ox + x * s;
  const Y = (y: number) => oy + y * s;
  const W = holeW(hole);
  const L = holeL(hole);
  const rnd = mulberry32(hashString(hole.id));

  // The garden all round: a bed of low green, darker under the oaks.
  ctx.fillStyle = C.bedDark;
  ctx.fillRect(0, 0, pw, ph);
  ctx.fillStyle = C.bed;
  ctx.fillRect(X(0), Y(0), W * s, L * s);
  // Mottling: soft darker and lighter patches of leaf and clover.
  for (let i = 0; i < 70; i++) {
    const x = rnd() * W;
    const y = rnd() * L;
    ctx.fillStyle = rnd() < 0.5 ? 'rgba(30,45,20,0.18)' : 'rgba(150,180,110,0.08)';
    ctx.beginPath();
    ctx.ellipse(X(x), Y(y), s * (0.25 + rnd() * 0.5), s * (0.18 + rnd() * 0.35), rnd() * 3, 0, Math.PI * 2);
    ctx.fill();
  }
  // What grows in the beds: ferns, clover, flowers and the odd toadstool, never on the fairway.
  paintBedPlants(ctx, hole, X, Y, s, rnd);

  // The fairway: close-cropped moss, mown in faint bands.
  const fairway = hole.boundary ?? [
    { x: 0, y: 0 },
    { x: W, y: 0 },
    { x: W, y: L },
    { x: 0, y: L },
  ];
  ctx.save();
  // Its shadow on the bed, just below the edging.
  ctx.save();
  ctx.translate(0, s * 0.06);
  polyPath(ctx, fairway, X, Y);
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.fill();
  ctx.restore();
  polyPath(ctx, fairway, X, Y);
  ctx.clip();
  const g = ctx.createLinearGradient(0, Y(0), 0, Y(L));
  g.addColorStop(0, C.mossLight);
  g.addColorStop(1, C.moss);
  ctx.fillStyle = g;
  ctx.fillRect(X(0) - 2, Y(0) - 2, W * s + 4, L * s + 4);
  ctx.fillStyle = 'rgba(255,255,220,0.05)';
  for (let y = 0; y < L; y += 1) if (Math.round(y) % 2 === 0) ctx.fillRect(X(0), Y(y), W * s, s * 0.5);
  // The moss's own texture: tiny lighter and darker flecks.
  for (let i = 0; i < 260; i++) {
    const x = rnd() * W;
    const y = rnd() * L;
    ctx.fillStyle = rnd() < 0.5 ? 'rgba(40,70,25,0.22)' : 'rgba(190,220,140,0.16)';
    ctx.fillRect(X(x), Y(y), Math.max(1, s * 0.03), Math.max(1, s * 0.03));
  }
  for (const z of hole.zones ?? []) paintZone(ctx, z, X, Y, s, rnd);
  ctx.restore();

  // The edging: an old timber border pegged in round the moss.
  if (hole.boundary) {
    ctx.save();
    ctx.lineJoin = 'round';
    polyPath(ctx, fairway, X, Y);
    ctx.strokeStyle = C.barkDark;
    ctx.lineWidth = Math.max(3, EDGE_R * 2 * s + 3);
    ctx.stroke();
    polyPath(ctx, fairway, X, Y);
    ctx.strokeStyle = C.edging;
    ctx.lineWidth = Math.max(2, EDGE_R * 2 * s + 1);
    ctx.stroke();
    ctx.translate(-0.6, -0.8);
    polyPath(ctx, fairway, X, Y);
    ctx.strokeStyle = 'rgba(214,170,120,0.35)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
  }
  // The outer hedge line where the box ends.
  ctx.strokeStyle = 'rgba(20,30,14,0.5)';
  ctx.lineWidth = 2;
  ctx.strokeRect(X(0), Y(0), W * s, L * s);
  return cv;
}

function paintBedPlants(ctx: Ctx, hole: Hole, X: (x: number) => number, Y: (y: number) => number, s: number, rnd: () => number) {
  const W = holeW(hole);
  const L = holeL(hole);
  const clear = (x: number, y: number, pad: number) => {
    if (onFairway(hole, x, y)) return false;
    // Keep a little way back from the edging so nothing seems to hang over the play.
    for (const [dx, dy] of [
      [pad, 0],
      [-pad, 0],
      [0, pad],
      [0, -pad],
    ]) if (onFairway(hole, x + dx, y + dy)) return false;
    return true;
  };
  const flowers = ['#f4efe0', '#f2d35a', '#e9a6c0', '#c9b6e8', '#9fc2e8'];
  for (let i = 0; i < 260; i++) {
    const x = rnd() * W;
    const y = rnd() * L;
    const kind = rnd();
    if (kind < 0.35) {
      if (!clear(x, y, 0.35)) continue;
      fern(ctx, X(x), Y(y), s * (0.35 + rnd() * 0.25), rnd() * Math.PI * 2);
    } else if (kind < 0.62) {
      if (!clear(x, y, 0.12)) continue;
      // Clover: three round leaves.
      ctx.fillStyle = rnd() < 0.5 ? '#5d8a3c' : '#6b9a45';
      const r = s * 0.06;
      for (let k = 0; k < 3; k++) {
        const a = (k / 3) * Math.PI * 2 + i;
        ctx.beginPath();
        ctx.arc(X(x) + Math.cos(a) * r, Y(y) + Math.sin(a) * r, r, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (kind < 0.9) {
      if (!clear(x, y, 0.12)) continue;
      ctx.fillStyle = flowers[Math.floor(rnd() * flowers.length)];
      const r = s * (0.04 + rnd() * 0.03);
      for (let k = 0; k < 5; k++) {
        const a = (k / 5) * Math.PI * 2;
        ctx.beginPath();
        ctx.arc(X(x) + Math.cos(a) * r, Y(y) + Math.sin(a) * r, r * 0.75, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = '#e8b83a';
      ctx.beginPath();
      ctx.arc(X(x), Y(y), r * 0.5, 0, Math.PI * 2);
      ctx.fill();
    } else {
      if (!clear(x, y, 0.2)) continue;
      toadstoolArt(ctx, X(x), Y(y), s * (0.08 + rnd() * 0.06), 0, rnd() < 0.7 ? C.cap : '#c99a4a');
    }
  }
}

/** A fern from above: fronds radiating from a crown, each a stem with leaflets down it. */
export function fern(ctx: Ctx, x: number, y: number, size: number, rot: number, sway = 0) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  const n = 6;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + sway * Math.sin(i * 1.7);
    const len = size * (0.8 + 0.2 * Math.sin(i * 2.3));
    const ex = Math.cos(a) * len;
    const ey = Math.sin(a) * len;
    ctx.strokeStyle = i % 2 ? '#4f8a3a' : '#5c9a44';
    ctx.lineWidth = Math.max(1, size * 0.06);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(ex, ey);
    ctx.stroke();
    ctx.fillStyle = i % 2 ? '#4f8a3a' : '#5c9a44';
    for (let k = 1; k < 6; k++) {
      const u = k / 6;
      const px = ex * u;
      const py = ey * u;
      const w = size * 0.16 * (1 - u * 0.7);
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.ellipse(px + -Math.sin(a) * w * side, py + Math.cos(a) * w * side, w * 0.9, w * 0.35, a + side * 0.9, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
  ctx.restore();
}

/** A toadstool from just above: a round red cap with white spots, `squash` (0..1) flattening it after a hit. */
export function toadstoolArt(ctx: Ctx, x: number, y: number, r: number, squash: number, cap = C.cap) {
  const k = 1 + squash * 0.18;
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath();
  ctx.ellipse(x + r * 0.18, y + r * 0.28, r * 1.05 * k, r * 0.9 * k, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = cap;
  ctx.beginPath();
  ctx.arc(x, y, r * k, 0, Math.PI * 2);
  ctx.fill();
  // The cap's dome: lighter toward the light.
  const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r * k);
  g.addColorStop(0, 'rgba(255,255,255,0.35)');
  g.addColorStop(1, 'rgba(0,0,0,0.12)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r * k, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = C.stalk;
  for (const [dx, dy, rr] of [
    [-0.35, -0.3, 0.17],
    [0.3, -0.15, 0.13],
    [0.05, 0.38, 0.15],
    [-0.42, 0.25, 0.1],
    [0.45, 0.32, 0.09],
  ]) {
    ctx.beginPath();
    ctx.arc(x + dx * r * k, y + dy * r * k, Math.max(0.8, rr * r), 0, Math.PI * 2);
    ctx.fill();
  }
}

function paintZone(ctx: Ctx, z: Zone, X: (x: number) => number, Y: (y: number) => number, s: number, rnd: () => number) {
  const x = X(z.x);
  const y = Y(z.y);
  const w = z.w * s;
  const h = z.h * s;
  ctx.save();
  if (z.kind === 'rough') {
    // Long grass: a darker patch with tufts standing up in it.
    ctx.fillStyle = C.rough;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, s * 0.25);
    ctx.fill();
    ctx.strokeStyle = 'rgba(30,55,20,0.6)';
    ctx.lineWidth = 1;
    for (let i = 0; i < (z.w * z.h) * 26; i++) {
      const tx = x + rnd() * w;
      const ty = y + rnd() * h;
      ctx.beginPath();
      ctx.moveTo(tx, ty);
      ctx.lineTo(tx - s * 0.04, ty - s * 0.1);
      ctx.moveTo(tx, ty);
      ctx.lineTo(tx + s * 0.04, ty - s * 0.11);
      ctx.stroke();
    }
  } else if (z.kind === 'slick') {
    // Old flagstones, worn smooth: the ball runs on over them.
    ctx.fillStyle = 'rgba(40,50,30,0.35)';
    ctx.fillRect(x, y, w, h);
    const n = Math.max(2, Math.round(z.h / 0.55));
    for (let i = 0; i < n; i++) {
      const sy = y + (h / n) * i + 1;
      ctx.fillStyle = i % 2 ? '#a9a391' : '#b5ae99';
      ctx.beginPath();
      ctx.roundRect(x + 1.5, sy, w - 3, h / n - 2, s * 0.08);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.fillRect(x + 3, sy + 1.5, w - 8, 1.5);
    }
  } else if (z.kind === 'ramp') {
    // A bank: lit along its top, shaded at its foot, with the way it falls shown in soft chevrons.
    const sl = z.slope ?? { x: 0, y: 0 };
    const a = Math.atan2(sl.y, sl.x);
    const g = ctx.createLinearGradient(x + w / 2 - (Math.cos(a) * w) / 2, y + h / 2 - (Math.sin(a) * h) / 2, x + w / 2 + (Math.cos(a) * w) / 2, y + h / 2 + (Math.sin(a) * h) / 2);
    g.addColorStop(0, 'rgba(255,255,210,0.22)');
    g.addColorStop(1, 'rgba(0,20,0,0.22)');
    ctx.fillStyle = g;
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = 'rgba(30,60,20,0.35)';
    ctx.lineWidth = 1.5;
    for (let gx = x + s * 0.3; gx < x + w; gx += s * 0.6) {
      ctx.save();
      ctx.translate(gx, y + h / 2);
      ctx.rotate(a);
      ctx.beginPath();
      ctx.moveTo(-s * 0.08, -s * 0.12);
      ctx.lineTo(s * 0.05, 0);
      ctx.lineTo(-s * 0.08, s * 0.12);
      ctx.stroke();
      ctx.restore();
    }
  } else if (z.kind === 'hill') {
    // A mound (lit on top) or a dell (shadowed in its bowl), with faint contour rings.
    const cx = x + w / 2;
    const cy = y + h / 2;
    const up = (z.pull ?? 0) > 0;
    ctx.translate(cx, cy);
    ctx.scale(1, h / w);
    const g = ctx.createRadialGradient(-w * 0.12, -w * 0.12, 0, 0, 0, w / 2);
    if (up) {
      g.addColorStop(0, 'rgba(230,245,180,0.32)');
      g.addColorStop(0.55, 'rgba(200,230,150,0.1)');
      g.addColorStop(1, 'rgba(0,30,0,0.0)');
    } else {
      g.addColorStop(0, 'rgba(10,40,10,0.28)');
      g.addColorStop(0.7, 'rgba(10,40,10,0.1)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
    }
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, w / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = up ? 'rgba(240,255,200,0.16)' : 'rgba(10,30,10,0.16)';
    ctx.lineWidth = 1.2;
    for (const k of [0.35, 0.6, 0.85]) {
      ctx.beginPath();
      ctx.arc(0, 0, (w / 2) * k, 0, Math.PI * 2);
      ctx.stroke();
    }
  } else if (z.kind === 'water') {
    // The creek (or the pond): muddy banks, then water, deeper in the middle.
    ctx.fillStyle = '#6a5a3e';
    if (z.round) {
      ctx.beginPath();
      ctx.ellipse(x + w / 2, y + h / 2, w / 2 + s * 0.08, h / 2 + s * 0.08, 0, 0, Math.PI * 2);
      ctx.fill();
      const g = ctx.createRadialGradient(x + w / 2, y + h / 2, 0, x + w / 2, y + h / 2, w / 2);
      g.addColorStop(0, C.waterDeep);
      g.addColorStop(1, C.water);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
      ctx.fill();
      // Lily pads round its edge.
      ctx.fillStyle = '#4f8a3a';
      for (let i = 0; i < 4; i++) {
        const a = i * 1.9 + 0.4;
        const px = x + w / 2 + Math.cos(a) * w * 0.32;
        const py = y + h / 2 + Math.sin(a) * h * 0.32;
        ctx.beginPath();
        ctx.arc(px, py, s * 0.1, 0.4, Math.PI * 2 - 0.1);
        ctx.lineTo(px, py);
        ctx.closePath();
        ctx.fill();
      }
    } else {
      ctx.fillRect(x, y - s * 0.08, w, h + s * 0.16);
      const g = ctx.createLinearGradient(0, y, 0, y + h);
      g.addColorStop(0, C.water);
      g.addColorStop(0.5, C.waterDeep);
      g.addColorStop(1, C.water);
      ctx.fillStyle = g;
      ctx.fillRect(x, y, w, h);
      // Pebbles along the banks.
      for (let i = 0; i < z.w * 6; i++) {
        ctx.fillStyle = rnd() < 0.5 ? '#8f8a78' : '#a59f8a';
        const px = x + rnd() * w;
        for (const by of [y - s * 0.04, y + h + s * 0.04]) {
          ctx.beginPath();
          ctx.ellipse(px, by, s * 0.05, s * 0.035, 0, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
  } else if (z.kind === 'bridge') {
    // Planks across the water, gaps of dark between.
    const planks = Math.max(3, Math.round(z.h / 0.22));
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fillRect(x + s * 0.05, y + s * 0.06, w, h);
    for (let i = 0; i < planks; i++) {
      const py = y + (h / planks) * i;
      ctx.fillStyle = i % 2 ? '#8a6440' : '#96704a';
      ctx.fillRect(x, py + 0.5, w, h / planks - 1);
      ctx.fillStyle = 'rgba(255,230,190,0.12)';
      ctx.fillRect(x, py + 0.5, w, 1.2);
    }
  }
  ctx.restore();
}

/** Ripples drifting downstream on the water, drawn live over the backdrop. */
export function drawWaterLife(ctx: Ctx, hole: Hole, X: (x: number) => number, Y: (y: number) => number, s: number, t: number) {
  ctx.save();
  ctx.strokeStyle = 'rgba(230,245,250,0.35)';
  ctx.lineWidth = 1.2;
  for (const z of hole.zones ?? []) {
    if (z.kind !== 'water') continue;
    if (z.round) {
      for (let i = 0; i < 2; i++) {
        const k = ((t / 2600 + i / 2) % 1) * 0.8 + 0.1;
        ctx.globalAlpha = 1 - k;
        ctx.beginPath();
        ctx.ellipse(X(z.x + z.w / 2), Y(z.y + z.h / 2), (z.w / 2) * k, (z.h / 2) * k, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      continue;
    }
    for (let i = 0; i < Math.round(z.w * 2.2); i++) {
      const rx = z.x + ((i * 0.73 + (t / 1000) * 0.45) % z.w);
      const ry = z.y + 0.2 + ((i * 0.37) % Math.max(0.1, z.h - 0.4));
      // Under a bridge, the planks hide it.
      if ((hole.zones ?? []).some((b) => b.kind === 'bridge' && rx > b.x - 0.1 && rx < b.x + b.w + 0.1)) continue;
      ctx.beginPath();
      ctx.moveTo(X(rx), Y(ry));
      ctx.quadraticCurveTo(X(rx + 0.12), Y(ry) - 2, X(rx + 0.25), Y(ry));
      ctx.stroke();
    }
  }
  ctx.restore();
}

/** Soft patches of sun through the oak leaves, drifting slowly. Cheap: a few gradients. */
export function drawDappledLight(ctx: Ctx, x0: number, y0: number, w: number, h: number, t: number) {
  ctx.save();
  ctx.globalCompositeOperation = 'soft-light';
  for (let i = 0; i < 4; i++) {
    const cx = x0 + w * (0.2 + 0.6 * ((i * 0.37 + Math.sin(t / 9000 + i) * 0.08 + 0.5) % 1));
    const cy = y0 + h * ((i * 0.29 + 0.1 + Math.cos(t / 11000 + i * 2) * 0.05) % 1);
    const r = Math.min(w, h) * (0.35 + 0.1 * (i % 2));
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0, 'rgba(255,248,210,0.35)');
    g.addColorStop(1, 'rgba(255,248,210,0)');
    ctx.fillStyle = g;
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
  }
  ctx.restore();
}

/** A hollow log lying across the bed between its two mouths. */
export function drawHollowLog(ctx: Ctx, tube: Tube, X: (x: number) => number, Y: (y: number) => number, s: number) {
  const ax = X(tube.a.x);
  const ay = Y(tube.a.y);
  const bx = X(tube.b.x);
  const by = Y(tube.b.y);
  const r = TUBE_R * s * 1.25;
  const a = Math.atan2(by - ay, bx - ax);
  ctx.save();
  ctx.lineCap = 'round';
  ctx.strokeStyle = 'rgba(0,0,0,0.3)';
  ctx.lineWidth = r * 2 + 4;
  ctx.beginPath();
  ctx.moveTo(ax + 3, ay + 5);
  ctx.lineTo(bx + 3, by + 5);
  ctx.stroke();
  ctx.lineCap = 'butt';
  ctx.strokeStyle = C.bark;
  ctx.lineWidth = r * 2;
  ctx.beginPath();
  ctx.moveTo(ax, ay);
  ctx.lineTo(bx, by);
  ctx.stroke();
  // Bark furrows along it, lit along its top.
  const len = Math.hypot(bx - ax, by - ay);
  ctx.translate(ax, ay);
  ctx.rotate(a);
  ctx.strokeStyle = 'rgba(40,24,12,0.5)';
  ctx.lineWidth = 1.2;
  for (const k of [-0.55, -0.15, 0.25, 0.6]) {
    ctx.beginPath();
    ctx.moveTo(r * 0.4, r * k);
    for (let u = 0; u <= 1; u += 0.1) ctx.lineTo(u * len, r * k + Math.sin(u * 23 + k * 7) * 1.2);
    ctx.stroke();
  }
  ctx.fillStyle = 'rgba(214,170,120,0.25)';
  ctx.fillRect(0, -r * 0.85, len, r * 0.25);
  // A cushion of moss on its back.
  ctx.fillStyle = '#6f9a4a';
  ctx.beginPath();
  ctx.ellipse(len * 0.55, -r * 0.2, len * 0.16, r * 0.55, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  // The open ends.
  for (const [x, y] of [
    [ax, ay],
    [bx, by],
  ]) {
    ctx.fillStyle = '#d0a878';
    ctx.beginPath();
    ctx.ellipse(x, y, r * 1.02, r * 1.02, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#20160c';
    ctx.beginPath();
    ctx.arc(x, y, r * 0.75, 0, Math.PI * 2);
    ctx.fill();
  }
}

function capsulePath(ctx: Ctx, o: CapsuleObstacle, X: (x: number) => number, Y: (y: number) => number, s: number, width: number, color: string, dx = 0, dy = 0) {
  ctx.strokeStyle = color;
  ctx.lineCap = 'round';
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(X(o.a.x) + dx, Y(o.a.y) + dy);
  ctx.lineTo(X(o.b.x) + dx, Y(o.b.y) + dy);
  ctx.stroke();
}

/**
 * One of the garden's obstacles, where it is now. `since` is seconds since
 * the ball last hit it (a cap squashes and springs back; a hedgehog curls).
 */
export function drawGardenObstacle(ctx: Ctx, o: Obstacle, X: (x: number) => number, Y: (y: number) => number, s: number, t: number, since: number, facing = 1) {
  ctx.save();
  if (o.shape === 'capsule') {
    const w = o.r * 2 * s;
    if (o.kind === 'root') {
      capsulePath(ctx, o, X, Y, s, w + 2, 'rgba(0,0,0,0.3)', 2, 4);
      capsulePath(ctx, o, X, Y, s, w, C.bark);
      capsulePath(ctx, o, X, Y, s, w * 0.6, '#7b5636', -w * 0.08, -w * 0.12);
      capsulePath(ctx, o, X, Y, s, w * 0.18, 'rgba(214,170,120,0.35)', -w * 0.12, -w * 0.28);
      // Moss along the top of it.
      const mx = (X(o.a.x) + X(o.b.x)) / 2;
      const my = (Y(o.a.y) + Y(o.b.y)) / 2;
      ctx.fillStyle = '#6f9a4a';
      ctx.beginPath();
      ctx.ellipse(mx, my - w * 0.15, w * 0.9, w * 0.32, Math.atan2(Y(o.b.y) - Y(o.a.y), X(o.b.x) - X(o.a.x)), 0, Math.PI * 2);
      ctx.fill();
    } else if (o.kind === 'rail') {
      capsulePath(ctx, o, X, Y, s, w + 1, 'rgba(0,0,0,0.35)', 1.5, 2.5);
      capsulePath(ctx, o, X, Y, s, w, '#7a5232');
      capsulePath(ctx, o, X, Y, s, Math.max(1, w * 0.3), 'rgba(214,170,120,0.4)', -0.5, -1);
    } else if (o.kind === 'branch') {
      // A leafy branch, its shadow on the moss below it.
      capsulePath(ctx, o, X, Y, s, w, 'rgba(0,0,0,0.22)', s * 0.18, s * 0.3);
      capsulePath(ctx, o, X, Y, s, w, '#5e4128');
      capsulePath(ctx, o, X, Y, s, Math.max(1, w * 0.3), 'rgba(214,170,120,0.35)', -0.5, -1);
      const n = 6;
      for (let i = 1; i <= n; i++) {
        const u = i / (n + 0.5);
        const px = X(o.a.x + (o.b.x - o.a.x) * u);
        const py = Y(o.a.y + (o.b.y - o.a.y) * u);
        ctx.fillStyle = i % 2 ? '#4f8a3a' : '#5f9a44';
        for (const side of [-1, 1]) {
          ctx.beginPath();
          ctx.ellipse(px + side * s * 0.12, py - side * s * 0.05, s * 0.13, s * 0.07, side * 0.6 + u, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    } else if (o.kind === 'fern') {
      // The fern hedge: a row of crowns, fronds hanging over the hidden path beside it.
      const n = Math.max(2, Math.round(Math.hypot(o.b.x - o.a.x, o.b.y - o.a.y) / 0.45));
      for (let i = 0; i <= n; i++) {
        const u = i / n;
        const px = X(o.a.x + (o.b.x - o.a.x) * u);
        const py = Y(o.a.y + (o.b.y - o.a.y) * u);
        fern(ctx, px, py, s * 0.42, i * 0.9, Math.sin(t / 1400 + i) * 0.05);
      }
    } else {
      capsulePath(ctx, o, X, Y, s, w, C.bark);
    }
    ctx.restore();
    return;
  }
  if (o.shape === 'rect') {
    ctx.fillStyle = C.stone;
    ctx.fillRect(X(o.x), Y(o.y), o.w * s, o.h * s);
    ctx.restore();
    return;
  }
  const cx = X(o.x);
  const cy = Y(o.y);
  const r = o.r * s;
  if (o.kind === 'toadstool') {
    const squash = since < 0.5 ? Math.exp(-since * 8) * Math.cos(since * 30) : 0;
    toadstoolArt(ctx, cx, cy, r, Math.abs(squash));
  } else if (o.kind === 'stone') {
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(cx + r * 0.12, cy + r * 0.18, r * 1.02, r * 0.95, 0, 0, Math.PI * 2);
    ctx.fill();
    const g = ctx.createRadialGradient(cx - r * 0.35, cy - r * 0.4, r * 0.1, cx, cy, r);
    g.addColorStop(0, '#bdb8a6');
    g.addColorStop(1, C.stoneDark);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(cx, cy, r, r * 0.94, 0.3, 0, Math.PI * 2);
    ctx.fill();
    // Lichen and a cap of moss.
    ctx.fillStyle = 'rgba(200,210,150,0.5)';
    ctx.beginPath();
    ctx.arc(cx + r * 0.3, cy + r * 0.2, r * 0.12, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#6f9a4a';
    ctx.beginPath();
    ctx.ellipse(cx - r * 0.15, cy - r * 0.45, r * 0.5, r * 0.25, -0.3, 0, Math.PI * 2);
    ctx.fill();
  } else if (o.kind === 'stump') {
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.arc(cx + r * 0.15, cy + r * 0.2, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = C.bark;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#c9a274';
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.82, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(120,84,48,0.6)';
    ctx.lineWidth = 1;
    for (const k of [0.25, 0.45, 0.65]) {
      ctx.beginPath();
      ctx.arc(cx + r * 0.05, cy, r * k, 0, Math.PI * 2);
      ctx.stroke();
    }
  } else if (o.kind === 'hedgehog') {
    drawHedgehog(ctx, cx, cy, r, t, facing, since);
  }
  ctx.restore();
}

/**
 * The hedgehog from above, trundling the way he's facing: a brown
 * prickly back, a pale pointed face and a black nose, and little feet going.
 * Bumped, he tucks his nose in for a moment and carries on.
 */
function drawHedgehog(ctx: Ctx, x: number, y: number, r: number, t: number, facing: number, since: number) {
  const tucked = since < 0.9 ? 1 - since / 0.9 : 0;
  const step = Math.sin(t / 90);
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(facing, 1);
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  ctx.beginPath();
  ctx.ellipse(r * 0.1, r * 0.3, r * 1.1, r * 0.8, 0, 0, Math.PI * 2);
  ctx.fill();
  // Feet, going.
  if (tucked < 0.5) {
    ctx.fillStyle = '#5a4030';
    for (const [fx, fy, ph] of [
      [0.5, -0.62, 1],
      [0.5, 0.62, -1],
      [-0.45, -0.6, -1],
      [-0.45, 0.6, 1],
    ]) {
      ctx.beginPath();
      ctx.arc(r * (fx + step * ph * 0.1), r * fy, r * 0.13, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // Face: a pale point out front, black nose.
  const fx = r * (0.85 - tucked * 0.4);
  ctx.fillStyle = '#d9c4a0';
  ctx.beginPath();
  ctx.moveTo(r * 0.3, -r * 0.45);
  ctx.quadraticCurveTo(fx + r * 0.25, 0, r * 0.3, r * 0.45);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#1a120c';
  ctx.beginPath();
  ctx.arc(fx + r * 0.12, 0, r * 0.1, 0, Math.PI * 2);
  ctx.fill();
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.arc(r * 0.6 - tucked * r * 0.3, side * r * 0.2, r * 0.06, 0, Math.PI * 2);
    ctx.fill();
  }
  // The prickly back: a dome of spines, darker toward the tips.
  const k = 1 + tucked * 0.06;
  ctx.fillStyle = '#6b5038';
  ctx.beginPath();
  ctx.ellipse(-r * 0.1, 0, r * 0.82 * k, r * 0.7 * k, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#3e2c1c';
  ctx.lineWidth = Math.max(0.8, r * 0.07);
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * Math.PI * 2;
    const rr = 0.35 + ((i * 7) % 5) / 10;
    const px = -r * 0.1 + Math.cos(a) * r * 0.82 * rr * k;
    const py = Math.sin(a) * r * 0.7 * rr * k;
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(px - r * 0.18, py + Math.sin(a) * r * 0.06);
    ctx.stroke();
  }
  ctx.fillStyle = 'rgba(230,210,180,0.25)';
  ctx.beginPath();
  ctx.ellipse(-r * 0.25, -r * 0.25, r * 0.35, r * 0.18, -0.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}
