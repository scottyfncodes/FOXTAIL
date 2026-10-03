import type { GameState, OwnedPlant } from '../state';
import { RAISED_BED, type DecorId, type FurnitureId } from '../data/shop';
import { FURNITURE_DEFS, furnitureTurn } from '../data/furniture';
import {
  allFurniture,
  findFurniture,
  footprint,
  moveFurniture,
  pickUpFurniture,
  placeFurniture,
  rotateFurniture,
  sitBlockReason,
  type PlaceBlock,
} from '../systems/furniture';
import {
  bedBlockReason,
  bedCost,
  checkPlanting,
  createBed,
  clearingSpecOf,
  createClearing,
  createPath,
  previewClearing,
  placeRaisedBed,
  normRect,
  previewPath,
  simplifyRoute,
  transplant,
  type BedBlock,
  type BedResult,
  type ClearingPreview,
  type ClearingResult,
  type ClearingShape,
  type ClearingSpec,
  type LandscapeWorld,
  type PathPreview,
  type PathResult,
  type PlantingCheck,
} from '../systems/landscape';
import { plantOutdoors } from '../systems/propagation';
import { pickUpDecor, rotateDecor, nextPondSize } from '../systems/decor';
import { decorTurn } from '../data/decor';
import { nextRot } from '../data/turn';
import {
  STALL_ID,
  findYardPiece,
  moveYardPiece,
  placeYardDecor,
  snapYard,
  worldOpenGround,
  yardBlockReason,
  decorBlockReason,
  yardFootprint,
  yardPieces,
  type OpenGround,
  type YardBlock,
} from '../systems/yard';

// The player's finger is the gardening tool. Every way of changing the
// world by hand — choosing exactly where a plant goes, dragging furniture
// around the house, marking out a garden bed, tracing a path — runs through
// this one small state machine, in world coordinates, so it can be driven
// the same way by touch, a mouse, or a test.
//
//   play ──▶ plant    drag the preview to a spot ─▶ ✓ plant / ✕ cancel
//        ──▶ arrange  drag any piece; tap to select, turn, store; add from stock
//        ──▶ yard     the same, outdoors: garden decor and the market stall
//        ──▶ bed      drag out a rectangle or oval ─▶ ✓ dig / ✕
//        ──▶ path     trace a route with a finger ─▶ ✓ carve / ✕
//        ──▶ clear    drag out a square or circle ─▶ ✓ clear / ✕

export interface PlantGhost {
  defId: string;
  variantId: string;
  seed: number;
  growth: number;
}

export type ToolMode =
  | { kind: 'play' }
  | {
      kind: 'plant';
      /** A basket item being planted out, or a young outdoor plant being moved. */
      uid: string | null;
      plantId: string | null;
      ghost: PlantGhost;
      x: number;
      y: number;
      check: PlantingCheck;
      dragging: boolean;
    }
  | {
      kind: 'arrange';
      selectedId: string | null;
      /** The piece being dragged and where it would land. */
      drag: { id: string; offX: number; offY: number; x: number; y: number; block: PlaceBlock | null; moved: boolean } | null;
      /** A new piece from stock, not yet set down. */
      pending: { kind: FurnitureId; x: number; y: number; rot: number; block: PlaceBlock | null } | null;
      pendingDrag: { offX: number; offY: number } | null;
    }
  | {
      kind: 'yard';
      selectedId: string | null;
      drag: { id: string; offX: number; offY: number; x: number; y: number; block: YardBlock | null; moved: boolean } | null;
      /** A piece of decor from stock, not yet set down. */
      pending: { decorId: DecorId; x: number; y: number; rot: number; block: YardBlock | null } | null;
      pendingDrag: { offX: number; offY: number } | null;
    }
  | { kind: 'bed'; shape: 'rect' | 'oval'; a: { x: number; y: number } | null; b: { x: number; y: number } | null; block: BedBlock | null; drawing: boolean }
  | { kind: 'path'; route: { x: number; y: number }[]; points: number[]; preview: PathPreview | null; drawing: boolean }
  | { kind: 'clear'; shape: ClearingShape; a: { x: number; y: number } | null; b: { x: number; y: number } | null; preview: ClearingPreview | null; drawing: boolean };

