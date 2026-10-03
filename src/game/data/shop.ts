// Everything the market sells. One-off upgrades change the player's space
// (and are visible there); pots are cosmetic styles you can then use for
// any displayed plant; garden decor is bought by the piece and placed
// outdoors wherever Ellen is standing.

export type ShopCategory = 'greenhouse' | 'pots' | 'garden' | 'equipment' | 'stall';

/**
 * What a greenhouse item is *for*, so the market can answer two different
 * questions at a glance: "how do I grow more?" (production) and "how do I
 * show off what I have?" (display). Every greenhouse item has exactly one.
 */
export type ShopPurpose = 'production' | 'display' | 'space' | 'utility';

/**
 * How an item fits into progression. Foundation items open up something
 * new, expansions add more of something the player already has, and
 * decoration is there for the look of the place.
 */
export type ShopRole = 'foundation' | 'expansion' | 'decoration';

export const PURPOSE_INFO: Record<ShopPurpose, { icon: string; label: string }> = {
  production: { icon: '🌱', label: 'Production' },
  display: { icon: '🪴', label: 'Display' },
  space: { icon: '🏡', label: 'Space' },
  utility: { icon: '🔧', label: 'Utility' },
};

/** The order greenhouse groups appear in: growing capacity first. */
export const PURPOSE_ORDER: ShopPurpose[] = ['production', 'space', 'display', 'utility'];

export interface ShopItem {
  id: string;
  name: string;
  category: ShopCategory;
  price: number;
  description: string;
  /** Can be bought over and over (garden decor). */
  repeatable?: boolean;
  /**
   * Only offered once this item has been bought — so the market opens up a
   * step at a time: the first pot style, then the next, and so on.
   */
  after?: string;
  /** Greenhouse items only: what it's for. */
  purpose?: ShopPurpose;
  role?: ShopRole;
  /** A few words on what it does, shown before the flavour text. */
  blurb?: string;
  /**
   * Repeatable items whose price compounds: each one bought costs this
   * much more than the last (1.25 = a quarter more).
   */
  priceGrowth?: number;
  /** How many units one purchase adds to stock (a double bed adds two beds). */
  pack?: number;
  /** The stock a purchase fills, when it isn't the item's own id (the double bed fills nursery beds). */
  stock?: string;
  /** The purchase counter a compounding price follows, when it isn't the item's own (shared with what it replaced). */
  priceKey?: string;
}

