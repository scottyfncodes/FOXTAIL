import { describe, it, expect } from 'vitest';
import { createNewGame, type GameState } from '../src/game/state';
import { ToolController } from '../src/game/engine/Tools';
import type { LandscapeWorld } from '../src/game/systems/landscape';
import { findFurniture } from '../src/game/systems/furniture';
import { STALL_ID, stallRect } from '../src/game/systems/yard';

const world: LandscapeWorld = {
  obstacleAt: (x, y) => (x === 60 && y === 30 ? 'tree' : null),
  isBuiltOrWater: (x, y) => x < 0 || y < 0 || x >= 90 || y >= 64 || (x >= 40 && x < 44),
  isSpot: () => false,
};

function setup(indoors = false) {
  const state = createNewGame();
  state.player.inGreenhouse = indoors;
  const player = indoors ? { x: 8.5, y: 6.5 } : { x: 55, y: 30 };
  const tools = new ToolController({ state, world, now: () => 0, player: () => player });
  return { state, tools };
}

function readyPlant(state: GameState) {
  state.collection.pothos = { foundAt: 0, variants: ['golden'], grown: 2, propagated: 0, sold: 0, earned: 0, plantedOut: 0, displayed: 0 };
  state.basket.push({ uid: 'u', defId: 'pothos', variantId: 'golden', seed: 1, growth: 600, generation: 1, origin: 'cutting', collectedAt: 0 });
}

describe('the finger as gardening tool', () => {
  it('drags a plant preview to an exact spot and plants it right there', () => {
    const { state, tools } = setup();
    readyPlant(state);
    tools.startPlanting('u', 55, 31);
    expect(tools.mode.kind).toBe('plant');
    expect(tools.pointerDown(56, 31)).toBe('grab');
    tools.pointerMove(57.1, 32.37);
    tools.pointerUp(57.13, 32.41);
    expect(tools.canConfirm()).toBe(true);
    const out = tools.confirm();
    expect(out.kind).toBe('planted');
    const plant = Object.values(state.plants)[0];
    expect(plant.location).toMatchObject({ kind: 'wild', x: 57.15, y: 32.4 });
    expect(state.basket).toHaveLength(0);
    expect(tools.mode.kind).toBe('play');
  });

  it('won’t plant where it’s blocked — ✓ does nothing until the preview is moved somewhere good', () => {
    const { state, tools } = setup();
    readyPlant(state);
    tools.startPlanting('u', 60.5, 30.5);
    expect(tools.mode.kind === 'plant' && tools.mode.check.block).toBe('obstacle');
    expect(tools.canConfirm()).toBe(false);
    expect(tools.confirm().kind).toBe('none');
    expect(tools.mode.kind).toBe('plant');
    expect(state.basket).toHaveLength(1);
  });

  it('✕ cancels without changing anything', () => {
    const { state, tools } = setup();
    readyPlant(state);
    tools.startPlanting('u', 55, 31);
    tools.cancel();
    expect(tools.mode.kind).toBe('play');
    expect(state.basket).toHaveLength(1);
    expect(Object.keys(state.plants)).toHaveLength(0);
  });

  it('moves a young outdoor plant by dragging it', () => {
    const { state, tools } = setup();
    state.plants.p = { id: 'p', defId: 'pothos', variantId: 'golden', seed: 1, growth: 300, location: { kind: 'wild', x: 55, y: 31, zone: 'meadow' }, plantedAt: 0, lastCuttingAt: null, generation: 0, bornWild: false };
    tools.startTransplant('p');
    tools.pointerDown(55, 31);
    tools.pointerMove(52, 33);
    tools.pointerUp(52, 33);
    expect(tools.confirm().kind).toBe('transplanted');
    expect(state.plants.p.location).toMatchObject({ x: 52, y: 33 });
  });
});