export interface ToolHost {
  state: GameState;
  world: LandscapeWorld;
  now(): number;
  /** Where Ellen is standing (world or interior coords, whichever she's in). */
  player(): { x: number; y: number };
  /** Open outdoor ground a garden piece could stand on; defaults to what the landscape alone says. */
  openGround?: OpenGround;
}

export type ToolOutcome =
  | { kind: 'planted'; plant: OwnedPlant }
  | { kind: 'transplanted'; plantId: string }
  | { kind: 'placed'; id: string }
  | { kind: 'bed'; result: BedResult }
  | { kind: 'path'; result: PathResult }
  | { kind: 'clearing'; result: ClearingResult }
  | { kind: 'none'; reason?: string };

/** What a press did: grabbed something, or should pan the view. */
export type PressResult = 'grab' | 'pan' | 'draw' | 'none';

/** Touch targets are generous: anything within this of a piece's footprint grabs it. */
const GRAB_SLOP = 0.28;

export class ToolController {
  mode: ToolMode = { kind: 'play' };
  onChange: (() => void) | null = null;

  constructor(private host: ToolHost) {}

  private get open(): OpenGround {
    return this.host.openGround ?? worldOpenGround(this.host.world);
  }

  get active(): boolean {
    return this.mode.kind !== 'play';
  }

  private changed() {
    this.onChange?.();
  }

  cancel() {
    this.mode = { kind: 'play' };
    this.changed();
  }

  // ------------------------------------------------------------ planting

  /** Starts choosing a spot for a basket plant, beginning at (x, y). */
  startPlanting(uid: string, x: number, y: number): boolean {
    const item = this.host.state.basket.find((b) => b.uid === uid);
    if (!item) return false;
    const ghost = { defId: item.defId, variantId: item.variantId, seed: item.seed, growth: Math.max(item.growth, 200) };
    this.mode = { kind: 'plant', uid, plantId: null, ghost, x, y, check: this.checkAt(ghost.defId, x, y, null), dragging: false };
    this.changed();
    return true;
  }

  /** Starts moving a young outdoor plant somewhere else. */
  startTransplant(plantId: string): boolean {
    const p = this.host.state.plants[plantId];
    if (!p || p.location.kind !== 'wild') return false;
    const { x, y } = p.location;
    const ghost = { defId: p.defId, variantId: p.variantId, seed: p.seed, growth: p.growth };
    this.mode = { kind: 'plant', uid: null, plantId, ghost, x, y, check: this.checkAt(ghost.defId, x, y, plantId), dragging: false };
    this.changed();
    return true;
  }

  private checkAt(defId: string, x: number, y: number, ignoreId: string | null): PlantingCheck {
    return checkPlanting(this.host.state, defId, x, y, this.host.world, this.host.now(), { ignoreId: ignoreId ?? undefined });
  }

  private movePlantGhost(x: number, y: number) {
    const m = this.mode;
    if (m.kind !== 'plant') return;
    // Positions are kept to a twentieth of a tile: precise, but tidy in the save.
    m.x = Math.round(x * 20) / 20;
    m.y = Math.round(y * 20) / 20;
    m.check = this.checkAt(m.ghost.defId, m.x, m.y, m.plantId);
  }

  // ------------------------------------------------------------ arranging

  startArrange(withStock?: FurnitureId, at?: { x: number; y: number }) {
    this.mode = { kind: 'arrange', selectedId: null, drag: null, pending: null, pendingDrag: null };
    if (withStock) this.addFromStock(withStock, at ?? this.host.player());
    this.changed();
  }

  /** Picks out one piece, ready to drag, turn or put away. */
  select(id: string) {
    const m = this.mode;
    if (m.kind === 'yard') {
      if (!findYardPiece(this.host.state, id)) return;
    } else if (m.kind !== 'arrange' || !findFurniture(this.host.state, id)) return;
    m.selectedId = id;
    m.pending = null;
    this.changed();
  }

