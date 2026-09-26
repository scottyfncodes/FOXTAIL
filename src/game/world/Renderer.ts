import { Camera } from '../engine/Camera';
import type { GameState, ScoutState, ScottState, CatState, Facing, OwnedPlant, PlacedDecor } from '../state';
import type { Obstacle } from './Obstacles';
import type { DiscoverySpot, ZoneId } from '../types';
import { TILE_SIZE, GRID_W, GREENHOUSE_FOOTPRINT, zoneAt, isWater, type Rect } from '../data/worldMap';
import { ZONES } from '../data/zones';
import { GREENHOUSE_GRID_W, GREENHOUSE_GRID_H, GREENHOUSE_EXIT, NURSERY_BEDS, STORAGE_CRATES, type DisplaySlot } from '../data/stations';
import { displaySlots, climbsTrellis } from '../systems/furniture';
import { occupantOf, isRarerThanStandard } from '../systems/propagation';
import { STALL_ID, stallRect, yardFootprint, type YardPiece } from '../systems/yard';
import { PLANTS, lookFor, specimenRarity, rarityRank } from '../data/plants';
import { TOOL_PICKUPS } from '../data/toolPickups';
import { DISCOVERY_SPOTS } from '../data/discoveryPoints';
import { findPotStyle, RAISED_BED } from '../data/shop';
import { ELLEN_APPEARANCE, SCOUT_APPEARANCE, SCOTT_APPEARANCE, CAT_APPEARANCE, CHARACTER_SCALE } from '../data/character';
import { daylightFactor, isNight } from '../engine/Clock';
import { spotContent } from '../systems/spots';
import { hasFound } from '../systems/collection';
import { stageFloat, stageIndexOf } from '../systems/growth';
import { commissionPortrait, openCommission } from '../systems/commissions';
import type { LushField } from '../systems/wild';
import { CHARACTERS } from '../systems/wild';
import { bedLiveliness } from '../systems/beds';
import { PlantSpriteCache, type PlantMode } from './PlantArt';
import type { ToolMode } from '../engine/Tools';
import type { WorldFlourish } from '../engine/Game';
import type { PlacedFurniture } from '../state';
import {
  drawHouseExterior,
  drawGardenBed,
  drawGardenPath,
  drawPlantPreview,
  drawBedPreview,
  drawPathPreview,
  drawFlourish,
  drawFox as drawFoxArt,
  drawFoxFindCuriosity,
  drawNearGlint,
  drawFindCover,
} from './LandscapeArt';
import { drawInteriorShell, drawFixture, type FixtureContext } from './HomeArt';
import { PARTITION_X, GREENHOUSE_DOORS, type LivingFixture } from '../data/interior';
import { FURNITURE_DEFS } from '../data/furniture';
import { allFurniture, footprint } from '../systems/furniture';
import { catLift } from '../systems/cat';
import { foxFade } from '../systems/fox';
import { isCouchNap, isCouchSpot } from '../data/scottSpots';
import { PATH_WIDTH, bedCost } from '../systems/landscape';
import { dipAmount, smiling, DIP_END } from '../systems/scott';

/** Everything the scene needs beyond the game state: what the player is doing with their hands, and passing effects. */
export interface SceneExtras {
  tools: ToolMode;
  flourishes: WorldFlourish[];
  cleared: Set<string>;
  /** 1 just after stepping through a door, falling to 0. */
  fade: number;
  /** Scott dipping Ellen into a kiss, if he's been caught. */
  kiss?: { t: number; ellenLeft: boolean } | null;
}

const NO_EXTRAS: SceneExtras = { tools: { kind: 'play' }, flourishes: [], cleared: new Set(), fade: 0 };

/** Ground colour each kind of planting pulls the land toward as it thickens. */
const LUSH_GROUND: Record<string, RGB> = {
  fern: [44, 88, 52],
  jungle: [40, 76, 32],
  vine: [58, 98, 40],
  flower: [74, 104, 50],
  arid: [118, 128, 80],
  color: [70, 86, 58],
  strange: [58, 56, 76],
};

/**
 * Ground this overgrown (0…1, as drawn) is a carpet: the small plants in
 * it are drawn as one sweep of foliage rather than a hundred sprites.
 * Large plants, specimens, sports and anything rarer than the standard
 * form still stand out of it as themselves.
 */
export const CARPET_FROM = 0.55;
export const CARPET_DENSE = 0.75;

/** Whether a wild plant is drawn as part of the carpet rather than on its own. */
export function drawnAsCarpet(p: Pick<OwnedPlant, 'defId' | 'variantId' | 'growth' | 'unnoticed'>, lushHere: number): boolean {
  if (lushHere < CARPET_DENSE) return false;
  if (p.unnoticed || stageIndexOf(p.growth) >= 3) return false;
  return !isRarerThanStandard(p.defId, p.variantId);
}

/** How the leaves of each landscape character lie in a carpet. */
const CARPET_LEAF: Record<string, { w: number; h: number; count: number; frond?: boolean; petal?: string }> = {
  fern: { w: 0.2, h: 0.055, count: 7, frond: true },
  jungle: { w: 0.13, h: 0.095, count: 5 },
  vine: { w: 0.105, h: 0.085, count: 8 },
  flower: { w: 0.11, h: 0.07, count: 5, petal: 'rgba(250,244,236,0.9)' },
  arid: { w: 0.065, h: 0.045, count: 9 },
  color: { w: 0.12, h: 0.085, count: 5, petal: 'rgba(236,140,190,0.85)' },
  strange: { w: 0.12, h: 0.085, count: 5, petal: 'rgba(200,170,255,0.8)' },
};

