// Visual identity for Ellen and Scout, kept as data so palette/silhouette
// tuning never requires touching the renderer's drawing code.

export const ELLEN_APPEARANCE = {
  skin: '#e3b48c',
  hair: '#5a3a2a',
  hat: '#c9a463',
  hatBand: '#7a5a3a',
  vest: '#5c6b4a',
  vestTrim: '#3e4a32',
  shirt: '#e8dcc4',
  pants: '#4a4438',
  boots: '#3a2e22',
  backpack: '#8a5a3c',
  backpackStrap: '#5c3d28',
  pouch: '#6b5335',
  // The recurring handmade-crochet detail: her scarf, in a warm variegated
  // accent distinct from the practical field-gear palette.
  crochetScarf: '#c96a5a',
  crochetScarfAlt: '#e0a35a',
  lensGlint: '#cfe8e0',
  blush: 'rgba(214,112,100,0.4)',
};

export const SCOUT_APPEARANCE = {
  furBase: '#a97a4f',
  furDark: '#7c5936',
  furLight: '#d4b483',
  eyePatch: '#4a3a2c',
  eye: '#2a2018',
  nose: '#2a2018',
  collar: '#2fb36a', // her green collar, bright enough to read against the grass
};

export const SCOTT_APPEARANCE = {
  skin: '#e8bd94',
  hair: '#dcb86a', // tall and blonde
  beard: '#c9a258', // kept short, a shade darker than his hair
  shirt: '#7a8a9a', // faded chambray
  overalls: '#4a6478',
  overallsTrim: '#33485a',
  boots: '#4a3623',
  tool: '#8a8a82', // whatever he's tinkering with — a trowel, a watering can
  toolHandle: '#6b4a2e',
  snack: '#c97a4a', // an apple, more or less
  napBlanket: '#c96a5a', // one of Ellen's crochet pieces, borrowed
  clubShaft: '#b9bec2',
  clubHead: '#6e7479',
  golfBall: '#f7f5ee',
  flag: '#c8553d',
};

export const CAT_APPEARANCE = {
  furBase: '#d98a3d',
  furDark: '#b5691f',
  furLight: '#f0c98a',
  belly: '#f5e3c3',
  eye: '#5a8a3c',
  nose: '#c96a5a',
};

/**
 * On-screen size of each character, relative to the art's native size.
 * The art was drawn at roughly two-thirds of a tile tall, which made Ellen
 * about as tall as the market stall's table; at these sizes she stands a
 * little under a tile, the table reaches her hip, and everyone else sits in
 * proportion to her — Scott a head taller, Scout a medium dog, the cat and
 * fox small.
 *
 * Heights follow the real pair: Ellen is 5'3" and Scott 6'3", so crown to
 * sole he stands 75/63 ≈ 1.19 times her height. His art is 0.682 of a
 * native tile from sole to crown against her 0.65 (hat aside), which puts
 * his scale at 1.4 × 1.19 × 0.65 / 0.682 ≈ 1.59.
 */
export const CHARACTER_SCALE = {
  ellen: 1.4,
  scott: 1.59,
  scout: 1.2,
  cat: 1.1,
  fox: 1.0,
};