  /** Takes a piece out of stock and holds it, ready to be dragged into place. */
  addFromStock(kind: FurnitureId, at: { x: number; y: number }) {
    const m = this.mode;
    if (m.kind !== 'arrange' || (this.host.state.furnitureStock[kind] ?? 0) <= 0) return;
    const x = Math.round((at.x - 0.5) * 8) / 8;
    const y = Math.round((at.y - 0.5) * 8) / 8;
    m.pending = { kind, x, y, rot: 0, block: null };
    m.selectedId = null;
    m.pending.block = this.pendingBlock();
    this.changed();
  }

  private pendingBlock(): PlaceBlock | null {
    const m = this.mode;
    if (m.kind !== 'arrange' || !m.pending) return null;
    return sitBlockReason(this.host.state, m.pending.kind, m.pending.x, m.pending.y, { rot: m.pending.rot, avoid: [this.host.player()] });
  }

  /** The piece under a press, with generous slop for fingers. Hanging pieces are grabbed by their pot, up in the air. */
  pieceAt(x: number, y: number): string | null {
    let best: string | null = null;
    let bestD = Infinity;
    for (const f of allFurniture(this.host.state)) {
      const def = FURNITURE_DEFS[f.kind];
      const fp = footprint(f.kind, f.x, f.y, f.rot ?? 0);
      const lift = def.layer === 'overhead' ? 0.75 : def.slotKind === 'trellis' ? 0.6 : 0.2;
      const cx = fp.x + fp.w / 2;
      const cy = fp.y + fp.h / 2 - lift;
      const inX = Math.abs(x - cx) <= fp.w / 2 + GRAB_SLOP;
      const inY = Math.abs(y - cy) <= fp.h / 2 + GRAB_SLOP + lift;
      if (!inX || !inY) continue;
      // Prefer overhead pieces when pressing high, rugs last.
      const d = Math.hypot(x - cx, y - cy) + (def.layer === 'flat' ? 2 : 0);
      if (d < bestD) {
        bestD = d;
        best = f.id;
      }
    }
    return best;
  }

  rotateSelected(): boolean {
    const m = this.mode;
    if (m.kind === 'yard') return this.rotateYardSelected();
    if (m.kind !== 'arrange') return false;
    if (m.pending) {
      m.pending.rot = nextRot(furnitureTurn(m.pending.kind), m.pending.rot);
      m.pending.block = this.pendingBlock();
      this.changed();
      return true;
    }
    if (!m.selectedId) return false;
    const ok = rotateFurniture(this.host.state, m.selectedId, [this.host.player()]);
    this.changed();
    return ok;
  }

  /** Puts the selected (empty) piece back into stock. */
  storeSelected(): boolean {
    const m = this.mode;
    if (m.kind === 'yard') return this.storeYardSelected();
    if (m.kind !== 'arrange') return false;
    if (m.pending) {
      m.pending = null;
      this.changed();
      return true;
    }
    if (!m.selectedId) return false;
    const ok = pickUpFurniture(this.host.state, m.selectedId);
    if (ok) m.selectedId = null;
    this.changed();
    return ok;
  }

  // ------------------------------------------------------------ the yard

  startYard(withStock?: DecorId, at?: { x: number; y: number }) {
    this.mode = { kind: 'yard', selectedId: null, drag: null, pending: null, pendingDrag: null };
    if (withStock) this.addDecorFromStock(withStock, at ?? this.host.player());
    this.changed();
  }

  /** Takes a piece of garden decor out of stock and holds it, ready to be dragged into place. */
  addDecorFromStock(decorId: DecorId, at: { x: number; y: number }) {
    const m = this.mode;
    if (m.kind !== 'yard' || (this.host.state.decorStock[decorId] ?? 0) <= 0) return;
    const { x, y } = snapYard(decorId, at.x, at.y);
    m.pending = { decorId, x, y, rot: 0, block: null };
    m.selectedId = null;
    m.pending.block = this.decorPendingBlock(decorId, x, y, 0);
    this.changed();
  }