export const SHOP_ITEMS: ShopItem[] = [
  // Greenhouse
  { id: 'hangingHooks', name: 'Hanging Hook Rail', category: 'greenhouse', price: 90, purpose: 'display', role: 'foundation', blurb: 'Adds 3 hanging spots', description: 'A rail of three ceiling hooks for hanging pots. Trailing plants look spectacular up here.' },
  { id: 'plantShelf', name: 'Wall Shelf', category: 'greenhouse', price: 120, after: 'hangingHooks', purpose: 'display', role: 'expansion', blurb: 'Adds 3 display spots', description: 'A reclaimed-wood shelf along the west wall. Room for three more plants.' },
  { id: 'tieredStand', name: 'Tiered Plant Stand', category: 'greenhouse', price: 240, after: 'plantShelf', purpose: 'display', role: 'expansion', blurb: 'Adds 3 display spots', description: 'A three-step iron stand by the east glass. Three more display spots in the best light.' },
  { id: 'growLights', name: 'Grow Lights', category: 'greenhouse', price: 360, purpose: 'production', role: 'foundation', blurb: 'Everything indoors grows 1.5× faster', description: 'Warm lamps over the whole greenhouse. Everything indoors grows half again as fast.' },
  // Greenhouse furniture: bought by the piece and set down wherever you
  // like indoors, then picked up and moved as the collection grows.
  // Nursery beds come in pairs. The price per bed is the old single bed's,
  // still compounding with every bed bought (singles bought before count too).
  { id: 'doubleNurseryBed', name: 'Double Nursery Bed', category: 'greenhouse', price: 45, priceGrowth: 1.5, priceKey: 'nurseryBed', pack: 2, stock: 'nurseryBed', repeatable: true, purpose: 'production', role: 'expansion', blurb: 'Adds 2 growing beds', description: 'A pair of timber troughs for rooting cuttings and raising young plants: two more planting spaces. Put each anywhere indoors. Each pair costs a little more than the last.' },
  { id: 'plantStand', name: 'Plant Stand', category: 'greenhouse', price: 45, repeatable: true, purpose: 'display', role: 'expansion', blurb: 'Display spot for 1 plant', description: 'A round wooden stand for one plant. Put it anywhere in the greenhouse.' },
  { id: 'ironPedestal', name: 'Iron Pedestal', category: 'greenhouse', price: 80, after: 'plantStand', repeatable: true, purpose: 'display', role: 'expansion', blurb: 'Display spot for 1 plant', description: 'A tall wrought-iron pedestal that lifts one plant up into the light.' },
  { id: 'ceilingHook', name: 'Ceiling Hook', category: 'greenhouse', price: 40, after: 'hangingHooks', repeatable: true, purpose: 'display', role: 'expansion', blurb: 'Hangs 1 plant', description: 'A single hook: hang one more pot from the roof, above anything you like.' },
  { id: 'wallTrellis', name: 'Wall Trellis', category: 'greenhouse', price: 95, after: 'plantShelf', repeatable: true, purpose: 'display', role: 'expansion', blurb: 'Display spot vines can climb', description: 'A tall cedar lattice. Vines and trailers planted at its foot climb it instead of trailing — best along a wall.' },
  { id: 'pottingTable', name: 'Potting Table', category: 'greenhouse', price: 85, after: 'plantStand', repeatable: true, purpose: 'display', role: 'expansion', blurb: 'Display spot for 1 plant', description: 'A long, scrubbed table. Sets one plant at a comfortable height. Turns to fit along any wall.' },
  { id: 'floorPlanter', name: 'Floor Planter', category: 'greenhouse', price: 110, after: 'ironPedestal', repeatable: true, purpose: 'display', role: 'expansion', blurb: 'Display spot for 1 big plant', description: 'A deep glazed planter that sits on the floor. Big plants love the extra root room.' },
  { id: 'growLamp', name: 'Grow Lamp', category: 'greenhouse', price: 150, after: 'growLights', repeatable: true, purpose: 'production', role: 'expansion', blurb: 'Plants nearby grow 1.3× faster', description: 'A standing lamp with a warm, pinkish glow. Plants close to it grow a third faster.' },
  { id: 'wateringCan', name: 'Watering Can', category: 'greenhouse', price: 15, repeatable: true, purpose: 'display', role: 'decoration', blurb: 'Decoration', description: 'A dented brass can. Purely for the look of the place.' },
  { id: 'houseRug', name: 'Woven Rug', category: 'greenhouse', price: 40, after: 'wateringCan', repeatable: true, purpose: 'display', role: 'decoration', blurb: 'Decoration', description: 'A soft jute rug to put down anywhere indoors. Things stand on it happily.' },
  { id: 'weathervane', name: 'Fox Weathervane', category: 'greenhouse', price: 1200, after: 'sunRoom', purpose: 'display', role: 'decoration', blurb: 'On the greenhouse roof', description: 'A copper fox on the ridge of the greenhouse, nose to the wind. It does nothing at all, and everyone who comes up the lane looks at it.' },
  { id: 'sunRoom', name: 'Clear Out the Sun Room', category: 'greenhouse', price: 700, purpose: 'space', role: 'foundation', blurb: 'Opens a new corner · 4 display spots', description: 'Haul away the old crates in the south-east corner and fit it out: four new display spots in full sun.' },
  // The big ones: whole new stretches of the greenhouse, for a collector
  // whose ambitions have outgrown it.
  { id: 'pottingAnnex', name: 'The Potting Annex', category: 'greenhouse', price: 3500, after: 'growLights', purpose: 'production', role: 'foundation', blurb: 'Adds 4 nursery beds along the north glass', description: 'Knock through to the old lean-to along the north glass and fit it out as a nursery: four more beds, in the best morning light. The most a greenhouse this size can root at once.' },
  { id: 'orangery', name: 'The Orangery', category: 'greenhouse', price: 6000, after: 'sunRoom', purpose: 'space', role: 'foundation', blurb: 'Opens the south glass · 4 display spots', description: 'A proper orangery along the south wall: tall glass, a tiled floor, and four display spots for the plants you want the whole valley to see through the window.' },
  { id: 'roofLights', name: 'Roof Lights', category: 'greenhouse', price: 9000, after: 'growLights', purpose: 'production', role: 'foundation', blurb: 'Everything indoors grows 2× (up from 1.5×)', description: 'Replace the roof glass with lights that follow the sun round. Everything indoors grows twice as fast; the grow lights come out.' },

  // Pots
  { id: 'potGlazed', name: 'Teal Glazed Pots', category: 'pots', price: 25, description: 'Deep sea-green glaze with a drip at the rim.' },
  { id: 'potSpeckled', name: 'Speckled Stoneware', category: 'pots', price: 35, after: 'potGlazed', description: 'Oatmeal clay flecked with iron.' },
  { id: 'potBasket', name: 'Woven Baskets', category: 'pots', price: 40, after: 'potSpeckled', description: 'Seagrass baskets. Cosy.' },
  { id: 'potCopper', name: 'Hammered Copper', category: 'pots', price: 70, after: 'potBasket', description: 'Catches the light beautifully.' },
  { id: 'potPorcelain', name: 'Gold-Rim Porcelain', category: 'pots', price: 140, after: 'potCopper', description: 'For the plants you’re most proud of.' },
  { id: 'potGilded', name: 'Gilded Urns', category: 'pots', price: 900, after: 'potPorcelain', description: 'Gold leaf over hammered brass. Buyers ask for them by name.' },
  { id: 'potMidnight', name: 'Midnight & Stars', category: 'pots', price: 2400, after: 'potGilded', description: 'Deep blue glaze flecked with gold. The pot people come to the stall to see.' },

  // Garden decor (placed outdoors)
  { id: 'raisedBed', name: 'Raised Bed', category: 'garden', price: 90, priceGrowth: 1.2, repeatable: true, description: 'A timber-framed bed, ready made: set it down on any open ground and plant into it. Like a dug bed, whatever grows in it stays in it. Each one costs a little more than the last.' },
  { id: 'steppingStones', name: 'Stepping Stones', category: 'garden', price: 6, repeatable: true, description: 'A pair of flat stones, cut to match the path from the front door. Lay pairs end to end and the zigzag carries on.' },
  { id: 'picketFence', name: 'Picket Fence', category: 'garden', price: 12, after: 'steppingStones', repeatable: true, description: 'A short run of white fence to frame a bed.' },
  { id: 'gardenLantern', name: 'Garden Lantern', category: 'garden', price: 30, repeatable: true, description: 'Glows warmly after dark.' },
  { id: 'birdbath', name: 'Birdbath', category: 'garden', price: 45, after: 'gardenLantern', repeatable: true, description: 'A stone basin. Birds and butterflies will visit.' },
  { id: 'gardenBench', name: 'Garden Bench', category: 'garden', price: 60, after: 'birdbath', repeatable: true, description: 'Somewhere to sit and look at what you’ve made.' },
  { id: 'gardenTrellis', name: 'Garden Trellis', category: 'garden', price: 55, after: 'picketFence', repeatable: true, description: 'A freestanding cedar lattice with a pot at its foot: a planter for the garden, like the trellis indoors. Vines and trailers climb it.' },
  { id: 'pergola', name: 'Pergola', category: 'garden', price: 1800, after: 'gardenTrellis', priceGrowth: 1.3, repeatable: true, description: 'Four cedar posts and a beam roof, for a vine to find its way over. Somewhere to stand in the shade of what you grew.' },
  { id: 'gardenPond', name: 'Ornamental Pond', category: 'garden', price: 3000, after: 'gardenBench', priceGrowth: 1.3, repeatable: true, description: 'A stone-rimmed pond with lily pads and a dragonfly or two, dug to whatever size you choose and lined by the crew. Big enough, and it can keep koi.' },
  { id: 'koi', name: 'Koi', category: 'garden', price: 120, after: 'gardenPond', repeatable: true, description: 'A young koi in a bag of water, its markings its own. Let it go in a pond big enough for it.' },

  // Equipment
  { id: 'basketMedium', name: 'Collector’s Satchel', category: 'equipment', price: 80, description: 'Carry up to 10 plants.' },
  { id: 'basketLarge', name: 'Field Pack', category: 'equipment', price: 340, after: 'basketMedium', description: 'Carry up to 16 plants.' },
  { id: 'rootingKit', name: 'Rooting Kit', category: 'equipment', price: 260, description: 'Hormone powder and sharp snips. Plants recover twice as fast after you take a cutting, and cuttings throw sports (mutations) more often.' },
  { id: 'rockHammer', name: 'Rock Hammer', category: 'equipment', price: 150, description: 'A sledge and a pry bar. Needed before any rock can be broken up and hauled away — for a single rock, or for a path that runs through one.' },
  { id: 'chainsaw', name: 'Chainsaw', category: 'equipment', price: 420, after: 'rockHammer', description: 'Needed before a tree can be felled or a bush grubbed out — one at a time, or for a path that runs through trees.' },
  { id: 'miniTruck', name: 'Mini Truck', category: 'equipment', price: 2800, description: 'A little flatbed truck, delivered to the lane by the house. Drive it anywhere the ground is open — twice as fast as walking, and thickets don’t slow it — and carry a dozen more plants in the back. Park it by the stall to sell the whole load, or by the greenhouse door to pot straight from the bed.' },

  // Market stall
  { id: 'stallAwning', name: 'Striped Awning', category: 'stall', price: 120, description: 'Draws a crowd. Everything sells for 10% more.' },
  { id: 'stallCrates', name: 'Display Crates', category: 'stall', price: 260, after: 'stallAwning', description: 'Plants shown off properly. Another 10% on every sale.' },
];