describe('arranging the house by touch', () => {
  it('pressing a piece grabs it; pressing empty floor pans the view', () => {
    const { tools } = setup(true);
    tools.startArrange();
    expect(tools.pointerDown(10.5, 3.4)).toBe('grab');
    tools.pointerUp(10.5, 3.4);
    expect(tools.mode.kind === 'arrange' && tools.mode.selectedId).toBe('stand1');
    expect(tools.pointerDown(7, 5)).toBe('pan');
    expect(tools.mode.kind === 'arrange' && tools.mode.selectedId).toBeNull();
  });

  it('drops a dragged piece where the finger lets go', () => {
    const { state, tools } = setup(true);
    tools.startArrange();
    tools.pointerDown(10.5, 3.4);
    tools.pointerMove(6.6, 6.2);
    const out = tools.pointerUp(6.6, 6.2);
    expect(out.kind).toBe('placed');
    const piece = findFurniture(state, 'stand1')!;
    expect(Math.abs(piece.x - (6.6 - 0.5 + 0.0))).toBeLessThan(0.2);
  });

  it('springs a piece back if it’s let go somewhere it can’t stand', () => {
    const { state, tools } = setup(true);
    tools.startArrange();
    tools.pointerDown(10.5, 3.4);
    tools.pointerMove(0.2, 5); // into the wall
    expect(tools.mode.kind === 'arrange' && tools.mode.drag?.block).toBe('wall');
    expect(tools.pointerUp(0.2, 5).kind).toBe('none');
    expect(findFurniture(state, 'stand1')).toMatchObject({ x: 10, y: 3 });
  });

  it('adds a piece from stock, lets it be dragged and turned, and sets it down on ✓', () => {
    const { state, tools } = setup(true);
    state.furnitureStock = { pottingTable: 1 };
    tools.startArrange('pottingTable', { x: 7, y: 5 });
    const m = tools.mode;
    expect(m.kind === 'arrange' && m.pending?.kind).toBe('pottingTable');
    expect(tools.pointerDown(6.9, 4.9)).toBe('grab');
    tools.pointerMove(6.5, 6.8);
    tools.pointerUp(6.5, 6.8);
    expect(tools.rotateSelected()).toBe(true);
    expect(tools.canConfirm()).toBe(true);
    const out = tools.confirm();
    expect(out.kind).toBe('placed');
    expect(state.furnitureStock.pottingTable).toBe(0);
    expect(state.furniture[0].rot).toBe(1);
    // Arranging stays open for the next thing.
    expect(tools.mode.kind).toBe('arrange');
  });
});

describe('marking out ground', () => {
  it('drags out a bed, previews its cost, and digs it', () => {
    const { state, tools } = setup();
    state.coins = 1000;
    tools.startBed('rect');
    expect(tools.pointerDown(50, 20)).toBe('draw');
    tools.pointerMove(51, 21);
    expect(tools.mode.kind === 'bed' && tools.mode.block).toBe('too-small');
    tools.pointerMove(53, 22.6);
    tools.pointerUp(53, 22.6);
    expect(tools.bedCost()).toBeGreaterThan(0);
    expect(tools.canConfirm()).toBe(true);
    expect(tools.confirm().kind).toBe('bed');
    expect(state.gardenBeds[0]).toMatchObject({ x: 50, y: 20, w: 3, h: 2.5, shape: 'rect' });
  });

  it('traces a path with the finger and carves it', () => {
    const { state, tools } = setup();
    state.coins = 1000;
    tools.startPath();
    expect(tools.pointerDown(50, 34)).toBe('draw');
    for (let x = 50.3; x <= 54; x += 0.3) tools.pointerMove(x, 34 + (x - 50) * 0.1);
    tools.pointerUp(54, 34.4);
    expect(tools.canConfirm()).toBe(true);
    expect(tools.confirm().kind).toBe('path');
    expect(state.paths).toHaveLength(1);
  });
});