  /** The garden piece under a press. Decor and the stall stand up off the ground, so pressing what's drawn counts. */
  yardPieceAt(x: number, y: number): string | null {
    let best: string | null = null;
    let bestD = Infinity;
    for (const p of yardPieces(this.host.state)) {
      const fp = yardFootprint(p.kind, p.x, p.y, p.rot ?? 0, p.size);
      const lift = p.kind === 'stall' ? 0.45 : 0.25;
      const cx = fp.x + fp.w / 2;
      const cy = fp.y + fp.h / 2 - lift;
      if (Math.abs(x - cx) > fp.w / 2 + GRAB_SLOP || Math.abs(y - cy) > fp.h / 2 + GRAB_SLOP + lift) continue;
      // Small pieces win over the big stall when both are under the finger.
      const d = Math.hypot(x - cx, y - cy) + (p.kind === 'stall' ? 0.5 : 0);
      if (d < bestD) {
        bestD = d;
        best = p.id;
      }
    }
    return best;
  }

  /** Turns the garden piece in hand or picked out: a quarter-turn for one with a long side, round the other way for a standing one or the stall. */
  private rotateYardSelected(): boolean {
    const m = this.mode;
    if (m.kind !== 'yard') return false;
    if (m.pending) {
      m.pending.rot = nextRot(decorTurn(m.pending.decorId), m.pending.rot);
      m.pending.block = this.decorPendingBlock(m.pending.decorId, m.pending.x, m.pending.y, m.pending.rot);
      this.changed();
      return true;
    }
    if (!m.selectedId) return false;
    if (m.selectedId === STALL_ID) {
      // The stall turns round to face the other way.
      const st = this.host.state.stall;
      st.rot = nextRot('mirror', st.rot ?? 0);
      if (!st.rot) delete st.rot;
      this.changed();
      return true;
    }
    const ok = rotateDecor(this.host.state, m.selectedId);
    this.changed();
    return ok;
  }

  private storeYardSelected(): boolean {
    const m = this.mode;
    if (m.kind !== 'yard') return false;
    if (m.pending) {
      m.pending = null;
      this.changed();
      return true;
    }
    // The stall stays: there's nowhere to put a market away.
    if (!m.selectedId || m.selectedId === STALL_ID) return false;
    const ok = pickUpDecor(this.host.state, m.selectedId);
    if (ok) m.selectedId = null;
    this.changed();
    return ok;
  }

  // ------------------------------------------------------------ beds & paths

  startBed(shape: 'rect' | 'oval' = 'rect') {
    this.mode = { kind: 'bed', shape, a: null, b: null, block: null, drawing: false };
    this.changed();
  }

  setBedShape(shape: 'rect' | 'oval') {
    const m = this.mode;
    if (m.kind !== 'bed') return;
    m.shape = shape;
    this.updateBed();
    this.changed();
  }

  bedSpec() {
    const m = this.mode;
    if (m.kind !== 'bed' || !m.a || !m.b) return null;
    const r = normRect(m.a.x, m.a.y, m.b.x, m.b.y);
    const q = (v: number) => Math.round(v * 4) / 4;
    return { x: q(r.x), y: q(r.y), w: q(r.w), h: q(r.h), shape: m.shape };
  }

  bedCost(): number | null {
    const spec = this.bedSpec();
    return spec ? bedCost(this.host.state, spec.w, spec.h) : null;
  }

  /** A raised bed from stock stands where a bed could be dug; other decor where a piece could stand. */
  /** A raised bed's size as it stands or turned end-on. */
  private raisedBedSize(rot: number): { w: number; h: number } {
    return rot % 2 === 1 ? { w: RAISED_BED.h, h: RAISED_BED.w } : RAISED_BED;
  }

  private decorPendingBlock(decorId: DecorId, x: number, y: number, rot: number) {
    if (decorId === 'raisedBed') {
      const size = this.raisedBedSize(rot);
      const spec = { x: Math.round((x - size.w / 2) * 4) / 4, y: Math.round((y - size.h / 2) * 4) / 4, w: size.w, h: size.h, shape: 'rect' as const, raised: true };
      return bedBlockReason(this.host.state, spec, this.host.world) ? ('ground' as const) : null;
    }
    return decorBlockReason(this.host.state, this.open, x, y);
  }

  private updateBed() {
    const m = this.mode;
    if (m.kind !== 'bed') return;
    const spec = this.bedSpec();
    m.block = spec ? bedBlockReason(this.host.state, spec, this.host.world) : null;
  }