export function findShopItem(id: string): ShopItem | undefined {
  return SHOP_ITEMS.find((s) => s.id === id);
}

/** Items added to the market in a later build, so older saves see them as NEW. */
export const INTRODUCED_IN_V7 = ['doubleNurseryBed'];

export interface PotStyle {
  id: string;
  name: string;
  /** Shop item that unlocks it; terracotta is free. */
  requires?: string;
  body: string;
  rim: string;
  shade: string;
  pattern?: 'speckle' | 'weave' | 'hammered' | 'gold' | 'drip';
}

export const POT_STYLES: PotStyle[] = [
  { id: 'terracotta', name: 'Terracotta', body: '#b8653e', rim: '#cf7a4f', shade: '#8f4a2b' },
  { id: 'glazed', name: 'Teal Glaze', requires: 'potGlazed', body: '#2f7f7a', rim: '#4aa39b', shade: '#1f5a56', pattern: 'drip' },
  { id: 'speckled', name: 'Speckled', requires: 'potSpeckled', body: '#d9ccb2', rim: '#e8dcc4', shade: '#b3a58a', pattern: 'speckle' },
  { id: 'basket', name: 'Woven', requires: 'potBasket', body: '#b99a62', rim: '#d1b67e', shade: '#8a7044', pattern: 'weave' },
  { id: 'copper', name: 'Copper', requires: 'potCopper', body: '#b76e3a', rim: '#e0a066', shade: '#7e4522', pattern: 'hammered' },
  { id: 'porcelain', name: 'Porcelain', requires: 'potPorcelain', body: '#f1efe8', rim: '#d8b24a', shade: '#cfcac0', pattern: 'gold' },
  { id: 'gilded', name: 'Gilded', requires: 'potGilded', body: '#cfa62c', rim: '#f0d77a', shade: '#8f6f12', pattern: 'hammered' },
  { id: 'midnight', name: 'Midnight', requires: 'potMidnight', body: '#22305f', rim: '#d8b24a', shade: '#131b3a', pattern: 'speckle' },
];

