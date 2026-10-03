import type { Camera } from '../engine/Camera';
import type { GameState } from '../state';
import { TILE_SIZE } from '../data/worldMap';
import { isNight } from '../engine/Clock';
import { INTERIOR_W } from '../data/interior';
import { keepsakesOnShow } from '../data/keepsakes';
import { GOLF_BALLS, type GolfBallDef } from '../data/golfBalls';
import { hasGolfBall } from '../systems/golfBalls';
import { drawGolfBall } from './GolfBallArt';

// The curiosities, at home: Ellen's sketches of them in plain frames on the
// living room walls, and the two that are only things — a split geode and the
// lost golf balls — set where they belong.

type Ctx = CanvasRenderingContext2D;

const PAPER = '#f1e8d2';
const FRAME = '#6e4f34';
const FRAME_LIGHT = '#9a7550';

/** Every framed sketch that's earned its place on the wall. */
export function drawKeepsakeFrames(ctx: Ctx, camera: Camera, state: GameState, now: number) {
  const tile = TILE_SIZE * camera.zoom;
  const night = isNight(state.clock.totalMinutes);
  for (const k of keepsakesOnShow(state)) {
    const p = k.place;
    if (p.kind !== 'frame') continue;
    let x: number, y: number, w: number, h: number;
    if (p.wall === 'north') {
      const a = camera.worldToScreen(p.at * TILE_SIZE, 0.1 * TILE_SIZE);
      x = a.x;
      y = a.y;
      w = p.span * tile;
      h = tile * (p.span > 0.8 ? 0.5 : 0.56);
    } else {
      // Seen edge-on along the east wall, like its window: narrow and tall.
      const a = camera.worldToScreen((INTERIOR_W - 1 + 0.14) * TILE_SIZE, p.at * TILE_SIZE);
      x = a.x;
      y = a.y;
      w = tile * 0.46;
      h = p.span * tile;
    }
    drawFrame(ctx, x, y, w, h, tile, k.curiosityId, now, night);
  }
}

function drawFrame(ctx: Ctx, x: number, y: number, w: number, h: number, tile: number, id: string, now: number, night: boolean) {
  const b = Math.max(2, tile * 0.04);
  ctx.save();
  // A soft shadow on the paper behind it.
  ctx.fillStyle = 'rgba(40,30,20,0.25)';
  ctx.fillRect(x + b * 0.6, y + b * 0.9, w, h);
  ctx.fillStyle = FRAME;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = FRAME_LIGHT;
  ctx.fillRect(x, y, w, Math.max(1, b * 0.35));
  const ix = x + b;
  const iy = y + b;
  const iw = w - b * 2;
  const ih = h - b * 2;
  ctx.fillStyle = id === 'glowworms' ? '#1d2a3a' : PAPER;
  ctx.fillRect(ix, iy, iw, ih);
  ctx.beginPath();
  ctx.rect(ix, iy, iw, ih);
  ctx.clip();
  ctx.translate(ix + iw / 2, iy + ih / 2);
  const s = Math.min(iw, ih);
  drawSketch(ctx, id, s, iw, ih, now, night);
  ctx.restore();
}