  startPath() {
    this.mode = { kind: 'path', route: [], points: [], preview: null, drawing: false };
    this.changed();
  }

  private updatePath() {
    const m = this.mode;
    if (m.kind !== 'path') return;
    m.points = simplifyRoute(m.route);
    m.preview = m.points.length >= 2 ? previewPath(this.host.state, m.points, this.host.world) : null;
  }

  startClearing(shape: ClearingShape = 'square') {
    this.mode = { kind: 'clear', shape, a: null, b: null, preview: null, drawing: false };
    this.changed();
  }

  setClearingShape(shape: ClearingShape) {
    const m = this.mode;
    if (m.kind !== 'clear') return;
    m.shape = shape;
    this.updateClearing();
    this.changed();
  }

  /** The square (or the circle's bounding square) dragged out from where the press began. */
  clearingSpec(): ClearingSpec | null {
    const m = this.mode;
    if (m.kind !== 'clear' || !m.a || !m.b) return null;
    return clearingSpecOf(m.a, m.b, m.shape);
  }

  private updateClearing() {
    const m = this.mode;
    if (m.kind !== 'clear') return;
    const spec = this.clearingSpec();
    m.preview = spec ? previewClearing(this.host.state, spec, this.host.world) : null;
  }

  // ------------------------------------------------------------ pointer

  pointerDown(x: number, y: number): PressResult {
    const m = this.mode;
    switch (m.kind) {
      case 'plant':
        m.dragging = true;
        this.movePlantGhost(x, y);
        this.changed();
        return 'grab';
      case 'arrange': {
        if (m.pending) {
          const fp = footprint(m.pending.kind, m.pending.x, m.pending.y, m.pending.rot);
          const near = Math.abs(x - (fp.x + fp.w / 2)) <= fp.w / 2 + GRAB_SLOP + 0.3 && Math.abs(y - (fp.y + fp.h / 2 - 0.2)) <= fp.h / 2 + GRAB_SLOP + 0.5;
          if (near) {
            m.pendingDrag = { offX: m.pending.x - x, offY: m.pending.y - y };
            return 'grab';
          }
          return 'pan';
        }
        const id = this.pieceAt(x, y);
        if (!id) {
          if (m.selectedId) {
            m.selectedId = null;
            this.changed();
          }
          return 'pan';
        }
        const piece = findFurniture(this.host.state, id)!;
        m.selectedId = id;
        m.drag = { id, offX: piece.x - x, offY: piece.y - y, x: piece.x, y: piece.y, block: null, moved: false };
        this.changed();
        return 'grab';
      }
      case 'yard': {
        if (m.pending) {
          const fp = yardFootprint(m.pending.decorId, m.pending.x, m.pending.y, m.pending.rot, m.pending.decorId === 'gardenPond' ? nextPondSize(this.host.state) : undefined);
          const near = Math.abs(x - (fp.x + fp.w / 2)) <= fp.w / 2 + GRAB_SLOP + 0.3 && Math.abs(y - (fp.y + fp.h / 2 - 0.25)) <= fp.h / 2 + GRAB_SLOP + 0.5;
          if (near) {
            m.pendingDrag = { offX: m.pending.x - x, offY: m.pending.y - y };
            return 'grab';
          }
          return 'pan';
        }
        const id = this.yardPieceAt(x, y);
        if (!id) {
          if (m.selectedId) {
            m.selectedId = null;
            this.changed();
          }
          return 'pan';
        }
        const piece = findYardPiece(this.host.state, id)!;
        m.selectedId = id;
        m.drag = { id, offX: piece.x - x, offY: piece.y - y, x: piece.x, y: piece.y, block: null, moved: false };
        this.changed();
        return 'grab';
      }
      case 'bed':
        m.a = { x, y };
        m.b = { x, y };
        m.drawing = true;
        this.updateBed();
        this.changed();
        return 'draw';
      case 'path':
        m.route = [{ x, y }];
        m.drawing = true;
        this.updatePath();
        this.changed();
        return 'draw';
      case 'clear':
        m.a = { x, y };
        m.b = { x, y };
        m.drawing = true;
        this.updateClearing();
        this.changed();
        return 'draw';
      default:
        return 'none';
    }
  }

