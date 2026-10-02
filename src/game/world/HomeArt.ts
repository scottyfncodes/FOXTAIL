import type { Camera } from '../engine/Camera';
import type { GameState } from '../state';
import { TILE_SIZE } from '../data/worldMap';
import { daylightFactor, isNight } from '../engine/Clock';
import {
  FRONT_DOOR,
  GREENHOUSE_DOORS,
  greenhouseDoorAtInside,
  IMPLIED_DOORWAYS,
  INTERIOR_H,
  INTERIOR_W,
  LIVING_WINDOWS,
  PARTITION_DOOR_YS,
  PARTITION_X,
  PUTTING_CUP_OFFSET,
  type LivingFixture,
} from '../data/interior';
import { SCOTT_APPEARANCE, ELLEN_APPEARANCE } from '../data/character';

// The inside of the house: the greenhouse's plank floor and glass walls on
// the west, and on the east the living room — warmer floor, papered walls,
// the couch and the TV and the cat's things — with doorways to the rest of
// the house that you never go through. It should feel like a home with a
// greenhouse, not a menu with a floor.

type Ctx = CanvasRenderingContext2D;

function hash2(x: number, y: number): number {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

function mix(a: string, b: string, t: number): string {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const r = Math.round(((pa >> 16) & 255) * (1 - t) + ((pb >> 16) & 255) * t);
  const g = Math.round(((pa >> 8) & 255) * (1 - t) + ((pb >> 8) & 255) * t);
  const bl = Math.round((pa & 255) * (1 - t) + (pb & 255) * t);
  return `rgb(${r},${g},${bl})`;
}

/** Floors and walls for the whole interior. */
export function drawInteriorShell(ctx: Ctx, camera: Camera, state: GameState, now: number) {
  const tile = TILE_SIZE * camera.zoom;
  const size = Math.ceil(tile) + 1;
  const day = daylightFactor(state.clock.totalMinutes);
  const seams = new Path2D();
  const grain = new Path2D();
  const bounds = {
    x0: Math.max(0, Math.floor((camera.x - camera.viewW / 2 / camera.zoom) / TILE_SIZE) - 1),
    x1: Math.min(INTERIOR_W - 1, Math.ceil((camera.x + camera.viewW / 2 / camera.zoom) / TILE_SIZE) + 1),
    y0: 0,
    y1: INTERIOR_H - 1,
  };
  for (let y = bounds.y0; y <= bounds.y1; y++) {
    const stagger = (y * 2) % 3;
    for (let x = bounds.x0; x <= bounds.x1; x++) {
      const sc = camera.worldToScreen(x * TILE_SIZE, y * TILE_SIZE);
      const sx = Math.floor(sc.x);
      const sy = Math.floor(sc.y);
      const living = x > PARTITION_X;
      const border = x === 0 || y === 0 || x === INTERIOR_W - 1 || y === INTERIOR_H - 1;
      const partition = x === PARTITION_X && !PARTITION_DOOR_YS.includes(y);
      const exit = !!greenhouseDoorAtInside(x, y) || (x === FRONT_DOOR.x && y === INTERIOR_H - 1);
      if ((border || partition) && !exit) {
        if (living || partition) drawWallTile(ctx, sx, sy, size, tile, x, y, partition);
        else drawGlassTile(ctx, sx, sy, size, tile, x, y, day, now);
        continue;
      }
      if (living || x === PARTITION_X) {
        // Warm oak, narrower boards, laid the other way.
        const board = Math.floor((y * 3 + (x % 2 ? 1 : 0)) / 2);
        ctx.fillStyle = mix('#9a7650', '#8a6844', hash2(board * 3.3, x * 1.7));
        ctx.fillRect(sx, sy, size, size);
        seams.moveTo(sx, sy);
        seams.lineTo(sx, sy + tile);
        if ((x + y) % 2 === 0) {
          seams.moveTo(sx, sy + tile * 0.5);
          seams.lineTo(sx + tile, sy + tile * 0.5);
        }
      } else {
        const plank = Math.floor((x + stagger) / 3);
        ctx.fillStyle = mix('#6e5238', '#5f4630', hash2(plank * 7.1, y * 3.3));
        ctx.fillRect(sx, sy, size, size);
        seams.moveTo(sx, sy);
        seams.lineTo(sx + tile, sy);
        if ((x + stagger) % 3 === 0) {
          seams.moveTo(sx, sy);
          seams.lineTo(sx, sy + tile);
        }
        const gy = sy + tile * (0.3 + 0.4 * hash2(x * 1.9, y * 2.7));
        grain.moveTo(sx + tile * 0.1, gy);
        grain.lineTo(sx + tile * 0.9, gy + tile * 0.02);
      }
    }
  }
  ctx.lineWidth = Math.max(1, tile * 0.02);
  ctx.strokeStyle = 'rgba(40,26,14,0.5)';
  ctx.stroke(seams);
  ctx.lineWidth = 1;
  ctx.strokeStyle = 'rgba(40,26,14,0.18)';
  ctx.stroke(grain);

  // Sunlight through the glass falls across the greenhouse floor.
  if (day > 0.05) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = `rgba(255,236,190,${0.05 * day})`;
    for (let i = 0; i < 4; i++) {
      const a = camera.worldToScreen((2 + i * 4) * TILE_SIZE, 1 * TILE_SIZE);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(a.x + tile * 1.6, a.y);
      ctx.lineTo(a.x + tile * 3.4, a.y + tile * 9);
      ctx.lineTo(a.x + tile * 1.8, a.y + tile * 9);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  // The doorway between the rooms: a painted frame and a threshold strip.
  const d0 = camera.worldToScreen(PARTITION_X * TILE_SIZE, PARTITION_DOOR_YS[0] * TILE_SIZE);
  const span = PARTITION_DOOR_YS.length * tile;
  ctx.fillStyle = '#b09068';
  ctx.fillRect(d0.x + tile * 0.1, d0.y, tile * 0.8, span);
  ctx.fillStyle = 'rgba(0,0,0,0.12)';
  ctx.fillRect(d0.x + tile * 0.1, d0.y, tile * 0.8, tile * 0.05);
  ctx.fillStyle = '#efe6d2';
  ctx.fillRect(d0.x, d0.y - tile * 0.1, tile, tile * 0.12);
  ctx.fillRect(d0.x, d0.y + span - tile * 0.02, tile, tile * 0.12);

  // Windows in the living room walls.
  for (const w of LIVING_WINDOWS) drawWindow(ctx, camera, w, day, now);
  // Doorways into the rest of the house: warm, dim, never entered.
  for (const d of IMPLIED_DOORWAYS) drawImpliedDoorway(ctx, camera, d, state);

  // The two ways out: the garden door in the glass, the front door in the wall.
  // Every glass door out to the garden: garden, back and side.
  for (const d of GREENHOUSE_DOORS) {
    const g = camera.worldToScreen(d.inside.x * TILE_SIZE, d.inside.y * TILE_SIZE);
    ctx.fillStyle = day > 0.3 ? 'rgba(170,215,160,0.55)' : 'rgba(60,90,90,0.6)';
    ctx.fillRect(g.x, g.y, tile, tile);
    ctx.fillStyle = 'rgba(150,200,255,0.25)';
    if (d.wall === 'west') ctx.fillRect(g.x, g.y - tile * 0.3, tile, tile * 1.6);
    else ctx.fillRect(g.x - tile * 0.3, g.y, tile * 1.6, tile);
  }
  const f = camera.worldToScreen(FRONT_DOOR.x * TILE_SIZE, FRONT_DOOR.y * TILE_SIZE);
  ctx.fillStyle = '#3f5a4c';
  ctx.fillRect(f.x + tile * 0.08, f.y + tile * 0.05, tile * 0.84, tile * 0.9);
  ctx.fillStyle = day > 0.3 ? 'rgba(255,240,200,0.55)' : 'rgba(120,140,170,0.4)';
  ctx.fillRect(f.x + tile * 0.3, f.y + tile * 0.15, tile * 0.4, tile * 0.3);
  ctx.fillStyle = '#d8b24a';
  ctx.beginPath();
  ctx.arc(f.x + tile * 0.78, f.y + tile * 0.55, tile * 0.04, 0, Math.PI * 2);
  ctx.fill();
}

function drawGlassTile(ctx: Ctx, sx: number, sy: number, size: number, tile: number, x: number, y: number, day: number, now: number) {
  // The glass walls look out onto the garden: dim green shapes beyond them.
  ctx.fillStyle = mix('#2e4a3c', '#6d9a78', day * 0.6);
  ctx.fillRect(sx, sy, size, size);
  const sway = Math.sin(now * 0.0008 + x * 0.7 + y) * tile * 0.04;
  for (let i = 0; i < 3; i++) {
    const h = hash2(x * 3 + i, y * 5);
    ctx.fillStyle = `rgba(${40 + day * 40},${80 + day * 60},${50 + day * 30},0.55)`;
    ctx.beginPath();
    ctx.arc(sx + tile * (0.2 + h * 0.6) + sway, sy + tile * (0.3 + hash2(y, x + i) * 0.5), tile * (0.18 + h * 0.18), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = `rgba(220,240,235,${0.12 + day * 0.1})`;
  ctx.fillRect(sx, sy, size, size);
  ctx.strokeStyle = '#2c3d33';
  ctx.lineWidth = Math.max(1, tile * 0.05);
  ctx.strokeRect(sx + 0.5, sy + 0.5, tile, tile);
  ctx.strokeStyle = 'rgba(255,255,255,0.18)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(sx + tile * 0.15, sy + tile * 0.8);
  ctx.lineTo(sx + tile * 0.55, sy + tile * 0.2);
  ctx.stroke();
}

function drawWallTile(ctx: Ctx, sx: number, sy: number, size: number, tile: number, x: number, y: number, partition: boolean) {
  if (partition) {
    // The old east glass of the greenhouse, now a wall of the house: glass above a painted timber base.
    ctx.fillStyle = '#e6dcc6';
    ctx.fillRect(sx, sy, size, size);
    ctx.fillStyle = 'rgba(170,200,190,0.55)';
    ctx.fillRect(sx + tile * 0.12, sy + tile * 0.08, tile * 0.76, tile * 0.5);
    ctx.fillStyle = '#b09068';
    ctx.fillRect(sx, sy + tile * 0.62, size, tile * 0.38);
    ctx.strokeStyle = 'rgba(60,40,20,0.35)';
    ctx.lineWidth = 1;
    ctx.strokeRect(sx + 0.5, sy + 0.5, tile, tile);
    return;
  }
  // Papered walls: soft sage with a fine stripe, and a skirting board.
  ctx.fillStyle = '#9fae94';
  ctx.fillRect(sx, sy, size, size);
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  for (let i = 0; i < 4; i++) ctx.fillRect(sx + tile * (0.1 + i * 0.25), sy, tile * 0.05, size);
  ctx.fillStyle = 'rgba(80,60,40,0.2)';
  ctx.fillRect(sx, sy + tile * 0.1 * hash2(x, y), size, 1);
  ctx.fillStyle = '#efe6d2';
  if (y === 0) ctx.fillRect(sx, sy + tile * 0.84, size, tile * 0.16);
  else if (x === INTERIOR_W - 1) ctx.fillRect(sx, sy, tile * 0.16, size);
  else if (y === INTERIOR_H - 1) ctx.fillRect(sx, sy, size, tile * 0.12);
}

function drawWindow(ctx: Ctx, camera: Camera, w: (typeof LIVING_WINDOWS)[number], day: number, now: number) {
  const tile = TILE_SIZE * camera.zoom;
  const sky = mix('#22324a', '#b8d8e8', day);
  if (w.wall === 'north') {
    const a = camera.worldToScreen(w.x * TILE_SIZE, 0.08 * TILE_SIZE);
    ctx.fillStyle = sky;
    ctx.fillRect(a.x, a.y, w.span * tile, tile * 0.7);
    ctx.fillStyle = `rgba(90,140,90,${0.4 + day * 0.3})`;
    ctx.beginPath();
    ctx.arc(a.x + tile * 0.4 + Math.sin(now * 0.0007) * 2, a.y + tile * 0.6, tile * 0.35, 0, Math.PI * 2);
    ctx.arc(a.x + tile * 1.1, a.y + tile * 0.65, tile * 0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#f4ecdc';
    ctx.lineWidth = Math.max(1, tile * 0.06);
    ctx.strokeRect(a.x, a.y, w.span * tile, tile * 0.7);
    ctx.beginPath();
    ctx.moveTo(a.x + (w.span * tile) / 2, a.y);
    ctx.lineTo(a.x + (w.span * tile) / 2, a.y + tile * 0.7);
    ctx.stroke();
    // Light falling in onto the floor.
    if (day > 0.1) {
      ctx.fillStyle = `rgba(255,236,190,${0.08 * day})`;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y + tile * 0.9);
      ctx.lineTo(a.x + w.span * tile, a.y + tile * 0.9);
      ctx.lineTo(a.x + w.span * tile + tile * 0.8, a.y + tile * 3);
      ctx.lineTo(a.x + tile * 0.6, a.y + tile * 3);
      ctx.closePath();
      ctx.fill();
    }
  } else {
    const a = camera.worldToScreen((INTERIOR_W - 1 + 0.1) * TILE_SIZE, w.y * TILE_SIZE);
    ctx.fillStyle = sky;
    ctx.fillRect(a.x, a.y, tile * 0.5, w.span * tile);
    ctx.strokeStyle = '#f4ecdc';
    ctx.lineWidth = Math.max(1, tile * 0.06);
    ctx.strokeRect(a.x, a.y, tile * 0.5, w.span * tile);
    // The sill the cat likes.
    ctx.fillStyle = '#efe6d2';
    ctx.fillRect(a.x - tile * 0.18, a.y + w.span * tile * 0.35, tile * 0.22, w.span * tile * 0.5);
  }
}

function drawImpliedDoorway(ctx: Ctx, camera: Camera, d: (typeof IMPLIED_DOORWAYS)[number], state: GameState) {
  const tile = TILE_SIZE * camera.zoom;
  const night = isNight(state.clock.totalMinutes);
  if (d.wall === 'north') {
    const a = camera.worldToScreen(d.x! * TILE_SIZE, 0);
    const w = d.span * tile;
    ctx.fillStyle = '#3a2c20';
    ctx.fillRect(a.x, a.y + tile * 0.05, w, tile * 0.95);
    // A glimpse of the kitchen: a warm lamp, the edge of a counter.
    const g = ctx.createLinearGradient(0, a.y, 0, a.y + tile);
    g.addColorStop(0, night ? d.light : 'rgba(255,230,190,0.35)');
    g.addColorStop(1, 'rgba(255,200,140,0.05)');
    ctx.fillStyle = g;
    ctx.fillRect(a.x, a.y + tile * 0.05, w, tile * 0.95);
    ctx.fillStyle = 'rgba(200,180,150,0.45)';
    ctx.fillRect(a.x + w * 0.55, a.y + tile * 0.3, w * 0.45, tile * 0.2);
    ctx.strokeStyle = '#efe6d2';
    ctx.lineWidth = Math.max(1.5, tile * 0.08);
    ctx.strokeRect(a.x, a.y + tile * 0.05, w, tile * 0.95);
    // Light spilling onto the floor in front of it.
    ctx.fillStyle = night ? 'rgba(255,200,130,0.12)' : 'rgba(255,230,190,0.06)';
    ctx.beginPath();
    ctx.moveTo(a.x, a.y + tile);
    ctx.lineTo(a.x + w, a.y + tile);
    ctx.lineTo(a.x + w + tile * 0.3, a.y + tile * 2);
    ctx.lineTo(a.x - tile * 0.3, a.y + tile * 2);
    ctx.closePath();
    ctx.fill();
  } else {
    const a = camera.worldToScreen((INTERIOR_W - 1) * TILE_SIZE, d.y! * TILE_SIZE);
    const h = d.span * tile;
    ctx.fillStyle = '#3a2c20';
    ctx.fillRect(a.x, a.y, tile * 0.95, h);
    const g = ctx.createLinearGradient(a.x + tile, 0, a.x, 0);
    g.addColorStop(0, night ? d.light : 'rgba(255,230,190,0.3)');
    g.addColorStop(1, 'rgba(255,200,140,0.04)');
    ctx.fillStyle = g;
    ctx.fillRect(a.x, a.y, tile * 0.95, h);
    // A hallway runner disappearing out of sight.
    ctx.fillStyle = 'rgba(150,70,60,0.5)';
    ctx.fillRect(a.x + tile * 0.1, a.y + h * 0.3, tile * 0.85, h * 0.4);
    ctx.strokeStyle = '#efe6d2';
    ctx.lineWidth = Math.max(1.5, tile * 0.08);
    ctx.strokeRect(a.x, a.y, tile * 0.95, h);
  }
}

// ---------------------------------------------------------------- fixtures

export interface FixtureContext {
  state: GameState;
  now: number;
  scottWatching: boolean;
  scottRelaxing: boolean;
  /** One of Scott's loaves, cooling on the coffee table. */
  freshLoaf?: boolean;
}

export function drawFixture(ctx: Ctx, camera: Camera, f: LivingFixture, fc: FixtureContext) {
  const tile = TILE_SIZE * camera.zoom;
  const a = camera.worldToScreen(f.x * TILE_SIZE, f.y * TILE_SIZE);
  const w = f.w * tile;
  const h = f.h * tile;
  const night = isNight(fc.state.clock.totalMinutes);
  switch (f.kind) {
    case 'rug': {
      ctx.fillStyle = '#b86a4e';
      ctx.beginPath();
      ctx.roundRect(a.x, a.y, w, h, tile * 0.12);
      ctx.fill();
      ctx.strokeStyle = '#e8c89a';
      ctx.lineWidth = Math.max(1.5, tile * 0.06);
      ctx.beginPath();
      ctx.roundRect(a.x + tile * 0.14, a.y + tile * 0.14, w - tile * 0.28, h - tile * 0.28, tile * 0.08);
      ctx.stroke();
      ctx.fillStyle = 'rgba(232,200,154,0.5)';
      for (let i = 1; i < 6; i++) {
        ctx.beginPath();
        ctx.arc(a.x + (w * i) / 6, a.y + h / 2, tile * 0.08, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case 'doormat':
      ctx.fillStyle = '#8a6a44';
      ctx.fillRect(a.x, a.y, w, h);
      ctx.strokeStyle = 'rgba(40,24,10,0.4)';
      ctx.lineWidth = 1;
      for (let i = 1; i < 8; i++) {
        ctx.beginPath();
        ctx.moveTo(a.x + (w * i) / 8, a.y);
        ctx.lineTo(a.x + (w * i) / 8, a.y + h);
        ctx.stroke();
      }
      break;
    case 'puttingMat': {
      ctx.fillStyle = '#3f7a3c';
      ctx.fillRect(a.x, a.y, w, h);
      ctx.fillStyle = 'rgba(255,255,255,0.07)';
      for (let i = 0; i < 6; i++) ctx.fillRect(a.x + (w * i) / 6, a.y, w / 12, h);
      ctx.strokeStyle = '#e8e0cc';
      ctx.lineWidth = Math.max(1, tile * 0.03);
      ctx.strokeRect(a.x, a.y, w, h);
      const cup = camera.worldToScreen((f.x + PUTTING_CUP_OFFSET.x) * TILE_SIZE, (f.y + PUTTING_CUP_OFFSET.y) * TILE_SIZE);
      ctx.fillStyle = '#1a2a18';
      ctx.beginPath();
      ctx.ellipse(cup.x, cup.y, tile * 0.07, tile * 0.045, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#d8d8d8';
      ctx.lineWidth = Math.max(1, tile * 0.02);
      ctx.beginPath();
      ctx.moveTo(cup.x, cup.y);
      ctx.lineTo(cup.x, cup.y - tile * 0.45);
      ctx.stroke();
      ctx.fillStyle = SCOTT_APPEARANCE.flag;
      ctx.beginPath();
      ctx.moveTo(cup.x, cup.y - tile * 0.45);
      ctx.lineTo(cup.x + tile * 0.18, cup.y - tile * 0.39);
      ctx.lineTo(cup.x, cup.y - tile * 0.33);
      ctx.closePath();
      ctx.fill();
      // A couple of stray balls.
      ctx.fillStyle = SCOTT_APPEARANCE.golfBall;
      for (const bx of [0.22, 0.3]) {
        ctx.beginPath();
        ctx.arc(a.x + w * bx, a.y + h * (0.4 + bx * 0.3), tile * 0.035, 0, Math.PI * 2);
        ctx.fill();
      }
      // While there are holes still to ace, a coin sits by the cup: Scott's
      // standing bet, glinting now and then so the mat reads as worth a go.
      if (fc.state.putting.aces.length < 9) {
        const glint = 0.55 + 0.45 * Math.max(0, Math.sin(fc.now * 0.0025));
        ctx.fillStyle = `rgba(232,196,88,${glint})`;
        ctx.beginPath();
        ctx.ellipse(cup.x + tile * 0.2, cup.y + tile * 0.12, tile * 0.055, tile * 0.035, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = `rgba(140,100,30,${glint})`;
        ctx.lineWidth = Math.max(1, tile * 0.012);
        ctx.stroke();
      }
      break;
    }
    case 'catBed':
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      ctx.beginPath();
      ctx.ellipse(a.x + w / 2, a.y + h * 0.62, w * 0.52, h * 0.45, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = ELLEN_APPEARANCE.crochetScarf;
      ctx.beginPath();
      ctx.ellipse(a.x + w / 2, a.y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#f0dcc0';
      ctx.beginPath();
      ctx.ellipse(a.x + w / 2, a.y + h * 0.48, w * 0.36, h * 0.32, 0, 0, Math.PI * 2);
      ctx.fill();
      break;
    case 'tv': {
      // Low cabinet, screen on top.
      ctx.fillStyle = '#5a4230';
      ctx.fillRect(a.x - tile * 0.1, a.y + h * 0.35, w + tile * 0.2, h * 0.75);
      ctx.fillStyle = '#1a1a1c';
      ctx.fillRect(a.x, a.y - tile * 0.5, w, tile * 0.72);
      const sx = a.x + tile * 0.05;
      const sy = a.y - tile * 0.45;
      const sw = w - tile * 0.1;
      const sh = tile * 0.62;
      if (fc.scottWatching) {
        // The ball game: a green diamond under the lights.
        ctx.fillStyle = '#2f6a34';
        ctx.fillRect(sx, sy, sw, sh);
        ctx.fillStyle = '#a8784a';
        ctx.beginPath();
        ctx.moveTo(sx + sw / 2, sy + sh * 0.25);
        ctx.lineTo(sx + sw * 0.72, sy + sh * 0.6);
        ctx.lineTo(sx + sw / 2, sy + sh * 0.95);
        ctx.lineTo(sx + sw * 0.28, sy + sh * 0.6);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#3a8a40';
        ctx.beginPath();
        ctx.moveTo(sx + sw / 2, sy + sh * 0.38);
        ctx.lineTo(sx + sw * 0.62, sy + sh * 0.6);
        ctx.lineTo(sx + sw / 2, sy + sh * 0.82);
        ctx.lineTo(sx + sw * 0.38, sy + sh * 0.6);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#f4f4f0';
        const t = fc.now * 0.001;
        for (let i = 0; i < 5; i++) {
          ctx.fillRect(sx + sw * (0.3 + 0.4 * hash2(i, 3)) + Math.sin(t + i) * 2, sy + sh * (0.35 + 0.5 * hash2(3, i)), 2, 2);
        }
        ctx.fillStyle = 'rgba(10,10,20,0.75)';
        ctx.fillRect(sx, sy + sh * 0.84, sw * 0.5, sh * 0.16);
        ctx.fillStyle = '#f4f0e0';
        ctx.font = `${Math.max(7, Math.round(tile * 0.12))}px system-ui, sans-serif`;
        ctx.textAlign = 'left';
        ctx.fillText('BOT 7  3–2', sx + 2, sy + sh * 0.97);
        // Its glow on the room.
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        const g = ctx.createRadialGradient(a.x + w / 2, a.y + tile * 0.4, 0, a.x + w / 2, a.y + tile * 0.4, tile * 2.6);
        g.addColorStop(0, `rgba(120,180,255,${night ? 0.18 : 0.07})`);
        g.addColorStop(1, 'rgba(120,180,255,0)');
        ctx.fillStyle = g;
        ctx.fillRect(a.x - tile * 2.6, a.y - tile, w + tile * 5.2, tile * 4);
        ctx.restore();
      } else {
        ctx.fillStyle = '#23262a';
        ctx.fillRect(sx, sy, sw, sh);
        ctx.fillStyle = 'rgba(255,255,255,0.07)';
        ctx.beginPath();
        ctx.moveTo(sx, sy + sh);
        ctx.lineTo(sx + sw * 0.35, sy);
        ctx.lineTo(sx + sw * 0.55, sy);
        ctx.lineTo(sx + sw * 0.2, sy + sh);
        ctx.closePath();
        ctx.fill();
      }
      break;
    }
    case 'couch': {
      // Seen from behind: it faces the TV. Seat, then arms, then the back nearest us.
      ctx.fillStyle = 'rgba(0,0,0,0.2)';
      ctx.fillRect(a.x + tile * 0.05, a.y + h - tile * 0.02, w, tile * 0.1);
      ctx.fillStyle = '#56707a';
      ctx.fillRect(a.x, a.y, w, h * 0.6);
      ctx.fillStyle = '#62808a';
      for (let i = 0; i < 3; i++) ctx.fillRect(a.x + tile * 0.18 + (i * (w - tile * 0.36)) / 3 + 1, a.y + tile * 0.05, (w - tile * 0.36) / 3 - 2, h * 0.45);
      ctx.fillStyle = '#4a626b';
      ctx.fillRect(a.x - tile * 0.02, a.y - tile * 0.05, tile * 0.2, h * 0.9);
      ctx.fillRect(a.x + w - tile * 0.18, a.y - tile * 0.05, tile * 0.2, h * 0.9);
      ctx.fillStyle = '#4f6973';
      ctx.beginPath();
      ctx.roundRect(a.x - tile * 0.02, a.y + h * 0.42, w + tile * 0.04, h * 0.58, tile * 0.08);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      ctx.fillRect(a.x + tile * 0.05, a.y + h * 0.46, w - tile * 0.1, tile * 0.05);
      // A crochet throw over the back.
      ctx.fillStyle = ELLEN_APPEARANCE.crochetScarfAlt;
      ctx.fillRect(a.x + w * 0.62, a.y + h * 0.4, w * 0.22, h * 0.45);
      ctx.fillStyle = ELLEN_APPEARANCE.crochetScarf;
      for (let i = 0; i < 3; i++) ctx.fillRect(a.x + w * 0.62, a.y + h * (0.48 + i * 0.12), w * 0.22, h * 0.04);
      break;
    }
    case 'coffeeTable':
      ctx.fillStyle = 'rgba(0,0,0,0.2)';
      ctx.fillRect(a.x + tile * 0.05, a.y + h * 0.7, w, tile * 0.1);
      ctx.fillStyle = '#6e4e32';
      ctx.fillRect(a.x, a.y, w, h * 0.72);
      ctx.fillStyle = '#5a3e26';
      ctx.fillRect(a.x, a.y + h * 0.72, w, h * 0.28);
      // A mug, a remote, a plant magazine.
      ctx.fillStyle = '#e8dcc4';
      ctx.fillRect(a.x + w * 0.12, a.y + h * 0.18, w * 0.26, h * 0.34);
      ctx.fillStyle = '#2a2a2a';
      ctx.fillRect(a.x + w * 0.52, a.y + h * 0.28, w * 0.18, h * 0.12);
      ctx.fillStyle = '#c96a5a';
      ctx.beginPath();
      ctx.arc(a.x + w * 0.84, a.y + h * 0.3, tile * 0.06, 0, Math.PI * 2);
      ctx.fill();
      if (fc.freshLoaf) {
        // Scott's bread on its board: a scored, golden loaf, still steaming.
        const lx = a.x + w * 0.55;
        const ly = a.y + h * 0.2;
        ctx.fillStyle = '#a77a4a';
        ctx.fillRect(lx - tile * 0.2, ly - tile * 0.02, tile * 0.4, tile * 0.1);
        ctx.fillStyle = '#c0813f';
        ctx.beginPath();
        ctx.ellipse(lx, ly - tile * 0.04, tile * 0.16, tile * 0.09, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#d99a52';
        ctx.beginPath();
        ctx.ellipse(lx - tile * 0.02, ly - tile * 0.07, tile * 0.11, tile * 0.05, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#f0d9a8';
        ctx.lineWidth = Math.max(1, tile * 0.015);
        ctx.beginPath();
        for (let i = -1; i <= 1; i++) {
          ctx.moveTo(lx + i * tile * 0.06 - tile * 0.02, ly - tile * 0.1);
          ctx.lineTo(lx + i * tile * 0.06 + tile * 0.02, ly - tile * 0.02);
        }
        ctx.stroke();
        for (let k = 0; k < 2; k++) {
          const u = (fc.now * 0.0004 + k * 0.5) % 1;
          ctx.fillStyle = `rgba(255,255,255,${0.3 * (1 - u)})`;
          ctx.beginPath();
          ctx.arc(lx + (k - 0.5) * tile * 0.08 + Math.sin(u * 6 + k) * tile * 0.03, ly - tile * 0.14 - u * tile * 0.35, tile * (0.025 + u * 0.03), 0, Math.PI * 2);
          ctx.fill();
        }
      }
      break;
    case 'sideTable': {
      ctx.fillStyle = '#6e4e32';
      ctx.fillRect(a.x, a.y, w, h * 0.7);
      ctx.fillStyle = '#5a3e26';
      ctx.fillRect(a.x, a.y + h * 0.7, w, h * 0.3);
      if (fc.scottRelaxing) {
        // His drink, sweating a little.
        ctx.fillStyle = 'rgba(210,150,70,0.85)';
        ctx.fillRect(a.x + w * 0.3, a.y - tile * 0.12, w * 0.3, tile * 0.22);
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.fillRect(a.x + w * 0.3, a.y - tile * 0.12, w * 0.3, tile * 0.04);
      }
      break;
    }
    case 'floorLamp': {
      const cx = a.x + w / 2;
      ctx.fillStyle = '#3a3026';
      ctx.fillRect(cx - tile * 0.02, a.y - tile * 1.1, tile * 0.04, tile * 1.2 + h * 0.4);
      ctx.fillStyle = '#e8d6aa';
      ctx.beginPath();
      ctx.moveTo(cx - tile * 0.2, a.y - tile * 0.95);
      ctx.lineTo(cx + tile * 0.2, a.y - tile * 0.95);
      ctx.lineTo(cx + tile * 0.12, a.y - tile * 1.25);
      ctx.lineTo(cx - tile * 0.12, a.y - tile * 1.25);
      ctx.closePath();
      ctx.fill();
      if (night) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        const g = ctx.createRadialGradient(cx, a.y - tile * 0.8, 0, cx, a.y - tile * 0.4, tile * 2.4);
        g.addColorStop(0, 'rgba(255,200,120,0.28)');
        g.addColorStop(1, 'rgba(255,200,120,0)');
        ctx.fillStyle = g;
        ctx.fillRect(cx - tile * 2.4, a.y - tile * 3, tile * 4.8, tile * 5);
        ctx.restore();
      }
      break;
    }
    case 'bookshelf': {
      ctx.fillStyle = '#5a4030';
      ctx.fillRect(a.x, a.y - tile * 0.8, w, tile * 0.8 + h);
      const spines = ['#8a3a2e', '#3e5a7a', '#c9a463', '#4d6a44', '#7a4a6a', '#d8cdb4'];
      for (let r = 0; r < 3; r++) {
        let x = a.x + tile * 0.06;
        let i = r * 3;
        while (x < a.x + w - tile * 0.12) {
          const bw = tile * (0.07 + hash2(i, r) * 0.06);
          ctx.fillStyle = spines[i % spines.length];
          ctx.fillRect(x, a.y - tile * (0.74 - r * 0.26), bw, tile * 0.21);
          x += bw + 1;
          i++;
        }
      }
      break;
    }
    case 'catTree': {
      const cx = a.x + w / 2;
      ctx.fillStyle = '#b8a07a';
      ctx.fillRect(cx - tile * 0.07, a.y - tile * 0.9, tile * 0.14, tile * 0.9 + h * 0.6);
      ctx.fillStyle = '#8a7a64';
      for (const [py, pw] of [
        [-0.95, 0.7],
        [-0.45, 0.55],
        [h / tile - 0.05, 0.85],
      ]) {
        ctx.beginPath();
        ctx.ellipse(cx, a.y + py * tile, (pw * tile) / 2, tile * 0.1, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      // A dangling toy.
      ctx.strokeStyle = '#6a5a4a';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(cx + tile * 0.28, a.y - tile * 0.45);
      ctx.lineTo(cx + tile * 0.3, a.y - tile * 0.2 + Math.sin(fc.now * 0.003) * 2);
      ctx.stroke();
      ctx.fillStyle = '#c96a5a';
      ctx.beginPath();
      ctx.arc(cx + tile * 0.3, a.y - tile * 0.18 + Math.sin(fc.now * 0.003) * 2, tile * 0.04, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'coatRack': {
      const cx = a.x + w / 2;
      ctx.fillStyle = '#5a4030';
      ctx.fillRect(cx - tile * 0.025, a.y - tile * 1.2, tile * 0.05, tile * 1.3);
      ctx.fillStyle = SCOTT_APPEARANCE.overalls;
      ctx.beginPath();
      ctx.ellipse(cx - tile * 0.08, a.y - tile * 0.8, tile * 0.1, tile * 0.28, 0.1, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#7a8a6a';
      ctx.beginPath();
      ctx.ellipse(cx + tile * 0.09, a.y - tile * 0.85, tile * 0.09, tile * 0.24, -0.1, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
  }
}