/** One sketch, centred on the origin, `s` the shorter side of the paper. */
function drawSketch(ctx: Ctx, id: string, s: number, iw: number, ih: number, now: number, night: boolean) {
  const ink = '#3a2c20';
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  switch (id) {
    case 'treeFrog': {
      // On the underside of a leaf.
      ctx.fillStyle = '#7aa25a';
      ctx.beginPath();
      ctx.ellipse(0, -s * 0.18, s * 0.42, s * 0.14, -0.35, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#4cb048';
      ctx.beginPath();
      ctx.ellipse(-s * 0.02, s * 0.08, s * 0.2, s * 0.13, -0.2, 0, Math.PI * 2);
      ctx.ellipse(s * 0.15, -s * 0.01, s * 0.1, s * 0.08, -0.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#e8402a';
      ctx.beginPath();
      ctx.arc(s * 0.19, -s * 0.06, s * 0.045, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#4cb048';
      for (const [tx, ty] of [[-0.2, 0.2], [0.08, 0.2], [0.24, 0.06]]) {
        ctx.beginPath();
        ctx.arc(tx * s, ty * s, s * 0.035, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case 'hedgehog': {
      ctx.fillStyle = '#6a5038';
      ctx.beginPath();
      ctx.ellipse(-s * 0.04, s * 0.12, s * 0.3, s * 0.2, 0, Math.PI, 0);
      ctx.fill();
      ctx.strokeStyle = '#3e2c1c';
      ctx.lineWidth = Math.max(0.8, s * 0.025);
      ctx.beginPath();
      for (let i = 0; i < 11; i++) {
        const a = Math.PI + (i / 10) * Math.PI;
        ctx.moveTo(-s * 0.04 + Math.cos(a) * s * 0.24, s * 0.12 + Math.sin(a) * s * 0.15);
        ctx.lineTo(-s * 0.04 + Math.cos(a) * s * 0.36, s * 0.12 + Math.sin(a) * s * 0.26);
      }
      ctx.stroke();
      ctx.fillStyle = '#c8a888';
      ctx.beginPath();
      ctx.ellipse(s * 0.28, s * 0.07, s * 0.11, s * 0.07, 0.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#1a1008';
      ctx.beginPath();
      ctx.arc(s * 0.38, s * 0.1, s * 0.025, 0, Math.PI * 2);
      ctx.arc(s * 0.27, s * 0.04, s * 0.018, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(80,110,60,0.6)';
      ctx.beginPath();
      ctx.moveTo(-s * 0.45, s * 0.14);
      ctx.lineTo(s * 0.45, s * 0.14);
      ctx.stroke();
      break;
    }
    case 'swallowtail':
    case 'lunaMoth': {
      const luna = id === 'lunaMoth';
      const wing = luna ? '#c8ecb0' : '#f4e3a4';
      const edge = luna ? '#8ab878' : '#2a2420';
      for (const side of [-1, 1]) {
        ctx.fillStyle = wing;
        ctx.strokeStyle = edge;
        ctx.lineWidth = Math.max(0.8, s * 0.03);
        // Forewing.
        ctx.beginPath();
        ctx.moveTo(0, -s * 0.06);
        ctx.quadraticCurveTo(side * s * 0.42, -s * 0.38, side * s * 0.44, -s * 0.08);
        ctx.quadraticCurveTo(side * s * 0.25, s * 0.02, 0, s * 0.02);
        ctx.fill();
        ctx.stroke();
        // Hindwing, ending in a long tail.
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.quadraticCurveTo(side * s * 0.32, s * 0.02, side * s * 0.24, s * 0.2);
        ctx.lineTo(side * s * (luna ? 0.2 : 0.18), s * (luna ? 0.46 : 0.36));
        ctx.quadraticCurveTo(side * s * 0.08, s * 0.2, 0, s * 0.1);
        ctx.fill();
        ctx.stroke();
        // The eyespots.
        ctx.fillStyle = luna ? '#d8b86a' : '#4a6ad0';
        ctx.beginPath();
        ctx.arc(side * s * (luna ? 0.24 : 0.17), s * (luna ? -0.14 : 0.16), s * 0.04, 0, Math.PI * 2);
        ctx.fill();
        if (!luna) {
          ctx.fillStyle = '#d04a3a';
          ctx.beginPath();
          ctx.arc(side * s * 0.1, s * 0.12, s * 0.025, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = '#2a2420';
          ctx.beginPath();
          ctx.moveTo(side * s * 0.06, -s * 0.06);
          ctx.lineTo(side * s * 0.3, -s * 0.24);
          ctx.moveTo(side * s * 0.08, -s * 0.02);
          ctx.lineTo(side * s * 0.36, -s * 0.12);
          ctx.stroke();
        }
      }
      ctx.strokeStyle = ink;
      ctx.lineWidth = Math.max(1, s * 0.05);
      ctx.beginPath();
      ctx.moveTo(0, -s * 0.16);
      ctx.lineTo(0, s * 0.14);
      ctx.stroke();
      ctx.lineWidth = Math.max(0.6, s * 0.015);
      ctx.beginPath();
      ctx.moveTo(0, -s * 0.16);
      ctx.lineTo(-s * 0.08, -s * 0.28);
      ctx.moveTo(0, -s * 0.16);
      ctx.lineTo(s * 0.08, -s * 0.28);
      ctx.stroke();
      break;
    }
    case 'emeraldDragonfly': {
      ctx.fillStyle = 'rgba(190,220,230,0.7)';
      ctx.strokeStyle = 'rgba(70,100,110,0.6)';
      ctx.lineWidth = Math.max(0.6, s * 0.015);
      for (const side of [-1, 1]) {
        for (const [wy, rot] of [[-0.14, -0.15], [-0.02, 0.15]]) {
          ctx.beginPath();
          ctx.ellipse(side * s * 0.22, wy * s, s * 0.22, s * 0.055, side * rot, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        }
      }
      ctx.strokeStyle = '#2f9a6a';
      ctx.lineWidth = Math.max(1, s * 0.045);
      ctx.beginPath();
      ctx.moveTo(0, -s * 0.14);
      ctx.lineTo(0, s * 0.42);
      ctx.stroke();
      ctx.fillStyle = '#3cc888';
      ctx.beginPath();
      ctx.ellipse(0, -s * 0.08, s * 0.05, s * 0.09, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#1f6a4a';
      ctx.beginPath();
      ctx.arc(-s * 0.04, -s * 0.2, s * 0.04, 0, Math.PI * 2);
      ctx.arc(s * 0.04, -s * 0.2, s * 0.04, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'jewelBeetle': {
      // Copper turning to green, and a sheen that shifts a little.
      ctx.strokeStyle = ink;
      ctx.lineWidth = Math.max(0.7, s * 0.02);
      ctx.beginPath();
      for (const side of [-1, 1]) {
        for (const ly of [-0.08, 0.04, 0.16]) {
          ctx.moveTo(side * s * 0.1, ly * s);
          ctx.lineTo(side * s * 0.26, ly * s + s * 0.06);
        }
        ctx.moveTo(side * s * 0.03, -s * 0.24);
        ctx.lineTo(side * s * 0.1, -s * 0.36);
      }
      ctx.stroke();
      const g = ctx.createLinearGradient(-s * 0.15, -s * 0.2, s * 0.15, s * 0.3);
      g.addColorStop(0, '#c8783a');
      g.addColorStop(1, '#3a9a6a');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(0, s * 0.06, s * 0.14, s * 0.24, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#7a5a2a';
      ctx.beginPath();
      ctx.ellipse(0, -s * 0.2, s * 0.08, s * 0.06, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(40,30,20,0.5)';
      ctx.beginPath();
      ctx.moveTo(0, -s * 0.16);
      ctx.lineTo(0, s * 0.3);
      ctx.stroke();
      ctx.fillStyle = `rgba(255,250,220,${0.25 + 0.15 * Math.sin(now * 0.001)})`;
      ctx.beginPath();
      ctx.ellipse(-s * 0.06, -s * 0.02, s * 0.03, s * 0.1, 0.2, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'fireSalamander': {
      ctx.strokeStyle = '#151210';
      ctx.lineWidth = Math.max(1.5, s * 0.1);
      ctx.beginPath();
      ctx.moveTo(-s * 0.06, -s * 0.38);
      ctx.quadraticCurveTo(s * 0.18, -s * 0.1, -s * 0.02, s * 0.14);
      ctx.quadraticCurveTo(-s * 0.18, s * 0.32, s * 0.12, s * 0.42);
      ctx.stroke();
      ctx.lineWidth = Math.max(1, s * 0.05);
      ctx.beginPath();
      for (const [lx, ly, dx, dy] of [[0.03, -0.24, 0.14, -0.3], [0.03, -0.24, -0.1, -0.2], [-0.06, 0.2, -0.18, 0.18], [-0.06, 0.2, 0.06, 0.28]]) {
        ctx.moveTo(lx * s, ly * s);
        ctx.lineTo(dx * s, dy * s);
      }
      ctx.stroke();
      ctx.fillStyle = '#f2c41a';
      for (const [px, py] of [[-0.04, -0.34], [0.07, -0.18], [0.04, -0.02], [-0.07, 0.12], [-0.06, 0.28], [0.06, 0.38]]) {
        ctx.beginPath();
        ctx.arc(px * s, py * s, s * 0.035, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case 'glowworms': {
      // Painted in the dark: grass against the night and a scatter of cold
      // green lights that catch the lamplight once it's dark in the room too.
      ctx.fillStyle = '#2a3a2a';
      ctx.beginPath();
      ctx.moveTo(-iw / 2, ih / 2);
      for (let i = 0; i <= 10; i++) {
        const gx = -iw / 2 + (iw * i) / 10;
        ctx.lineTo(gx, ih * (0.18 - (i % 2) * 0.12));
      }
      ctx.lineTo(iw / 2, ih / 2);
      ctx.closePath();
      ctx.fill();
      const glow = night ? 0.75 + 0.25 * Math.sin(now * 0.003) : 0.55;
      for (let i = 0; i < 7; i++) {
        const gx = (((i * 37) % 10) / 10 - 0.45) * iw * 0.9;
        const gy = (((i * 53) % 10) / 10 - 0.2) * ih * 0.55;
        if (night) {
          const g = ctx.createRadialGradient(gx, gy, 0, gx, gy, s * 0.14);
          g.addColorStop(0, `rgba(170,255,170,${0.35 * glow})`);
          g.addColorStop(1, 'rgba(170,255,170,0)');
          ctx.fillStyle = g;
          ctx.fillRect(gx - s * 0.14, gy - s * 0.14, s * 0.28, s * 0.28);
        }
        ctx.fillStyle = `rgba(190,255,180,${glow})`;
        ctx.beginPath();
        ctx.arc(gx, gy, s * 0.04, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = 'rgba(240,240,220,0.7)';
      ctx.beginPath();
      ctx.arc(iw * 0.3, -ih * 0.32, s * 0.06, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'foxDen': {
      // A bank under a big tree's roots, the dark mouth of the den, and the fox in it.
      ctx.fillStyle = '#c8d8b8';
      ctx.fillRect(-iw / 2, -ih / 2, iw, ih * 0.45);
      ctx.fillStyle = '#7a9a5a';
      ctx.beginPath();
      ctx.moveTo(-iw / 2, ih * 0.05);
      ctx.quadraticCurveTo(0, -ih * 0.35, iw / 2, ih * 0.02);
      ctx.lineTo(iw / 2, ih / 2);
      ctx.lineTo(-iw / 2, ih / 2);
      ctx.closePath();
      ctx.fill();
      // The tree.
      ctx.fillStyle = '#5a4030';
      ctx.fillRect(-iw * 0.06, -ih * 0.5, iw * 0.12, ih * 0.4);
      ctx.fillStyle = '#4a7a3a';
      ctx.beginPath();
      ctx.arc(-iw * 0.02, -ih * 0.48, ih * 0.22, 0, Math.PI * 2);
      ctx.arc(iw * 0.12, -ih * 0.42, ih * 0.18, 0, Math.PI * 2);
      ctx.fill();
      // Roots arching over the den mouth.
      ctx.fillStyle = '#1e140c';
      ctx.beginPath();
      ctx.ellipse(0, ih * 0.16, iw * 0.14, ih * 0.16, 0, Math.PI, 0);
      ctx.fill();
      ctx.strokeStyle = '#5a4030';
      ctx.lineWidth = Math.max(1, ih * 0.05);
      ctx.beginPath();
      ctx.moveTo(-iw * 0.2, ih * 0.18);
      ctx.quadraticCurveTo(-iw * 0.12, -ih * 0.12, 0, -ih * 0.1);
      ctx.quadraticCurveTo(iw * 0.14, -ih * 0.12, iw * 0.22, ih * 0.18);
      ctx.stroke();
      // Two eyes and a pair of ears in the dark.
      ctx.fillStyle = '#c8642a';
      ctx.beginPath();
      ctx.moveTo(-iw * 0.05, ih * 0.06);
      ctx.lineTo(-iw * 0.035, -ih * 0.03);
      ctx.lineTo(-iw * 0.015, ih * 0.06);
      ctx.moveTo(iw * 0.015, ih * 0.06);
      ctx.lineTo(iw * 0.035, -ih * 0.03);
      ctx.lineTo(iw * 0.05, ih * 0.06);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(0, ih * 0.12, iw * 0.05, ih * 0.07, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#f0e0a0';
      ctx.beginPath();
      ctx.arc(-iw * 0.02, ih * 0.1, Math.max(0.8, ih * 0.018), 0, Math.PI * 2);
      ctx.arc(iw * 0.02, ih * 0.1, Math.max(0.8, ih * 0.018), 0, Math.PI * 2);
      ctx.fill();
      break;
    }
  }
}

/** The split geode, its two halves open on the bookshelf, crystal side out. */
export function drawGeodeOnShelf(ctx: Ctx, x: number, y: number, tile: number) {
  for (const [dx, r, rot] of [[0, 0.11, -0.2], [0.17, 0.095, 0.25]] as const) {
    const cx = x + dx * tile;
    ctx.fillStyle = '#8a8478';
    ctx.beginPath();
    ctx.ellipse(cx, y, r * tile, r * tile * 0.82, rot, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#e8e0f0';
    ctx.beginPath();
    ctx.ellipse(cx, y, r * tile * 0.78, r * tile * 0.62, rot, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#9a6ad0';
    ctx.beginPath();
    ctx.ellipse(cx, y, r * tile * 0.6, r * tile * 0.46, rot, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.beginPath();
    ctx.arc(cx - r * tile * 0.2, y - r * tile * 0.15, r * tile * 0.12, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** The lost golf ball, scuffed and grass-stained, on a little wooden tee by the putting mat. */
export function drawLostGolfBall(ctx: Ctx, x: number, y: number, tile: number) {
  ctx.fillStyle = 'rgba(0,0,0,0.2)';
  ctx.beginPath();
  ctx.ellipse(x, y + tile * 0.05, tile * 0.09, tile * 0.03, 0, 0, Math.PI * 2);
  ctx.fill();
  // A little plinth of stained oak.
  ctx.fillStyle = '#6e4f34';
  ctx.fillRect(x - tile * 0.08, y - tile * 0.04, tile * 0.16, tile * 0.08);
  ctx.fillStyle = '#9a7550';
  ctx.fillRect(x - tile * 0.08, y - tile * 0.06, tile * 0.16, tile * 0.03);
  // The tee.
  ctx.fillStyle = '#e8d8a8';
  ctx.fillRect(x - tile * 0.01, y - tile * 0.15, tile * 0.02, tile * 0.1);
  // The ball, with its grass stain.
  ctx.fillStyle = '#f7f5ee';
  ctx.beginPath();
  ctx.arc(x, y - tile * 0.2, tile * 0.06, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(90,130,60,0.55)';
  ctx.beginPath();
  ctx.ellipse(x + tile * 0.02, y - tile * 0.17, tile * 0.03, tile * 0.015, 0.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,0.12)';
  for (const [dx, dy] of [[-0.02, -0.22], [0.01, -0.24], [-0.03, -0.18]]) ctx.fillRect(x + dx * tile, y + dy * tile, 1, 1);
}

/** What sits on the rail: for each kind of golf ball, in collection order, the ball if one's been found, else an empty hollow (null). */
export function golfRailBalls(state: Pick<GameState, 'golfBalls'>): (GolfBallDef | null)[] {
  return GOLF_BALLS.map((b) => (hasGolfBall(state, b.id) ? b : null));
}

/** One hollow on the rail for every kind of golf ball there is, left to right in collection order. */
export function golfRailSlots(x: number, w: number): number[] {
  const n = GOLF_BALLS.length;
  const pad = w * 0.06;
  return GOLF_BALLS.map((_, i) => x + pad + ((w - pad * 2) * (i + 0.5)) / n);
}

/**
 * The golf ball rail: a strip of oak along the back of Scott's putting mat
 * with a hollow for each kind of lost golf ball, and in each hollow the
 * first of that kind found. The ones still out there leave their hollow
 * empty, so the gaps show.
 */
export function drawGolfBallRail(ctx: Ctx, state: Pick<GameState, 'golfBalls'>, x: number, y: number, w: number, tile: number) {
  const h = tile * 0.16;
  ctx.fillStyle = 'rgba(0,0,0,0.2)';
  ctx.fillRect(x, y + h, w, Math.max(1, tile * 0.025));
  ctx.fillStyle = FRAME;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = FRAME_LIGHT;
  ctx.fillRect(x, y, w, Math.max(1, tile * 0.025));
  const cy = y + h * 0.55;
  const r = Math.min(tile * 0.06, ((w / GOLF_BALLS.length) * 0.5) * 0.8);
  const slots = golfRailSlots(x, w);
  golfRailBalls(state).forEach((ball, i) => {
    const cx = slots[i];
    ctx.fillStyle = 'rgba(40,24,10,0.55)';
    ctx.beginPath();
    ctx.ellipse(cx, cy + r * 0.2, r * 0.9, r * 0.55, 0, 0, Math.PI * 2);
    ctx.fill();
    if (ball) drawGolfBall(ctx, cx, cy - r * 0.15, r, ball.look, { detail: r > 5 });
  });
}