  pointerMove(x: number, y: number) {
    const m = this.mode;
    switch (m.kind) {
      case 'plant':
        if (!m.dragging) return;
        this.movePlantGhost(x, y);
        break;
      case 'arrange':
        if (m.pending && m.pendingDrag) {
          m.pending.x = Math.round((x + m.pendingDrag.offX) * 8) / 8;
          m.pending.y = Math.round((y + m.pendingDrag.offY) * 8) / 8;
          m.pending.block = this.pendingBlock();
        } else if (m.drag) {
          const piece = findFurniture(this.host.state, m.drag.id);
          if (!piece) return;
          m.drag.x = Math.round((x + m.drag.offX) * 8) / 8;
          m.drag.y = Math.round((y + m.drag.offY) * 8) / 8;
          m.drag.moved = m.drag.moved || Math.hypot(m.drag.x - piece.x, m.drag.y - piece.y) > 0.1;
          m.drag.block = sitBlockReason(this.host.state, piece.kind, m.drag.x, m.drag.y, { rot: piece.rot ?? 0, ignoreId: piece.id, avoid: [this.host.player()] });
        } else return;
        break;
      case 'yard':
        if (m.pending && m.pendingDrag) {
          const at = snapYard(m.pending.decorId, x + m.pendingDrag.offX, y + m.pendingDrag.offY);
          m.pending.x = at.x;
          m.pending.y = at.y;
          m.pending.block = this.decorPendingBlock(m.pending.decorId, at.x, at.y, m.pending.rot);
        } else if (m.drag) {
          const piece = findYardPiece(this.host.state, m.drag.id);
          if (!piece) return;
          const at = snapYard(piece.id, x + m.drag.offX, y + m.drag.offY);
          m.drag.x = at.x;
          m.drag.y = at.y;
          m.drag.moved = m.drag.moved || Math.hypot(at.x - piece.x, at.y - piece.y) > 0.1;
          m.drag.block = yardBlockReason(this.host.state, this.open, piece.id, at.x, at.y, [this.host.player()]);
        } else return;
        break;
      case 'bed':
        if (!m.drawing) return;
        m.b = { x, y };
        this.updateBed();
        break;
      case 'clear':
        if (!m.drawing) return;
        m.b = { x, y };
        this.updateClearing();
        break;
      case 'path': {
        if (!m.drawing) return;
        const last = m.route[m.route.length - 1];
        if (last && Math.hypot(x - last.x, y - last.y) < 0.2) return;
        m.route.push({ x, y });
        this.updatePath();
        break;
      }
      default:
        return;
    }
    this.changed();
  }

  /** Ends a press. In arrange mode a drag drops the piece — or, if it can't go there, it springs back. */
  pointerUp(x: number, y: number): ToolOutcome {
    const m = this.mode;
    switch (m.kind) {
      case 'plant':
        if (m.dragging) this.movePlantGhost(x, y);
        m.dragging = false;
        break;
      case 'arrange':
        if (m.pendingDrag) {
          m.pendingDrag = null;
        } else if (m.drag) {
          const d = m.drag;
          m.drag = null;
          if (d.moved && !d.block) {
            moveFurniture(this.host.state, d.id, d.x, d.y, { avoid: [this.host.player()] });
            this.changed();
            return { kind: 'placed', id: d.id };
          }
        }
        break;
      case 'yard':
        if (m.pendingDrag) {
          m.pendingDrag = null;
        } else if (m.drag) {
          const d = m.drag;
          m.drag = null;
          if (d.moved && !d.block && moveYardPiece(this.host.state, this.open, d.id, d.x, d.y, [this.host.player()])) {
            this.changed();
            return { kind: 'placed', id: d.id };
          }
        }
        break;
      case 'bed':
      case 'clear':
        m.drawing = false;
        break;
      case 'path':
        m.drawing = false;
        this.updatePath();
        break;
    }
    this.changed();
    return { kind: 'none' };
  }