function hash2(x: number, y: number): number {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

type RGB = [number, number, number];

function hexToRgb(hex: string): RGB {
  const p = parseInt(hex.slice(1), 16);
  return [(p >> 16) & 255, (p >> 8) & 255, p & 255];
}

function mixRgb(a: RGB, b: RGB, t: number): RGB {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

function rgbCss(c: RGB): string {
  return `rgb(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])})`;
}

function lerpColor(a: string, b: string, t: number): string {
  return rgbCss(mixRgb(hexToRgb(a), hexToRgb(b), t));
}

/** Bilinear value noise over the hash lattice: smooth, organic patches. */
function smoothNoise(x: number, y: number, scale: number): number {
  const gx = x / scale;
  const gy = y / scale;
  const x0 = Math.floor(gx);
  const y0 = Math.floor(gy);
  const fx = gx - x0;
  const fy = gy - y0;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const a = hash2(x0, y0);
  const b = hash2(x0 + 1, y0);
  const c = hash2(x0, y0 + 1);
  const d = hash2(x0 + 1, y0 + 1);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

function luminance(c: RGB): number {
  return 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2];
}

// Each zone's ground palette as a dark-to-light gradient, so tiles can be
// sampled continuously instead of flipping between discrete swatches.
const GROUND_GRADIENTS = Object.fromEntries(
  Object.values(ZONES).map((z) => [z.id, z.groundColors.map(hexToRgb).sort((a, b) => luminance(a) - luminance(b))])
) as Record<ZoneId, RGB[]>;

function sampleGradient(stops: RGB[], t: number): RGB {
  if (stops.length === 1) return stops[0];
  const pos = Math.max(0, Math.min(0.9999, t)) * (stops.length - 1);
  const i = Math.floor(pos);
  return mixRgb(stops[i], stops[i + 1], pos - i);
}

type GroundDetail = 'grass' | 'litter' | 'moss' | 'pebbles';
const GROUND_DETAIL: Partial<Record<ZoneId, GroundDetail>> = {
  meadow: 'grass',
  overgrownClearing: 'grass',
  woodland: 'litter',
  dampForest: 'moss',
  rockyClearing: 'pebbles',
  creek: 'pebbles',
};
const BLOB_COLORS: Record<GroundDetail, string> = {
  grass: 'rgba(0,0,0,0)',
  litter: 'rgba(122,88,48,0.24)',
  moss: 'rgba(150,196,120,0.16)',
  pebbles: 'rgba(58,52,42,0.26)',
};
const NEIGHBORS: [number, number][] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

/** A living-room piece as the rect its art is drawn in. */
function fixtureRect(f: PlacedFurniture): LivingFixture {
  const fp = footprint(f.kind, f.x, f.y, f.rot ?? 0);
  return { id: f.id, kind: f.kind as LivingFixture['kind'], x: fp.x, y: fp.y, w: fp.w, h: fp.h, solid: FURNITURE_DEFS[f.kind].layer === 'floor' };
}

/** Time constant for weather drifting in and out, in ms. */
const WEATHER_FADE_MS = 3500;

export class Renderer {
  private lastEllenX = 0;
  private lastEllenY = 0;
  private sprites = new PlantSpriteCache();
  private dpr = 1;
  /** Carpet tiles by look, so a dense region costs one drawImage a tile. */
  private carpets = new Map<string, HTMLCanvasElement>();

  /** A tile's worth of foliage in the colour of what's growing there. Four patterns per look, so it never tiles visibly. */
  private carpetTile(ch: string, hue: number, sat: number, light: number, pale: number, dense: boolean, variant: number, tile: number): HTMLCanvasElement | null {
    const h = Math.round(hue / 8) * 8;
    const sa = Math.round(sat / 15) * 15;
    const li = Math.round(light / 8) * 8;
    const pq = Math.round(pale * 4);
    const px = Math.round(tile);
    const key = `${ch}|${h}|${sa}|${li}|${pq}|${dense ? 1 : 0}|${variant}|${px}|${this.dpr}`;
    const hit = this.carpets.get(key);
    if (hit) return hit;
    if (this.carpets.size > 600) this.carpets.clear();
    const pad = Math.ceil(px * 0.3);
    const size = px + pad * 2;
    const c = document.createElement('canvas');
    c.width = Math.ceil(size * this.dpr);
    c.height = Math.ceil(size * this.dpr);
    const g = c.getContext('2d');
    if (!g) return null;
    g.scale(this.dpr, this.dpr);
    const leaf = CARPET_LEAF[ch] ?? CARPET_LEAF.jungle;
    const n = dense ? leaf.count + 3 : leaf.count - 2;
    const seed = variant * 31 + ch.length;
    for (let k = 0; k < n; k++) {
      const x = pad + hash2(seed + k * 3.7, k * 1.3) * px;
      const y = pad + hash2(k * 2.9, seed - k * 1.7) * px;
      const rot = hash2(seed * 1.1 + k, k * 5.1) * Math.PI;
      const sc = 0.8 + 0.5 * hash2(k * 7.3, seed);
      const dl = (hash2(k, seed + 2) - 0.5) * 16;
      const dh = (hash2(k + 9, seed) - 0.5) * 12;
      const w = px * leaf.w * sc;
      const hh = px * leaf.h * sc;
      g.save();
      g.translate(x, y);
      g.rotate(rot);
      g.fillStyle = `hsl(${h + dh} ${Math.min(100, sa + 5)}% ${Math.max(12, li + dl - 6)}%)`;
      g.beginPath();
      if (leaf.frond) {
        // A frond: a tapered blade with a lighter midrib.
        g.moveTo(-w, 0);
        g.quadraticCurveTo(0, -hh * 1.6, w, 0);
        g.quadraticCurveTo(0, hh * 1.6, -w, 0);
      } else g.ellipse(0, 0, w, hh, 0, 0, Math.PI * 2);
      g.fill();
      // Lit side, so leaves read as leaves and not confetti.
      g.fillStyle = `hsl(${h + dh} ${Math.min(100, sa + 5)}% ${Math.min(80, li + dl + 8)}%)`;
      g.beginPath();
      if (leaf.frond) {
        g.moveTo(-w, 0);
        g.quadraticCurveTo(0, -hh * 1.6, w, 0);
        g.lineTo(-w, 0);
      } else g.ellipse(0, -hh * 0.25, w * 0.85, hh * 0.55, 0, 0, Math.PI * 2);
      g.fill();
      // Variegated plantings keep their cream in the carpet.
      if (pale > 0.05 && hash2(k * 4.1, seed * 2.3) < pale) {
        g.fillStyle = 'rgba(248,240,214,0.85)';
        g.beginPath();
        g.ellipse(w * 0.25, hh * 0.1, w * 0.45, hh * 0.45, 0, 0, Math.PI * 2);
        g.fill();
      }
      g.restore();
      if (leaf.petal && k % 3 === 0) {
        g.fillStyle = leaf.petal;
        g.beginPath();
        g.arc(x + w * 0.6, y - hh * 0.8, px * 0.025, 0, Math.PI * 2);
        g.fill();
      }
    }
    this.carpets.set(key, c);
    return c;
  }
  /** Eased 0..1 strength of cloud cover and rain, so weather drifts in and out. */
  private cloudMix = -1;
  private rainMix = -1;
  private lastWeatherAt = 0;

  constructor(private ctx: CanvasRenderingContext2D) {}

  clear(color: string) {
    const { ctx } = this;
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  }

  renderOutdoor(camera: Camera, state: GameState, obstacles: Obstacle[], now: number, crouching = false, lush: LushField | null = null, extras: SceneExtras = NO_EXTRAS) {
    const zoneHere = zoneAt(Math.floor(state.player.x), Math.floor(state.player.y));
    this.clear(ZONES[zoneHere].tint);
    this.sprites.beginFrame();
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    const bounds = camera.getViewportTileBounds();
    const inView = (x: number, y: number, pad = 2) => x > bounds.minX - pad && x < bounds.maxX + pad && y > bounds.minY - pad && y < bounds.maxY + pad;

    this.drawGround(camera, bounds, now, lush);
    const gm = state.clock.totalMinutes;
    // Ground the player has worked: beds first, paths over them.
    for (const bed of state.gardenBeds) {
      if (!inView(bed.x, bed.y, bed.w + bed.h + 2)) continue;
      drawGardenBed(this.ctx, camera, bed, gm);
    }
    for (const path of state.paths) {
      const xs = path.points.filter((_, i) => i % 2 === 0);
      const ys = path.points.filter((_, i) => i % 2 === 1);
      if (Math.max(...xs) < bounds.minX - 2 || Math.min(...xs) > bounds.maxX + 2 || Math.max(...ys) < bounds.minY - 2 || Math.min(...ys) > bounds.maxY + 2) continue;
      drawGardenPath(this.ctx, camera, path, gm);
    }
    this.drawGreenhouseExterior(camera, state.clock.totalMinutes);
    drawHouseExterior(this.ctx, camera, state.clock.totalMinutes);

    for (const o of obstacles) {
      if (!inView(o.x, o.y) || extras.cleared.has(`${o.x},${o.y}`)) continue;
      this.drawObstacle(camera, o, lush ? lush.lush[o.y * GRID_W + o.x] : 0);
    }

    // Everything that stands up off the ground is depth-sorted together, so
    // Ellen can walk behind a big monstera and in front of a small one.
    const drawables: { y: number; draw: () => void }[] = [];
    const movingId = extras.tools.kind === 'plant' ? extras.tools.plantId : null;
    for (const p of Object.values(state.plants)) {
      if (p.location.kind !== 'wild' || !inView(p.location.x, p.location.y, 3) || p.id === movingId) continue;
      const loc = p.location;
      const lushHere = lush ? Math.min(1, lush.lush[Math.floor(loc.y) * GRID_W + Math.floor(loc.x)] / 0.9) : 0;
      if (drawnAsCarpet(p, lushHere)) continue;
      drawables.push({ y: loc.y, draw: () => this.drawWildPlant(camera, state, p, loc.x, loc.y, now) });
    }
    for (const spot of DISCOVERY_SPOTS) {
      if (!inView(spot.x, spot.y)) continue;
      drawables.push({ y: spot.y + 0.5, draw: () => this.drawSpot(camera, state, spot, now) });
    }
    // While arranging outdoors, a piece being dragged is drawn where the finger has it.
    const yard = extras.tools.kind === 'yard' ? extras.tools : null;
    const decor: PlacedDecor[] = state.decor.map((d) => (yard?.drag?.id === d.id ? { ...d, x: yard.drag.x, y: yard.drag.y } : d));
    if (yard?.pending) decor.push({ id: '__pending', decorId: yard.pending.decorId, x: yard.pending.x, y: yard.pending.y });
    const stall = yard?.drag?.id === STALL_ID ? { ...stallRect(state), x: yard.drag.x, y: yard.drag.y } : stallRect(state);
    for (const d of decor) {
      if (!inView(d.x, d.y)) continue;
      // A trellis stands just behind whatever is climbing it.
      drawables.push({ y: d.decorId === 'gardenTrellis' ? d.y - 0.1 : d.y, draw: () => this.drawDecor(camera, d, state, now) });
    }
    for (const tp of TOOL_PICKUPS) {
      if (state.tools[tp.tool] || !inView(tp.x, tp.y)) continue;
      drawables.push({ y: tp.y + 0.5, draw: () => this.drawLanternPickup(camera, tp.x + 0.5, tp.y + 0.5, now) });
    }
    for (const r of Object.values(state.regions)) {
      if (!r || !inView(r.x, r.y)) continue;
      drawables.push({ y: r.y, draw: () => this.drawPlaque(camera, r.x, r.y, r.name) });
    }
    if (inView(stall.x, stall.y, 4)) {
      drawables.push({ y: stall.y + 0.8, draw: () => this.drawMarketStall(camera, state, now, stall) });
    }
    if (state.fox.visible && !state.player.inGreenhouse) {
      const fade = foxFade(state);
      drawables.push({ y: state.fox.y, draw: () => this.atScale(camera, state.fox.x, state.fox.y, CHARACTER_SCALE.fox, () => drawFoxArt(this.ctx, camera, state.fox, now, fade)) });
    }
    for (const f of state.foxFinds) {
      if (!inView(f.x, f.y)) continue;
      const near = Math.hypot(f.x - state.player.x, f.y - state.player.y) < 3.5;
      if (f.kind === 'curiosity') {
        drawables.push({ y: f.y, draw: () => drawFoxFindCuriosity(this.ctx, camera, f, now, near) });
      } else if (f.defId && f.variantId) {
        const defId = f.defId;
        const variantId = f.variantId;
        drawables.push({
          y: f.y,
          draw: () => {
            const s = camera.worldToScreen(f.x * TILE_SIZE, f.y * TILE_SIZE);
            const tile = TILE_SIZE * camera.zoom;
            this.drawPlantSprite(s.x, s.y + tile * 0.05, tile, defId, variantId, 2.4, f.seed, 'ground', now);
            drawFindCover(this.ctx, camera, f.x, f.y, f.seed % 97);
            if (near) drawNearGlint(this.ctx, s.x, s.y - tile * 0.4, tile, now);
          },
        });
      }
    }
    const tools = extras.tools;
    if (tools.kind === 'plant') {
      const pm = tools;
      // The plant being moved isn't drawn where it was while it's in your hands.
      drawables.push({
        y: pm.y + 0.01,
        draw: () =>
          drawPlantPreview(
            this.ctx,
            camera,
            pm,
            (sx, sy, alpha) => {
              this.ctx.globalAlpha = alpha;
              this.drawPlantSprite(sx, sy + TILE_SIZE * camera.zoom * 0.05, TILE_SIZE * camera.zoom, pm.ghost.defId, pm.ghost.variantId, stageFloat(pm.ghost.growth), pm.ghost.seed, 'ground', now);
              this.ctx.globalAlpha = 1;
            },
            now
          ),
      });
    }
    drawables.push({ y: state.scout.y, draw: () => this.atScale(camera, state.scout.x, state.scout.y, CHARACTER_SCALE.scout, () => this.drawScout(camera, state.scout, now)) });
    const moving = Math.hypot(state.player.x - this.lastEllenX, state.player.y - this.lastEllenY) > 0.001;
    this.lastEllenX = state.player.x;
    this.lastEllenY = state.player.y;
    if (extras.kiss && state.scott.zone !== 'greenhouse') {
      const kiss = extras.kiss;
      drawables.push({ y: state.player.y, draw: () => this.drawKiss(camera, state, kiss, now) });
    } else {
      if (state.scott.zone !== 'greenhouse') {
        drawables.push({ y: state.scott.y, draw: () => this.atScale(camera, state.scott.x, state.scott.y, CHARACTER_SCALE.scott, () => this.drawScott(camera, state.scott, now)) });
      }
      drawables.push({ y: state.player.y, draw: () => this.atScale(camera, state.player.x, state.player.y, CHARACTER_SCALE.ellen, () => this.drawEllen(camera, state.player.x, state.player.y, state.player.facing, now, moving, crouching)) });
    }
    drawables.sort((a, b) => a.y - b.y);
    for (const d of drawables) d.draw();

    // Low foreground vegetation drawn last, so tall grass/reeds partially
    // overlap the characters' feet instead of characters always reading on
    // top of everything.
    for (const o of obstacles) {
      if (o.kind !== 'flower' && o.kind !== 'reed') continue;
      if (!inView(o.x, o.y)) continue;
      const nearFeet = Math.hypot(o.x + 0.5 - state.player.x, o.y + 0.5 - state.player.y) < 0.9;
      if (nearFeet) this.drawObstacle(camera, o, 0);
    }

    // Tool previews for marking out ground sit on top of the scene so they're never lost under foliage.
    if (tools.kind === 'bed') {
      const spec = tools.a && tools.b ? this.bedSpecOf(tools) : null;
      if (spec) drawBedPreview(this.ctx, camera, spec, tools.block, bedCost(state, spec.w, spec.h), state.coins);
    } else if (tools.kind === 'path') {
      if (tools.points.length >= 2) drawPathPreview(this.ctx, camera, tools.points, tools.preview, PATH_WIDTH);
    }
    if (yard) {
      const pieces: YardPiece[] = [{ id: STALL_ID, kind: 'stall', x: stall.x, y: stall.y }, ...decor.map((d) => ({ id: d.id, kind: d.decorId, x: d.x, y: d.y }))];
      this.drawYardOverlay(camera, yard, pieces);
    }
    const nowMs = performance.now();
    for (const f of extras.flourishes) drawFlourish(this.ctx, camera, f, nowMs);

    this.drawPollinators(camera, state, bounds, now);
    this.drawAmbientParticles(camera, zoneHere, state.weather.condition, now);
    this.drawWeatherOverlay(camera, state, now);
    this.drawNightLights(camera, state, bounds, now);
    this.drawFade(extras.fade);
  }

  private bedSpecOf(tools: Extract<ToolMode, { kind: 'bed' }>) {
    const a = tools.a!;
    const b = tools.b!;
    const q = (v: number) => Math.round(v * 4) / 4;
    return { x: q(Math.min(a.x, b.x)), y: q(Math.min(a.y, b.y)), w: q(Math.abs(b.x - a.x)), h: q(Math.abs(b.y - a.y)), shape: tools.shape };
  }

  /** A soft dip to dark as you step through a door, so rooms feel joined rather than swapped. */
  private drawFade(fade: number) {
    if (fade <= 0) return;
    const { ctx } = this;
    ctx.fillStyle = `rgba(14,10,6,${Math.min(1, fade) * 0.85})`;
    ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  }

  /**
   * Ground colour comes from smooth value noise sampled along each zone's
   * palette, so neighbouring tiles differ gently instead of reading as a
   * checkerboard; tiles bordering another zone lean toward its colour to
   * soften the straight seams. Small per-zone detail (grass blades, leaf
   * litter, moss, pebbles) is batched into one path per layer.
   */
  private drawGround(camera: Camera, bounds: { minX: number; maxX: number; minY: number; maxY: number }, now: number, lush: LushField | null) {
    const { ctx } = this;
    const tile = TILE_SIZE * camera.zoom;
    const size = Math.ceil(tile) + 1;
    const dark = new Path2D();
    const light = new Path2D();
    const blobs: Partial<Record<GroundDetail, Path2D>> = {};
    // Ground cover under the player's plantings: leaf litter and runners,
    // plus petals or glints depending on what's been planted there.
    const coverDark = new Path2D();
    const coverLight = new Path2D();
    const petals: Record<string, Path2D> = {};
    const carpetTiles: { sx: number; sy: number; li: number; ch: string; dense: boolean; variant: number; alpha: number }[] = [];
    const petalColors: Record<string, string> = {
      flower: 'rgba(250,244,236,0.85)',
      color: 'rgba(236,140,190,0.8)',
      strange: 'rgba(190,150,255,0.7)',
      arid: 'rgba(200,210,170,0.6)',
    };

    for (let ty = bounds.minY; ty <= bounds.maxY; ty++) {
      for (let tx = bounds.minX; tx <= bounds.maxX; tx++) {
        const screen = camera.worldToScreen(tx * TILE_SIZE, ty * TILE_SIZE);
        const sx = Math.floor(screen.x);
        const sy = Math.floor(screen.y);
        if (isWater(tx, ty)) {
          const wobble = Math.sin(now * 0.002 + tx * 0.6 + ty * 0.3) * 0.15 + 0.5;
          ctx.fillStyle = lerpColor('#1c4650', '#3f7f86', wobble);
          ctx.fillRect(sx, sy, size, size);
          continue;
        }

        const zone = zoneAt(tx, ty);
        const t = 0.78 * smoothNoise(tx, ty, 6) + 0.22 * hash2(tx + 17.3, ty - 4.1);
        let color = sampleGradient(GROUND_GRADIENTS[zone], t);
        for (const [dx, dy] of NEIGHBORS) {
          const nz = zoneAt(tx + dx, ty + dy);
          if (nz === zone || nz === 'greenhouse' || isWater(tx + dx, ty + dy)) continue;
          color = mixRgb(color, sampleGradient(GROUND_GRADIENTS[nz], t), 0.2);
        }
        const li = ty * GRID_W + tx;
        const lushHere = lush ? Math.min(1, lush.lush[li] / 0.9) : 0;
        if (lushHere >= CARPET_FROM && lush) {
          const ch = CHARACTERS[lush.character[li]] ?? 'jungle';
          const target = LUSH_GROUND[ch];
          const shade = 0.85 + 0.3 * smoothNoise(tx + 40, ty + 40, 3);
          color = mixRgb(color, [target[0] * shade, target[1] * shade, target[2] * shade], 0.9);
          carpetTiles.push({ sx, sy, li, ch, dense: lushHere >= CARPET_DENSE, variant: Math.floor(hash2(tx * 7.1, ty * 3.3) * 4), alpha: Math.min(1, (lushHere - CARPET_FROM + 0.12) / 0.3) });
        } else if (lushHere > 0.01) {
          const ch = CHARACTERS[lush!.character[li]] ?? 'jungle';
          const target = LUSH_GROUND[ch];
          const shade = 0.85 + 0.3 * smoothNoise(tx + 40, ty + 40, 3);
          color = mixRgb(color, [target[0] * shade, target[1] * shade, target[2] * shade], lushHere * 0.85);
          // Scatter cover detail in proportion to how overgrown the tile is.
          const count = Math.floor(lushHere * 5);
          for (let k = 0; k < count; k++) {
            const px = sx + hash2(tx * 1.3 + k * 7.7, ty * 0.7) * tile;
            const py = sy + hash2(tx * 0.9, ty * 1.1 + k * 5.3) * tile;
            const r = tile * (0.05 + 0.05 * hash2(tx + k, ty - k));
            const path = k % 2 === 0 ? coverDark : coverLight;
            path.moveTo(px + r, py);
            path.ellipse(px, py, r, r * 0.55, hash2(tx - k, ty + k) * Math.PI, 0, Math.PI * 2);
            if (petalColors[ch] && k % 2 === 1 && hash2(tx + k * 3, ty) < lushHere) {
              const pp = (petals[ch] ??= new Path2D());
              const pr = tile * 0.025;
              pp.moveTo(px + tile * 0.08 + pr, py - tile * 0.04);
              pp.arc(px + tile * 0.08, py - tile * 0.04, pr, 0, Math.PI * 2);
            }
          }
        }
        ctx.fillStyle = rgbCss(color);
        ctx.fillRect(sx, sy, size, size);

        const detail = lushHere > 0.55 ? undefined : GROUND_DETAIL[zone];
        const d = hash2(tx * 3.1, ty * 1.7);
        if (!detail || d > 0.62) continue;
        for (let k = 0; k < 3; k++) {
          const px = sx + (0.12 + 0.76 * hash2(tx + k * 5.3, ty * 2.1)) * tile;
          const py = sy + (0.2 + 0.7 * hash2(tx * 2.3, ty + k * 3.7)) * tile;
          if (detail === 'grass') {
            const lean = (hash2(tx + k, ty - k) - 0.5) * tile * 0.08;
            const path = k % 2 === 0 ? dark : light;
            path.moveTo(px, py);
            path.lineTo(px + lean, py - tile * 0.13);
          } else if (k < 2) {
            const r = tile * (detail === 'pebbles' ? 0.045 : 0.05) * (0.7 + d);
            const path = (blobs[detail] ??= new Path2D());
            path.moveTo(px + r, py);
            path.ellipse(px, py, r, r * 0.62, hash2(tx, ty + k) * Math.PI, 0, Math.PI * 2);
          }
        }
      }
    }

    ctx.lineWidth = Math.max(1, tile * 0.022);
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(28,52,22,0.32)';
    ctx.stroke(dark);
    ctx.strokeStyle = 'rgba(214,236,160,0.2)';
    ctx.stroke(light);
    ctx.lineCap = 'butt';
    for (const kind of Object.keys(blobs) as GroundDetail[]) {
      ctx.fillStyle = BLOB_COLORS[kind];
      ctx.fill(blobs[kind]!);
    }
    ctx.fillStyle = 'rgba(16,40,14,0.35)';
    ctx.fill(coverDark);
    ctx.fillStyle = 'rgba(120,170,80,0.28)';
    ctx.fill(coverLight);
    for (const [ch, path] of Object.entries(petals)) {
      ctx.fillStyle = petalColors[ch];
      ctx.fill(path);
    }
    // The carpet goes on last, over the litter, in the colour of what grows there.
    if (lush && carpetTiles.length) {
      const pad = Math.ceil(Math.round(tile) * 0.3);
      for (const t of carpetTiles) {
        const c = this.carpetTile(t.ch, lush.leaf[t.li * 3], lush.leaf[t.li * 3 + 1], lush.leaf[t.li * 3 + 2], lush.pale[t.li], t.dense, t.variant, tile);
        if (!c) continue;
        // The carpet thins out toward the edge of the overgrowth rather than stopping at a tile line.
        ctx.globalAlpha = t.alpha;
        ctx.drawImage(c, t.sx - pad, t.sy - pad, Math.round(tile) + pad * 2, Math.round(tile) + pad * 2);
      }
      ctx.globalAlpha = 1;
    }
  }

  private drawGreenhouseExterior(camera: Camera, gameMinutes: number) {
    const { ctx } = this;
    const tile = TILE_SIZE * camera.zoom;
    const topLeft = camera.worldToScreen(GREENHOUSE_FOOTPRINT.x * TILE_SIZE, GREENHOUSE_FOOTPRINT.y * TILE_SIZE);
    const w = GREENHOUSE_FOOTPRINT.w * tile;
    const h = GREENHOUSE_FOOTPRINT.h * tile;
    const grad = ctx.createLinearGradient(topLeft.x, topLeft.y, topLeft.x, topLeft.y + h);
    const night = isNight(gameMinutes);
    grad.addColorStop(0, night ? '#8fae9e' : '#bcd8c8');
    grad.addColorStop(1, night ? '#3c5a4d' : '#6f8f7c');
    ctx.fillStyle = grad;
    ctx.fillRect(topLeft.x, topLeft.y, w, h);
    ctx.strokeStyle = '#2c3d33';
    ctx.lineWidth = Math.max(1, tile * 0.06);
    ctx.strokeRect(topLeft.x, topLeft.y, w, h);
    // Pane lines
    ctx.strokeStyle = 'rgba(40,60,50,0.4)';
    ctx.lineWidth = 1;
    for (let i = 1; i < GREENHOUSE_FOOTPRINT.w; i++) {
      ctx.beginPath();
      ctx.moveTo(topLeft.x + i * tile, topLeft.y);
      ctx.lineTo(topLeft.x + i * tile, topLeft.y + h);
      ctx.stroke();
    }
    // Warm interior glow
    ctx.fillStyle = night ? 'rgba(255,200,120,0.18)' : 'rgba(255,220,150,0.08)';
    ctx.fillRect(topLeft.x + tile, topLeft.y + tile, w - tile * 2, h - tile * 2);
    // Doors: the garden door at the front, a back door and a side door,
    // each a timber frame straddling the glass wall it opens through.
    ctx.fillStyle = '#4a3623';
    for (const d of GREENHOUSE_DOORS) {
      const s = camera.worldToScreen(d.outside.x * TILE_SIZE, d.outside.y * TILE_SIZE);
      if (d.wall === 'south') ctx.fillRect(s.x, s.y - tile * 0.3, tile, tile * 0.5);
      else if (d.wall === 'north') ctx.fillRect(s.x, s.y + tile * 0.8, tile, tile * 0.5);
      else ctx.fillRect(s.x + tile * 0.8, s.y, tile * 0.5, tile);
    }
  }

  private drawObstacle(camera: Camera, o: Obstacle, lushHere: number) {
    const { ctx } = this;
    const tile = TILE_SIZE * camera.zoom;
    const screen = camera.worldToScreen((o.x + 0.5) * TILE_SIZE, (o.y + 0.5) * TILE_SIZE);
    const jitter = hash2(o.x, o.y) - 0.5;
    switch (o.kind) {
      case 'tree': {
        ctx.fillStyle = 'rgba(0,0,0,0.18)';
        ctx.beginPath();
        ctx.ellipse(screen.x, screen.y + tile * 0.32, tile * 0.34, tile * 0.14, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#4a3423';
        ctx.fillRect(screen.x - tile * 0.05, screen.y - tile * 0.1, tile * 0.1, tile * 0.4);
        // Two-tone canopy: a darker under-layer for depth, then the lit
        // clumps on top, so the tree reads as a volume, not a flat blob.
        const shade = lerpColor('#1f331f', '#2a4526', hash2(o.x + 2, o.y + 5));
        ctx.fillStyle = shade;
        ctx.beginPath();
        ctx.arc(screen.x + jitter * tile * 0.15, screen.y - tile * 0.28, tile * 0.37, 0, Math.PI * 2);
        ctx.fill();
        const green = lerpColor('#2f4a2c', '#3f6b3a', hash2(o.x + 1, o.y + 1));
        ctx.fillStyle = green;
        ctx.beginPath();
        ctx.arc(screen.x + jitter * tile * 0.15, screen.y - tile * 0.34, tile * 0.32, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(screen.x - tile * 0.2, screen.y - tile * 0.2, tile * 0.23, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(screen.x + tile * 0.22, screen.y - tile * 0.18, tile * 0.21, 0, Math.PI * 2);
        ctx.fill();
        // sunlit highlight clump
        const highlight = lerpColor('#4d7a44', '#6a9a5a', hash2(o.x + 9, o.y + 4));
        ctx.fillStyle = highlight;
        ctx.beginPath();
        ctx.arc(screen.x + jitter * tile * 0.1 - tile * 0.08, screen.y - tile * 0.4, tile * 0.14, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case 'bush': {
        const green = lerpColor('#3a5a34', '#4d7040', hash2(o.x, o.y + 3));
        ctx.fillStyle = green;
        ctx.beginPath();
        ctx.arc(screen.x, screen.y, tile * 0.26, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(screen.x - tile * 0.16, screen.y + tile * 0.06, tile * 0.18, 0, Math.PI * 2);
        ctx.fill();
        const highlight = lerpColor('#5a8a4c', '#78ac68', hash2(o.x + 4, o.y + 1));
        ctx.fillStyle = highlight;
        ctx.beginPath();
        ctx.arc(screen.x + tile * 0.08, screen.y - tile * 0.1, tile * 0.1, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case 'rock': {
        ctx.fillStyle = 'rgba(0,0,0,0.15)';
        ctx.beginPath();
        ctx.ellipse(screen.x, screen.y + tile * 0.16, tile * 0.28, tile * 0.1, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = lerpColor('#7c7460', '#93876a', hash2(o.x, o.y));
        ctx.beginPath();
        ctx.moveTo(screen.x - tile * 0.26, screen.y + tile * 0.14);
        ctx.lineTo(screen.x - tile * 0.12, screen.y - tile * 0.2);
        ctx.lineTo(screen.x + tile * 0.16, screen.y - tile * 0.16);
        ctx.lineTo(screen.x + tile * 0.26, screen.y + tile * 0.12);
        ctx.closePath();
        ctx.fill();
        break;
      }
      case 'flower': {
        const hue = 300 + hash2(o.x, o.y) * 80;
        ctx.fillStyle = `hsl(${hue}, 55%, 65%)`;
        for (let i = 0; i < 4; i++) {
          const a = (i / 4) * Math.PI * 2;
          ctx.beginPath();
          ctx.arc(screen.x + Math.cos(a) * tile * 0.08, screen.y + Math.sin(a) * tile * 0.08, tile * 0.07, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.fillStyle = '#e8d873';
        ctx.beginPath();
        ctx.arc(screen.x, screen.y, tile * 0.05, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case 'reed': {
        ctx.strokeStyle = '#4d7a5a';
        ctx.lineWidth = Math.max(1, tile * 0.05);
        for (let i = -1; i <= 1; i++) {
          ctx.beginPath();
          ctx.moveTo(screen.x + i * tile * 0.1, screen.y + tile * 0.2);
          ctx.lineTo(screen.x + i * tile * 0.1 + jitter * 4, screen.y - tile * 0.28);
          ctx.stroke();
        }
        break;
      }
    }
    // Once the player's plants have taken the ground around it, the old
    // landscape starts disappearing under them: rocks and shrubs get
    // smothered in leaves, trunks wear vines.
    if (lushHere > 0.5) this.drawOvergrowth(screen.x, screen.y, tile, o, Math.min(1, (lushHere - 0.5) / 0.5));
  }

  private drawOvergrowth(x: number, y: number, tile: number, o: Obstacle, amount: number) {
    const { ctx } = this;
    const n = Math.round(3 + amount * 6);
    if (o.kind === 'tree') {
      ctx.strokeStyle = 'rgba(52,96,40,0.9)';
      ctx.lineWidth = Math.max(1, tile * 0.03);
      ctx.beginPath();
      ctx.moveTo(x - tile * 0.05, y + tile * 0.28);
      ctx.bezierCurveTo(x + tile * 0.08, y + tile * 0.1, x - tile * 0.08, y, x + tile * 0.04, y - tile * 0.12);
      ctx.stroke();
    }
    for (let i = 0; i < n; i++) {
      const a = hash2(o.x + i, o.y - i) * Math.PI * 2;
      const r = tile * (0.08 + 0.18 * hash2(o.x * 2 + i, o.y));
      const lx = x + Math.cos(a) * r;
      const ly = y + (o.kind === 'tree' ? tile * 0.2 : 0) + Math.sin(a) * r * 0.6;
      ctx.fillStyle = lerpColor('#2c5a26', '#5a8e3e', hash2(o.x + i * 3, o.y + i));
      ctx.beginPath();
      ctx.ellipse(lx, ly, tile * (0.08 + amount * 0.05), tile * (0.045 + amount * 0.03), a, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private glowMarker(x: number, y: number, tile: number, hexColor: string, now: number) {
    const { ctx } = this;
    const pulse = 0.5 + 0.5 * Math.sin(now * 0.003);
    const grad = ctx.createRadialGradient(x, y, 0, x, y, tile * (0.5 + pulse * 0.15));
    const [r, g, b] = hexToRgb(hexColor);
    grad.addColorStop(0, `rgba(${r},${g},${b},0.45)`);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(x, y, tile * 0.6, 0, Math.PI * 2);
    ctx.fill();
  }

  /**
   * Blits a cached plant sprite with its base at (x, y) screen px, with a
   * gentle wind sway (a skew about the base) and a per-plant mirror flip.
   */
  private drawPlantSprite(x: number, y: number, unit: number, defId: string, variantId: string, sf: number, seed: number, mode: PlantMode, now: number, windy = false): boolean {
    const sprite = this.sprites.get(defId, variantId, sf, seed, unit, mode, this.dpr);
    if (!sprite) return false;
    const { ctx } = this;
    const sway = Math.sin(now * 0.0015 + (seed % 97)) * (windy ? 0.07 : 0.03) + Math.sin(now * 0.0041 + seed) * 0.01;
    ctx.save();
    ctx.translate(x, y);
    ctx.transform(1, 0, mode === 'hanging' ? 0 : sway, 1, 0, 0);
    if (seed % 2 === 1) ctx.scale(-1, 1);
    ctx.drawImage(sprite.canvas, -sprite.ox, -sprite.oy, sprite.w, sprite.h);
    ctx.restore();
    return true;
  }

  private drawWildPlant(camera: Camera, state: GameState, p: OwnedPlant, wx: number, wy: number, now: number) {
    const { ctx } = this;
    const tile = TILE_SIZE * camera.zoom;
    const s = camera.worldToScreen(wx * TILE_SIZE, wy * TILE_SIZE);
    const sf = stageFloat(p.growth);
    const look = lookFor(p.defId, p.variantId);
    const spread = tile * (0.12 + sf * 0.1) * look.size;
    ctx.fillStyle = 'rgba(10,24,8,0.22)';
    ctx.beginPath();
    ctx.ellipse(s.x, s.y + tile * 0.04, spread, spread * 0.4, 0, 0, Math.PI * 2);
    ctx.fill();
    // Foliage between the camera and Ellen fades, so she never gets lost in
    // the jungle she planted.
    const dx = wx - state.player.x;
    const dy = wy - state.player.y;
    const hides = dy > 0 && dy < 0.6 + sf * 0.3 && Math.abs(dx) < 0.5 + sf * 0.25;
    if (hides) ctx.globalAlpha = 0.45;
    this.drawPlantSprite(s.x, s.y + tile * 0.05, tile, p.defId, p.variantId, sf, p.seed, 'ground', now, state.weather.condition === 'rain');
    ctx.globalAlpha = 1;
    if (p.unnoticed) this.drawSparkle(s.x, s.y - tile * 0.35, tile, now, '#fff4c2', 3);
  }

  /** A few twinkling points: something here is worth walking over to. */
  private drawSparkle(x: number, y: number, tile: number, now: number, color: string, count: number) {
    const { ctx } = this;
    ctx.fillStyle = color;
    for (let i = 0; i < count; i++) {
      const ph = now * 0.003 + i * 2.1;
      const a = 0.5 + 0.5 * Math.sin(ph);
      const px = x + Math.cos(i * 2.4 + now * 0.0007) * tile * 0.28;
      const py = y + Math.sin(i * 1.7 + now * 0.0009) * tile * 0.18;
      const r = tile * 0.05 * a;
      ctx.globalAlpha = 0.35 + a * 0.6;
      ctx.beginPath();
      ctx.moveTo(px, py - r * 2);
      ctx.lineTo(px + r * 0.5, py - r * 0.5);
      ctx.lineTo(px + r * 2, py);
      ctx.lineTo(px + r * 0.5, py + r * 0.5);
      ctx.lineTo(px, py + r * 2);
      ctx.lineTo(px - r * 0.5, py + r * 0.5);
      ctx.lineTo(px - r * 2, py);
      ctx.lineTo(px - r * 0.5, py - r * 0.5);
      ctx.closePath();
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  /**
   * A wild patch shows the actual plant growing there — the plant itself
   * is the clue. Things you've never seen get a curious sparkle; rarer
   * finds shimmer more.
   */
  private drawSpot(camera: Camera, state: GameState, spot: DiscoverySpot, now: number) {
    const { ctx } = this;
    const content = spotContent(state, spot);
    if (!content) return;
    const tile = TILE_SIZE * camera.zoom;
    const s = camera.worldToScreen((spot.x + 0.5) * TILE_SIZE, (spot.y + 0.65) * TILE_SIZE);
    const rank = rarityRank(specimenRarity(content.defId, content.variantId));
    const unseen = !hasFound(state, content.defId, content.variantId);
    // Soft disturbed-earth patch so it reads as "something's growing here".
    ctx.fillStyle = 'rgba(58,40,22,0.35)';
    ctx.beginPath();
    ctx.ellipse(s.x, s.y + tile * 0.02, tile * 0.3, tile * 0.12, 0, 0, Math.PI * 2);
    ctx.fill();
    if (rank >= 2) this.glowMarker(s.x, s.y - tile * 0.2, tile, rank >= 3 ? '#f0d27a' : '#bfe6d4', now);
    this.drawPlantSprite(s.x, s.y + tile * 0.04, tile, content.defId, content.variantId, 1.5, content.seed, 'ground', now);
    if (unseen) this.drawSparkle(s.x, s.y - tile * 0.35, tile, now, rank >= 3 ? '#ffe28a' : '#ffffff', 2 + Math.min(3, rank));
  }

  /** A small wooden plaque on a post, with the name Ellen gave the place. */
  private drawPlaque(camera: Camera, wx: number, wy: number, name: string) {
    const { ctx } = this;
    const tile = TILE_SIZE * camera.zoom;
    const s = camera.worldToScreen(wx * TILE_SIZE, wy * TILE_SIZE);
    const font = Math.max(7, Math.round(tile * 0.15));
    ctx.font = `italic ${font}px Georgia`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const tw = ctx.measureText(name).width;
    const bw = tw + tile * 0.28;
    const bh = font * 1.9;
    const by = s.y - tile * 0.62;
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.beginPath();
    ctx.ellipse(s.x, s.y + tile * 0.02, tile * 0.16, tile * 0.06, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#5a3f28';
    ctx.fillRect(s.x - tile * 0.035, by + bh / 2, tile * 0.07, s.y - by - bh / 2);
    ctx.fillStyle = '#c9a877';
    ctx.beginPath();
    ctx.roundRect(s.x - bw / 2, by - bh / 2, bw, bh, tile * 0.05);
    ctx.fill();
    ctx.strokeStyle = '#6a4a2c';
    ctx.lineWidth = Math.max(1, tile * 0.025);
    ctx.stroke();
    ctx.fillStyle = '#3a2816';
    ctx.fillText(name, s.x, by + font * 0.05);
    ctx.textBaseline = 'alphabetic';
  }

  private drawLanternPickup(camera: Camera, wx: number, wy: number, now: number) {
    const { ctx } = this;
    const tile = TILE_SIZE * camera.zoom;
    const s = camera.worldToScreen(wx * TILE_SIZE, wy * TILE_SIZE);
    this.glowMarker(s.x, s.y - tile * 0.1, tile, '#f2c86a', now);
    ctx.fillStyle = '#3a3026';
    ctx.fillRect(s.x - tile * 0.09, s.y - tile * 0.26, tile * 0.18, tile * 0.04);
    ctx.fillStyle = 'rgba(255,214,120,0.9)';
    ctx.fillRect(s.x - tile * 0.07, s.y - tile * 0.22, tile * 0.14, tile * 0.18);
    ctx.strokeStyle = '#3a3026';
    ctx.lineWidth = Math.max(1, tile * 0.025);
    ctx.strokeRect(s.x - tile * 0.07, s.y - tile * 0.22, tile * 0.14, tile * 0.18);
    ctx.beginPath();
    ctx.arc(s.x, s.y - tile * 0.28, tile * 0.05, Math.PI, 0);
    ctx.stroke();
  }

  private drawPot(x: number, y: number, tile: number, potId: string, scale = 1) {
    const { ctx } = this;
    const pot = findPotStyle(potId);
    const w = tile * 0.2 * scale;
    const h = tile * 0.26 * scale;
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.beginPath();
    ctx.ellipse(x, y + h, w * 1.2, w * 0.35, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(x - w, y);
    ctx.lineTo(x + w, y);
    ctx.lineTo(x + w * 0.75, y + h);
    ctx.lineTo(x - w * 0.75, y + h);
    ctx.closePath();
    const g = ctx.createLinearGradient(x - w, 0, x + w, 0);
    g.addColorStop(0, pot.shade);
    g.addColorStop(0.35, pot.body);
    g.addColorStop(1, pot.shade);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.save();
    ctx.clip();
    if (pot.pattern === 'speckle') {
      ctx.fillStyle = 'rgba(80,60,40,0.55)';
      for (let i = 0; i < 14; i++) ctx.fillRect(x - w + hash2(i, 3) * w * 2, y + hash2(3, i) * h, 1.2, 1.2);
    } else if (pot.pattern === 'weave') {
      ctx.strokeStyle = 'rgba(90,70,40,0.5)';
      ctx.lineWidth = 1;
      for (let k = 1; k < 4; k++) {
        ctx.beginPath();
        ctx.moveTo(x - w, y + (h * k) / 4);
        ctx.lineTo(x + w, y + (h * k) / 4);
        ctx.stroke();
      }
    } else if (pot.pattern === 'hammered') {
      ctx.fillStyle = 'rgba(255,220,170,0.25)';
      for (let i = 0; i < 6; i++) {
        ctx.beginPath();
        ctx.arc(x - w + hash2(i, 9) * w * 2, y + hash2(9, i) * h, w * 0.14, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (pot.pattern === 'drip') {
      ctx.fillStyle = 'rgba(20,60,58,0.7)';
      ctx.fillRect(x - w, y, w * 2, h * 0.28);
    } else if (pot.pattern === 'gold') {
      ctx.strokeStyle = '#d8b24a';
      ctx.lineWidth = Math.max(1, tile * 0.012);
      ctx.beginPath();
      ctx.moveTo(x - w, y + h * 0.55);
      ctx.lineTo(x + w, y + h * 0.55);
      ctx.stroke();
    }
    ctx.restore();
    ctx.fillStyle = pot.rim;
    ctx.fillRect(x - w * 1.08, y - h * 0.08, w * 2.16, h * 0.18);
    ctx.fillStyle = '#3a2a1c';
    ctx.beginPath();
    ctx.ellipse(x, y - h * 0.02, w * 0.95, h * 0.07, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  /**
   * The Plant Stand & Supply stall: a trestle table, crates of plants for sale,
   * and a chalkboard advertising what people are asking for today.
   * Upgrades show up on the stall itself.
   */
  private drawMarketStall(camera: Camera, state: GameState, now: number, stall: Rect) {
    const { ctx } = this;
    const tile = TILE_SIZE * camera.zoom;
    const tl = camera.worldToScreen(stall.x * TILE_SIZE, stall.y * TILE_SIZE);
    const w = stall.w * tile;
    const awning = state.owned.includes('stallAwning');
    const crates = state.owned.includes('stallCrates');
    // Sized against the characters: the table comes to Ellen's hip and the
    // canopy clears Scott's head.
    const ground = tl.y + tile * 0.8;
    const top = tl.y - tile * 0.62;
    // posts
    ctx.fillStyle = '#5a3f28';
    ctx.fillRect(tl.x + tile * 0.05, top, tile * 0.07, ground - top);
    ctx.fillRect(tl.x + w - tile * 0.12, top, tile * 0.07, ground - top);
    // canopy
    const stripes = 6;
    for (let i = 0; i < stripes; i++) {
      ctx.fillStyle = awning ? (i % 2 ? '#f1e7cf' : '#c8553d') : i % 2 ? '#d9cba6' : '#c9b98f';
      ctx.fillRect(tl.x - tile * 0.1 + (i * (w + tile * 0.2)) / stripes, top - tile * 0.28, (w + tile * 0.2) / stripes + 1, tile * 0.3);
    }
    for (let i = 0; i < stripes; i++) {
      ctx.fillStyle = awning ? (i % 2 ? '#f1e7cf' : '#c8553d') : i % 2 ? '#d9cba6' : '#c9b98f';
      ctx.beginPath();
      const x0 = tl.x - tile * 0.1 + (i * (w + tile * 0.2)) / stripes;
      const ww = (w + tile * 0.2) / stripes;
      ctx.arc(x0 + ww / 2, top + tile * 0.02, ww / 2, 0, Math.PI);
      ctx.fill();
    }
    // table
    const tableTop = tl.y + tile * 0.36;
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(tl.x, ground - tile * 0.05, w, tile * 0.12);
    ctx.fillStyle = '#7a5636';
    ctx.fillRect(tl.x, tableTop + tile * 0.07, w, tile * 0.13);
    ctx.fillStyle = '#946a44';
    ctx.fillRect(tl.x, tableTop, w, tile * 0.08);
    ctx.fillStyle = '#5a3f28';
    ctx.fillRect(tl.x + tile * 0.1, tableTop + tile * 0.2, tile * 0.06, ground - tableTop - tile * 0.2);
    ctx.fillRect(tl.x + w - tile * 0.16, tableTop + tile * 0.2, tile * 0.06, ground - tableTop - tile * 0.2);
    // wares: potted plants of species the player has found (or a few commons)
    const found = Object.keys(state.collection).filter((id) => PLANTS[id]);
    const wares = (found.length ? found : ['pothos', 'spiderPlant', 'snakePlant']).slice(0, crates ? 5 : 3);
    wares.forEach((id, i) => {
      const px = tl.x + tile * 0.3 + (i * (w - tile * 0.6)) / Math.max(1, wares.length - 1);
      const py = tableTop - tile * 0.08;
      this.drawPot(px, py, tile, crates ? (i % 2 ? 'speckled' : 'terracotta') : 'terracotta', 0.7);
      this.drawPlantSprite(px, py + tile * 0.02, tile * 0.7, id, PLANTS[id].variants[0].id, 2.2, 11 + i, 'pot', now);
    });
    if (crates) {
      ctx.fillStyle = '#a07a4a';
      ctx.fillRect(tl.x - tile * 0.35, ground - tile * 0.35, tile * 0.4, tile * 0.35);
      ctx.fillRect(tl.x + w - tile * 0.05, ground - tile * 0.35, tile * 0.4, tile * 0.35);
    }
    // The board: the request pinned up, shown as a picture of the plant
    // (or a blank card for "anything from…"); a glint while it's unread,
    // and a pinned note once it's been filled.
    const bx = tl.x + w + tile * 0.1;
    const by = tl.y - tile * 0.35;
    const bw = tile * 0.56;
    ctx.fillStyle = '#5a3f28';
    ctx.fillRect(bx + bw / 2 - tile * 0.025, by + tile * 0.5, tile * 0.05, tile * 0.55);
    ctx.fillStyle = '#2d3a33';
    ctx.fillRect(bx, by, bw, tile * 0.52);
    ctx.strokeStyle = '#8a6a44';
    ctx.lineWidth = Math.max(1, tile * 0.03);
    ctx.strokeRect(bx, by, bw, tile * 0.52);
    const c = state.commission;
    const open = openCommission(state);
    const pic = open ? commissionPortrait(open) : null;
    if (pic) this.drawPlantSprite(bx + bw / 2, by + tile * 0.44, tile * 0.5, pic.defId, pic.variantId, 2, 5, 'ground', now);
    else {
      // A note card: "anything from…", or the buyer's thanks once it's filled.
      ctx.fillStyle = c && !open ? '#efe6cf' : '#d9d2bb';
      ctx.fillRect(bx + bw / 2 - tile * 0.12, by + tile * 0.2, tile * 0.24, tile * 0.22);
      ctx.fillStyle = 'rgba(60,40,20,0.55)';
      for (let i = 0; i < 3; i++) ctx.fillRect(bx + bw / 2 - tile * 0.09, by + tile * (0.25 + i * 0.05), tile * (0.18 - i * 0.04), Math.max(1, tile * 0.015));
    }
    // The word, sized to the board rather than the other way round.
    ctx.fillStyle = '#e8e2c8';
    ctx.font = `bold ${Math.max(7, Math.round(tile * 0.105))}px Georgia`;
    ctx.textAlign = 'center';
    ctx.fillText(open ? 'WANTED' : 'THANKS', bx + bw / 2, by + tile * 0.13);
    if (open && !open.seen) this.glowMarker(bx + bw / 2, by + tile * 0.26, tile, '#f0d27a', now);
  }

  private drawDecor(camera: Camera, d: PlacedDecor, state: GameState, now: number) {
    const { ctx } = this;
    const tile = TILE_SIZE * camera.zoom;
    const s = camera.worldToScreen(d.x * TILE_SIZE, d.y * TILE_SIZE);
    switch (d.decorId) {
      case 'raisedBed': {
        // Only ever drawn while it's being set down: once placed it's a garden bed.
        const w = RAISED_BED.w * tile;
        const h = RAISED_BED.h * tile;
        const x0 = s.x - w / 2;
        const y0 = s.y - h / 2;
        ctx.fillStyle = 'rgba(74,54,36,0.7)';
        ctx.fillRect(x0, y0, w, h);
        ctx.strokeStyle = '#8a6a44';
        ctx.lineWidth = Math.max(3, tile * 0.2);
        ctx.strokeRect(x0, y0, w, h);
        ctx.strokeStyle = 'rgba(230,200,150,0.55)';
        ctx.lineWidth = Math.max(1, tile * 0.06);
        ctx.strokeRect(x0, y0, w, h);
        break;
      }
      case 'steppingStones':
        for (let i = 0; i < 3; i++) {
          ctx.fillStyle = lerpColor('#9a9484', '#b8b09c', hash2(d.x * 3 + i, d.y));
          ctx.beginPath();
          ctx.ellipse(s.x + (i - 1) * tile * 0.26, s.y + (i % 2) * tile * 0.12 - tile * 0.05, tile * 0.13, tile * 0.08, 0.2 * i, 0, Math.PI * 2);
          ctx.fill();
        }
        break;
      case 'picketFence': {
        ctx.fillStyle = '#efe9da';
        ctx.fillRect(s.x - tile * 0.5, s.y - tile * 0.2, tile, tile * 0.05);
        ctx.fillRect(s.x - tile * 0.5, s.y - tile * 0.06, tile, tile * 0.05);
        for (let i = 0; i < 5; i++) {
          const px = s.x - tile * 0.45 + i * tile * 0.22;
          ctx.beginPath();
          ctx.moveTo(px, s.y + tile * 0.05);
          ctx.lineTo(px, s.y - tile * 0.3);
          ctx.lineTo(px + tile * 0.04, s.y - tile * 0.36);
          ctx.lineTo(px + tile * 0.08, s.y - tile * 0.3);
          ctx.lineTo(px + tile * 0.08, s.y + tile * 0.05);
          ctx.fill();
        }
        break;
      }
      case 'gardenLantern': {
        ctx.fillStyle = '#3a3026';
        ctx.fillRect(s.x - tile * 0.025, s.y - tile * 0.5, tile * 0.05, tile * 0.5);
        const night = isNight(state.clock.totalMinutes);
        ctx.fillStyle = night ? 'rgba(255,214,120,0.95)' : 'rgba(230,220,190,0.8)';
        ctx.fillRect(s.x - tile * 0.07, s.y - tile * 0.66, tile * 0.14, tile * 0.16);
        ctx.strokeStyle = '#3a3026';
        ctx.lineWidth = Math.max(1, tile * 0.02);
        ctx.strokeRect(s.x - tile * 0.07, s.y - tile * 0.66, tile * 0.14, tile * 0.16);
        break;
      }
      case 'birdbath': {
        ctx.fillStyle = '#a8a292';
        ctx.fillRect(s.x - tile * 0.06, s.y - tile * 0.3, tile * 0.12, tile * 0.3);
        ctx.beginPath();
        ctx.ellipse(s.x, s.y - tile * 0.32, tile * 0.26, tile * 0.09, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = lerpColor('#6fa8b8', '#9fd0dc', 0.5 + 0.5 * Math.sin(now * 0.002));
        ctx.beginPath();
        ctx.ellipse(s.x, s.y - tile * 0.33, tile * 0.2, tile * 0.06, 0, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case 'gardenTrellis': {
        // A planter, like the wall trellis indoors: a pot at its foot, vines climbing the lattice.
        const slot: DisplaySlot = { id: d.id, x: d.x - 0.5, y: d.y - 0.8, kind: 'trellis' };
        this.drawDisplaySlot(camera, slot, occupantOf(state, { slotId: d.id }), now);
        break;
      }
      case 'gardenBench': {
        ctx.fillStyle = 'rgba(0,0,0,0.2)';
        ctx.fillRect(s.x - tile * 0.45, s.y - tile * 0.02, tile * 0.9, tile * 0.08);
        ctx.fillStyle = '#6b4a2e';
        ctx.fillRect(s.x - tile * 0.42, s.y - tile * 0.2, tile * 0.05, tile * 0.2);
        ctx.fillRect(s.x + tile * 0.37, s.y - tile * 0.2, tile * 0.05, tile * 0.2);
        ctx.fillStyle = '#8f6540';
        ctx.fillRect(s.x - tile * 0.46, s.y - tile * 0.26, tile * 0.92, tile * 0.08);
        ctx.fillRect(s.x - tile * 0.46, s.y - tile * 0.48, tile * 0.92, tile * 0.07);
        ctx.fillRect(s.x - tile * 0.46, s.y - tile * 0.37, tile * 0.92, tile * 0.05);
        break;
      }
    }
  }

  /**
   * Butterflies and bees drift around the player's flowering and colourful
   * plants — a living sign that what they planted is doing something.
   */
  private drawPollinators(camera: Camera, state: GameState, bounds: { minX: number; maxX: number; minY: number; maxY: number }, now: number) {
    const { ctx } = this;
    const tile = TILE_SIZE * camera.zoom;
    let drawn = 0;
    // A lively bed has butterflies over it by day, more the livelier it is,
    // and at night the humming ones have glow-worms low in the leaves.
    const dark = 1 - daylightFactor(state.clock.totalMinutes);
    for (const bed of state.gardenBeds) {
      if (bed.x + bed.w < bounds.minX || bed.x > bounds.maxX || bed.y + bed.h < bounds.minY || bed.y > bounds.maxY) continue;
      const tier = bedLiveliness(state, bed.id).tier;
      if (tier < 2) continue;
      const n = tier - 1;
      for (let i = 0; i < n; i++) {
        const seed = Math.floor(bed.x * 7 + bed.y * 13) + i * 17;
        const ph = now * 0.0009 + seed;
        const bx = bed.x + bed.w / 2 + Math.sin(ph * 0.8 + i) * bed.w * 0.4;
        const by = bed.y + bed.h / 2 + Math.cos(ph * 1.1 + i * 2) * bed.h * 0.35 - 0.4;
        const sc = camera.worldToScreen(bx * TILE_SIZE, by * TILE_SIZE);
        if (dark > 0.6) {
          if (tier < 4) continue;
          const glow = 0.5 + 0.5 * Math.sin(now * 0.004 + seed);
          ctx.fillStyle = `rgba(190,255,150,${0.35 + glow * 0.55})`;
          ctx.beginPath();
          ctx.arc(sc.x, sc.y + tile * 0.35, tile * 0.03, 0, Math.PI * 2);
          ctx.fill();
          continue;
        }
        const flap = Math.abs(Math.sin(now * 0.022 + seed)) * tile * 0.06 + tile * 0.01;
        ctx.fillStyle = i % 2 ? 'rgba(250,244,236,0.9)' : `hsla(${(seed * 37) % 360},65%,70%,0.9)`;
        ctx.beginPath();
        ctx.ellipse(sc.x - flap * 0.6, sc.y, flap, tile * 0.045, 0.3, 0, Math.PI * 2);
        ctx.ellipse(sc.x + flap * 0.6, sc.y, flap, tile * 0.045, -0.3, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#2a2018';
        ctx.fillRect(sc.x - 0.75, sc.y - tile * 0.03, 1.5, tile * 0.06);
        drawn++;
      }
    }
    for (const p of Object.values(state.plants)) {
      if (drawn >= 12) break;
      if (p.location.kind !== 'wild') continue;
      const { x, y } = p.location;
      if (x < bounds.minX || x > bounds.maxX || y < bounds.minY || y > bounds.maxY) continue;
      const def = PLANTS[p.defId];
      if (!def || (def.landscape !== 'flower' && def.landscape !== 'color') || stageFloat(p.growth) < 2) continue;
      if (p.seed % 3 !== 0 && def.landscape !== 'flower') continue;
      const look = lookFor(p.defId, p.variantId);
      const ph = now * 0.0011 + (p.seed % 50);
      const bx = x + Math.sin(ph) * 0.7;
      const by = y - 0.6 + Math.cos(ph * 1.3) * 0.35;
      const sc = camera.worldToScreen(bx * TILE_SIZE, by * TILE_SIZE);
      const flap = Math.abs(Math.sin(now * 0.025 + p.seed)) * tile * 0.06 + tile * 0.01;
      ctx.fillStyle = `hsla(${(look.accentHue + 40) % 360},70%,72%,0.9)`;
      ctx.beginPath();
      ctx.ellipse(sc.x - flap * 0.6, sc.y, flap, tile * 0.045, 0.3, 0, Math.PI * 2);
      ctx.ellipse(sc.x + flap * 0.6, sc.y, flap, tile * 0.045, -0.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#2a2018';
      ctx.fillRect(sc.x - 0.75, sc.y - tile * 0.03, 1.5, tile * 0.06);
      drawn++;
    }
  }

  /** Light sources that punch through the night: garden lanterns and glowing plants. */
  private drawNightLights(camera: Camera, state: GameState, bounds: { minX: number; maxX: number; minY: number; maxY: number }, now: number) {
    const darkness = 1 - daylightFactor(state.clock.totalMinutes);
    if (darkness < 0.2) return;
    const { ctx } = this;
    const tile = TILE_SIZE * camera.zoom;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const glow = (wx: number, wy: number, r: number, color: [number, number, number], a: number) => {
      if (wx < bounds.minX - 3 || wx > bounds.maxX + 3 || wy < bounds.minY - 3 || wy > bounds.maxY + 3) return;
      const s = camera.worldToScreen(wx * TILE_SIZE, wy * TILE_SIZE);
      const g = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, r * tile);
      g.addColorStop(0, `rgba(${color[0]},${color[1]},${color[2]},${a * darkness})`);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(s.x - r * tile, s.y - r * tile, r * tile * 2, r * tile * 2);
    };
    for (const d of state.decor) if (d.decorId === 'gardenLantern') glow(d.x, d.y - 0.55, 2.2, [255, 190, 100], 0.45);
    for (const p of Object.values(state.plants)) {
      if (p.location.kind !== 'wild') continue;
      const look = lookFor(p.defId, p.variantId);
      if (look.variegation !== 'glow' || !look.variegationColor) continue;
      const pulse = 0.8 + 0.2 * Math.sin(now * 0.002 + p.seed);
      const c = look.variegationColor[0] < 100 ? ([255, 170, 70] as [number, number, number]) : ([110, 190, 255] as [number, number, number]);
      glow(p.location.x, p.location.y - 0.4, 1 + stageFloat(p.growth) * 0.35, c, 0.4 * pulse);
    }
    if (state.tools.lantern && !state.player.inGreenhouse) glow(state.player.x + 0.2, state.player.y - 0.3, 3, [255, 200, 120], 0.3);
    ctx.restore();
  }

  /** Draws a character scaled about its feet, so resizing never lifts it off the ground. */
  /** Set while drawing a tender moment: faces with closed, smiling eyes. */
  private happyFaces = false;

  private atScale(camera: Camera, x: number, y: number, k: number, draw: () => void, tilt = 0) {
    const { ctx } = this;
    const screen = camera.worldToScreen(x * TILE_SIZE, y * TILE_SIZE);
    const footY = screen.y + TILE_SIZE * camera.zoom * 0.25;
    ctx.save();
    ctx.translate(screen.x, footY);
    // A lean, pivoting on the feet (radians; positive tips the head right).
    if (tilt) ctx.rotate(tilt);
    ctx.scale(k, k);
    ctx.translate(-screen.x, -footY);
    draw();
    ctx.restore();
  }

  /**
   * Caught: Scott turns, sweeps Ellen back into a dip and kisses her. Both
   * are drawn side-on facing each other; he leans in over her as she tips
   * back, each pivoting on their feet, and a heart drifts up between them.
   */
  private drawKiss(camera: Camera, state: GameState, kiss: { t: number; ellenLeft: boolean }, now: number) {
    const tile = TILE_SIZE * camera.zoom;
    const dip = dipAmount(kiss.t);
    // Toward Scott is +1 when Ellen stands on the left.
    const toward = kiss.ellenLeft ? 1 : -1;
    const p = state.player;
    const ellenFacing: Facing = kiss.ellenLeft ? 'right' : 'left';
    const scott = { ...state.scott, activity: 'traveling' as const, facing: (kiss.ellenLeft ? 'left' : 'right') as Facing };
    // She tips back, away from him; he leans in over her. Angles and the
    // slide of her feet in under him are set so their faces meet at the
    // bottom of the dip (he's the taller by a head). Up again, they sway a
    // little, smiling at each other.
    const sway = smiling(kiss.t) ? Math.sin(now * 0.006) * 0.035 : 0;
    const ellenTilt = -toward * 0.45 * dip + sway;
    const scottTilt = -toward * 0.6 * dip + sway;
    const ex = p.x + toward * 0.15 * dip;
    this.happyFaces = true;
    this.atScale(camera, scott.x, scott.y, CHARACTER_SCALE.scott, () => this.drawScott(camera, scott, 0), scottTilt);
    this.atScale(camera, ex, p.y, CHARACTER_SCALE.ellen, () => this.drawEllen(camera, ex, p.y, ellenFacing, 0, false, false), ellenTilt);
    this.happyFaces = false;

    const mid = camera.worldToScreen(((ex + scott.x) / 2) * TILE_SIZE, p.y * TILE_SIZE);
    if (dip > 0.6) {
      const rise = (kiss.t / DIP_END) * tile * 0.6;
      this.drawHeart(mid.x + Math.sin(now * 0.004) * tile * 0.05, mid.y - tile * 1.1 - rise, tile * 0.09, Math.min(1, (dip - 0.6) * 2.5));
    }
    if (smiling(kiss.t)) {
      // A couple of small hearts drifting up while they smile.
      const u = (kiss.t - DIP_END) / (1 - DIP_END);
      for (let i = 0; i < 2; i++) {
        const k = (u * 1.6 + i * 0.5) % 1;
        const alpha = Math.sin(k * Math.PI);
        this.drawHeart(mid.x + (i ? 1 : -1) * tile * 0.18 + Math.sin(now * 0.005 + i) * tile * 0.04, mid.y - tile * 1.2 - k * tile * 0.7, tile * 0.06, alpha);
      }
    }
  }

  private drawHeart(hx: number, hy: number, r: number, alpha: number) {
    const { ctx } = this;
    ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
    ctx.fillStyle = '#d9534f';
    ctx.beginPath();
    ctx.moveTo(hx, hy + r * 1.1);
    ctx.bezierCurveTo(hx - r * 1.6, hy - r * 0.2, hx - r * 0.7, hy - r * 1.4, hx, hy - r * 0.5);
    ctx.bezierCurveTo(hx + r * 0.7, hy - r * 1.4, hx + r * 1.6, hy - r * 0.2, hx, hy + r * 1.1);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  private drawFox(camera: Camera, x: number, y: number, now: number) {
    const { ctx } = this;
    const tile = TILE_SIZE * camera.zoom;
    const screen = camera.worldToScreen(x * TILE_SIZE, y * TILE_SIZE);
    const bob = Math.sin(now * 0.006) * tile * 0.03;
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.beginPath();
    ctx.ellipse(screen.x, screen.y + tile * 0.2, tile * 0.22, tile * 0.08, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#c96a34';
    ctx.beginPath();
    ctx.ellipse(screen.x, screen.y + bob, tile * 0.2, tile * 0.14, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(screen.x - tile * 0.1, screen.y - tile * 0.08 + bob);
    ctx.lineTo(screen.x - tile * 0.16, screen.y - tile * 0.22 + bob);
    ctx.lineTo(screen.x - tile * 0.02, screen.y - tile * 0.12 + bob);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(screen.x + tile * 0.1, screen.y - tile * 0.08 + bob);
    ctx.lineTo(screen.x + tile * 0.16, screen.y - tile * 0.22 + bob);
    ctx.lineTo(screen.x + tile * 0.02, screen.y - tile * 0.12 + bob);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#f4ecd8';
    ctx.beginPath();
    ctx.arc(screen.x + tile * 0.1, screen.y + tile * 0.02 + bob, tile * 0.07, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#c96a34';
    ctx.beginPath();
    ctx.ellipse(screen.x - tile * 0.2, screen.y + tile * 0.06 + bob, tile * 0.14, tile * 0.06, -0.5, 0, Math.PI * 2);
    ctx.fill();
  }

  private static readonly DIR: Record<Facing, [number, number]> = {
    up: [0, -1],
    down: [0, 1],
    left: [-1, 0],
    right: [1, 0],
  };

  /**
   * Ellen: a field botanist, not a generic sprite — vest, backpack, wide
   * hat, satchel with a hand lens, a long dark ponytail, and the recurring
   * handmade detail, a crocheted scarf. `crouching` renders her brief
   * collect/examine pose.
   *
   * Layering depends on facing: from the front her face is always on top and
   * the ponytail hangs behind her; from behind the ponytail falls down her
   * back over the pack; in profile it streams off the back of her head.
   */
  private drawEllen(camera: Camera, x: number, y: number, facing: Facing, now: number, moving: boolean, crouching: boolean) {
    const { ctx } = this;
    const tile = TILE_SIZE * camera.zoom;
    const screen = camera.worldToScreen(x * TILE_SIZE, y * TILE_SIZE);
    const dir = Renderer.DIR[facing];
    const s = facing === 'left' ? -1 : 1;
    const isSide = facing === 'left' || facing === 'right';
    const isBack = facing === 'up';
    const isFront = facing === 'down';

    const walkPhase = moving ? now * 0.013 : now * 0.003;
    const walkAmp = moving ? 1 : 0.3;
    const bob = Math.abs(Math.sin(walkPhase)) * -tile * 0.025 * walkAmp;
    const stride = moving ? Math.sin(walkPhase) : 0;
    const squash = crouching ? 0.72 : 1;
    const lift = crouching ? tile * 0.1 : 0;

    const cx = screen.x;
    const cy = screen.y + bob + lift;
    const footY = screen.y + tile * 0.25;

    // A thin dark outline on every silhouette-defining shape, so she reads
    // as a distinct figure against any background at small zoom instead of
    // blurring into a same-toned blob.
    const OUTLINE = 'rgba(28,20,12,0.55)';
    const outlineWidth = Math.max(1, tile * 0.016);
    const outline = () => {
      ctx.strokeStyle = OUTLINE;
      ctx.lineWidth = outlineWidth;
      ctx.stroke();
    };

    // Slim, upright proportions: narrow shoulders, a clearly tapered waist,
    // and legs rather than a single pants blob. Profile is narrower still.
    const shoulderY = cy - tile * 0.17 * squash;
    const waistY = cy + tile * 0.06 * squash;
    const hipY = cy + tile * 0.12 * squash;
    const shoulderW = tile * (isSide ? 0.075 : 0.11);
    const waistW = tile * (isSide ? 0.058 : 0.068);
    const hipW = tile * (isSide ? 0.062 : 0.074);
    const headR = tile * 0.1;
    const headY = cy - tile * 0.3 * squash;

    // shadow
    ctx.fillStyle = 'rgba(0,0,0,0.24)';
    ctx.beginPath();
    ctx.ellipse(cx, screen.y + tile * 0.26, tile * (isSide ? 0.13 : 0.12), tile * 0.05, 0, 0, Math.PI * 2);
    ctx.fill();

    const tailSway = Math.sin(walkPhase - 0.8) * tile * 0.03 * walkAmp;

    const drawPack = () => {
      const packX = isSide ? cx - s * tile * 0.1 : cx;
      const packY = cy - tile * 0.04 * squash;
      const packW = tile * (isSide ? 0.065 : 0.1);
      const packH = tile * 0.13 * squash;
      ctx.fillStyle = ELLEN_APPEARANCE.backpack;
      ctx.beginPath();
      ctx.roundRect(packX - packW, packY - packH, packW * 2, packH * 2, tile * 0.04);
      ctx.fill();
      outline();
      // flap + buckle
      ctx.fillStyle = ELLEN_APPEARANCE.backpackStrap;
      ctx.beginPath();
      ctx.roundRect(packX - packW, packY - packH, packW * 2, packH * 0.7, tile * 0.04);
      ctx.fill();
      if (isBack) {
        ctx.fillStyle = '#cbb78a';
        ctx.fillRect(packX - tile * 0.012, packY - packH * 0.35, tile * 0.024, tile * 0.03);
      }
    };

    const drawLegs = () => {
      const legW = Math.max(2, tile * 0.05);
      ctx.lineCap = 'round';
      const legs: Array<[number, number]> = isSide
        ? [[-1, -stride], [1, stride]]
        : [[-1, stride], [1, -stride]];
      for (const [side, swing] of legs) {
        const topX = isSide ? cx + side * tile * 0.012 : cx + side * tile * 0.038;
        const footX = isSide ? topX + s * swing * tile * 0.07 : topX;
        const fy = isSide ? footY : footY - Math.max(0, swing) * tile * 0.03;
        ctx.strokeStyle = OUTLINE;
        ctx.lineWidth = legW + outlineWidth * 2;
        ctx.beginPath();
        ctx.moveTo(topX, hipY);
        ctx.lineTo(footX, fy - tile * 0.03);
        ctx.stroke();
        ctx.strokeStyle = ELLEN_APPEARANCE.pants;
        ctx.lineWidth = legW;
        ctx.stroke();
        // boot
        ctx.fillStyle = ELLEN_APPEARANCE.boots;
        ctx.beginPath();
        if (isSide) {
          ctx.ellipse(footX + s * tile * 0.015, fy, tile * 0.045, tile * 0.03, 0, 0, Math.PI * 2);
        } else {
          ctx.ellipse(footX, fy, tile * 0.034, tile * 0.034, 0, 0, Math.PI * 2);
        }
        ctx.fill();
        outline();
      }
      ctx.lineCap = 'butt';
    };

    // Slim shirt-sleeved arms, swinging opposite the legs.
    const drawArm = (side: number, swing: number) => {
      const armW = Math.max(2, tile * 0.04);
      const sx = isSide ? cx + side * tile * 0.01 : cx + side * (shoulderW - tile * 0.01);
      const sy = shoulderY + tile * 0.025;
      const hx = isSide ? sx + s * swing * tile * 0.08 : sx + side * tile * 0.022;
      const hy = isSide ? cy + tile * 0.07 * squash : cy + tile * 0.07 * squash - swing * tile * 0.025;
      ctx.lineCap = 'round';
      ctx.strokeStyle = OUTLINE;
      ctx.lineWidth = armW + outlineWidth * 2;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(hx, hy);
      ctx.stroke();
      ctx.strokeStyle = ELLEN_APPEARANCE.shirt;
      ctx.lineWidth = armW;
      ctx.stroke();
      ctx.lineCap = 'butt';
      ctx.fillStyle = ELLEN_APPEARANCE.skin;
      ctx.beginPath();
      ctx.arc(hx, hy + tile * 0.012, tile * 0.024, 0, Math.PI * 2);
      ctx.fill();
    };

    const drawTorso = () => {
      ctx.fillStyle = ELLEN_APPEARANCE.vest;
      ctx.beginPath();
      ctx.moveTo(cx - shoulderW, shoulderY);
      ctx.quadraticCurveTo(cx - waistW * 1.05, cy - tile * 0.04 * squash, cx - waistW, waistY);
      ctx.quadraticCurveTo(cx - hipW, (waistY + hipY) / 2, cx - hipW, hipY);
      ctx.lineTo(cx + hipW, hipY);
      ctx.quadraticCurveTo(cx + hipW, (waistY + hipY) / 2, cx + waistW, waistY);
      ctx.quadraticCurveTo(cx + waistW * 1.05, cy - tile * 0.04 * squash, cx + shoulderW, shoulderY);
      ctx.quadraticCurveTo(cx, shoulderY - tile * 0.03 * squash, cx - shoulderW, shoulderY);
      ctx.closePath();
      ctx.fill();
      outline();
      // belt line
      ctx.fillStyle = ELLEN_APPEARANCE.pants;
      ctx.fillRect(cx - waistW, waistY - tile * 0.008, waistW * 2, tile * 0.03);
      if (isFront) {
        // open vest over the shirt
        ctx.fillStyle = ELLEN_APPEARANCE.shirt;
        ctx.beginPath();
        ctx.moveTo(cx - tile * 0.03, shoulderY);
        ctx.lineTo(cx + tile * 0.03, shoulderY);
        ctx.lineTo(cx, waistY - tile * 0.01);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = ELLEN_APPEARANCE.vestTrim;
        ctx.lineWidth = Math.max(1, tile * 0.015);
        ctx.stroke();
      } else if (isSide) {
        ctx.strokeStyle = ELLEN_APPEARANCE.vestTrim;
        ctx.lineWidth = Math.max(1, tile * 0.015);
        ctx.beginPath();
        ctx.moveTo(cx + s * shoulderW * 0.7, shoulderY + tile * 0.01);
        ctx.lineTo(cx + s * waistW * 0.8, waistY - tile * 0.01);
        ctx.stroke();
      }
    };

    // crocheted scarf — the recurring handmade touch
    const drawScarf = () => {
      const scarfY = shoulderY - tile * 0.005;
      ctx.fillStyle = ELLEN_APPEARANCE.crochetScarf;
      ctx.beginPath();
      ctx.ellipse(cx, scarfY, tile * (isSide ? 0.055 : 0.07), tile * 0.03, 0, 0, Math.PI * 2);
      ctx.fill();
      outline();
      if (!isBack) {
        // a trailing end, knotted at the front
        const endX = cx + (isSide ? s * tile * 0.035 : tile * 0.03);
        ctx.beginPath();
        ctx.moveTo(endX - tile * 0.018, scarfY);
        ctx.lineTo(endX + tile * 0.018, scarfY);
        ctx.lineTo(endX + tile * 0.012 + tailSway * 0.3, scarfY + tile * 0.1);
        ctx.lineTo(endX - tile * 0.02 + tailSway * 0.3, scarfY + tile * 0.09);
        ctx.closePath();
        ctx.fill();
        outline();
      }
      ctx.fillStyle = ELLEN_APPEARANCE.crochetScarfAlt;
      for (let i = -2; i <= 2; i++) {
        ctx.beginPath();
        ctx.arc(cx + i * tile * (isSide ? 0.02 : 0.026), scarfY, Math.max(0.6, tile * 0.008), 0, Math.PI * 2);
        ctx.fill();
      }
    };

    // satchel + hand lens at the hip
    const drawSatchel = () => {
      const hipX = isSide ? cx + s * tile * 0.03 : cx + tile * 0.1;
      const py = hipY - tile * 0.02;
      ctx.strokeStyle = ELLEN_APPEARANCE.backpackStrap;
      ctx.lineWidth = Math.max(1, tile * 0.014);
      ctx.beginPath();
      ctx.moveTo(isSide ? cx - s * tile * 0.03 : cx - tile * 0.08, shoulderY + tile * 0.01);
      ctx.lineTo(hipX, py - tile * 0.04);
      ctx.stroke();
      ctx.fillStyle = ELLEN_APPEARANCE.pouch;
      ctx.beginPath();
      ctx.roundRect(hipX - tile * 0.04, py - tile * 0.04, tile * 0.08, tile * 0.07, tile * 0.02);
      ctx.fill();
      outline();
      ctx.strokeStyle = '#cbb78a';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(hipX, py - tile * 0.005, tile * 0.02, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = ELLEN_APPEARANCE.lensGlint;
      ctx.beginPath();
      ctx.arc(hipX, py - tile * 0.005, tile * 0.01, 0, Math.PI * 2);
      ctx.fill();
    };

    // long dark ponytail, gathered with a crocheted tie
    const drawPonytail = (base: [number, number], ctrl: [number, number], tip: [number, number], width: number) => {
      this.fillTaperedStrand(base, ctrl, tip, width, width * 0.35, ELLEN_APPEARANCE.hair, OUTLINE, outlineWidth);
      ctx.fillStyle = ELLEN_APPEARANCE.crochetScarf;
      ctx.beginPath();
      ctx.arc(base[0], base[1], width * 0.5, 0, Math.PI * 2);
      ctx.fill();
      outline();
    };

    const drawHead = () => {
      // neck
      ctx.fillStyle = ELLEN_APPEARANCE.skin;
      ctx.fillRect(cx - tile * 0.025, headY + headR * 0.6, tile * 0.05, shoulderY - headY - headR * 0.4);

      // hair mass (the whole back of her head)
      ctx.fillStyle = ELLEN_APPEARANCE.hair;
      ctx.beginPath();
      ctx.arc(cx, headY, headR, 0, Math.PI * 2);
      ctx.fill();
      outline();
      if (isBack) return;

      // face, set toward whichever way she's looking
      const faceX = cx + (isSide ? s * headR * 0.28 : 0);
      ctx.fillStyle = ELLEN_APPEARANCE.skin;
      ctx.beginPath();
      ctx.ellipse(faceX, headY + headR * 0.14, headR * (isSide ? 0.72 : 0.8), headR * 0.84, 0, 0, Math.PI * 2);
      ctx.fill();
      if (isSide) {
        // nose + ear
        ctx.beginPath();
        ctx.arc(cx + s * headR * 0.95, headY + headR * 0.22, headR * 0.16, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(cx - s * headR * 0.1, headY + headR * 0.25, headR * 0.16, 0, Math.PI * 2);
        ctx.fill();
      }

      // side-swept fringe under the brim
      ctx.fillStyle = ELLEN_APPEARANCE.hair;
      ctx.beginPath();
      if (isSide) {
        ctx.moveTo(cx - s * headR * 0.2, headY - headR * 0.75);
        ctx.quadraticCurveTo(cx + s * headR * 0.9, headY - headR * 0.75, cx + s * headR * 0.95, headY - headR * 0.25);
        ctx.quadraticCurveTo(cx + s * headR * 0.4, headY - headR * 0.35, cx - s * headR * 0.05, headY - headR * 0.1);
      } else {
        ctx.moveTo(cx - headR * 0.85, headY + headR * 0.1);
        ctx.quadraticCurveTo(cx - headR * 0.6, headY - headR * 0.75, cx + headR * 0.2, headY - headR * 0.72);
        ctx.quadraticCurveTo(cx + headR * 0.75, headY - headR * 0.6, cx + headR * 0.88, headY - headR * 0.05);
        ctx.quadraticCurveTo(cx + headR * 0.5, headY - headR * 0.4, cx - headR * 0.1, headY - headR * 0.35);
        ctx.quadraticCurveTo(cx - headR * 0.55, headY - headR * 0.2, cx - headR * 0.85, headY + headR * 0.1);
      }
      ctx.closePath();
      ctx.fill();

      // eyes, brows, blush, mouth — all below the brim, never under it
      const eyeY = headY + headR * 0.12;
      const eyeR = Math.max(1, headR * 0.13);
      const eyes = isSide ? [cx + s * headR * 0.55] : [cx - headR * 0.36, cx + headR * 0.36];
      ctx.fillStyle = '#2a2018';
      if (this.happyFaces) {
        // eyes closed in happy upturned arcs
        ctx.strokeStyle = '#2a2018';
        ctx.lineWidth = Math.max(1, eyeR * 0.7);
        ctx.lineCap = 'round';
        for (const ex of eyes) {
          ctx.beginPath();
          ctx.arc(ex, eyeY + eyeR * 0.6, eyeR * 1.1, 1.15 * Math.PI, 1.85 * Math.PI);
          ctx.stroke();
        }
        ctx.lineCap = 'butt';
      } else {
        for (const ex of eyes) {
          ctx.beginPath();
          ctx.ellipse(ex, eyeY, eyeR, eyeR * 1.25, 0, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      if (tile >= 40 && !this.happyFaces) {
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        for (const ex of eyes) {
          ctx.beginPath();
          ctx.arc(ex + eyeR * 0.35, eyeY - eyeR * 0.45, eyeR * 0.4, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.strokeStyle = ELLEN_APPEARANCE.hair;
        ctx.lineWidth = Math.max(1, headR * 0.08);
        ctx.lineCap = 'round';
        for (const ex of eyes) {
          ctx.beginPath();
          ctx.moveTo(ex - eyeR * 1.2, eyeY - eyeR * 2.1);
          ctx.lineTo(ex + eyeR * 1.2, eyeY - eyeR * 2.3);
          ctx.stroke();
        }
        ctx.lineCap = 'butt';
      }
      ctx.fillStyle = ELLEN_APPEARANCE.blush;
      const blushX = isSide ? [cx + s * headR * 0.45] : [cx - headR * 0.52, cx + headR * 0.52];
      const flush = this.happyFaces ? 1.35 : 1;
      for (const bx of blushX) {
        ctx.beginPath();
        ctx.ellipse(bx, headY + headR * 0.45, headR * 0.17 * flush, headR * 0.1 * flush, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.strokeStyle = '#8a4a3a';
      ctx.lineWidth = Math.max(1, headR * 0.08);
      ctx.beginPath();
      const mouthX = isSide ? cx + s * headR * 0.62 : cx;
      // a wider, happier smile in a tender moment
      ctx.arc(mouthX, headY + headR * (this.happyFaces ? 0.44 : 0.5), headR * (this.happyFaces ? 0.22 : 0.16), 0.15 * Math.PI, 0.85 * Math.PI);
      ctx.stroke();
    };

    // wide-brim field hat, sitting high enough to frame the face
    const drawHat = () => {
      const brimY = headY - headR * 0.62;
      ctx.fillStyle = ELLEN_APPEARANCE.hat;
      ctx.beginPath();
      ctx.ellipse(cx + (isSide ? s * tile * 0.012 : 0), brimY, tile * (isSide ? 0.15 : 0.16), tile * 0.042, 0, 0, Math.PI * 2);
      ctx.fill();
      outline();
      ctx.beginPath();
      ctx.moveTo(cx - tile * 0.075, brimY);
      ctx.quadraticCurveTo(cx - tile * 0.075, brimY - tile * 0.1, cx, brimY - tile * 0.1);
      ctx.quadraticCurveTo(cx + tile * 0.075, brimY - tile * 0.1, cx + tile * 0.075, brimY);
      ctx.closePath();
      ctx.fill();
      outline();
      ctx.fillStyle = ELLEN_APPEARANCE.hatBand;
      ctx.fillRect(cx - tile * 0.075, brimY - tile * 0.03, tile * 0.15, tile * 0.024);
    };

    const armSwing = stride;
    if (isBack) {
      drawLegs();
      drawArm(-1, -armSwing);
      drawArm(1, armSwing);
      drawTorso();
      drawScarf();
      drawPack();
      drawHead();
      drawHat();
      drawPonytail(
        [cx, headY + headR * 0.35],
        [cx + tailSway * 0.5, headY + tile * 0.14],
        [cx + tailSway, headY + tile * 0.3],
        tile * 0.055
      );
    } else if (isSide) {
      drawPack();
      drawArm(-1, -armSwing);
      drawLegs();
      drawTorso();
      drawScarf();
      drawSatchel();
      drawPonytail(
        [cx - s * headR * 0.85, headY - headR * 0.05],
        [cx - s * tile * 0.17, headY + tile * 0.04],
        [cx - s * tile * (moving ? 0.19 : 0.13) + tailSway, headY + tile * (moving ? 0.2 : 0.25)],
        tile * 0.05
      );
      drawHead();
      drawHat();
      drawArm(1, armSwing);
    } else {
      // Front: the ponytail hangs behind her, peeking out past her shoulder
      // as it sways, so it never crosses her face.
      drawPonytail(
        [cx + headR * 0.4, headY + headR * 0.2],
        [cx + tile * 0.1 + tailSway * 0.5, headY + tile * 0.12],
        [cx + tile * 0.1 + tailSway, headY + tile * 0.26],
        tile * 0.05
      );
      drawLegs();
      drawTorso();
      drawArm(-1, -armSwing);
      drawArm(1, armSwing);
      drawScarf();
      drawSatchel();
      // backpack straps over the shoulders
      ctx.strokeStyle = ELLEN_APPEARANCE.backpackStrap;
      ctx.lineWidth = Math.max(1, tile * 0.02);
      ctx.beginPath();
      ctx.moveTo(cx - shoulderW * 0.72, shoulderY + tile * 0.01);
      ctx.lineTo(cx - waistW * 0.75, waistY - tile * 0.02);
      ctx.moveTo(cx + shoulderW * 0.72, shoulderY + tile * 0.01);
      ctx.lineTo(cx + waistW * 0.75, waistY - tile * 0.02);
      ctx.stroke();
      drawHead();
      drawHat();
    }

    // reaching hand while crouched/collecting
    if (crouching) {
      ctx.fillStyle = ELLEN_APPEARANCE.skin;
      ctx.beginPath();
      ctx.arc(cx + dir[0] * tile * 0.2, cy + dir[1] * tile * 0.14 + tile * 0.08, tile * 0.035, 0, Math.PI * 2);
      ctx.fill();
      outline();
    }
  }

  /**
   * A strand of hair along a quadratic curve that tapers from `w0` at the
   * base to `w1` at the tip, with a slight fullness through the middle.
   */
  private fillTaperedStrand(
    p0: [number, number],
    c: [number, number],
    p1: [number, number],
    w0: number,
    w1: number,
    fill: string,
    stroke: string,
    strokeWidth: number
  ) {
    const { ctx } = this;
    const steps = 12;
    const left: Array<[number, number]> = [];
    const right: Array<[number, number]> = [];
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const mt = 1 - t;
      const px = mt * mt * p0[0] + 2 * mt * t * c[0] + t * t * p1[0];
      const py = mt * mt * p0[1] + 2 * mt * t * c[1] + t * t * p1[1];
      const tx = 2 * mt * (c[0] - p0[0]) + 2 * t * (p1[0] - c[0]);
      const ty = 2 * mt * (c[1] - p0[1]) + 2 * t * (p1[1] - c[1]);
      const len = Math.hypot(tx, ty) || 1;
      const half = ((w0 + (w1 - w0) * t) * (1 + 0.3 * Math.sin(Math.PI * t))) / 2;
      left.push([px - (ty / len) * half, py + (tx / len) * half]);
      right.push([px + (ty / len) * half, py - (tx / len) * half]);
    }
    ctx.beginPath();
    ctx.moveTo(left[0][0], left[0][1]);
    for (const [px, py] of left) ctx.lineTo(px, py);
    ctx.arc(p1[0], p1[1], w1 / 2, Math.atan2(left[steps][1] - p1[1], left[steps][0] - p1[0]), Math.atan2(right[steps][1] - p1[1], right[steps][0] - p1[0]), true);
    for (let i = steps; i >= 0; i--) ctx.lineTo(right[i][0], right[i][1]);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.strokeStyle = stroke;
    ctx.lineWidth = strokeWidth;
    ctx.stroke();
  }

  /** Scout: Ellen's scruffy one-eyed field companion. */
  /**
   * Four legs for a small animal, drawn before its body so the body covers
   * the tops. In profile the front pair sits under the head and the hind
   * pair under the tail; face-on the near pair is lower and wider, the far
   * pair tucked up behind. They step in diagonal pairs, like a real trot.
   */
  private drawQuadrupedLegs(
    cx: number,
    cy: number,
    dir: readonly [number, number] | number[],
    tile: number,
    o: { along: number; spread: number; top: number; paw: number; width: number; swing: number; near: string; far: string }
  ) {
    const { ctx } = this;
    const legs: { x: number; top: number; paw: number; dx: number; dy: number; far: boolean }[] = [];
    const sw = o.swing;
    if (dir[0] !== 0) {
      const f = dir[0];
      const lift = tile * 0.015;
      const off = f * tile * 0.012;
      legs.push({ x: cx + f * o.along + off, top: cy + o.top - lift, paw: cy + o.paw - lift, dx: -sw * f, dy: 0, far: true });
      legs.push({ x: cx - f * o.along + off, top: cy + o.top - lift, paw: cy + o.paw - lift, dx: sw * f, dy: 0, far: true });
      legs.push({ x: cx + f * o.along, top: cy + o.top, paw: cy + o.paw, dx: sw * f, dy: 0, far: false });
      legs.push({ x: cx - f * o.along, top: cy + o.top, paw: cy + o.paw, dx: -sw * f, dy: 0, far: false });
    } else {
      const tuck = tile * 0.04;
      legs.push({ x: cx - o.spread * 0.8, top: cy + o.top - tuck, paw: cy + o.paw - tuck, dx: 0, dy: -sw, far: true });
      legs.push({ x: cx + o.spread * 0.8, top: cy + o.top - tuck, paw: cy + o.paw - tuck, dx: 0, dy: sw, far: true });
      legs.push({ x: cx - o.spread, top: cy + o.top, paw: cy + o.paw, dx: 0, dy: sw, far: false });
      legs.push({ x: cx + o.spread, top: cy + o.top, paw: cy + o.paw, dx: 0, dy: -sw, far: false });
    }
    ctx.lineCap = 'round';
    for (const l of legs) {
      ctx.strokeStyle = l.far ? o.far : o.near;
      ctx.lineWidth = Math.max(1, o.width);
      ctx.beginPath();
      ctx.moveTo(l.x, l.top);
      ctx.lineTo(l.x + l.dx, l.paw + Math.min(0, l.dy));
      ctx.stroke();
      ctx.fillStyle = l.far ? o.far : o.near;
      ctx.beginPath();
      ctx.ellipse(l.x + l.dx, l.paw + Math.min(0, l.dy), o.width * 0.6, o.width * 0.45, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.lineCap = 'butt';
  }

  private drawScout(camera: Camera, scout: ScoutState, now: number) {
    const { ctx } = this;
    const tile = TILE_SIZE * camera.zoom;
    const screen = camera.worldToScreen(scout.x * TILE_SIZE, scout.y * TILE_SIZE);
    const dir = Renderer.DIR[scout.facing];

    const sitting = scout.behavior === 'idleSit';
    const sniffing = scout.behavior === 'idleSniff';
    const alert = scout.behavior === 'idleLook' || scout.behavior === 'noticing';
    const moving = scout.behavior === 'following';

    const bodyScaleY = sitting ? 0.62 : 1;
    const headDrop = sniffing ? tile * 0.09 : 0;
    const earPerk = alert ? 1.3 : 1;
    const legPhase = moving ? now * 0.02 : now * 0.004;
    const legSwing = moving ? Math.sin(legPhase) * tile * 0.045 : Math.sin(legPhase) * tile * 0.01;

    const cx = screen.x;
    const cy = screen.y;

    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.beginPath();
    ctx.ellipse(cx, cy + tile * 0.14, tile * 0.16, tile * 0.06, 0, 0, Math.PI * 2);
    ctx.fill();

    // tail: curled at rest, wagging when moving or content
    const tailBaseX = cx - dir[0] * tile * 0.14;
    const tailBaseY = cy - dir[1] * tile * 0.14 * bodyScaleY;
    const wag = sitting ? 0.3 : Math.sin(now * 0.012) * (moving ? 0.5 : 0.25);
    ctx.strokeStyle = SCOUT_APPEARANCE.furDark;
    ctx.lineWidth = Math.max(1, tile * 0.045);
    ctx.beginPath();
    ctx.moveTo(tailBaseX, tailBaseY);
    ctx.quadraticCurveTo(
      tailBaseX - dir[0] * tile * 0.14 + wag * tile * 0.1,
      tailBaseY - dir[1] * tile * 0.14 - tile * 0.06,
      tailBaseX - dir[0] * tile * 0.05 + wag * tile * 0.16,
      tailBaseY - tile * 0.14
    );
    ctx.stroke();

    // four legs: a trot while following, planted when standing; sitting,
    // just the two front legs straight down under his chest
    if (sitting) {
      const fx = cx + dir[0] * tile * 0.08;
      for (const side of [-1, 1]) {
        const lx = dir[0] !== 0 ? fx + side * tile * 0.015 : cx + side * tile * 0.05;
        ctx.strokeStyle = side < 0 && dir[0] !== 0 ? SCOUT_APPEARANCE.furDark : SCOUT_APPEARANCE.furBase;
        ctx.lineWidth = Math.max(1, tile * 0.04);
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(lx, cy);
        ctx.lineTo(lx, cy + tile * 0.12);
        ctx.stroke();
        ctx.lineCap = 'butt';
      }
    } else {
      this.drawQuadrupedLegs(cx, cy, dir, tile, {
        along: tile * 0.09,
        spread: tile * 0.07,
        top: tile * 0.0,
        paw: tile * 0.13,
        width: tile * 0.038,
        swing: legSwing,
        near: SCOUT_APPEARANCE.furBase,
        far: SCOUT_APPEARANCE.furDark,
      });
    }

    // body with a scruffy darker patch
    ctx.fillStyle = SCOUT_APPEARANCE.furBase;
    ctx.beginPath();
    ctx.ellipse(cx, cy - tile * 0.02, tile * 0.15, tile * 0.11 * bodyScaleY, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = SCOUT_APPEARANCE.furDark;
    ctx.beginPath();
    ctx.ellipse(cx - dir[0] * tile * 0.03, cy - tile * 0.05 - dir[1] * tile * 0.02, tile * 0.08, tile * 0.05 * bodyScaleY, 0, 0, Math.PI * 2);
    ctx.fill();

    // head
    const headX = cx + dir[0] * tile * 0.14;
    const headY = cy + dir[1] * tile * 0.1 - tile * 0.03 + headDrop;
    ctx.fillStyle = SCOUT_APPEARANCE.furBase;
    ctx.beginPath();
    ctx.arc(headX, headY, tile * 0.09, 0, Math.PI * 2);
    ctx.fill();

    // ears — one a little crooked
    ctx.fillStyle = SCOUT_APPEARANCE.furDark;
    ctx.beginPath();
    ctx.moveTo(headX - tile * 0.07, headY - tile * 0.04);
    ctx.lineTo(headX - tile * 0.1, headY - tile * 0.12 * earPerk);
    ctx.lineTo(headX - tile * 0.02, headY - tile * 0.06);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(headX + tile * 0.06, headY - tile * 0.04);
    ctx.lineTo(headX + tile * 0.11, headY - tile * 0.1 * earPerk);
    ctx.lineTo(headX + tile * 0.02, headY - tile * 0.06);
    ctx.closePath();
    ctx.fill();

    // muzzle + nose
    ctx.fillStyle = SCOUT_APPEARANCE.furLight;
    ctx.beginPath();
    ctx.ellipse(headX + dir[0] * tile * 0.06, headY + dir[1] * tile * 0.04 + tile * 0.02, tile * 0.055, tile * 0.04, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = SCOUT_APPEARANCE.nose;
    ctx.beginPath();
    ctx.arc(headX + dir[0] * tile * 0.1, headY + dir[1] * tile * 0.06 + tile * 0.02, tile * 0.018, 0, Math.PI * 2);
    ctx.fill();

    // one good eye, one patch — a plain, recognizable detail
    ctx.fillStyle = SCOUT_APPEARANCE.eye;
    ctx.beginPath();
    ctx.arc(headX - dir[1] * tile * 0.05 + dir[0] * tile * 0.01, headY - tile * 0.01, tile * 0.016, 0, Math.PI * 2);
    ctx.fill();
    // the missing eye, marked with a small "x" rather than a blank patch
    {
      const mx = headX + dir[1] * tile * 0.05 + dir[0] * tile * 0.01;
      const my = headY - tile * 0.01;
      const r = tile * 0.017;
      ctx.strokeStyle = SCOUT_APPEARANCE.eyePatch;
      ctx.lineWidth = Math.max(1, tile * 0.018);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(mx - r, my - r);
      ctx.lineTo(mx + r, my + r);
      ctx.moveTo(mx + r, my - r);
      ctx.lineTo(mx - r, my + r);
      ctx.stroke();
      ctx.lineCap = 'butt';
    }

    // handmade collar, matching Ellen's crochet accent
    ctx.strokeStyle = SCOUT_APPEARANCE.collar;
    ctx.lineWidth = Math.max(1, tile * 0.03);
    ctx.beginPath();
    ctx.arc(headX, headY + tile * 0.07, tile * 0.06, 0.1 * Math.PI, 0.9 * Math.PI);
    ctx.stroke();
  }

  /**
   * Scott: tall, lean, blonde and short-bearded, ambient, and entirely
   * uninterested in whatever the player is doing. Tinkers, naps, snacks,
   * or practices his golf depending on `activity`, which the scott system
   * drives on its own independent clock. Built like Ellen — legs, arms, a
   * tapered torso — just a head taller and in overalls.
   */
  private drawScott(camera: Camera, scott: ScottState, now: number) {
    const { ctx } = this;
    const tile = TILE_SIZE * camera.zoom;
    const screen = camera.worldToScreen(scott.x * TILE_SIZE, scott.y * TILE_SIZE);
    const A = SCOTT_APPEARANCE;

    if (scott.activity === 'napping') {
      this.drawScottNapping(screen, tile, now);
      return;
    }

    const golfing = scott.activity === 'golfing';
    const putting = scott.activity === 'putting';
    const facing: Facing = golfing ? 'down' : putting ? 'right' : scott.facing;
    const s = facing === 'left' ? -1 : 1;
    const isSide = facing === 'left' || facing === 'right';
    const isBack = facing === 'up';
    const isFront = facing === 'down';
    const moving = scott.activity === 'traveling';
    const tinkering = scott.activity === 'tinkering';
    const snacking = scott.activity === 'snacking';

    const walkPhase = moving ? now * (scott.hurrying ? 0.02 : 0.011) : now * 0.0025;
    const walkAmp = moving ? 1 : 0.25;
    const bob = Math.abs(Math.sin(walkPhase)) * -tile * 0.02 * walkAmp;
    const stride = moving ? Math.sin(walkPhase) : 0;
    const squash = tinkering ? 0.74 : 1;
    const lift = tinkering ? tile * 0.09 : 0;

    const cx = screen.x;
    const cy = screen.y + bob + lift;
    const footY = screen.y + tile * 0.25;

    const OUTLINE = 'rgba(28,20,12,0.55)';
    const outlineWidth = Math.max(1, tile * 0.016);
    const outline = () => {
      ctx.strokeStyle = OUTLINE;
      ctx.lineWidth = outlineWidth;
      ctx.stroke();
    };
    const limb = (x0: number, y0: number, x1: number, y1: number, w: number, color: string) => {
      ctx.lineCap = 'round';
      ctx.strokeStyle = OUTLINE;
      ctx.lineWidth = w + outlineWidth * 2;
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      ctx.stroke();
      ctx.strokeStyle = color;
      ctx.lineWidth = w;
      ctx.stroke();
      ctx.lineCap = 'butt';
    };

    // Lean frame: a head taller than Ellen, long legs, narrow waist.
    const shoulderY = cy - tile * 0.22 * squash;
    const waistY = cy + tile * 0.04 * squash;
    const hipY = cy + tile * 0.08 * squash;
    const shoulderW = tile * (isSide ? 0.07 : 0.1);
    const waistW = tile * (isSide ? 0.05 : 0.058);
    const headR = tile * 0.092;
    const headY = cy - tile * 0.34 * squash;

    // ---------------------------------------------------------------- golf
    // One swing every few seconds: address, a slow turn back, a quick
    // strike, and a held follow-through. The club is a line from his hands,
    // which swing round his shoulders; θ = 0 points straight down, positive
    // swings toward his right (screen-left, since he faces the camera).
    const SWING_MS = 3800;
    const t = golfing ? (now % SWING_MS) / SWING_MS : 0;
    const IMPACT = 0.7;
    const ease = (u: number) => u * u * (3 - 2 * u);
    let theta = 0;
    if (golfing) {
      if (t < 0.3) theta = Math.sin(now * 0.01) * 0.06;
      else if (t < 0.58) theta = 2.5 * ease((t - 0.3) / 0.28);
      else if (t < 0.64) theta = 2.5;
      else if (t < 0.76) theta = 2.5 - 4.9 * ease((t - 0.64) / 0.12);
      else if (t < 0.9) theta = -2.4;
      else theta = -2.4 * (1 - ease((t - 0.9) / 0.1));
    }
    // Putting: a short, smooth pendulum, side-on, then watch it roll.
    const PUTT_MS = 4200;
    const pt = putting ? (now % PUTT_MS) / PUTT_MS : 0;
    const STROKE = 0.3;
    const puttTheta = putting ? (pt < STROKE ? -0.4 * Math.sin((pt / STROKE) * Math.PI) : pt < STROKE + 0.06 ? 0.3 * Math.sin(((pt - STROKE) / 0.06) * (Math.PI / 2)) : 0.3) : 0;
    const holeX = cx + s * tile * 1.15;

    const drawGolfGround = () => {
      if (golfing) {
        // a tee and ball waiting at his feet until he strikes it
        if (t < IMPACT) {
          ctx.fillStyle = '#e8dcc4';
          ctx.fillRect(cx + tile * 0.01, footY - tile * 0.02, tile * 0.012, tile * 0.03);
          ctx.fillStyle = A.golfBall;
          ctx.beginPath();
          ctx.arc(cx + tile * 0.016, footY - tile * 0.03, tile * 0.022, 0, Math.PI * 2);
          ctx.fill();
          outline();
        }
      }
      if (putting) {
        // the cup and its flag
        ctx.fillStyle = 'rgba(20,24,16,0.75)';
        ctx.beginPath();
        ctx.ellipse(holeX, footY, tile * 0.05, tile * 0.022, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#e8e2c8';
        ctx.lineWidth = Math.max(1, tile * 0.012);
        ctx.beginPath();
        ctx.moveTo(holeX, footY);
        ctx.lineTo(holeX, footY - tile * 0.5);
        ctx.stroke();
        const flutter = Math.sin(now * 0.006) * tile * 0.012;
        ctx.fillStyle = A.flag;
        ctx.beginPath();
        ctx.moveTo(holeX, footY - tile * 0.5);
        ctx.lineTo(holeX + tile * 0.16, footY - tile * 0.45 + flutter);
        ctx.lineTo(holeX, footY - tile * 0.4);
        ctx.closePath();
        ctx.fill();
        // the ball: sits at his feet, then rolls (slowing) into the cup
        const startX = cx + s * tile * 0.13;
        let bx = startX;
        let show = true;
        if (pt >= STROKE + 0.03) {
          const u = Math.min(1, (pt - STROKE - 0.03) / 0.4);
          bx = startX + (holeX - startX) * (1 - (1 - u) * (1 - u));
          show = u < 1;
        }
        if (show) {
          ctx.fillStyle = A.golfBall;
          ctx.beginPath();
          ctx.arc(bx, footY - tile * 0.018, tile * 0.02, 0, Math.PI * 2);
          ctx.fill();
          outline();
        }
      }
    };

    const drawBallFlight = () => {
      if (!golfing || t < IMPACT) return;
      const u = (t - IMPACT) / 0.3;
      if (u > 1) return;
      // away to the right and up, shrinking as it carries
      const bx = cx + u * tile * 2.2;
      const by = footY - tile * 0.03 - Math.sin(u * Math.PI) * tile * 1.1 - u * tile * 0.35;
      ctx.fillStyle = A.golfBall;
      ctx.beginPath();
      ctx.arc(bx, by, tile * 0.022 * (1 - u * 0.5), 0, Math.PI * 2);
      ctx.fill();
    };

    // shadow
    ctx.fillStyle = 'rgba(0,0,0,0.24)';
    ctx.beginPath();
    ctx.ellipse(cx, screen.y + tile * 0.26, tile * (isSide ? 0.12 : 0.11), tile * 0.045, 0, 0, Math.PI * 2);
    ctx.fill();

    drawGolfGround();

    // legs — a little wider apart when he's addressing a ball
    const stanceW = golfing ? 0.06 : putting ? 0.03 : 0.036;
    const legW = Math.max(2, tile * 0.05);
    const legs: Array<[number, number]> = isSide ? [[-1, -stride], [1, stride]] : [[-1, stride], [1, -stride]];
    for (const [side, swing] of legs) {
      const topX = isSide ? cx + side * tile * 0.012 : cx + side * tile * 0.034;
      const footX = isSide ? topX + s * swing * tile * 0.08 + side * tile * stanceW * 0.4 : cx + side * tile * stanceW;
      const fy = isSide ? footY : footY - Math.max(0, swing) * tile * 0.03;
      limb(topX, hipY, footX, fy - tile * 0.03, legW, A.overalls);
      ctx.fillStyle = A.boots;
      ctx.beginPath();
      if (isSide) ctx.ellipse(footX + s * tile * 0.018, fy, tile * 0.048, tile * 0.03, 0, 0, Math.PI * 2);
      else ctx.ellipse(footX, fy, tile * 0.034, tile * 0.034, 0, 0, Math.PI * 2);
      ctx.fill();
      outline();
    }

    // where his hands are, and what's in them
    const pivotX = cx;
    const pivotY = shoulderY + tile * 0.04;
    let hands: [number, number] | null = null;
    let clubTo: [number, number] | null = null;
    if (golfing) {
      const d: [number, number] = [-Math.sin(theta), Math.cos(theta)];
      const rh = tile * 0.19;
      hands = [pivotX + d[0] * rh, pivotY + d[1] * rh];
      clubTo = [hands[0] + d[0] * tile * 0.25, hands[1] + d[1] * tile * 0.25];
    } else if (putting) {
      hands = [cx + s * tile * 0.07, waistY + tile * 0.02];
      const d: [number, number] = [Math.sin(puttTheta) * s, Math.cos(puttTheta)];
      clubTo = [hands[0] + d[0] * tile * 0.19, hands[1] + d[1] * tile * 0.19];
    }

    const drawArms = (front: boolean) => {
      const armW = Math.max(2, tile * 0.04);
      if (hands) {
        // both hands together on the grip
        const sides = isSide ? [s] : [-1, 1];
        for (const side of sides) {
          const sx = isSide ? cx + side * tile * 0.01 : cx + side * (shoulderW - tile * 0.012);
          limb(sx, shoulderY + tile * 0.025, hands[0], hands[1], armW, A.shirt);
        }
        ctx.fillStyle = A.skin;
        ctx.beginPath();
        ctx.arc(hands[0], hands[1], tile * 0.026, 0, Math.PI * 2);
        ctx.fill();
        return;
      }
      const armSwing = moving ? stride : 0;
      for (const [side, swing] of [[-1, armSwing], [1, -armSwing]] as const) {
        if (isSide && (side === s) !== front) continue;
        const sx = isSide ? cx + side * tile * 0.01 : cx + side * (shoulderW - tile * 0.012);
        const sy = shoulderY + tile * 0.025;
        let hx = isSide ? sx + s * swing * tile * 0.09 : sx + side * tile * 0.02;
        let hy = isSide ? cy + tile * 0.06 * squash : cy + tile * 0.06 * squash - swing * tile * 0.025;
        if (tinkering && side === 1) {
          hx = cx + (isSide ? s : 1) * tile * 0.13;
          hy = cy + tile * 0.1 + Math.sin(now * 0.01) * tile * 0.025;
        }
        if (snacking && side === 1) {
          hx = cx + (isSide ? s * tile * 0.08 : tile * 0.05);
          hy = headY + headR * 0.9 + Math.sin(now * 0.012) * tile * 0.012;
        }
        limb(sx, sy, hx, hy, armW, A.shirt);
        ctx.fillStyle = A.skin;
        ctx.beginPath();
        ctx.arc(hx, hy + tile * 0.01, tile * 0.024, 0, Math.PI * 2);
        ctx.fill();
        if (tinkering && side === 1) {
          // a trowel, poking at something
          ctx.strokeStyle = A.toolHandle;
          ctx.lineWidth = Math.max(1, tile * 0.022);
          ctx.beginPath();
          ctx.moveTo(hx, hy);
          ctx.lineTo(hx + tile * 0.06, hy + tile * 0.07);
          ctx.stroke();
          ctx.fillStyle = A.tool;
          ctx.beginPath();
          ctx.ellipse(hx + tile * 0.075, hy + tile * 0.09, tile * 0.02, tile * 0.03, -0.6, 0, Math.PI * 2);
          ctx.fill();
        }
        if (snacking && side === 1) {
          ctx.fillStyle = A.snack;
          ctx.beginPath();
          ctx.arc(hx, hy - tile * 0.02, tile * 0.03, 0, Math.PI * 2);
          ctx.fill();
          outline();
        }
      }
    };

    const drawClub = () => {
      if (!hands || !clubTo) return;
      ctx.lineCap = 'round';
      ctx.strokeStyle = A.clubShaft;
      ctx.lineWidth = Math.max(1, tile * 0.014);
      ctx.beginPath();
      ctx.moveTo(hands[0], hands[1]);
      ctx.lineTo(clubTo[0], clubTo[1]);
      ctx.stroke();
      ctx.lineCap = 'butt';
      ctx.fillStyle = A.clubHead;
      ctx.beginPath();
      ctx.ellipse(clubTo[0], clubTo[1], tile * (putting ? 0.035 : 0.028), tile * 0.016, 0, 0, Math.PI * 2);
      ctx.fill();
    };

    const drawTorso = () => {
      // chambray shirt
      ctx.fillStyle = A.shirt;
      ctx.beginPath();
      ctx.moveTo(cx - shoulderW, shoulderY);
      ctx.quadraticCurveTo(cx - waistW * 1.1, cy - tile * 0.06 * squash, cx - waistW, waistY);
      ctx.lineTo(cx - waistW, hipY);
      ctx.lineTo(cx + waistW, hipY);
      ctx.lineTo(cx + waistW, waistY);
      ctx.quadraticCurveTo(cx + waistW * 1.1, cy - tile * 0.06 * squash, cx + shoulderW, shoulderY);
      ctx.quadraticCurveTo(cx, shoulderY - tile * 0.03 * squash, cx - shoulderW, shoulderY);
      ctx.closePath();
      ctx.fill();
      outline();
      // overalls: bib and straps over the shirt
      ctx.fillStyle = A.overalls;
      const bibTop = shoulderY + tile * 0.09 * squash;
      const bibW = isSide ? waistW * 0.7 : waistW * 0.85;
      const bibX = isSide ? cx + s * waistW * 0.2 : cx;
      ctx.beginPath();
      ctx.moveTo(bibX - bibW, bibTop);
      ctx.lineTo(bibX + bibW, bibTop);
      ctx.lineTo(cx + waistW, hipY);
      ctx.lineTo(cx - waistW, hipY);
      ctx.closePath();
      if (!isBack) ctx.fill();
      ctx.fillRect(cx - waistW, waistY, waistW * 2, hipY - waistY + tile * 0.01);
      ctx.strokeStyle = A.overallsTrim;
      ctx.lineWidth = Math.max(1, tile * 0.018);
      ctx.beginPath();
      if (isSide) {
        ctx.moveTo(cx + s * shoulderW * 0.2, shoulderY);
        ctx.lineTo(bibX + s * bibW * 0.6, bibTop);
      } else {
        ctx.moveTo(cx - shoulderW * 0.55, shoulderY);
        ctx.lineTo(isBack ? cx + waistW * 0.4 : bibX - bibW * 0.8, isBack ? waistY : bibTop);
        ctx.moveTo(cx + shoulderW * 0.55, shoulderY);
        ctx.lineTo(isBack ? cx - waistW * 0.4 : bibX + bibW * 0.8, isBack ? waistY : bibTop);
      }
      ctx.stroke();
      if (isFront) {
        ctx.fillStyle = A.overallsTrim;
        ctx.fillRect(bibX - bibW * 0.4, bibTop + tile * 0.02, bibW * 0.8, tile * 0.03);
      }
    };

    const drawHead = () => {
      ctx.fillStyle = A.skin;
      ctx.fillRect(cx - tile * 0.022, headY + headR * 0.6, tile * 0.044, shoulderY - headY - headR * 0.4);
      const faceX = cx + (isSide ? s * headR * 0.15 : 0);
      ctx.beginPath();
      ctx.ellipse(faceX, headY, headR * (isSide ? 0.88 : 0.86), headR, 0, 0, Math.PI * 2);
      ctx.fill();
      outline();
      if (isSide) {
        ctx.beginPath();
        ctx.arc(cx + s * headR * 0.98, headY + headR * 0.08, headR * 0.16, 0, Math.PI * 2);
        ctx.fill();
      }

      // short blonde beard along the jaw, with a moustache
      if (!isBack) {
        ctx.fillStyle = A.beard;
        ctx.beginPath();
        if (isSide) {
          ctx.moveTo(cx - s * headR * 0.35, headY + headR * 0.05);
          ctx.quadraticCurveTo(cx - s * headR * 0.2, headY + headR * 1.02, cx + s * headR * 0.55, headY + headR * 0.98);
          ctx.quadraticCurveTo(cx + s * headR * 0.95, headY + headR * 0.72, cx + s * headR * 0.92, headY + headR * 0.42);
          ctx.quadraticCurveTo(cx + s * headR * 0.5, headY + headR * 0.55, cx + s * headR * 0.1, headY + headR * 0.3);
          ctx.quadraticCurveTo(cx - s * headR * 0.15, headY + headR * 0.3, cx - s * headR * 0.35, headY + headR * 0.05);
        } else {
          ctx.moveTo(cx - headR * 0.84, headY + headR * 0.05);
          ctx.quadraticCurveTo(cx - headR * 0.8, headY + headR * 1.12, cx, headY + headR * 1.14);
          ctx.quadraticCurveTo(cx + headR * 0.8, headY + headR * 1.12, cx + headR * 0.84, headY + headR * 0.05);
          ctx.quadraticCurveTo(cx + headR * 0.62, headY + headR * 0.42, cx + headR * 0.3, headY + headR * 0.42);
          ctx.quadraticCurveTo(cx, headY + headR * 0.3, cx - headR * 0.3, headY + headR * 0.42);
          ctx.quadraticCurveTo(cx - headR * 0.62, headY + headR * 0.42, cx - headR * 0.84, headY + headR * 0.05);
        }
        ctx.closePath();
        ctx.fill();
        // mouth: a skin-coloured gap in the beard
        ctx.fillStyle = 'rgba(120,70,50,0.7)';
        ctx.beginPath();
        if (this.happyFaces) {
          // a grin: the gap curves up at the corners
          const mx = isSide ? cx + s * headR * 0.55 : cx;
          const mw = headR * (isSide ? 0.18 : 0.26);
          ctx.moveTo(mx - mw, headY + headR * 0.6);
          ctx.quadraticCurveTo(mx, headY + headR * 0.82, mx + mw, headY + headR * 0.6);
          ctx.quadraticCurveTo(mx, headY + headR * 0.7, mx - mw, headY + headR * 0.6);
        } else {
          ctx.ellipse(isSide ? cx + s * headR * 0.55 : cx, headY + headR * 0.66, headR * (isSide ? 0.14 : 0.2), headR * 0.07, 0, 0, Math.PI * 2);
        }
        ctx.fill();
      }

      // short blonde hair, swept up at the front
      ctx.fillStyle = A.hair;
      ctx.beginPath();
      if (isBack) {
        ctx.ellipse(cx, headY - headR * 0.1, headR * 0.9, headR * 0.92, 0, 0, Math.PI * 2);
      } else if (isSide) {
        ctx.moveTo(cx + s * headR * 0.95, headY - headR * 0.35);
        ctx.quadraticCurveTo(cx + s * headR * 0.9, headY - headR * 1.2, cx - s * headR * 0.2, headY - headR * 1.08);
        ctx.quadraticCurveTo(cx - s * headR * 1.02, headY - headR * 0.8, cx - s * headR * 0.86, headY + headR * 0.1);
        ctx.quadraticCurveTo(cx - s * headR * 0.4, headY - headR * 0.1, cx - s * headR * 0.25, headY + headR * 0.1);
        ctx.quadraticCurveTo(cx + s * headR * 0.2, headY - headR * 0.5, cx + s * headR * 0.95, headY - headR * 0.35);
      } else {
        ctx.moveTo(cx - headR * 0.88, headY - headR * 0.05);
        ctx.quadraticCurveTo(cx - headR * 0.95, headY - headR * 1.15, cx, headY - headR * 1.12);
        ctx.quadraticCurveTo(cx + headR * 0.95, headY - headR * 1.15, cx + headR * 0.88, headY - headR * 0.05);
        ctx.quadraticCurveTo(cx + headR * 0.55, headY - headR * 0.55, cx + headR * 0.1, headY - headR * 0.5);
        ctx.quadraticCurveTo(cx - headR * 0.5, headY - headR * 0.62, cx - headR * 0.88, headY - headR * 0.05);
      }
      ctx.closePath();
      ctx.fill();
      outline();
      if (isBack) return;

      // eyes (on the ball when he's golfing)
      ctx.fillStyle = '#2a2018';
      const eyeY = headY + headR * (golfing && t < IMPACT ? 0.08 : 0.0);
      const eyeR = Math.max(0.7, headR * 0.085);
      const eyes = isSide ? [cx + s * headR * 0.55] : [cx - headR * 0.32, cx + headR * 0.32];
      if (this.happyFaces) {
        ctx.strokeStyle = '#2a2018';
        ctx.lineWidth = Math.max(0.8, eyeR * 0.8);
        ctx.lineCap = 'round';
        for (const ex of eyes) {
          ctx.beginPath();
          ctx.arc(ex, eyeY + eyeR * 0.7, eyeR * 1.3, 1.15 * Math.PI, 1.85 * Math.PI);
          ctx.stroke();
        }
        ctx.lineCap = 'butt';
      } else {
        for (const ex of eyes) {
          ctx.beginPath();
          ctx.ellipse(ex, eyeY, eyeR, eyeR * (snacking ? 0.5 : 1.15), 0, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      // light, fair brows — dark ones read as sunglasses at this size
      ctx.strokeStyle = A.hair;
      ctx.lineWidth = Math.max(0.6, headR * 0.06);
      ctx.beginPath();
      for (const ex of eyes) {
        ctx.moveTo(ex - headR * 0.12, eyeY - headR * 0.24);
        ctx.lineTo(ex + headR * 0.12, eyeY - headR * 0.27);
      }
      ctx.stroke();
      // a hint of nose between beard and eyes
      ctx.fillStyle = 'rgba(170,110,80,0.55)';
      ctx.beginPath();
      ctx.ellipse(isSide ? cx + s * headR * 0.86 : cx, headY + headR * 0.3, headR * 0.08, headR * 0.06, 0, 0, Math.PI * 2);
      ctx.fill();
    };

    if (isBack) {
      drawArms(true);
      drawTorso();
      drawHead();
      drawClub();
    } else if (isSide) {
      drawArms(false);
      drawTorso();
      drawHead();
      drawArms(true);
      drawClub();
    } else {
      drawTorso();
      // Backswing: the club rises behind his head; otherwise it's in front.
      if (golfing && Math.abs(theta) > 1.6) drawClub();
      drawHead();
      drawArms(true);
      if (!(golfing && Math.abs(theta) > 1.6)) drawClub();
    }
    drawBallFlight();
  }

  private drawScottNapping(screen: { x: number; y: number }, tile: number, now: number) {
    const { ctx } = this;
    const A = SCOTT_APPEARANCE;
    const breathe = Math.sin(now * 0.003) * tile * 0.012;

    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.beginPath();
    ctx.ellipse(screen.x, screen.y + tile * 0.1, tile * 0.34, tile * 0.1, 0, 0, Math.PI * 2);
    ctx.fill();

    // long and lean, stretched out on his back
    ctx.fillStyle = A.overalls;
    ctx.beginPath();
    ctx.roundRect(screen.x - tile * 0.12, screen.y + tile * 0.02 + breathe, tile * 0.42, tile * 0.1, tile * 0.05);
    ctx.fill();
    ctx.fillStyle = A.boots;
    ctx.beginPath();
    ctx.ellipse(screen.x + tile * 0.32, screen.y + tile * 0.03, tile * 0.03, tile * 0.04, 0, 0, Math.PI * 2);
    ctx.ellipse(screen.x + tile * 0.32, screen.y + tile * 0.1, tile * 0.03, tile * 0.04, 0, 0, Math.PI * 2);
    ctx.fill();
    // a borrowed crochet blanket over his middle
    ctx.fillStyle = A.napBlanket;
    ctx.beginPath();
    ctx.roundRect(screen.x - tile * 0.06, screen.y + breathe, tile * 0.22, tile * 0.14, tile * 0.04);
    ctx.fill();
    ctx.fillStyle = A.shirt;
    ctx.beginPath();
    ctx.roundRect(screen.x - tile * 0.2, screen.y + tile * 0.015 + breathe, tile * 0.14, tile * 0.11, tile * 0.04);
    ctx.fill();

    const hx = screen.x - tile * 0.27;
    const hy = screen.y + tile * 0.07 + breathe;
    ctx.fillStyle = A.skin;
    ctx.beginPath();
    ctx.arc(hx, hy, tile * 0.075, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = A.hair;
    ctx.beginPath();
    ctx.arc(hx - tile * 0.03, hy, tile * 0.065, Math.PI * 0.5, Math.PI * 1.5);
    ctx.fill();
    ctx.fillStyle = A.beard;
    ctx.beginPath();
    ctx.arc(hx + tile * 0.035, hy, tile * 0.05, -Math.PI * 0.5, Math.PI * 0.5);
    ctx.fill();

    ctx.fillStyle = 'rgba(240,236,216,0.75)';
    ctx.font = `${Math.round(tile * 0.13)}px Georgia`;
    ctx.textAlign = 'center';
    for (let i = 0; i < 2; i++) {
      const zt = (now * 0.0006 + i * 0.5) % 1;
      ctx.globalAlpha = 1 - zt;
      ctx.fillText('z', hx - zt * tile * 0.1, screen.y - tile * 0.12 - zt * tile * 0.4);
    }
    ctx.globalAlpha = 1;
  }

  /**
   * The greenhouse cat: small, orange, indoor-only, and drawn only from
   * `renderIndoor` — she has no outdoor coordinate space to speak of.
   */
  private drawCat(camera: Camera, cat: CatState, now: number) {
    const { ctx } = this;
    const tile = TILE_SIZE * camera.zoom;
    const screen = camera.worldToScreen(cat.x * TILE_SIZE, cat.y * TILE_SIZE);

    if (cat.activity === 'sleeping') {
      this.drawCatSleeping(screen, tile, now);
      return;
    }

    const dir = Renderer.DIR[cat.facing];
    const moving = cat.activity === 'wandering';
    const sitting = cat.activity === 'sitting' || cat.activity === 'hiding';
    const grooming = cat.activity === 'grooming';

    const walkPhase = now * 0.015;
    const bob = moving ? Math.sin(walkPhase) * tile * 0.015 : 0;
    const legSwing = moving ? Math.sin(walkPhase * 2) * tile * 0.03 : 0;
    const bodyScaleY = sitting || grooming ? 1.15 : 1;

    const cx = screen.x;
    const cy = screen.y + bob;

    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.beginPath();
    ctx.ellipse(cx, screen.y + tile * 0.13, tile * 0.13, tile * 0.05, 0, 0, Math.PI * 2);
    ctx.fill();

    // tail: curled up at rest, low and out while walking
    const tailBaseX = cx - dir[0] * tile * 0.1;
    const tailBaseY = cy - tile * 0.02;
    ctx.strokeStyle = CAT_APPEARANCE.furDark;
    ctx.lineWidth = Math.max(1, tile * 0.03);
    ctx.beginPath();
    ctx.moveTo(tailBaseX, tailBaseY);
    if (sitting || grooming) {
      ctx.quadraticCurveTo(tailBaseX - dir[0] * tile * 0.1, tailBaseY - tile * 0.14, tailBaseX + tile * 0.03, tailBaseY - tile * 0.16);
    } else {
      ctx.quadraticCurveTo(
        tailBaseX - dir[0] * tile * 0.12,
        tailBaseY - tile * 0.02 + Math.sin(now * 0.01) * tile * 0.03,
        tailBaseX - dir[0] * tile * 0.16,
        tailBaseY - tile * 0.08
      );
    }
    ctx.stroke();

    if (!sitting && !grooming) {
      this.drawQuadrupedLegs(cx, cy, dir, tile, {
        along: tile * 0.065,
        spread: tile * 0.05,
        top: tile * 0.0,
        paw: tile * 0.1,
        width: tile * 0.026,
        swing: legSwing,
        near: CAT_APPEARANCE.furBase,
        far: CAT_APPEARANCE.furDark,
      });
    } else {
      // sitting upright: front legs straight down, paws together
      for (const side of [-1, 1]) {
        const lx = cx + dir[0] * tile * 0.05 + side * tile * (dir[0] !== 0 ? 0.012 : 0.03);
        ctx.strokeStyle = CAT_APPEARANCE.furLight;
        ctx.lineWidth = Math.max(1, tile * 0.024);
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(lx, cy);
        ctx.lineTo(lx, cy + tile * 0.085);
        ctx.stroke();
        ctx.lineCap = 'butt';
      }
    }

    // body, orange tabby
    ctx.fillStyle = CAT_APPEARANCE.furBase;
    ctx.beginPath();
    ctx.ellipse(cx, cy - tile * 0.02, tile * 0.1, tile * 0.075 * bodyScaleY, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = CAT_APPEARANCE.furDark;
    ctx.lineWidth = Math.max(1, tile * 0.015);
    for (let i = -1; i <= 1; i++) {
      ctx.beginPath();
      ctx.moveTo(cx + i * tile * 0.025, cy - tile * 0.07 * bodyScaleY);
      ctx.lineTo(cx + i * tile * 0.025, cy + tile * 0.01);
      ctx.stroke();
    }

    // head
    const headX = cx + dir[0] * tile * 0.1;
    const headY = cy + dir[1] * tile * 0.06 - tile * 0.06;
    ctx.fillStyle = CAT_APPEARANCE.furBase;
    ctx.beginPath();
    ctx.arc(headX, headY, tile * 0.065, 0, Math.PI * 2);
    ctx.fill();

    // pointed ears
    ctx.fillStyle = CAT_APPEARANCE.furBase;
    ctx.beginPath();
    ctx.moveTo(headX - tile * 0.05, headY - tile * 0.03);
    ctx.lineTo(headX - tile * 0.07, headY - tile * 0.1);
    ctx.lineTo(headX - tile * 0.01, headY - tile * 0.05);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(headX + tile * 0.05, headY - tile * 0.03);
    ctx.lineTo(headX + tile * 0.07, headY - tile * 0.1);
    ctx.lineTo(headX + tile * 0.01, headY - tile * 0.05);
    ctx.closePath();
    ctx.fill();

    // muzzle + nose
    ctx.fillStyle = CAT_APPEARANCE.belly;
    ctx.beginPath();
    ctx.ellipse(headX + dir[0] * tile * 0.02, headY + tile * 0.03, tile * 0.035, tile * 0.025, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = CAT_APPEARANCE.nose;
    ctx.beginPath();
    ctx.arc(headX + dir[0] * tile * 0.03, headY + tile * 0.02, tile * 0.012, 0, Math.PI * 2);
    ctx.fill();

    // eyes
    ctx.fillStyle = CAT_APPEARANCE.eye;
    ctx.beginPath();
    ctx.arc(headX - dir[1] * tile * 0.03 + dir[0] * tile * 0.005, headY - tile * 0.005, tile * 0.012, 0, Math.PI * 2);
    ctx.arc(headX + dir[1] * tile * 0.03 + dir[0] * tile * 0.005, headY - tile * 0.005, tile * 0.012, 0, Math.PI * 2);
    ctx.fill();

    if (grooming) {
      // one paw raised to the side of her head, mid-lick
      const liftPhase = Math.sin(now * 0.018) * tile * 0.02;
      ctx.fillStyle = CAT_APPEARANCE.furLight;
      ctx.beginPath();
      ctx.ellipse(headX - dir[0] * tile * 0.02, headY + tile * 0.06 + liftPhase, tile * 0.02, tile * 0.03, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private drawCatSleeping(screen: { x: number; y: number }, tile: number, now: number) {
    const { ctx } = this;
    const breathe = Math.sin(now * 0.004) * tile * 0.01;

    ctx.fillStyle = 'rgba(0,0,0,0.16)';
    ctx.beginPath();
    ctx.ellipse(screen.x, screen.y + tile * 0.06, tile * 0.14, tile * 0.06, 0, 0, Math.PI * 2);
    ctx.fill();

    // curled into a ball
    ctx.fillStyle = CAT_APPEARANCE.furBase;
    ctx.beginPath();
    ctx.ellipse(screen.x, screen.y + tile * 0.02 + breathe, tile * 0.11, tile * 0.09, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = CAT_APPEARANCE.furDark;
    ctx.lineWidth = Math.max(1, tile * 0.015);
    ctx.beginPath();
    ctx.arc(screen.x, screen.y + tile * 0.02 + breathe, tile * 0.09, 0.2 * Math.PI, 0.8 * Math.PI);
    ctx.stroke();

    // tail wrapped over the nose
    ctx.strokeStyle = CAT_APPEARANCE.furDark;
    ctx.lineWidth = Math.max(1, tile * 0.025);
    ctx.beginPath();
    ctx.arc(screen.x, screen.y + tile * 0.02 + breathe, tile * 0.1, -0.3 * Math.PI, 0.15 * Math.PI);
    ctx.stroke();

    ctx.fillStyle = 'rgba(240,236,216,0.7)';
    ctx.font = `${Math.round(tile * 0.1)}px Georgia`;
    ctx.textAlign = 'center';
    for (let i = 0; i < 2; i++) {
      const t = (now * 0.0006 + i * 0.5) % 1;
      const zx = screen.x + tile * 0.14 + t * tile * 0.08;
      const zy = screen.y - tile * 0.1 - t * tile * 0.3;
      ctx.globalAlpha = 1 - t;
      ctx.fillText('z', zx, zy);
    }
    ctx.globalAlpha = 1;
  }

  /**
   * Tasteful, capped-count atmosphere: drifting pollen in the shaded
   * zones, a couple of wandering butterflies over open flowers, and
   * falling leaves under the canopy when it's dry. Screen-space and cheap,
   * in the same spirit as the existing rain overlay.
   */
  private drawAmbientParticles(camera: Camera, zone: ZoneId, weather: string, now: number) {
    const { ctx } = this;
    // CSS pixels, matching the DPR-scaled transform; canvas.width would be
    // 2x on a phone and push most particles off-screen.
    const w = camera.viewW;
    const h = camera.viewH;

    if (zone === 'woodland' || zone === 'dampForest') {
      for (let i = 0; i < 10; i++) {
        const seed = i * 137.5;
        const x = (seed * 3 + now * 0.01 * (0.5 + (i % 3) * 0.2)) % w;
        const y = h - ((now * 0.02 + seed * 5) % (h + 40));
        const alpha = Math.max(0, 0.15 + 0.1 * Math.sin(now * 0.002 + i));
        ctx.fillStyle = `rgba(230,225,190,${alpha})`;
        ctx.beginPath();
        ctx.arc(x, y, 1.5, 0, Math.PI * 2);
        ctx.fill();
      }
      if (weather !== 'rain') {
        for (let i = 0; i < 4; i++) {
          const seed = i * 211.3;
          const fx = (seed * 2 + Math.sin(now * 0.0006 + i) * 40 + w) % w;
          const fy = ((now * 0.03 + seed * 4) % (h + 30)) - 15;
          ctx.save();
          ctx.translate(fx, fy);
          ctx.rotate(now * 0.001 + i);
          ctx.fillStyle = 'rgba(150,110,60,0.4)';
          ctx.beginPath();
          ctx.ellipse(0, 0, 3, 1.6, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
      }
    } else if (zone === 'meadow' || zone === 'overgrownClearing') {
      for (let i = 0; i < 3; i++) {
        const bx = (w * (0.15 + i * 0.35) + Math.sin(now * 0.0015 + i * 2) * w * 0.12 + w) % w;
        const by = h * 0.3 + Math.cos(now * 0.0021 + i * 3) * h * 0.15;
        const flap = Math.sin(now * 0.02 + i) * 3;
        ctx.fillStyle = i % 2 === 0 ? 'rgba(240,220,120,0.75)' : 'rgba(230,180,220,0.75)';
        ctx.beginPath();
        ctx.ellipse(bx - 3, by - flap, 3, 2, 0.4, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(bx + 3, by + flap, 3, 2, -0.4, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  private drawWeatherOverlay(camera: Camera, state: GameState, now: number) {
    const { ctx } = this;
    const daylight = daylightFactor(state.clock.totalMinutes);
    const darkness = 1 - daylight;
    if (darkness > 0.02) {
      ctx.fillStyle = `rgba(8,16,28,${darkness * 0.55})`;
      ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    }
    const rainTarget = state.weather.condition === 'rain' ? 1 : 0;
    const cloudTarget = state.weather.condition === 'overcast' ? 1 : 0;
    if (this.rainMix < 0) {
      // First frame: show the weather as it is, no fade-in on load.
      this.rainMix = rainTarget;
      this.cloudMix = cloudTarget;
    } else {
      const k = 1 - Math.exp(-Math.max(0, Math.min(250, now - this.lastWeatherAt)) / WEATHER_FADE_MS);
      this.rainMix += (rainTarget - this.rainMix) * k;
      this.cloudMix += (cloudTarget - this.cloudMix) * k;
    }
    this.lastWeatherAt = now;
    if (this.cloudMix > 0.01) {
      ctx.fillStyle = `rgba(120,130,120,${0.12 * this.cloudMix})`;
      ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    }
    if (this.rainMix > 0.01) {
      const r = this.rainMix;
      ctx.fillStyle = `rgba(150,170,190,${0.15 * r})`;
      ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
      ctx.strokeStyle = `rgba(200,220,235,${0.35 * r})`;
      ctx.lineWidth = 1;
      const w = camera.viewW;
      const h = camera.viewH;
      ctx.beginPath();
      const drops = Math.round(90 * r);
      for (let i = 0; i < drops; i++) {
        const seedX = (i * 977) % w;
        const seedY = ((i * 613 + Math.floor(now * 0.6)) % (h + 40)) - 20;
        ctx.moveTo(seedX, seedY);
        ctx.lineTo(seedX - 6, seedY + 16);
      }
      ctx.stroke();
    }
  }

  // ---------------- Indoor (greenhouse) ----------------

  renderIndoor(camera: Camera, state: GameState, now: number, crouching = false, extras: SceneExtras = NO_EXTRAS) {
    const { ctx } = this;
    this.clear('#241a12');
    const tile = TILE_SIZE * camera.zoom;
    this.sprites.beginFrame();
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);

    drawInteriorShell(ctx, camera, state, now);

    const scottHome = state.scott.zone === 'greenhouse';
    const fc: FixtureContext = {
      state,
      now,
      scottWatching: scottHome && state.scott.activity === 'watchingTV',
      scottRelaxing: scottHome && state.scott.activity === 'relaxing',
    };
    const tools = extras.tools;
    const arranging = tools.kind === 'arrange' ? tools : null;
    // While a piece is being dragged it's drawn where the finger has it.
    const pieces: PlacedFurniture[] = allFurniture(state).map((f) => (arranging?.drag && arranging.drag.id === f.id ? { ...f, x: arranging.drag.x, y: arranging.drag.y } : f));
    if (arranging?.pending) pieces.push({ id: '__pending', kind: arranging.pending.kind, x: arranging.pending.x, y: arranging.pending.y, rot: arranging.pending.rot });

    // Rugs lie under everything; the cat's bed, the mat and the doormat lie on top of rugs.
    const flats = pieces.filter((f) => FURNITURE_DEFS[f.kind]?.layer === 'flat');
    for (const f of flats) {
      if (FURNITURE_DEFS[f.kind].reserves) continue;
      if (FURNITURE_DEFS[f.kind].fixed) drawFixture(ctx, camera, fixtureRect(f), fc);
      else this.drawHouseRug(camera, f);
    }
    for (const f of flats) {
      if (!FURNITURE_DEFS[f.kind].reserves) continue;
      if (f.kind === 'scoutBed') this.drawScoutBed(camera, f);
      else drawFixture(ctx, camera, fixtureRect(f), fc);
    }

    const plantIn = (kind: 'nursery' | 'display', id: string) =>
      Object.values(state.plants).find((p) => (kind === 'nursery' ? p.location.kind === 'nursery' && p.location.bedId === id : p.location.kind === 'display' && p.location.slotId === id));

    const drawables: { y: number; draw: () => void }[] = [];
    const hanging: { piece: PlacedFurniture; slot: DisplaySlot }[] = [];
    // The sun room's stacked junk stands up, so it sorts with everyone else.
    if (!state.owned.includes('sunRoom')) {
      for (const c of STORAGE_CRATES) drawables.push({ y: c.y + 0.9, draw: () => this.drawCrate(camera, c.x, c.y) });
    }
    for (const f of pieces) {
      const def = FURNITURE_DEFS[f.kind];
      if (!def || def.layer === 'flat') continue;
      const fp = footprint(f.kind, f.x, f.y, f.rot ?? 0);
      if (def.role === 'nursery') {
        drawables.push({ y: fp.y + fp.h, draw: () => this.drawNurseryPiece(camera, f, plantIn('nursery', f.id), now) });
      } else if (def.role === 'display') {
        const slot: DisplaySlot = { id: f.id, x: f.x, y: f.y, kind: def.slotKind! };
        if (def.layer === 'overhead') hanging.push({ piece: f, slot });
        else drawables.push({ y: fp.y + fp.h, draw: () => this.drawDisplaySlot(camera, slot, plantIn('display', f.id), now, f.rot ?? 0) });
      } else if (f.kind === 'growLamp') {
        drawables.push({ y: fp.y + fp.h, draw: () => this.drawGrowLamp(camera, f, now) });
      } else if (f.kind === 'wateringCan') {
        drawables.push({ y: fp.y + fp.h, draw: () => this.drawWateringCan(camera, f) });
      } else if (f.kind === 'ellenDesk') {
        drawables.push({ y: fp.y + fp.h, draw: () => this.drawEllenDesk(camera, f) });
      } else if (def.fixed) {
        drawables.push({ y: fp.y + fp.h, draw: () => drawFixture(ctx, camera, fixtureRect(f), fc) });
      }
    }

    const moving = Math.hypot(state.player.x - this.lastEllenX, state.player.y - this.lastEllenY) > 0.001;
    this.lastEllenX = state.player.x;
    this.lastEllenY = state.player.y;
    drawables.push({ y: state.scout.y, draw: () => this.atScale(camera, state.scout.x, state.scout.y, CHARACTER_SCALE.scout, () => this.drawScout(camera, state.scout, now)) });
    const kissing = !!extras.kiss && scottHome;
    if (scottHome && !kissing) {
      // On the couch he's sitting down, so he sits lower — the couch back hides the rest of him.
      const seated = isCouchSpot(state.scott.currentSpotId) && (state.scott.activity === 'watchingTV' || state.scott.activity === 'relaxing');
      // Napping on the couch he's stretched out on the seat: drawn up on it, in front of it.
      const onCouch = isCouchNap(state.scott.currentSpotId) && state.scott.activity === 'napping';
      const sy = state.scott.y + (seated ? -0.12 : onCouch ? -0.05 : 0);
      drawables.push({
        y: state.scott.y + (onCouch ? 0.6 : 0),
        draw: () => this.atScale(camera, state.scott.x, sy, CHARACTER_SCALE.scott, () => this.drawScott(camera, seated || onCouch ? { ...state.scott, y: sy } : state.scott, now)),
      });
    }
    // Up on something (the couch, the TV), the cat is drawn raised and in front of it;
    // hiding, she's tucked just behind a plant so its leaves cover her.
    const lift = catLift(state.cat);
    const catDepth = state.cat.y + (lift > 0 ? 1 : 0);
    drawables.push({
      y: catDepth,
      draw: () => {
        ctx.save();
        ctx.translate(0, -lift * tile);
        this.atScale(camera, state.cat.x, state.cat.y, CHARACTER_SCALE.cat, () => this.drawCat(camera, state.cat, now));
        ctx.restore();
      },
    });
    if (kissing) {
      const kiss = extras.kiss!;
      drawables.push({ y: state.player.y, draw: () => this.drawKiss(camera, state, kiss, now) });
    } else drawables.push({ y: state.player.y, draw: () => this.atScale(camera, state.player.x, state.player.y, CHARACTER_SCALE.ellen, () => this.drawEllen(camera, state.player.x, state.player.y, state.player.facing, now, moving, crouching)) });
    drawables.sort((a, b) => a.y - b.y);
    for (const d of drawables) d.draw();
    // Hanging pots are overhead, so they draw over everyone.
    for (const h of hanging) this.drawDisplaySlot(camera, h.slot, plantIn('display', h.piece.id), now);

    if (state.owned.includes('growLights')) this.drawGrowLights(camera, now);

    // The living room is lamplit and warm; the greenhouse is bright and green.
    ctx.fillStyle = 'rgba(255,200,130,0.05)';
    ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    const edge = camera.worldToScreen((PARTITION_X + 0.5) * TILE_SIZE, 0);
    if (edge.x < camera.viewW) {
      ctx.fillStyle = isNight(state.clock.totalMinutes) ? 'rgba(255,170,90,0.08)' : 'rgba(255,190,120,0.05)';
      ctx.fillRect(Math.max(0, edge.x), 0, camera.viewW, camera.viewH);
    }

    if (arranging) this.drawArrangeOverlay(camera, state, arranging, pieces);
    this.drawFade(extras.fade);
  }

  /** While arranging: every movable piece is outlined; the one in hand shows whether it fits. */
  private drawArrangeOverlay(camera: Camera, state: GameState, m: Extract<ToolMode, { kind: 'arrange' }>, pieces: PlacedFurniture[]) {
    const { ctx } = this;
    const tile = TILE_SIZE * camera.zoom;
    const now = performance.now();
    for (const f of pieces) {
      const def = FURNITURE_DEFS[f.kind];
      const fp = footprint(f.kind, f.x, f.y, f.rot ?? 0);
      const a = camera.worldToScreen(fp.x * TILE_SIZE, fp.y * TILE_SIZE);
      const isPending = f.id === '__pending';
      const dragging = m.drag?.id === f.id;
      const selected = m.selectedId === f.id || isPending;
      const block = isPending ? m.pending?.block : dragging ? m.drag?.block : null;
      const lift = def.layer === 'overhead' ? tile * 0.9 : 0;
      ctx.save();
      ctx.lineWidth = Math.max(1.5, tile * (selected || dragging ? 0.06 : 0.03));
      if (block) ctx.strokeStyle = 'rgba(255,120,100,0.95)';
      else if (selected || dragging) ctx.strokeStyle = `rgba(200,255,190,${0.75 + 0.25 * Math.sin(now * 0.006)})`;
      else ctx.strokeStyle = 'rgba(246,239,224,0.35)';
      if (!selected && !dragging) ctx.setLineDash([tile * 0.08, tile * 0.08]);
      ctx.beginPath();
      ctx.roundRect(a.x - tile * 0.06, a.y - tile * 0.06 - lift, fp.w * tile + tile * 0.12, fp.h * tile + tile * 0.12, tile * 0.08);
      ctx.stroke();
      if (block || ((selected || dragging) && !block)) {
        ctx.fillStyle = block ? 'rgba(255,110,90,0.18)' : 'rgba(160,230,150,0.12)';
        ctx.fill();
      }
      ctx.restore();
    }
    void state;
  }

  /** Arranging outdoors: every movable garden piece is outlined; the one in hand shows whether it fits. */
  private drawYardOverlay(camera: Camera, m: Extract<ToolMode, { kind: 'yard' }>, pieces: YardPiece[]) {
    const { ctx } = this;
    const tile = TILE_SIZE * camera.zoom;
    const now = performance.now();
    for (const p of pieces) {
      const fp = yardFootprint(p.kind, p.x, p.y);
      const a = camera.worldToScreen(fp.x * TILE_SIZE, fp.y * TILE_SIZE);
      const isPending = p.id === '__pending';
      const dragging = m.drag?.id === p.id;
      const selected = m.selectedId === p.id || isPending;
      const block = isPending ? m.pending?.block : dragging ? m.drag?.block : null;
      ctx.save();
      ctx.lineWidth = Math.max(1.5, tile * (selected || dragging ? 0.06 : 0.03));
      if (block) ctx.strokeStyle = 'rgba(255,120,100,0.95)';
      else if (selected || dragging) ctx.strokeStyle = `rgba(200,255,190,${0.75 + 0.25 * Math.sin(now * 0.006)})`;
      else ctx.strokeStyle = 'rgba(246,239,224,0.45)';
      if (!selected && !dragging) ctx.setLineDash([tile * 0.08, tile * 0.08]);
      ctx.beginPath();
      ctx.roundRect(a.x - tile * 0.06, a.y - tile * 0.06, fp.w * tile + tile * 0.12, fp.h * tile + tile * 0.12, tile * 0.08);
      ctx.stroke();
      if (block || selected || dragging) {
        ctx.fillStyle = block ? 'rgba(255,110,90,0.18)' : 'rgba(160,230,150,0.12)';
        ctx.fill();
      }
      ctx.restore();
    }
  }

  /** Scout's own round bed: set dressing that makes the greenhouse somewhere they live. Movable like the rest. */
  private drawScoutBed(camera: Camera, piece: PlacedFurniture) {
    const { ctx } = this;
    const tile = TILE_SIZE * camera.zoom;
    {
      const s = camera.worldToScreen((piece.x + 0.5) * TILE_SIZE, (piece.y + 0.5) * TILE_SIZE);
      ctx.fillStyle = 'rgba(0,0,0,0.22)';
      ctx.beginPath();
      ctx.ellipse(s.x, s.y + tile * 0.24, tile * 0.34, tile * 0.12, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = SCOUT_APPEARANCE.collar;
      ctx.beginPath();
      ctx.ellipse(s.x, s.y + tile * 0.14, tile * 0.32, tile * 0.2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = SCOUT_APPEARANCE.furLight;
      ctx.beginPath();
      ctx.ellipse(s.x, s.y + tile * 0.12, tile * 0.22, tile * 0.13, 0, 0, Math.PI * 2);
      ctx.fill();
    }

  }

  /** Ellen's low desk, with her notebook and crochet basket. */
  private drawEllenDesk(camera: Camera, piece: PlacedFurniture) {
    const { ctx } = this;
    const tile = TILE_SIZE * camera.zoom;
    {
      const s = camera.worldToScreen((piece.x + 0.5) * TILE_SIZE, (piece.y + 0.5) * TILE_SIZE);
      ctx.fillStyle = '#5a4530';
      ctx.fillRect(s.x - tile * 0.3, s.y - tile * 0.16, tile * 0.6, tile * 0.32);
      // notebook
      ctx.save();
      ctx.translate(s.x - tile * 0.1, s.y - tile * 0.04);
      ctx.rotate(-0.15);
      ctx.fillStyle = ELLEN_APPEARANCE.shirt;
      ctx.fillRect(-tile * 0.12, -tile * 0.09, tile * 0.24, tile * 0.18);
      ctx.strokeStyle = 'rgba(60,45,30,0.5)';
      ctx.lineWidth = 1;
      for (let i = -1; i <= 1; i++) {
        ctx.beginPath();
        ctx.moveTo(-tile * 0.09, i * tile * 0.05);
        ctx.lineTo(tile * 0.09, i * tile * 0.05);
        ctx.stroke();
      }
      ctx.restore();
      // crochet basket with a hook of yarn
      ctx.fillStyle = '#8a6a42';
      ctx.beginPath();
      ctx.ellipse(s.x + tile * 0.16, s.y + tile * 0.04, tile * 0.11, tile * 0.08, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = ELLEN_APPEARANCE.crochetScarf;
      ctx.beginPath();
      ctx.arc(s.x + tile * 0.16, s.y - tile * 0.02, tile * 0.07, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = ELLEN_APPEARANCE.crochetScarfAlt;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(s.x + tile * 0.1, s.y - tile * 0.05);
      ctx.quadraticCurveTo(s.x + tile * 0.02, s.y - tile * 0.12, s.x - tile * 0.05, s.y - tile * 0.08);
      ctx.stroke();
    }

  }

  /** A nursery bed: a timber seed trough, either way round. */
  private drawNurseryPiece(camera: Camera, piece: PlacedFurniture, plant: OwnedPlant | undefined, now: number) {
    const { ctx } = this;
    const tile = TILE_SIZE * camera.zoom;
    const fp = footprint(piece.kind, piece.x, piece.y, piece.rot ?? 0);
    const a = camera.worldToScreen(fp.x * TILE_SIZE, fp.y * TILE_SIZE);
    const w = fp.w * tile;
    const h = fp.h * tile;
    const depth = tile * 0.2;
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(a.x + tile * 0.03, a.y + h + depth - tile * 0.02, w, tile * 0.08);
    // Front face, then the soil-filled top.
    ctx.fillStyle = '#6b4a2e';
    ctx.fillRect(a.x, a.y + h - depth * 0.2, w, depth + depth * 0.2);
    ctx.fillStyle = '#7a5636';
    ctx.fillRect(a.x, a.y - depth * 0.6, w, h + depth * 0.4);
    ctx.fillStyle = '#3d2a1a';
    ctx.fillRect(a.x + tile * 0.05, a.y - depth * 0.45, w - tile * 0.1, h + depth * 0.1);
    // Seed-tray cells.
    ctx.strokeStyle = 'rgba(30,20,10,0.4)';
    ctx.lineWidth = 1;
    const along = w >= h;
    const n = Math.max(2, Math.round((along ? fp.w : fp.h) / 0.22));
    for (let i = 1; i < n; i++) {
      ctx.beginPath();
      if (along) {
        ctx.moveTo(a.x + tile * 0.05 + ((w - tile * 0.1) * i) / n, a.y - depth * 0.45);
        ctx.lineTo(a.x + tile * 0.05 + ((w - tile * 0.1) * i) / n, a.y + h - depth * 0.35);
      } else {
        ctx.moveTo(a.x + tile * 0.05, a.y - depth * 0.45 + ((h + depth * 0.1) * i) / n);
        ctx.lineTo(a.x + w - tile * 0.05, a.y - depth * 0.45 + ((h + depth * 0.1) * i) / n);
      }
      ctx.stroke();
    }
    const cx = a.x + w / 2;
    const cy = a.y + h / 2;
    if (plant) {
      const sf = stageFloat(plant.growth);
      this.drawPlantSprite(cx, cy - tile * 0.02, tile * 0.85, plant.defId, plant.variantId, sf, plant.seed, 'pot', now);
      // Along the front of the trough, a thin line fills as the plant comes
      // on toward its next stage, so from across the room a bed reads as
      // "getting there" without a number on it. It goes once the plant is grown.
      if (sf < 4) {
        const frac = sf - Math.floor(sf);
        const bx = a.x + tile * 0.09;
        const bw = w - tile * 0.18;
        const by = a.y + h + depth * 0.42;
        const bh = Math.max(2, tile * 0.05);
        ctx.fillStyle = 'rgba(20,12,6,0.45)';
        ctx.beginPath();
        ctx.roundRect(bx, by, bw, bh, bh / 2);
        ctx.fill();
        if (frac > 0.02) {
          ctx.fillStyle = 'rgba(178,214,120,0.9)';
          ctx.beginPath();
          ctx.roundRect(bx, by, bw * frac, bh, bh / 2);
          ctx.fill();
        }
      }
    }
  }

  private drawHouseRug(camera: Camera, piece: PlacedFurniture) {
    const { ctx } = this;
    const tile = TILE_SIZE * camera.zoom;
    const fp = footprint(piece.kind, piece.x, piece.y, piece.rot ?? 0);
    const a = camera.worldToScreen(fp.x * TILE_SIZE, fp.y * TILE_SIZE);
    const w = fp.w * tile;
    const h = fp.h * tile;
    ctx.fillStyle = '#c9ae7e';
    ctx.beginPath();
    ctx.roundRect(a.x, a.y, w, h, tile * 0.1);
    ctx.fill();
    ctx.strokeStyle = 'rgba(110,80,44,0.45)';
    ctx.lineWidth = Math.max(1, tile * 0.03);
    for (let i = 1; i < 5; i++) {
      ctx.beginPath();
      ctx.roundRect(a.x + (i * tile) / 12, a.y + (i * tile) / 12, w - (i * tile) / 6, h - (i * tile) / 6, tile * 0.06);
      ctx.stroke();
    }
  }

  private drawGrowLamp(camera: Camera, piece: PlacedFurniture, now: number) {
    const { ctx } = this;
    const tile = TILE_SIZE * camera.zoom;
    const s = camera.worldToScreen((piece.x + 0.5) * TILE_SIZE, (piece.y + 0.6) * TILE_SIZE);
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.beginPath();
    ctx.ellipse(s.x, s.y + tile * 0.1, tile * 0.16, tile * 0.05, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#2f2f2c';
    ctx.fillRect(s.x - tile * 0.02, s.y - tile * 1.3, tile * 0.04, tile * 1.4);
    ctx.beginPath();
    ctx.ellipse(s.x, s.y + tile * 0.08, tile * 0.12, tile * 0.04, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#444';
    ctx.beginPath();
    ctx.moveTo(s.x - tile * 0.22, s.y - tile * 1.18);
    ctx.lineTo(s.x + tile * 0.22, s.y - tile * 1.18);
    ctx.lineTo(s.x + tile * 0.1, s.y - tile * 1.38);
    ctx.lineTo(s.x - tile * 0.1, s.y - tile * 1.38);
    ctx.closePath();
    ctx.fill();
    const flicker = 0.92 + 0.08 * Math.sin(now * 0.003 + piece.x);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = `rgba(255,150,210,${0.5 * flicker})`;
    ctx.fillRect(s.x - tile * 0.2, s.y - tile * 1.2, tile * 0.4, tile * 0.04);
    const g = ctx.createRadialGradient(s.x, s.y - tile * 0.4, 0, s.x, s.y - tile * 0.2, tile * 2.6);
    g.addColorStop(0, `rgba(255,160,220,${0.16 * flicker})`);
    g.addColorStop(1, 'rgba(255,160,220,0)');
    ctx.fillStyle = g;
    ctx.fillRect(s.x - tile * 2.6, s.y - tile * 2.8, tile * 5.2, tile * 5.4);
    ctx.restore();
  }

  private drawWateringCan(camera: Camera, piece: PlacedFurniture) {
    const { ctx } = this;
    const tile = TILE_SIZE * camera.zoom;
    const s = camera.worldToScreen((piece.x + 0.5) * TILE_SIZE, (piece.y + 0.6) * TILE_SIZE);
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.beginPath();
    ctx.ellipse(s.x, s.y + tile * 0.06, tile * 0.16, tile * 0.05, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#b8903e';
    ctx.fillRect(s.x - tile * 0.12, s.y - tile * 0.2, tile * 0.24, tile * 0.26);
    ctx.strokeStyle = '#b8903e';
    ctx.lineWidth = Math.max(1.5, tile * 0.04);
    ctx.beginPath();
    ctx.moveTo(s.x + tile * 0.1, s.y - tile * 0.05);
    ctx.lineTo(s.x + tile * 0.28, s.y - tile * 0.28);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(s.x - tile * 0.02, s.y - tile * 0.24, tile * 0.1, Math.PI, 0);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.2)';
    ctx.fillRect(s.x - tile * 0.09, s.y - tile * 0.17, tile * 0.05, tile * 0.18);
  }

  private drawDisplaySlot(camera: Camera, slot: DisplaySlot, plant: OwnedPlant | undefined, now: number, rot = 0) {
    const { ctx } = this;
    const tile = TILE_SIZE * camera.zoom;
    const s = camera.worldToScreen((slot.x + 0.5) * TILE_SIZE, (slot.y + 0.5) * TILE_SIZE);
    let potY = s.y;
    let mode: PlantMode = 'pot';
    switch (slot.kind) {
      case 'stand':
      case 'sunroom': {
        // round wooden plant stand
        ctx.fillStyle = 'rgba(0,0,0,0.22)';
        ctx.beginPath();
        ctx.ellipse(s.x, s.y + tile * 0.32, tile * 0.28, tile * 0.08, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = slot.kind === 'sunroom' ? '#d8cdb4' : '#7a5636';
        for (const dx of [-0.16, 0.13]) ctx.fillRect(s.x + dx * tile, s.y + tile * 0.06, tile * 0.04, tile * 0.28);
        ctx.fillStyle = slot.kind === 'sunroom' ? '#efe6d0' : '#946a44';
        ctx.beginPath();
        ctx.ellipse(s.x, s.y + tile * 0.06, tile * 0.24, tile * 0.07, 0, 0, Math.PI * 2);
        ctx.fill();
        potY = s.y - tile * 0.2;
        break;
      }
      case 'tiered': {
        ctx.fillStyle = '#2f2f2c';
        const rise = (slot.y % 4) * 0.04;
        ctx.fillRect(s.x - tile * 0.3, s.y + tile * 0.1 - rise * tile, tile * 0.6, tile * 0.05);
        ctx.fillRect(s.x - tile * 0.28, s.y + tile * 0.1 - rise * tile, tile * 0.03, tile * (0.25 + rise));
        ctx.fillRect(s.x + tile * 0.25, s.y + tile * 0.1 - rise * tile, tile * 0.03, tile * (0.25 + rise));
        potY = s.y - tile * 0.16 - rise * tile;
        break;
      }
      case 'pedestal': {
        // a tall wrought-iron pedestal, lifting its plant into the light
        ctx.fillStyle = 'rgba(0,0,0,0.22)';
        ctx.beginPath();
        ctx.ellipse(s.x, s.y + tile * 0.32, tile * 0.22, tile * 0.07, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#2f2f2c';
        ctx.beginPath();
        ctx.ellipse(s.x, s.y + tile * 0.28, tile * 0.17, tile * 0.05, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillRect(s.x - tile * 0.03, s.y - tile * 0.32, tile * 0.06, tile * 0.6);
        ctx.strokeStyle = '#2f2f2c';
        ctx.lineWidth = Math.max(1, tile * 0.02);
        for (const side of [-1, 1]) {
          // scrolled brackets under the top
          ctx.beginPath();
          ctx.arc(s.x + side * tile * 0.07, s.y - tile * 0.22, tile * 0.06, side > 0 ? Math.PI : 0, side > 0 ? Math.PI * 1.8 : -Math.PI * 0.8, side < 0);
          ctx.stroke();
        }
        ctx.fillStyle = '#3d3c38';
        ctx.beginPath();
        ctx.ellipse(s.x, s.y - tile * 0.33, tile * 0.2, tile * 0.055, 0, 0, Math.PI * 2);
        ctx.fill();
        potY = s.y - tile * 0.58;
        break;
      }
      case 'trellis': {
        // a cedar lattice panel standing on the floor, rising up the wall behind
        const left = s.x - tile * 0.42;
        const right = s.x + tile * 0.42;
        const top = s.y - tile * 1.75;
        const floor = s.y + tile * 0.3;
        ctx.fillStyle = 'rgba(0,0,0,0.18)';
        ctx.fillRect(left, floor - tile * 0.05, right - left, tile * 0.08);
        ctx.save();
        ctx.beginPath();
        ctx.rect(left, top, right - left, floor - top);
        ctx.clip();
        ctx.strokeStyle = '#a7784a';
        ctx.lineWidth = Math.max(1, tile * 0.03);
        const step = tile * 0.2;
        ctx.beginPath();
        for (let k = -8; k <= 12; k++) {
          const x0 = left + k * step;
          ctx.moveTo(x0, floor);
          ctx.lineTo(x0 + (floor - top), top);
          ctx.moveTo(x0, top);
          ctx.lineTo(x0 + (floor - top), floor);
        }
        ctx.stroke();
        ctx.restore();
        ctx.fillStyle = '#7e5634';
        ctx.fillRect(left - tile * 0.03, top - tile * 0.03, tile * 0.06, floor - top + tile * 0.03);
        ctx.fillRect(right - tile * 0.03, top - tile * 0.03, tile * 0.06, floor - top + tile * 0.03);
        ctx.fillRect(left - tile * 0.03, top - tile * 0.05, right - left + tile * 0.06, tile * 0.06);
        potY = s.y + tile * 0.04;
        if (plant && climbsTrellis(PLANTS[plant.defId]?.form ?? '')) {
          // The vine is its hanging form mirrored upward about the pot rim,
          // clipped so nothing spills below the pot.
          const rim = potY + tile * 0.02;
          ctx.save();
          ctx.beginPath();
          ctx.rect(s.x - tile * 1.2, top - tile * 0.4, tile * 2.4, rim - top + tile * 0.4);
          ctx.clip();
          ctx.translate(0, 2 * rim);
          ctx.scale(1, -1);
          this.drawPlantSprite(s.x, rim, tile * 0.8, plant.defId, plant.variantId, stageFloat(plant.growth), plant.seed, 'hanging', now);
          ctx.restore();
          this.drawPot(s.x, potY, tile, plant.location.kind === 'display' ? plant.location.potId : 'terracotta');
          if (rarityRank(specimenRarity(plant.defId, plant.variantId)) >= 3) this.drawSparkle(s.x, top + tile * 0.4, tile, now, '#ffe9a8', 2);
          return;
        }
        break;
      }
      case 'planter': {
        // A deep glazed floor planter: the plant grows straight in it, bigger than in a pot.
        ctx.fillStyle = 'rgba(0,0,0,0.24)';
        ctx.beginPath();
        ctx.ellipse(s.x, s.y + tile * 0.34, tile * 0.34, tile * 0.09, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#2f5f6a';
        ctx.beginPath();
        ctx.moveTo(s.x - tile * 0.32, s.y - tile * 0.12);
        ctx.lineTo(s.x + tile * 0.32, s.y - tile * 0.12);
        ctx.lineTo(s.x + tile * 0.24, s.y + tile * 0.32);
        ctx.lineTo(s.x - tile * 0.24, s.y + tile * 0.32);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.12)';
        ctx.fillRect(s.x - tile * 0.24, s.y - tile * 0.08, tile * 0.06, tile * 0.34);
        ctx.fillStyle = '#3f7a86';
        ctx.beginPath();
        ctx.ellipse(s.x, s.y - tile * 0.12, tile * 0.33, tile * 0.09, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#3d2a1a';
        ctx.beginPath();
        ctx.ellipse(s.x, s.y - tile * 0.11, tile * 0.27, tile * 0.065, 0, 0, Math.PI * 2);
        ctx.fill();
        if (!plant) return;
        this.drawPlantSprite(s.x, s.y - tile * 0.1, tile * 1.18, plant.defId, plant.variantId, stageFloat(plant.growth), plant.seed, 'pot', now);
        if (rarityRank(specimenRarity(plant.defId, plant.variantId)) >= 3) this.drawSparkle(s.x, s.y - tile * 0.8, tile, now, '#ffe9a8', 2);
        return;
      }
      case 'table': {
        // A scrubbed potting table, long side facing us or turned end-on.
        const long = rot % 2 === 0;
        const hw = (long ? 0.65 : 0.28) * tile;
        const hd = (long ? 0.28 : 0.65) * tile;
        const top = s.y + tile * 0.06 - hd * 0.6;
        ctx.fillStyle = 'rgba(0,0,0,0.22)';
        ctx.fillRect(s.x - hw, s.y + tile * 0.06 + hd * 0.55, hw * 2, tile * 0.08);
        ctx.fillStyle = '#6b4a2e';
        for (const lx of [-hw + tile * 0.05, hw - tile * 0.1]) ctx.fillRect(s.x + lx, top + hd * 0.9, tile * 0.05, tile * 0.32);
        ctx.fillStyle = '#b89468';
        ctx.fillRect(s.x - hw, top, hw * 2, hd * 1.2);
        ctx.fillStyle = '#9a7650';
        ctx.fillRect(s.x - hw, top + hd * 1.2, hw * 2, tile * 0.07);
        ctx.fillStyle = 'rgba(80,56,30,0.35)';
        ctx.fillRect(s.x - hw * 0.6, top + hd * 0.4, tile * 0.12, tile * 0.05);
        potY = top + hd * 0.35;
        break;
      }
      case 'shelf': {
        ctx.fillStyle = '#6b4a2e';
        ctx.fillRect(s.x - tile * 0.45, s.y + tile * 0.08, tile * 0.9, tile * 0.08);
        ctx.fillStyle = '#4a3220';
        ctx.fillRect(s.x - tile * 0.45, s.y + tile * 0.16, tile * 0.08, tile * 0.14);
        potY = s.y - tile * 0.18;
        break;
      }
      case 'hanging': {
        const sway = Math.sin(now * 0.0012 + slot.x) * tile * 0.02;
        ctx.strokeStyle = 'rgba(60,50,40,0.7)';
        ctx.lineWidth = 1;
        potY = s.y - tile * 0.35;
        ctx.beginPath();
        ctx.moveTo(s.x + sway, s.y - tile * 1.0);
        ctx.lineTo(s.x + sway - tile * 0.14, potY);
        ctx.moveTo(s.x + sway, s.y - tile * 1.0);
        ctx.lineTo(s.x + sway + tile * 0.14, potY);
        ctx.stroke();
        mode = 'hanging';
        if (!plant) {
          ctx.fillStyle = '#5a4030';
          ctx.beginPath();
          ctx.arc(s.x + sway, s.y - tile * 1.0, tile * 0.03, 0, Math.PI * 2);
          ctx.fill();
          return;
        }
        this.drawPot(s.x + sway, potY, tile, plant.location.kind === 'display' ? plant.location.potId : 'terracotta', 0.9);
        this.drawPlantSprite(s.x + sway, potY + tile * 0.02, tile * 0.9, plant.defId, plant.variantId, stageFloat(plant.growth), plant.seed, mode, now);
        return;
      }
    }
    if (!plant) {
      // An empty spot waiting for something special.
      ctx.strokeStyle = 'rgba(240,230,200,0.25)';
      ctx.setLineDash([3, 3]);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(s.x, potY + tile * 0.12, tile * 0.18, tile * 0.07, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      return;
    }
    const potId = plant.location.kind === 'display' ? plant.location.potId : 'terracotta';
    this.drawPot(s.x, potY, tile, potId);
    this.drawPlantSprite(s.x, potY + tile * 0.02, tile, plant.defId, plant.variantId, stageFloat(plant.growth), plant.seed, mode, now);
    if (rarityRank(specimenRarity(plant.defId, plant.variantId)) >= 3) this.drawSparkle(s.x, potY - tile * 0.5, tile, now, '#ffe9a8', 2);
  }

  /**
   * Junk stacked in the sun room until it's cleared out: a big slatted crate
   * with more piled on top — another crate, a tower of old pots, a slumped
   * sack — different in each corner, so it reads as storage, not furniture.
   */
  private drawCrate(camera: Camera, x: number, y: number) {
    const { ctx } = this;
    const tile = TILE_SIZE * camera.zoom;
    const o = camera.worldToScreen(x * TILE_SIZE, y * TILE_SIZE);
    const X = (u: number) => o.x + u * tile;
    const Y = (v: number) => o.y + v * tile;
    const line = Math.max(1, tile * 0.025);

    /** A slatted crate in three-quarter view: its top face, then the front face below it. */
    const crate = (x0: number, x1: number, top: number, face: number, depth: number, wood: string) => {
      ctx.fillStyle = lerpColor(wood, '#e8d6b4', 0.22);
      ctx.fillRect(X(x0), Y(top), (x1 - x0) * tile, depth * tile);
      ctx.fillStyle = wood;
      ctx.fillRect(X(x0), Y(top + depth), (x1 - x0) * tile, face * tile);
      ctx.strokeStyle = 'rgba(40,26,14,0.55)';
      ctx.lineWidth = line;
      ctx.strokeRect(X(x0), Y(top), (x1 - x0) * tile, (depth + face) * tile);
      ctx.beginPath();
      // Slats on the front, boards on the lid.
      for (let k = 1; k < 3; k++) {
        const yy = Y(top + depth + (face * k) / 3);
        ctx.moveTo(X(x0), yy);
        ctx.lineTo(X(x1), yy);
      }
      ctx.moveTo(X(x0), Y(top + depth));
      ctx.lineTo(X(x1), Y(top + depth));
      ctx.moveTo(X((x0 + x1) / 2), Y(top));
      ctx.lineTo(X((x0 + x1) / 2), Y(top + depth));
      ctx.stroke();
      // Corner battens.
      ctx.fillStyle = 'rgba(40,26,14,0.35)';
      ctx.fillRect(X(x0), Y(top + depth), tile * 0.05, face * tile);
      ctx.fillRect(X(x1) - tile * 0.05, Y(top + depth), tile * 0.05, face * tile);
    };

    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath();
    ctx.ellipse(X(0.5), Y(0.9), tile * 0.48, tile * 0.1, 0, 0, Math.PI * 2);
    ctx.fill();
    // The big crate everything else is piled on.
    crate(0.06, 0.94, 0.3, 0.6, 0.18, '#7c5c3a');

    switch (Math.abs(Math.round(x * 7 + y * 3)) % 4) {
      case 0:
        // A smaller crate on top, pushed to one side.
        crate(0.12, 0.66, -0.12, 0.3, 0.14, '#8b6a44');
        break;
      case 1: {
        // A tower of old terracotta pots, and a trowel.
        for (let k = 0; k < 4; k++) {
          const cy = 0.26 - k * 0.1;
          ctx.fillStyle = k % 2 ? '#b8653e' : '#a85a36';
          ctx.beginPath();
          ctx.moveTo(X(0.3), Y(cy));
          ctx.lineTo(X(0.7), Y(cy));
          ctx.lineTo(X(0.64), Y(cy + 0.12));
          ctx.lineTo(X(0.36), Y(cy + 0.12));
          ctx.closePath();
          ctx.fill();
          ctx.fillStyle = '#cf7a4f';
          ctx.fillRect(X(0.28), Y(cy - 0.02), tile * 0.44, tile * 0.04);
        }
        ctx.strokeStyle = '#6b6e70';
        ctx.lineWidth = Math.max(1, tile * 0.04);
        ctx.beginPath();
        ctx.moveTo(X(0.72), Y(0.38));
        ctx.lineTo(X(0.88), Y(0.3));
        ctx.stroke();
        break;
      }
      case 2: {
        // A slumped sack of old potting mix, and a coil of twine.
        ctx.fillStyle = '#b89a66';
        ctx.beginPath();
        ctx.moveTo(X(0.14), Y(0.36));
        ctx.quadraticCurveTo(X(0.12), Y(-0.02), X(0.36), Y(-0.06));
        ctx.quadraticCurveTo(X(0.52), Y(-0.02), X(0.6), Y(0.1));
        ctx.quadraticCurveTo(X(0.68), Y(0.3), X(0.62), Y(0.36));
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = 'rgba(60,44,20,0.45)';
        ctx.lineWidth = line;
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(X(0.3), Y(-0.02));
        ctx.lineTo(X(0.42), Y(-0.1));
        ctx.stroke();
        ctx.strokeStyle = '#c9b48a';
        ctx.lineWidth = Math.max(1, tile * 0.03);
        for (const r of [0.09, 0.06, 0.03]) {
          ctx.beginPath();
          ctx.ellipse(X(0.78), Y(0.3), r * tile, r * tile * 0.6, 0, 0, Math.PI * 2);
          ctx.stroke();
        }
        break;
      }
      default:
        // Two more crates, the top one askew, and a rolled-up old rug leaning on the pile.
        crate(0.1, 0.62, -0.08, 0.26, 0.14, '#8b6a44');
        ctx.save();
        ctx.translate(X(0.62), Y(-0.2));
        ctx.rotate(0.12);
        ctx.translate(-X(0.62), -Y(-0.2));
        crate(0.42, 0.84, -0.34, 0.22, 0.12, '#6f5234');
        ctx.restore();
        ctx.fillStyle = '#9a4a3a';
        ctx.fillRect(X(0.8), Y(-0.1), tile * 0.1, tile * 0.95);
        ctx.fillStyle = '#d9b27c';
        ctx.fillRect(X(0.8), Y(0.12), tile * 0.1, tile * 0.04);
        ctx.fillRect(X(0.8), Y(0.5), tile * 0.1, tile * 0.04);
        break;
    }
  }

  private drawGrowLights(camera: Camera, now: number) {
    const { ctx } = this;
    const tile = TILE_SIZE * camera.zoom;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const [lx, ly] of [
      [3, 3],
      [5, 3],
      [12, 4],
      [12, 7],
    ] as const) {
      const s = camera.worldToScreen(lx * TILE_SIZE, ly * TILE_SIZE);
      const flicker = 0.9 + 0.1 * Math.sin(now * 0.003 + lx);
      const g = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, tile * 2.2);
      g.addColorStop(0, `rgba(255,170,220,${0.12 * flicker})`);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(s.x - tile * 2.2, s.y - tile * 2.2, tile * 4.4, tile * 4.4);
    }
    ctx.restore();
  }
}