describe('a press that turns into a pinch', () => {
  it('drops a dragged piece back where it was and restores the old selection', () => {
    const { state, tools } = setup(true);
    tools.startArrange();
    const before = { ...findFurniture(state, 'stand1')! };
    expect(tools.pointerDown(10.5, 3.4)).toBe('grab');
    tools.pointerMove(12.5, 5.4);
    tools.cancelPress(null);
    const after = findFurniture(state, 'stand1')!;
    expect({ x: after.x, y: after.y }).toEqual({ x: before.x, y: before.y });
    const m = tools.mode;
    expect(m.kind === 'arrange' && m.selectedId).toBe(null);
    expect(m.kind === 'arrange' && m.drag).toBe(null);
  });

  it('throws away a half-drawn bed rather than leaving a scrap of one', () => {
    const { tools } = setup();
    tools.startBed();
    tools.pointerDown(55, 31);
    tools.pointerMove(57, 33);
    tools.cancelPress();
    const m = tools.mode;
    expect(m.kind === 'bed' && m.a).toBe(null);
    expect(tools.canConfirm()).toBe(false);
  });
});

describe('arranging the garden by touch', () => {
  it('drags the market stall to a new spot, snapped to whole tiles', () => {
    const { state, tools } = setup();
    tools.startYard();
    expect(tools.pointerDown(70, 42.2)).toBe('grab');
    expect(tools.mode.kind === 'yard' && tools.mode.selectedId).toBe(STALL_ID);
    tools.pointerMove(74.1, 46.3);
    expect(tools.pointerUp(74.1, 46.3).kind).toBe('placed');
    expect(state.stall).toEqual({ x: 73, y: 46 });
    expect(stallRect(state)).toMatchObject({ x: 73, y: 46, w: 2, h: 1 });
  });

  it('springs the stall back if it’s let go in the creek or on top of a plant', () => {
    const { state, tools } = setup();
    state.plants.p = { id: 'p', defId: 'pothos', variantId: 'golden', seed: 1, growth: 300, location: { kind: 'wild', x: 74.5, y: 46.5, zone: 'meadow' }, plantedAt: 0, lastCuttingAt: null, generation: 0, bornWild: false };
    tools.startYard();
    tools.pointerDown(70, 42.2);
    tools.pointerMove(42, 20.2);
    expect(tools.mode.kind === 'yard' && tools.mode.drag?.block).toBe('ground');
    tools.pointerMove(75, 46.2);
    expect(tools.mode.kind === 'yard' && tools.mode.drag?.block).toBe('occupied');
    expect(tools.pointerUp(75, 46.2).kind).toBe('none');
    expect(state.stall).toEqual({ x: 69, y: 42 });
  });

  it('places garden decor from stock, moves it, and puts it away again — but never the stall', () => {
    const { state, tools } = setup();
    state.decorStock = { birdbath: 1 };
    tools.startYard('birdbath', { x: 50, y: 20 });
    expect(tools.mode.kind === 'yard' && tools.mode.pending?.decorId).toBe('birdbath');
    expect(tools.confirm().kind).toBe('placed');
    expect(state.decorStock.birdbath).toBe(0);
    expect(state.decor[0]).toMatchObject({ decorId: 'birdbath', x: 50, y: 20 });
    expect(tools.mode.kind).toBe('yard');

    expect(tools.pointerDown(50, 19.8)).toBe('grab');
    tools.pointerMove(52, 21.8);
    expect(tools.pointerUp(52, 21.8).kind).toBe('placed');
    expect(state.decor[0]).toMatchObject({ x: 52, y: 22 });

    expect(tools.storeSelected()).toBe(true);
    expect(state.decor).toHaveLength(0);
    expect(state.decorStock.birdbath).toBe(1);

    tools.select(STALL_ID);
    expect(tools.storeSelected()).toBe(false);
    expect(state.stall).toEqual({ x: 69, y: 42 });
  });

  it('won’t set decor down in the water', () => {
    const { state, tools } = setup();
    state.decorStock = { gardenLantern: 1 };
    tools.startYard('gardenLantern', { x: 41, y: 20 });
    expect(tools.mode.kind === 'yard' && tools.mode.pending?.block).toBe('ground');
    expect(tools.canConfirm()).toBe(false);
  });
});