  /**
   * Abandons a press without doing anything (a second finger turned it into
   * a pinch, or the system cancelled the touch): a dragged piece stays where
   * it was, a half-drawn bed or path is discarded, and the selection goes back
   * to what it was before the press.
   */
  cancelPress(restoreSelected?: string | null) {
    const m = this.mode;
    switch (m.kind) {
      case 'plant':
        m.dragging = false;
        break;
      case 'arrange':
      case 'yard':
        m.drag = null;
        m.pendingDrag = null;
        if (restoreSelected !== undefined) m.selectedId = restoreSelected;
        break;
      case 'bed':
        if (m.drawing) {
          m.drawing = false;
          m.a = null;
          m.b = null;
          m.block = null;
        }
        break;
      case 'path':
        if (m.drawing) {
          m.drawing = false;
          m.route = [];
          m.points = [];
          m.preview = null;
        }
        break;
      case 'clear':
        if (m.drawing) {
          m.drawing = false;
          m.a = null;
          m.b = null;
          m.preview = null;
        }
        break;
    }
    this.changed();
  }

  // ------------------------------------------------------------ confirm

  /** Whether ✓ would do something right now. */
  canConfirm(): boolean {
    const m = this.mode;
    switch (m.kind) {
      case 'plant':
        return !m.check.block;
      case 'arrange':
      case 'yard':
        return !m.pending || !m.pending.block;
      case 'bed':
        return !!m.a && !!m.b && !m.block;
      case 'path':
      case 'clear':
        return !!m.preview && !m.preview.block;
      default:
        return false;
    }
  }

  /** ✓: commits whatever is being set up. Arranging stays open afterwards; everything else returns to play. */
  confirm(): ToolOutcome {
    const m = this.mode;
    const state = this.host.state;
    const now = this.host.now();
    if (!this.canConfirm()) return { kind: 'none', reason: 'blocked' };
    let out: ToolOutcome = { kind: 'none' };
    switch (m.kind) {
      case 'plant': {
        if (m.plantId) {
          if (transplant(state, m.plantId, m.x, m.y, this.host.world, now)) out = { kind: 'transplanted', plantId: m.plantId };
        } else if (m.uid && m.check.zone) {
          const plant = plantOutdoors(state, m.uid, m.x, m.y, m.check.zone, now);
          if (plant) {
            if (m.check.bedId && plant.location.kind === 'wild') plant.location.bedId = m.check.bedId;
            out = { kind: 'planted', plant };
          }
        }
        this.mode = { kind: 'play' };
        break;
      }
      case 'arrange': {
        if (m.pending) {
          const p = placeFurniture(state, m.pending.kind, m.pending.x, m.pending.y, { rot: m.pending.rot, avoid: [this.host.player()] });
          if (p) out = { kind: 'placed', id: p.id };
          m.pending = null;
          if (p) m.selectedId = p.id;
          this.changed();
          return out;
        }
        this.mode = { kind: 'play' };
        break;
      }
      case 'yard': {
        if (m.pending) {
          if (m.pending.decorId === 'raisedBed') {
            const res = placeRaisedBed(state, m.pending.x, m.pending.y, this.host.world, now, this.raisedBedSize(m.pending.rot));
            if (res) out = { kind: 'bed', result: res };
            m.pending = null;
            this.changed();
            return out;
          }
          const id = placeYardDecor(state, this.open, m.pending.decorId, m.pending.x, m.pending.y, m.pending.rot);
          if (id) out = { kind: 'placed', id };
          m.pending = null;
          if (id) m.selectedId = id;
          this.changed();
          return out;
        }
        this.mode = { kind: 'play' };
        break;
      }
      case 'bed': {
        const spec = this.bedSpec();
        const res = spec ? createBed(state, spec, this.host.world, now) : null;
        if (res) out = { kind: 'bed', result: res };
        this.mode = { kind: 'play' };
        break;
      }
      case 'path': {
        const res = createPath(state, m.points, this.host.world, now);
        if (res) out = { kind: 'path', result: res };
        this.mode = { kind: 'play' };
        break;
      }
      case 'clear': {
        const spec = this.clearingSpec();
        const res = spec ? createClearing(state, spec, this.host.world, now) : null;
        if (res) out = { kind: 'clearing', result: res };
        this.mode = { kind: 'play' };
        break;
      }
    }
    this.changed();
    return out;
  }
}
