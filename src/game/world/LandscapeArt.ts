import type { Camera } from '../engine/Camera';
import type { FoxState, GardenBed, GardenPath, GameState, OwnedPlant } from '../state';
import type { Rarity } from '../types';
import { TILE_SIZE, HOUSE_FOOTPRINT, HOUSE_DOOR, zoneAt } from '../data/worldMap';
import { isNight } from '../engine/Clock';
import { encroachment, pathPairs, bedCost, matureRadius, currentRadius, type PathPreview, type PlantingCheck } from '../systems/landscape';
import { findCuriosity } from '../data/curiosities';
import { FLAGSTONE } from '../data/decor';
import { drawFlagstone } from './GardenArt';

// Drawing for the shaped landscape: the house, garden beds, carved paths,
// the previews shown while the player is making them, and the fox and
// whatever it leads you to. Kept apart from Renderer.ts so the world's
// original art stays readable.

type Ctx = CanvasRenderingContext2D;

function hash2(x: number, y: number): number {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

const RARITY_GLOW: Record<Rarity, string> = {
  common: '#e8f0d0',
  uncommon: '#bfe6b0',
  rare: '#9fd0ff',
  veryRare: '#d4a8ff',
  extremelyRare: '#ffd98a',
  unheardOf: '#a8f0ff',
  mythic: '#e9ffd2',
};

// ---------------------------------------------------------------- the house

/** The house the greenhouse is attached to: warm clapboard, a shingled roof, lit windows at night. */
export function drawHouseExterior(ctx: Ctx, camera: Camera, gameMinutes: number) {
  const tile = TILE_SIZE * camera.zoom;
  const f = HOUSE_FOOTPRINT;
  const tl = camera.worldToScreen(f.x * TILE_SIZE, f.y * TILE_SIZE);
  const w = f.w * tile;
  const h = f.h * tile;
  const night = isNight(gameMinutes);
  const wallTop = tl.y + h * 0.58;
  // Shadow on the grass.
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  ctx.fillRect(tl.x + tile * 0.15, tl.y + h - tile * 0.05, w, tile * 0.22);
  // Front wall (clapboard).
  ctx.fillStyle = '#e4d6bb';
  ctx.fillRect(tl.x, wallTop, w, h - (wallTop - tl.y));
  ctx.strokeStyle = 'rgba(120,96,64,0.28)';
  ctx.lineWidth = 1;
  for (let yy = wallTop + tile * 0.16; yy < tl.y + h; yy += tile * 0.16) {
    ctx.beginPath();
    ctx.moveTo(tl.x, yy);
    ctx.lineTo(tl.x + w, yy);
    ctx.stroke();
  }
  // Roof: dark shingles, ridge along the top, slight overhang.
  const roofGrad = ctx.createLinearGradient(0, tl.y, 0, wallTop);
  roofGrad.addColorStop(0, night ? '#3b3430' : '#5a4a42');
  roofGrad.addColorStop(1, night ? '#2a2420' : '#44372f');
  ctx.fillStyle = roofGrad;
  ctx.beginPath();
  ctx.moveTo(tl.x - tile * 0.15, wallTop + tile * 0.08);
  ctx.lineTo(tl.x - tile * 0.05, tl.y + tile * 0.1);
  ctx.lineTo(tl.x + w + tile * 0.05, tl.y + tile * 0.1);
  ctx.lineTo(tl.x + w + tile * 0.15, wallTop + tile * 0.08);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(20,14,10,0.35)';
  for (let yy = tl.y + tile * 0.4; yy < wallTop; yy += tile * 0.28) {
    ctx.beginPath();
    ctx.moveTo(tl.x - tile * 0.08, yy);
    ctx.lineTo(tl.x + w + tile * 0.08, yy);
    ctx.stroke();
  }
  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  ctx.fillRect(tl.x - tile * 0.05, tl.y + tile * 0.1, w + tile * 0.1, tile * 0.12);
  // Chimney, with a thread of smoke in the evening.
  const chx = tl.x + w * 0.75;
  ctx.fillStyle = '#8a5a44';
  ctx.fillRect(chx, tl.y - tile * 0.35, tile * 0.45, tile * 0.8);
  ctx.fillStyle = '#6b4434';
  ctx.fillRect(chx - tile * 0.04, tl.y - tile * 0.4, tile * 0.53, tile * 0.1);
  if (night || gameMinutes % 1440 > 17 * 60) {
    const t = performance.now() * 0.0004;
    for (let i = 0; i < 4; i++) {
      const k = (t + i * 0.25) % 1;
      ctx.fillStyle = `rgba(220,220,220,${0.22 * (1 - k)})`;
      ctx.beginPath();
      ctx.arc(chx + tile * 0.22 + Math.sin(k * 6 + i) * tile * 0.15, tl.y - tile * 0.45 - k * tile * 1.2, tile * (0.1 + k * 0.18), 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // Windows either side of the door: warm light after dark.
  const door = camera.worldToScreen(HOUSE_DOOR.x * TILE_SIZE, HOUSE_DOOR.y * TILE_SIZE);
  for (const wx of [tl.x + tile * 0.55, tl.x + w - tile * 1.35]) {
    ctx.fillStyle = night ? '#ffcf7a' : '#9fb8c0';
    ctx.fillRect(wx, wallTop + tile * 0.55, tile * 0.8, tile * 0.7);
    if (night) {
      const g = ctx.createRadialGradient(wx + tile * 0.4, wallTop + tile * 0.9, 0, wx + tile * 0.4, wallTop + tile * 0.9, tile * 1.6);
      g.addColorStop(0, 'rgba(255,200,120,0.35)');
      g.addColorStop(1, 'rgba(255,200,120,0)');
      ctx.fillStyle = g;
      ctx.fillRect(wx - tile, wallTop - tile * 0.4, tile * 2.8, tile * 3);
    } else {
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.fillRect(wx + tile * 0.06, wallTop + tile * 0.6, tile * 0.18, tile * 0.3);
    }
    ctx.strokeStyle = '#f4ecdc';
    ctx.lineWidth = Math.max(1, tile * 0.05);
    ctx.strokeRect(wx, wallTop + tile * 0.55, tile * 0.8, tile * 0.7);
    ctx.beginPath();
    ctx.moveTo(wx + tile * 0.4, wallTop + tile * 0.55);
    ctx.lineTo(wx + tile * 0.4, wallTop + tile * 1.25);
    ctx.stroke();
    // A window box of something green.
    ctx.fillStyle = '#7a5636';
    ctx.fillRect(wx - tile * 0.05, wallTop + tile * 1.27, tile * 0.9, tile * 0.12);
    ctx.fillStyle = '#4f8a44';
    for (let i = 0; i < 5; i++) {
      ctx.beginPath();
      ctx.arc(wx + tile * (0.08 + i * 0.18), wallTop + tile * 1.24, tile * 0.08, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // Front door with a porch light and a step.
  ctx.fillStyle = '#8a8274';
  ctx.fillRect(door.x - tile * 0.15, door.y - tile * 0.02, tile * 1.3, tile * 0.16);
  ctx.fillStyle = '#3f5a4c';
  ctx.fillRect(door.x + tile * 0.12, door.y - tile * 1.1, tile * 0.76, tile * 1.08);
  ctx.fillStyle = 'rgba(255,230,170,0.5)';
  ctx.fillRect(door.x + tile * 0.3, door.y - tile * 0.98, tile * 0.4, tile * 0.28);
  ctx.fillStyle = '#d8b24a';
  ctx.beginPath();
  ctx.arc(door.x + tile * 0.76, door.y - tile * 0.5, tile * 0.04, 0, Math.PI * 2);
  ctx.fill();
  if (night) {
    const g = ctx.createRadialGradient(door.x + tile * 0.5, door.y - tile * 1.2, 0, door.x + tile * 0.5, door.y - tile * 0.6, tile * 2);
    g.addColorStop(0, 'rgba(255,214,140,0.45)');
    g.addColorStop(1, 'rgba(255,214,140,0)');
    ctx.fillStyle = g;
    ctx.fillRect(door.x - tile * 1.5, door.y - tile * 2.5, tile * 4, tile * 4);
  }
  ctx.fillStyle = night ? '#ffe2a0' : '#c9b89a';
  ctx.fillRect(door.x + tile * 0.44, door.y - tile * 1.3, tile * 0.12, tile * 0.14);
  // Flagstones down from the step.
  // These are the pattern the shop's stepping stones are cut to (data/decor.ts FLAGSTONE).
  for (let i = 0; i < 3; i++) {
    const s = camera.worldToScreen((HOUSE_DOOR.x + 0.5 + FLAGSTONE.stagger[i % 2]) * TILE_SIZE, (HOUSE_DOOR.y + 0.55 + i * FLAGSTONE.spacing) * TILE_SIZE);
    drawFlagstone(ctx, s.x, s.y, tile, i);
  }
}

// ---------------------------------------------------------------- beds

function bedOutline(ctx: Ctx, camera: Camera, b: Pick<GardenBed, 'x' | 'y' | 'w' | 'h' | 'shape'>, wobble: number, seed: number) {
  const tile = TILE_SIZE * camera.zoom;
  const c = camera.worldToScreen((b.x + b.w / 2) * TILE_SIZE, (b.y + b.h / 2) * TILE_SIZE);
  const rx = (b.w / 2) * tile;
  const ry = (b.h / 2) * tile;
  ctx.beginPath();
  const n = 48;
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2;
    const jag = 1 + (hash2(seed + i * 0.37, i) - 0.5) * wobble;
    let x: number;
    let y: number;
    if (b.shape === 'oval') {
      x = c.x + Math.cos(a) * rx * jag;
      y = c.y + Math.sin(a) * ry * jag;
    } else {
      // A rounded rectangle traced by angle (a superellipse), so edges can wobble organically.
      const p = 8;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      const r = Math.pow(Math.pow(Math.abs(ca), p) + Math.pow(Math.abs(sa), p), -1 / p);
      x = c.x + ca * r * rx * jag;
      y = c.y + sa * r * ry * jag;
    }
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

/** Dug beds: dark, worked soil with a mulch speckle and a low edging, already softening at the rims. */
export function drawGardenBed(ctx: Ctx, camera: Camera, bed: GardenBed, now: number) {
  const tile = TILE_SIZE * camera.zoom;
  const seed = hash2(bed.x, bed.y) * 100;
  // Worked soil.
  bedOutline(ctx, camera, bed, 0.035, seed);
  const tl = camera.worldToScreen(bed.x * TILE_SIZE, bed.y * TILE_SIZE);
  const g = ctx.createLinearGradient(tl.x, tl.y, tl.x, tl.y + bed.h * tile);
  g.addColorStop(0, '#4a3624');
  g.addColorStop(1, '#3a2a1c');
  ctx.fillStyle = g;
  ctx.fill();
  // Furrows and mulch, clipped to the soil.
  ctx.save();
  ctx.clip();
  ctx.strokeStyle = 'rgba(20,12,6,0.28)';
  ctx.lineWidth = Math.max(1, tile * 0.04);
  for (let yy = 0.35; yy < bed.h; yy += 0.45) {
    const a = camera.worldToScreen(bed.x * TILE_SIZE, (bed.y + yy) * TILE_SIZE);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    for (let xx = 0.25; xx <= bed.w + 0.25; xx += 0.25) {
      const p = camera.worldToScreen((bed.x + xx) * TILE_SIZE, (bed.y + yy + Math.sin(xx * 2 + yy) * 0.04) * TILE_SIZE);
      ctx.lineTo(p.x, p.y);
    }
    ctx.stroke();
  }
  const specks = Math.min(160, Math.floor(bed.w * bed.h * 6));
  for (let i = 0; i < specks; i++) {
    const px = tl.x + hash2(seed + i, i * 1.7) * bed.w * tile;
    const py = tl.y + hash2(i * 2.3, seed - i) * bed.h * tile;
    ctx.fillStyle = i % 3 === 0 ? 'rgba(150,110,62,0.45)' : 'rgba(96,70,40,0.5)';
    ctx.fillRect(px, py, tile * 0.05, tile * 0.03);
  }
  ctx.restore();
  // Edging: a tall timber frame for a raised bed, sleepers for a dug one, a ring of stones for a round one.
  if (bed.raised) {
    bedOutline(ctx, camera, bed, 0.02, seed);
    ctx.lineWidth = Math.max(3, tile * 0.2);
    ctx.strokeStyle = '#8a6a44';
    ctx.stroke();
    ctx.lineWidth = Math.max(1, tile * 0.06);
    ctx.strokeStyle = 'rgba(230,200,150,0.55)';
    ctx.stroke();
    // A shadow under the front edge, so it stands up off the ground.
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.fillRect(tl.x, tl.y + bed.h * tile + tile * 0.08, bed.w * tile, tile * 0.1);
  } else if (bed.shape === 'oval') {
    const c = camera.worldToScreen((bed.x + bed.w / 2) * TILE_SIZE, (bed.y + bed.h / 2) * TILE_SIZE);
    const rx = (bed.w / 2) * tile;
    const ry = (bed.h / 2) * tile;
    const n = Math.max(10, Math.round((bed.w + bed.h) * 4));
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const x = c.x + Math.cos(a) * rx;
      const y = c.y + Math.sin(a) * ry;
      ctx.fillStyle = hash2(i, seed) > 0.5 ? '#9a9180' : '#aea48f';
      ctx.beginPath();
      ctx.ellipse(x, y, tile * 0.13, tile * 0.09, a, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,0.15)';
      ctx.beginPath();
      ctx.ellipse(x, y + tile * 0.04, tile * 0.12, tile * 0.05, a, 0, Math.PI);
      ctx.fill();
    }
  } else {
    bedOutline(ctx, camera, bed, 0.01, seed);
    ctx.lineWidth = Math.max(2, tile * 0.13);
    ctx.strokeStyle = '#6e5234';
    ctx.stroke();
    ctx.lineWidth = Math.max(1, tile * 0.04);
    ctx.strokeStyle = 'rgba(190,150,100,0.45)';
    ctx.stroke();
  }
  // Moss and grass creeping back over the edging as the bed ages.
  const age = Math.min(1, (now - bed.createdAt) / 2880);
  if (age > 0.05) {
    const c = camera.worldToScreen((bed.x + bed.w / 2) * TILE_SIZE, (bed.y + bed.h / 2) * TILE_SIZE);
    const n = Math.floor((bed.w + bed.h) * 3 * age);
    ctx.fillStyle = 'rgba(90,140,60,0.55)';
    for (let i = 0; i < n; i++) {
      const a = hash2(i, seed + 3) * Math.PI * 2;
      const x = c.x + Math.cos(a) * (bed.w / 2) * tile * (bed.shape === 'oval' ? 1 : 1.05);
      const y = c.y + Math.sin(a) * (bed.h / 2) * tile * (bed.shape === 'oval' ? 1 : 1.05);
      ctx.beginPath();
      ctx.ellipse(x, y, tile * 0.1, tile * 0.05, a, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

// ---------------------------------------------------------------- paths

function pathDirt(zoneAtStart: string): [string, string] {
  if (zoneAtStart === 'dampForest' || zoneAtStart === 'woodland') return ['#5e4a34', '#7a6446'];
  if (zoneAtStart === 'rockyClearing') return ['#9a8a6a', '#b4a482'];
  return ['#7d6647', '#9a8260'];
}

/** A trodden-earth path: soft-edged, pebbled, its verges slowly creeping back in. */
export function drawGardenPath(ctx: Ctx, camera: Camera, path: GardenPath, now: number) {
  const pts = pathPairs(path.points);
  if (pts.length < 2) return;
  const tile = TILE_SIZE * camera.zoom;
  const screen = pts.map(([x, y]) => camera.worldToScreen(x * TILE_SIZE, y * TILE_SIZE));
  const trace = () => {
    ctx.beginPath();
    ctx.moveTo(screen[0].x, screen[0].y);
    for (let i = 1; i < screen.length - 1; i++) {
      const mx = (screen[i].x + screen[i + 1].x) / 2;
      const my = (screen[i].y + screen[i + 1].y) / 2;
      ctx.quadraticCurveTo(screen[i].x, screen[i].y, mx, my);
    }
    ctx.lineTo(screen[screen.length - 1].x, screen[screen.length - 1].y);
  };
  const [dark, light] = pathDirt(zoneAt(Math.floor(pts[0][0]), Math.floor(pts[0][1])));
  const enc = encroachment(path, now);
  const w = path.width * tile;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  trace();
  ctx.strokeStyle = 'rgba(30,24,12,0.16)';
  ctx.lineWidth = w * 1.12;
  ctx.stroke();
  ctx.strokeStyle = dark;
  ctx.globalAlpha = 0.92;
  ctx.lineWidth = w * (1 - enc * 0.18);
  ctx.stroke();
  ctx.strokeStyle = light;
  ctx.globalAlpha = 0.5;
  ctx.lineWidth = w * 0.5 * (1 - enc * 0.3);
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.restore();
  // Pebbles, footprints of use, and — as it ages — grass along the verges.
  for (let i = 1; i < pts.length; i++) {
    const [ax, ay] = pts[i - 1];
    const [bx, by] = pts[i];
    const len = Math.hypot(bx - ax, by - ay);
    const nx = -(by - ay) / (len || 1);
    const ny = (bx - ax) / (len || 1);
    const steps = Math.max(1, Math.floor(len * 3));
    for (let k = 0; k < steps; k++) {
      const t = k / steps;
      const h = hash2(ax * 7 + k, ay * 3 + i);
      const x = ax + (bx - ax) * t;
      const y = ay + (by - ay) * t;
      if (h < 0.5) {
        const off = (hash2(k + i, h) - 0.5) * path.width * 0.6;
        const s = camera.worldToScreen((x + nx * off) * TILE_SIZE, (y + ny * off) * TILE_SIZE);
        ctx.fillStyle = h < 0.25 ? 'rgba(170,160,140,0.8)' : 'rgba(60,48,30,0.35)';
        ctx.beginPath();
        ctx.ellipse(s.x, s.y, tile * 0.05, tile * 0.035, h * 3, 0, Math.PI * 2);
        ctx.fill();
      }
      for (const side of [-1, 1]) {
        if (hash2(k * 3 + side, i + ay) > 0.35 + enc * 0.6) continue;
        const reach = path.width * (0.5 - enc * 0.18 * hash2(k, side + i));
        const s = camera.worldToScreen((x + nx * side * reach) * TILE_SIZE, (y + ny * side * reach) * TILE_SIZE);
        ctx.strokeStyle = 'rgba(80,130,56,0.8)';
        ctx.lineWidth = Math.max(1, tile * 0.025);
        ctx.beginPath();
        for (let b = -1; b <= 1; b++) {
          ctx.moveTo(s.x + b * tile * 0.03, s.y);
          ctx.lineTo(s.x + b * tile * 0.05 + side * nx * tile * 0.02, s.y - tile * (0.1 + enc * 0.08));
        }
        ctx.stroke();
      }
    }
  }
}

// ---------------------------------------------------------------- previews

function label(ctx: Ctx, x: number, y: number, text: string, bad: boolean, tile: number) {
  ctx.font = `600 ${Math.max(11, Math.round(tile * 0.26))}px system-ui, sans-serif`;
  const w = ctx.measureText(text).width + tile * 0.4;
  const h = Math.max(20, tile * 0.46);
  // Keep it on screen, even at the edge of a drag.
  const viewW = ctx.canvas.width / Math.min(window.devicePixelRatio || 1, 2);
  x = Math.max(w / 2 + 6, Math.min(viewW - w / 2 - 6, x));
  ctx.fillStyle = bad ? 'rgba(90,24,18,0.86)' : 'rgba(18,50,34,0.86)';
  ctx.beginPath();
  ctx.roundRect(x - w / 2, y - h / 2, w, h, h / 2);
  ctx.fill();
  ctx.fillStyle = '#f6efe0';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x, y + 1);
  ctx.textBaseline = 'alphabetic';
}

const PLANT_BLOCK_TEXT: Record<string, string> = {
  bounds: 'Too far',
  water: 'Can’t plant here',
  dry: 'Needs water: the creek or a pond',
  building: 'Can’t plant here',
  obstacle: 'Something’s in the way',
  spot: 'A wild patch grows here',
  path: 'That’s your path',
  crowded: 'Too close',
  decor: 'Something’s in the way',
};

/** Where the plant will go: the young plant itself, and a ring for how much ground it will one day fill. */
export function drawPlantPreview(
  ctx: Ctx,
  camera: Camera,
  mode: { x: number; y: number; check: PlantingCheck; ghost: { defId: string; variantId: string; growth: number } },
  drawPlant: (sx: number, sy: number, alpha: number) => void,
  now: number
) {
  const tile = TILE_SIZE * camera.zoom;
  const s = camera.worldToScreen(mode.x * TILE_SIZE, mode.y * TILE_SIZE);
  const ok = !mode.check.block;
  const mature = matureRadius(mode.ghost.defId, mode.ghost.variantId) * tile;
  const pulse = 0.5 + 0.5 * Math.sin(now * 0.005);
  ctx.save();
  ctx.setLineDash([tile * 0.12, tile * 0.1]);
  ctx.lineWidth = Math.max(1.5, tile * 0.04);
  ctx.strokeStyle = ok ? `rgba(200,255,190,${0.55 + pulse * 0.3})` : 'rgba(255,140,120,0.85)';
  ctx.beginPath();
  ctx.ellipse(s.x, s.y, mature, mature * 0.6, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = ok ? 'rgba(160,230,150,0.14)' : 'rgba(255,110,90,0.16)';
  ctx.fill();
  ctx.restore();
  if (mode.check.blocker && mode.check.blocker.location.kind === 'wild') {
    const b = mode.check.blocker;
    const loc = b.location as { x: number; y: number };
    const bs = camera.worldToScreen(loc.x * TILE_SIZE, loc.y * TILE_SIZE);
    const r = currentRadius(b) * tile;
    ctx.strokeStyle = 'rgba(255,140,120,0.8)';
    ctx.lineWidth = Math.max(1.5, tile * 0.04);
    ctx.beginPath();
    ctx.ellipse(bs.x, bs.y, r, r * 0.6, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  drawPlant(s.x, s.y, ok ? 0.9 : 0.55);
  // A little stake marking the exact spot.
  ctx.fillStyle = ok ? '#f6efe0' : '#ffb4a4';
  ctx.beginPath();
  ctx.arc(s.x, s.y, Math.max(2, tile * 0.05), 0, Math.PI * 2);
  ctx.fill();
  if (!ok) label(ctx, s.x, s.y + tile * 0.75, PLANT_BLOCK_TEXT[mode.check.block!] ?? 'Not here', true, tile);
  else if (mode.check.bedId) label(ctx, s.x, s.y + tile * 0.75, 'In your garden bed', false, tile);
}

const BED_BLOCK_TEXT: Record<string, string> = {
  'too-small': 'Drag it bigger',
  'too-big': 'Too big for one bed',
  coins: 'Not enough coins',
  blocked: 'Trees, rocks or water in the way',
  patch: 'A wild patch grows there — leave it be',
  overlap: 'Overlaps another bed',
};

export function drawBedPreview(ctx: Ctx, camera: Camera, spec: Pick<GardenBed, 'x' | 'y' | 'w' | 'h' | 'shape'>, block: string | null, cost: number | null, coins: number) {
  const tile = TILE_SIZE * camera.zoom;
  const ok = !block;
  bedOutline(ctx, camera, spec, 0, 1);
  ctx.fillStyle = ok ? 'rgba(96,70,40,0.45)' : 'rgba(160,50,40,0.28)';
  ctx.fill();
  ctx.setLineDash([tile * 0.14, tile * 0.1]);
  ctx.lineWidth = Math.max(2, tile * 0.05);
  ctx.strokeStyle = ok ? 'rgba(236,222,190,0.95)' : 'rgba(255,150,130,0.95)';
  ctx.stroke();
  ctx.setLineDash([]);
  const c = camera.worldToScreen((spec.x + spec.w / 2) * TILE_SIZE, (spec.y + spec.h / 2) * TILE_SIZE);
  label(ctx, c.x, c.y, ok ? `${cost ?? ''} coins` : block === 'coins' ? `${cost} coins (you have ${coins})` : BED_BLOCK_TEXT[block!] ?? 'Not here', !ok, tile);
}

export function drawPathPreview(ctx: Ctx, camera: Camera, points: number[], preview: PathPreview | null, width: number) {
  const pts = pathPairs(points);
  if (pts.length < 1) return;
  const tile = TILE_SIZE * camera.zoom;
  const ok = !!preview && !preview.block;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  pts.forEach(([x, y], i) => {
    const s = camera.worldToScreen(x * TILE_SIZE, y * TILE_SIZE);
    if (i === 0) ctx.moveTo(s.x, s.y);
    else ctx.lineTo(s.x, s.y);
  });
  ctx.strokeStyle = ok ? 'rgba(160,126,84,0.6)' : 'rgba(200,120,100,0.45)';
  ctx.lineWidth = width * tile;
  ctx.stroke();
  ctx.setLineDash([tile * 0.12, tile * 0.12]);
  ctx.strokeStyle = 'rgba(246,239,224,0.9)';
  ctx.lineWidth = Math.max(1.5, tile * 0.04);
  ctx.stroke();
  ctx.restore();
  if (!preview) return;
  for (const p of preview.plants) {
    if (p.location.kind !== 'wild') continue;
    const s = camera.worldToScreen(p.location.x * TILE_SIZE, p.location.y * TILE_SIZE);
    const r = Math.max(0.35, currentRadius(p)) * tile;
    ctx.strokeStyle = 'rgba(255,190,110,0.95)';
    ctx.lineWidth = Math.max(1.5, tile * 0.05);
    ctx.beginPath();
    ctx.ellipse(s.x, s.y, r, r * 0.6, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  for (let i = 0; i + 1 < preview.badPoints.length; i += 2) {
    const s = camera.worldToScreen(preview.badPoints[i] * TILE_SIZE, preview.badPoints[i + 1] * TILE_SIZE);
    ctx.fillStyle = 'rgba(255,110,90,0.9)';
    ctx.beginPath();
    ctx.arc(s.x, s.y, tile * 0.12, 0, Math.PI * 2);
    ctx.fill();
  }
  const [lx, ly] = pts[pts.length - 1];
  const s = camera.worldToScreen(lx * TILE_SIZE, ly * TILE_SIZE);
  const text =
    preview.block === 'too-short'
      ? 'Keep tracing…'
      : preview.block === 'blocked'
        ? 'Trees, rocks or water in the way'
        : preview.block === 'bed'
          ? 'Paths go around garden beds'
        : preview.plants.length
          ? `Composts ${preview.plants.length} of your plants`
          : preview.block === 'coins'
            ? `${preview.cost} coins — not enough`
            : `${preview.cost} coins${preview.trees.length ? ` · ${preview.trees.length} tree${preview.trees.length === 1 ? '' : 's'}` : ''}${preview.rocks.length ? ` · ${preview.rocks.length} rock${preview.rocks.length === 1 ? '' : 's'}` : ''}`;
  label(ctx, s.x, s.y - tile * 0.8, text, !!preview.block && preview.block !== 'too-short', tile);
}

// ---------------------------------------------------------------- flourishes

/** A find worth stopping for: a ring of light spreading over the ground and motes drifting up. */
export function drawFlourish(ctx: Ctx, camera: Camera, f: { x: number; y: number; kind: string; rarity: Rarity; start: number }, nowMs: number) {
  const tile = TILE_SIZE * camera.zoom;
  const t = (nowMs - f.start) / 2600;
  if (t < 0 || t > 1) return;
  const s = camera.worldToScreen(f.x * TILE_SIZE, f.y * TILE_SIZE);
  const color = RARITY_GLOW[f.rarity];
  const big = f.kind === 'bloom';
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const r = tile * (0.4 + t * (big ? 2.4 : 1.4));
  ctx.globalAlpha = (1 - t) * (big ? 0.55 : 0.4);
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(1.5, tile * 0.06 * (1 - t));
  ctx.beginPath();
  ctx.ellipse(s.x, s.y, r, r * 0.55, 0, 0, Math.PI * 2);
  ctx.stroke();
  const motes = big ? 14 : 7;
  ctx.fillStyle = color;
  for (let i = 0; i < motes; i++) {
    const a = (i / motes) * Math.PI * 2 + hash2(i, f.start) * 0.6;
    const rr = tile * (0.3 + t * (big ? 1.2 : 0.8) * (0.6 + hash2(i * 3, f.x) * 0.6));
    const x = s.x + Math.cos(a) * rr;
    const y = s.y + Math.sin(a) * rr * 0.55 - t * tile * (0.8 + hash2(f.y, i) * 0.8);
    ctx.globalAlpha = (1 - t) * 0.9;
    ctx.beginPath();
    ctx.arc(x, y, tile * 0.04 * (1 - t * 0.5), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

// ---------------------------------------------------------------- the fox

/**
 * The fox: long-bodied and low, with a white-tipped brush of a tail. It
 * faces where it's going, runs flat out when it's running, and when it
 * stops to look back it turns its head to you.
 */
export function drawFox(ctx: Ctx, camera: Camera, fox: FoxState, now: number, fade: number) {
  const tile = TILE_SIZE * camera.zoom;
  const s = camera.worldToScreen(fox.x * TILE_SIZE, fox.y * TILE_SIZE);
  const dir = fox.facing === 'left' ? -1 : 1;
  const running = fox.behavior === 'fleeing';
  const trotting = fox.behavior === 'leading';
  const looking = fox.behavior === 'lookingBack' || fox.behavior === 'paused';
  const gait = running ? now * 0.028 : trotting ? now * 0.016 : 0;
  const bob = running ? Math.abs(Math.sin(gait)) * -tile * 0.05 : trotting ? Math.abs(Math.sin(gait)) * -tile * 0.025 : Math.sin(now * 0.002) * tile * 0.006;
  ctx.save();
  ctx.globalAlpha = 1 - fade;
  // A rustle of leaves where it slips away.
  if (fade > 0) {
    ctx.fillStyle = 'rgba(90,140,70,0.7)';
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + fade * 3;
      ctx.beginPath();
      ctx.ellipse(s.x + Math.cos(a) * tile * (0.2 + fade * 0.4), s.y + Math.sin(a) * tile * 0.12 - fade * tile * 0.2, tile * 0.07, tile * 0.035, a, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.translate(s.x, s.y + bob);
  ctx.scale(dir, 1);
  const OR = '#c9652f';
  const ORD = '#9e4a22';
  const CREAM = '#f4ecd8';
  const DARK = '#2a1a12';
  // shadow
  ctx.fillStyle = 'rgba(0,0,0,0.2)';
  ctx.beginPath();
  ctx.ellipse(0, tile * 0.2 - bob, tile * 0.3, tile * 0.07, 0, 0, Math.PI * 2);
  ctx.fill();
  // legs
  const legs = [
    [-0.17, 0],
    [-0.1, Math.PI],
    [0.12, Math.PI * 0.5],
    [0.19, Math.PI * 1.5],
  ];
  ctx.strokeStyle = DARK;
  ctx.lineWidth = Math.max(1.2, tile * 0.045);
  ctx.lineCap = 'round';
  for (const [lx, ph] of legs) {
    const swing = running || trotting ? Math.sin(gait + ph) * tile * (running ? 0.09 : 0.05) : 0;
    ctx.beginPath();
    ctx.moveTo(lx * tile, tile * 0.04);
    ctx.lineTo(lx * tile + swing, tile * 0.19 - bob);
    ctx.stroke();
  }
  // tail: streams out behind when running, curls down when still
  const tailLift = running ? -0.02 : looking ? 0.1 : 0.05;
  ctx.fillStyle = OR;
  ctx.beginPath();
  ctx.moveTo(-tile * 0.2, -tile * 0.02);
  ctx.quadraticCurveTo(-tile * 0.42, tile * (tailLift - 0.12), -tile * 0.58, tile * (tailLift + 0.02));
  ctx.quadraticCurveTo(-tile * 0.44, tile * (tailLift + 0.12), -tile * 0.2, tile * 0.07);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = CREAM;
  ctx.beginPath();
  ctx.ellipse(-tile * 0.56, tile * (tailLift + 0.02), tile * 0.06, tile * 0.045, -0.3, 0, Math.PI * 2);
  ctx.fill();
  // body
  const stretch = running ? 1.12 : 1;
  ctx.fillStyle = OR;
  ctx.beginPath();
  ctx.ellipse(0, 0, tile * 0.24 * stretch, tile * 0.11, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = ORD;
  ctx.beginPath();
  ctx.ellipse(-tile * 0.02, -tile * 0.05, tile * 0.18 * stretch, tile * 0.05, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = CREAM;
  ctx.beginPath();
  ctx.ellipse(tile * 0.06, tile * 0.06, tile * 0.13, tile * 0.04, 0, 0, Math.PI * 2);
  ctx.fill();
  // head — turned back over its shoulder when it's looking at you
  const turned = looking;
  const hx = turned ? tile * 0.2 : tile * 0.27;
  const hy = -tile * (running ? 0.05 : 0.11);
  ctx.save();
  ctx.translate(hx, hy);
  if (turned) ctx.scale(-0.85, 1);
  ctx.fillStyle = OR;
  ctx.beginPath();
  ctx.ellipse(0, 0, tile * 0.1, tile * 0.085, 0, 0, Math.PI * 2);
  ctx.fill();
  // ears
  for (const ex of [-0.05, 0.04]) {
    ctx.fillStyle = ORD;
    ctx.beginPath();
    ctx.moveTo(ex * tile - tile * 0.035, -tile * 0.05);
    ctx.lineTo(ex * tile, -tile * 0.16);
    ctx.lineTo(ex * tile + tile * 0.035, -tile * 0.05);
    ctx.closePath();
    ctx.fill();
  }
  // muzzle
  ctx.fillStyle = CREAM;
  ctx.beginPath();
  ctx.moveTo(tile * 0.03, -tile * 0.01);
  ctx.lineTo(tile * 0.17, tile * 0.02);
  ctx.lineTo(tile * 0.03, tile * 0.06);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = DARK;
  ctx.beginPath();
  ctx.arc(tile * 0.17, tile * 0.02, tile * 0.018, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(tile * 0.05, -tile * 0.02, tile * 0.014, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  ctx.restore();
}

// ---------------------------------------------------------------- fox finds

/** Undergrowth half-hiding a find, so you have to look for it. */
function hidingLeaves(ctx: Ctx, x: number, y: number, tile: number, seed: number) {
  for (let i = 0; i < 7; i++) {
    const a = hash2(seed, i) * Math.PI * 2;
    const r = tile * (0.18 + hash2(i, seed) * 0.2);
    ctx.fillStyle = i % 2 ? 'rgba(52,96,44,0.9)' : 'rgba(74,122,58,0.9)';
    ctx.beginPath();
    ctx.ellipse(x + Math.cos(a) * r, y + tile * 0.05 + Math.abs(Math.sin(a)) * r * 0.3, tile * 0.13, tile * 0.05, a, 0, Math.PI * 2);
    ctx.fill();
  }
}

export function drawFoxFindCuriosity(ctx: Ctx, camera: Camera, find: { x: number; y: number; curiosityId?: string; seed: number }, now: number, near: boolean) {
  const tile = TILE_SIZE * camera.zoom;
  const s = camera.worldToScreen(find.x * TILE_SIZE, find.y * TILE_SIZE);
  const c = findCuriosity(find.curiosityId ?? '');
  const id = c?.id ?? '';
  ctx.save();
  switch (id) {
    case 'treeFrog': {
      hidingLeaves(ctx, s.x, s.y, tile, find.seed % 50);
      const y = s.y - tile * 0.16;
      ctx.fillStyle = '#4cc04a';
      ctx.beginPath();
      ctx.ellipse(s.x, y, tile * 0.075, tile * 0.055, 0, 0, Math.PI * 2);
      ctx.ellipse(s.x + tile * 0.06, y - tile * 0.035, tile * 0.04, tile * 0.032, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#e8402a';
      ctx.beginPath();
      ctx.arc(s.x + tile * 0.075, y - tile * 0.06, tile * 0.016, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'hedgehog': {
      const y = s.y - tile * 0.04;
      ctx.fillStyle = '#6a5038';
      ctx.beginPath();
      ctx.ellipse(s.x, y, tile * 0.13, tile * 0.08, 0, Math.PI, 0);
      ctx.fill();
      ctx.strokeStyle = '#3e2c1c';
      ctx.lineWidth = Math.max(1, tile * 0.012);
      ctx.beginPath();
      for (let i = 0; i < 9; i++) {
        const a = Math.PI + (i / 8) * Math.PI;
        ctx.moveTo(s.x + Math.cos(a) * tile * 0.1, y + Math.sin(a) * tile * 0.06);
        ctx.lineTo(s.x + Math.cos(a) * tile * 0.16, y + Math.sin(a) * tile * 0.11);
      }
      ctx.stroke();
      ctx.fillStyle = '#c8a888';
      ctx.beginPath();
      ctx.ellipse(s.x + tile * 0.13, y - tile * 0.01, tile * 0.045, tile * 0.03, 0.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#1a1008';
      ctx.beginPath();
      ctx.arc(s.x + tile * 0.17, y - tile * 0.005, tile * 0.012, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'fireSalamander': {
      const y = s.y - tile * 0.02;
      ctx.strokeStyle = '#151210';
      ctx.lineCap = 'round';
      ctx.lineWidth = Math.max(2, tile * 0.05);
      ctx.beginPath();
      ctx.moveTo(s.x - tile * 0.18, y + tile * 0.02);
      ctx.quadraticCurveTo(s.x - tile * 0.05, y - tile * 0.05, s.x + tile * 0.14, y);
      ctx.stroke();
      ctx.fillStyle = '#f2c41a';
      for (let i = 0; i < 4; i++) {
        ctx.beginPath();
        ctx.arc(s.x - tile * 0.12 + i * tile * 0.075, y - tile * 0.015 * (i % 2 ? 1 : -0.4), tile * 0.016, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case 'lunaMoth':
    case 'swallowtail':
    case 'emeraldDragonfly':
    case 'jewelBeetle': {
      const flutter = Math.sin(now * 0.012) * 0.5 + 0.5;
      const col = id === 'lunaMoth' ? '#c8f0b4' : id === 'swallowtail' ? '#f4e8b0' : id === 'emeraldDragonfly' ? '#4ad89a' : '#c87a3a';
      hidingLeaves(ctx, s.x, s.y, tile, find.seed % 50);
      const y = s.y - tile * 0.18;
      ctx.fillStyle = col;
      if (id === 'jewelBeetle') {
        ctx.fillStyle = `hsl(${30 + flutter * 90}, 60%, 45%)`;
        ctx.beginPath();
        ctx.ellipse(s.x, y + tile * 0.1, tile * 0.07, tile * 0.1, 0, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.ellipse(s.x + side * tile * 0.08, y, tile * 0.08 * (0.4 + flutter * 0.6), tile * 0.1, side * 0.4, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = '#3a2a20';
      ctx.fillRect(s.x - tile * 0.012, y - tile * 0.08, tile * 0.024, tile * 0.16);
      break;
    }
    case 'glowworms': {
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 9; i++) {
        const a = hash2(i, find.seed % 31) * Math.PI * 2;
        const rr = tile * 0.45 * hash2(find.seed % 17, i);
        const tw = 0.5 + 0.5 * Math.sin(now * 0.003 + i * 1.7);
        ctx.fillStyle = `rgba(160,255,170,${0.4 + tw * 0.5})`;
        ctx.beginPath();
        ctx.arc(s.x + Math.cos(a) * rr, s.y + Math.sin(a) * rr * 0.5, tile * 0.03, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case 'lostGolfBall':
      hidingLeaves(ctx, s.x, s.y, tile, find.seed % 40);
      ctx.fillStyle = '#f7f5ee';
      ctx.beginPath();
      ctx.arc(s.x + tile * 0.05, s.y - tile * 0.02, tile * 0.055, 0, Math.PI * 2);
      ctx.fill();
      break;
    case 'splitGeode':
      ctx.fillStyle = '#8a8478';
      ctx.beginPath();
      ctx.ellipse(s.x - tile * 0.08, s.y, tile * 0.12, tile * 0.08, 0, 0, Math.PI * 2);
      ctx.ellipse(s.x + tile * 0.1, s.y + tile * 0.02, tile * 0.11, tile * 0.07, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#9a6ad0';
      ctx.beginPath();
      ctx.ellipse(s.x - tile * 0.08, s.y - tile * 0.02, tile * 0.07, tile * 0.045, 0, 0, Math.PI * 2);
      ctx.fill();
      break;
    case 'foxDen':
      ctx.fillStyle = '#1e140c';
      ctx.beginPath();
      ctx.ellipse(s.x, s.y, tile * 0.3, tile * 0.18, 0, Math.PI, 0);
      ctx.fill();
      ctx.fillStyle = '#6a5034';
      ctx.fillRect(s.x - tile * 0.4, s.y, tile * 0.8, tile * 0.06);
      hidingLeaves(ctx, s.x, s.y - tile * 0.15, tile, 9);
      break;
    default:
      hidingLeaves(ctx, s.x, s.y, tile, 3);
  }
  ctx.restore();
  if (near) drawNearGlint(ctx, s.x, s.y - tile * 0.3, tile, now);
}

/** Only when you're close does a find catch the light. */
export function drawNearGlint(ctx: Ctx, x: number, y: number, tile: number, now: number) {
  const a = 0.35 + 0.35 * Math.sin(now * 0.004);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const g = ctx.createRadialGradient(x, y, 0, x, y, tile * 0.5);
  g.addColorStop(0, `rgba(255,244,200,${a})`);
  g.addColorStop(1, 'rgba(255,244,200,0)');
  ctx.fillStyle = g;
  ctx.fillRect(x - tile * 0.5, y - tile * 0.5, tile, tile);
  ctx.restore();
}

export function drawFindCover(ctx: Ctx, camera: Camera, x: number, y: number, seed: number) {
  const tile = TILE_SIZE * camera.zoom;
  const s = camera.worldToScreen(x * TILE_SIZE, y * TILE_SIZE);
  hidingLeaves(ctx, s.x, s.y + tile * 0.08, tile, seed);
}

export type { OwnedPlant, GameState };