export function findPotStyle(id: string): PotStyle {
  return POT_STYLES.find((p) => p.id === id) ?? POT_STYLES[0];
}

export type DecorId = 'steppingStones' | 'picketFence' | 'gardenLantern' | 'birdbath' | 'gardenBench' | 'gardenTrellis' | 'raisedBed' | 'pergola' | 'gardenPond';
export const DECOR_IDS: DecorId[] = ['raisedBed', 'steppingStones', 'picketFence', 'gardenLantern', 'birdbath', 'gardenBench', 'gardenTrellis', 'pergola', 'gardenPond'];

/**
 * Everything that can stand (or hang) indoors. The first group is sold at
 * the market; the second is the greenhouse's own original fittings, which
 * can be moved or stored like anything else once the player picks them up;
 * the third is the living room's furniture, which can be moved but stays.
 * FURNITURE_IDS lists only what can ever be in stock.
 */
export type FurnitureId =
  | 'plantStand'
  | 'ironPedestal'
  | 'ceilingHook'
  | 'wallTrellis'
  | 'pottingTable'
  | 'floorPlanter'
  | 'growLamp'
  | 'wateringCan'
  | 'houseRug'
  | 'nurseryBed'
  | 'wallShelf'
  | 'tieredStand'
  | 'sunroomStand'
  // The living room's own furniture: moved like anything else, never put away.
  | 'tv'
  | 'couch'
  | 'coffeeTable'
  | 'sideTable'
  | 'catTree'
  | 'catBed'
  | 'puttingMat'
  | 'rug'
  | 'bookshelf'
  | 'doormat'
  | 'coatRack'
  | 'floorLamp'
  // The greenhouse's own set dressing: moved like anything else, never put away.
  | 'scoutBed'
  | 'ellenDesk';
export const FURNITURE_IDS: FurnitureId[] = [
  'plantStand',
  'ironPedestal',
  'ceilingHook',
  'wallTrellis',
  'pottingTable',
  'floorPlanter',
  'growLamp',
  'wateringCan',
  'houseRug',
  'nurseryBed',
  'wallShelf',
  'tieredStand',
  'sunroomStand',
];

/**
 * Ponds are dug to size. The price is by area (the original 2.2 × 1.5 pond
 * still costs 3000), compounding as before with every pond bought.
 */
export const POND_DEFAULT = { w: 2.2, h: 1.5 };
export const POND_MIN = { w: 1.5, h: 1 };
export const POND_MAX = { w: 5, h: 4 };
export const POND_STEP = 0.5;
export const POND_PRICE_PER_TILE = 3000 / (POND_DEFAULT.w * POND_DEFAULT.h);

/** Selling something back to the market fetches this share of its list price (never of a compounded price, so never more than was paid). */
export const RESALE_RATE = 0.5;

/** The raised bed a piece of stocked decor becomes when it's set down, in tiles. */
export const RAISED_BED = { w: 2.5, h: 1.5 };
