import type { PlantDef, Rarity } from '../types';

// The houseplant roster. Every species grows wild somewhere in the
// valley; each has a standard form plus named variants that range from
// "you'll see one eventually" to "you may never see one" — and one form
// beyond that, which nature never made: it never grows wild and is only
// ever thrown as a sport, by a big plant's cutting or a lively bed's seedling. A variant's
// look overrides the species look, so rarity is something you can *see*.
//
// Colours are HSL. Variegation colour is [h, s, l].

const CREAM: [number, number, number] = [52, 60, 90];
const WHITE: [number, number, number] = [60, 20, 96];
const GOLD: [number, number, number] = [48, 85, 62];
const PINK: [number, number, number] = [340, 70, 78];
const SILVER: [number, number, number] = [150, 12, 82];

export const PLANTS: Record<string, PlantDef> = {
  // ---------------------------------------------------------------- Meadow
  pothos: {
    id: 'pothos',
    name: 'Pothos',
    latin: 'Epipremnum aureum',
    form: 'trailing',
    rarity: 'common',
    habitat: ['meadow', 'woodland'],
    landscape: 'vine',
    description: 'A forgiving, fast-trailing vine with glossy heart-shaped leaves. It will happily carpet anything you let it.',
    hint: 'Something trails through the long grass near home.',
    look: { hue: 105, sat: 48, light: 38, accentHue: 55, variegation: 'marble', variegationColor: GOLD, size: 1 },
    variants: [
      { id: 'golden', name: 'Golden', rarity: 'common', description: 'Green leaves brushed with gold.', look: {} },
      { id: 'marbleQueen', name: 'Marble Queen', rarity: 'uncommon', description: 'Heavily streaked with cream — more white than green in places.', look: { variegation: 'splash', variegationColor: CREAM, light: 42 } },
      { id: 'neon', name: 'Neon', rarity: 'rare', description: 'Electric chartreuse, almost glowing in the shade.', look: { hue: 72, sat: 85, light: 55, variegation: 'none' } },
      { id: 'manjula', name: 'Manjula', rarity: 'veryRare', description: 'Wavy, rounded leaves splashed silver, cream and green all at once.', look: { variegation: 'splash', variegationColor: WHITE, ruffled: true, leafWidth: 1.25 } },
      { id: 'moonrunner', name: 'Moonrunner', rarity: 'unheardOf', sportOnly: true, description: 'Silver-white leaves veined with a cold light that shows after dark. No nursery has ever listed it.', look: { hue: 200, sat: 15, light: 70, variegation: 'glow', variegationColor: [190, 90, 75] } },
    ],
    growthRate: 1.35,
    spread: 0.85,
  },

  spiderPlant: {
    id: 'spiderPlant',
    name: 'Spider Plant',
    latin: 'Chlorophytum comosum',
    form: 'strappy',
    rarity: 'common',
    habitat: ['meadow', 'rockyClearing'],
    landscape: 'jungle',
    description: 'Arching ribbons of leaves that throw out little plantlets on long runners. It propagates itself if you let it.',
    hint: 'Arching ribbons, sun-bleached at the edges.',
    look: { hue: 95, sat: 45, light: 44, accentHue: 60, variegation: 'none', size: 0.9 },
    variants: [
      { id: 'green', name: 'Green', rarity: 'common', description: 'Plain, lush green ribbons.', look: {} },
      { id: 'vittatum', name: 'Vittatum', rarity: 'uncommon', description: 'A bright cream stripe down the middle of every leaf.', look: { variegation: 'stripe', variegationColor: CREAM } },
      { id: 'bonnie', name: 'Bonnie', rarity: 'rare', description: 'Curling, corkscrewed leaves with cream margins. Looks like it’s been to a salon.', look: { variegation: 'edge', variegationColor: CREAM, ruffled: true } },
      { id: 'comet', name: 'Comet', rarity: 'unheardOf', sportOnly: true, description: 'Ribbons gone translucent blue, each tip lit like a spark.', look: { hue: 205, sat: 55, light: 58, variegation: 'glow', variegationColor: [195, 100, 80] } },
    ],
    growthRate: 1.2,
    spread: 0.7,
  },

  pilea: {
    id: 'pilea',
    name: 'Chinese Money Plant',
    latin: 'Pilea peperomioides',
    form: 'coin',
    rarity: 'uncommon',
    habitat: ['meadow'],
    landscape: 'color',
    description: 'Round, coin-like leaves held out on long stems, like a handful of green pancakes. Pups pop up all around it.',
    hint: 'Little green coins held up to the sun.',
    look: { hue: 110, sat: 40, light: 42, accentHue: 90, variegation: 'none', size: 0.95 },
    variants: [
      { id: 'standard', name: 'Standard', rarity: 'uncommon', description: 'Matte green coins.', look: {} },
      { id: 'sugar', name: 'Sugar', rarity: 'rare', description: 'Every coin is dusted with fine silver speckles.', look: { variegation: 'speckle', variegationColor: SILVER } },
      { id: 'whiteSplash', name: 'White Splash', rarity: 'veryRare', description: 'Coins randomly splashed with pure white — no two alike.', look: { variegation: 'splash', variegationColor: WHITE } },
      { id: 'lantern', name: 'Lantern', rarity: 'unheardOf', sportOnly: true, description: 'Coins of amber glass that hold the day’s light and let it go at night.', look: { hue: 40, sat: 80, light: 58, variegation: 'glow', variegationColor: [45, 100, 70] } },
    ],
    growthRate: 1.0,
    spread: 0.55,
  },

  tradescantia: {
    id: 'tradescantia',
    name: 'Wandering Dude',
    latin: 'Tradescantia zebrina',
    form: 'trailing',
    rarity: 'common',
    habitat: ['meadow', 'overgrownClearing'],
    landscape: 'color',
    description: 'A sprawling trailer striped in silver and violet. It roots wherever a stem touches soil.',
    hint: 'Violet and silver, sprawling low.',
    look: { hue: 285, sat: 35, light: 38, accentHue: 300, variegation: 'stripe', variegationColor: SILVER, size: 0.85, leafWidth: 0.8 },
    variants: [
      { id: 'zebrina', name: 'Zebrina', rarity: 'common', description: 'Silver-striped purple leaves.', look: {} },
      { id: 'nanouk', name: 'Nanouk', rarity: 'rare', description: 'Candy-striped pink, cream and green. Looks like a sweet shop.', look: { hue: 330, sat: 55, light: 62, variegation: 'stripe', variegationColor: [120, 30, 70] } },
      { id: 'nightfall', name: 'Nightfall', rarity: 'unheardOf', sportOnly: true, description: 'Leaves so dark they’re nearly black, with a violet shimmer where the stripe was.', look: { hue: 275, sat: 45, light: 14, variegation: 'glow', variegationColor: [280, 90, 70] } },
    ],
    growthRate: 1.3,
    spread: 0.9,
  },

  birdOfParadise: {
    id: 'birdOfParadise',
    name: 'Bird of Paradise',
    latin: 'Strelitzia reginae',
    form: 'fan',
    rarity: 'rare',
    habitat: ['meadow', 'overgrownClearing'],
    landscape: 'flower',
    description: 'A fan of long-stalked paddle leaves, and — once it’s big enough — flowers like the heads of orange cranes, each with one blue tongue. It takes years to bloom and is worth every one.',
    hint: 'Paddles held up to the sun, in a fan. Something bright may perch among them one day.',
    look: { hue: 118, sat: 40, light: 34, accentHue: 28, accentSat: 95, accentLight: 58, variegation: 'none', size: 1.3, flowers: true },
    variants: [
      { id: 'reginae', name: 'Reginae', rarity: 'rare', description: 'Blue-green paddles; orange crests with a blue tongue.', look: {} },
      { id: 'mandelasGold', name: 'Mandela’s Gold', rarity: 'veryRare', description: 'The crests come up clear yellow instead of orange.', look: { accentHue: 50, accentSat: 95, accentLight: 62 } },
      { id: 'nicolai', name: 'Giant White', rarity: 'veryRare', description: 'A giant of the family: huge banana-like leaves and white crests with an ink-blue tongue.', look: { size: 1.55, leafWidth: 1.2, light: 32, accentHue: 55, accentSat: 20, accentLight: 94 } },
      { id: 'firebird', name: 'Firebird', rarity: 'unheardOf', sportOnly: true, description: 'Dusk-dark paddles; the crests burn like coals and light the leaves from below.', look: { hue: 250, sat: 30, light: 20, variegation: 'glow', variegationColor: [28, 100, 62], accentHue: 18, accentLight: 55 } },
    ],
    growthRate: 0.7,
    spread: 0.3,
  },

  // -------------------------------------------------------------- Woodland
  philodendron: {
    id: 'philodendron',
    name: 'Heartleaf Philodendron',
    latin: 'Philodendron hederaceum',
    form: 'heart',
    rarity: 'common',
    habitat: ['woodland', 'creek'],
    landscape: 'jungle',
    description: 'Velvety heart-shaped leaves on a scrambling stem. Where it’s happy, it becomes a jungle.',
    hint: 'Hearts on a scrambling stem, under the trees.',
    look: { hue: 115, sat: 50, light: 34, accentHue: 80, variegation: 'none', size: 1 },
    variants: [
      { id: 'green', name: 'Green', rarity: 'common', description: 'Deep, glossy green hearts.', look: {} },
      { id: 'brasil', name: 'Brasil', rarity: 'uncommon', description: 'A bold lime flame down the centre of each leaf.', look: { variegation: 'stripe', variegationColor: [80, 70, 55] } },
      { id: 'pinkPrincess', name: 'Pink Princess', rarity: 'veryRare', description: 'Near-black leaves splashed with bubblegum pink. Collectors lose sleep over these.', look: { hue: 340, sat: 30, light: 20, variegation: 'splash', variegationColor: PINK } },
      { id: 'emberheart', name: 'Emberheart', rarity: 'unheardOf', sportOnly: true, description: 'Hearts of deep red that smoulder along the veins.', look: { hue: 5, sat: 70, light: 30, variegation: 'glow', variegationColor: [20, 100, 60] } },
    ],
    growthRate: 1.15,
    spread: 0.7,
  },

  monstera: {
    id: 'monstera',
    name: 'Monstera',
    latin: 'Monstera deliciosa',
    form: 'splitleaf',
    rarity: 'uncommon',
    habitat: ['woodland'],
    landscape: 'jungle',
    description: 'Huge, split and holed leaves. Young plants have solid hearts; the famous splits come with age.',
    hint: 'A leaf with holes in it, bigger than your head.',
    look: { hue: 120, sat: 48, light: 30, accentHue: 90, variegation: 'none', size: 1.35 },
    variants: [
      { id: 'deliciosa', name: 'Deliciosa', rarity: 'uncommon', description: 'The classic swiss-cheese giant.', look: {} },
      { id: 'albo', name: 'Albo', rarity: 'veryRare', description: 'Great half-moons of pure white cut through the leaves.', look: { variegation: 'splash', variegationColor: WHITE } },
      { id: 'thaiConstellation', name: 'Thai Constellation', rarity: 'extremelyRare', description: 'Every leaf is scattered with creamy stars, like a night sky turned green.', look: { variegation: 'speckle', variegationColor: CREAM } },
      { id: 'starwindow', name: 'Starwindow', rarity: 'unheardOf', sportOnly: true, description: 'Midnight-blue leaves; through the holes, a faint light.', look: { hue: 225, sat: 45, light: 22, variegation: 'glow', variegationColor: [210, 100, 78] } },
    ],
    growthRate: 0.85,
    spread: 0.45,
  },

  swissCheeseVine: {
    id: 'swissCheeseVine',
    name: 'Swiss Cheese Vine',
    latin: 'Monstera adansonii',
    form: 'splitleaf',
    rarity: 'uncommon',
    habitat: ['woodland', 'creek'],
    landscape: 'vine',
    description: 'The monstera’s slighter, quicker cousin: a scrambling vine whose leaves come already full of oval holes, like a slice of Emmental.',
    hint: 'Small leaves, already full of holes, climbing.',
    look: { hue: 115, sat: 48, light: 34, accentHue: 90, variegation: 'none', size: 0.9, leafWidth: 0.85 },
    variants: [
      { id: 'adansonii', name: 'Adansonii', rarity: 'uncommon', description: 'Glossy green, riddled with holes.', look: {} },
      { id: 'laniata', name: 'Laniata', rarity: 'rare', description: 'Bigger, glossier leaves with the holes crowded along the midrib.', look: { light: 30, sat: 52, leafWidth: 0.95, size: 1 } },
      { id: 'albo', name: 'Albo', rarity: 'veryRare', description: 'Sectors of pure white cut across the holes.', look: { variegation: 'splash', variegationColor: WHITE } },
      { id: 'obliqua', name: 'Obliqua', rarity: 'extremelyRare', description: 'More hole than leaf — a paper-thin lattice that collectors have crossed oceans for.', look: { light: 40, sat: 40, leafWidth: 1.05 } },
      { id: 'lacelight', name: 'Lacelight', rarity: 'unheardOf', sportOnly: true, description: 'Leaves gone the green of deep sea glass; through every hole, a faint light.', look: { hue: 190, sat: 40, light: 30, variegation: 'glow', variegationColor: [175, 100, 78] } },
    ],
    growthRate: 1.2,
    spread: 0.7,
  },

  dieffenbachia: {
    id: 'dieffenbachia',
    name: 'Dumb Cane',
    latin: 'Dieffenbachia seguine',
    form: 'patterned',
    rarity: 'common',
    habitat: ['woodland', 'dampForest'],
    landscape: 'jungle',
    description: 'Big, soft, painted leaves — cream, lime and green — on a thick cane. Its sap numbs the tongue, which is how it got its unkind name.',
    hint: 'Broad painted leaves in the dappled shade. Don’t chew.',
    look: { hue: 112, sat: 42, light: 36, accentHue: 80, variegation: 'marble', variegationColor: CREAM, size: 1.15, leafWidth: 1.15 },
    variants: [
      { id: 'camille', name: 'Camille', rarity: 'common', description: 'Creamy-white centres with a soft green margin.', look: {} },
      { id: 'tropicSnow', name: 'Tropic Snow', rarity: 'uncommon', description: 'Dark leaves flecked and feathered with white, like a light snowfall.', look: { light: 30, variegation: 'speckle', variegationColor: WHITE } },
      { id: 'reflector', name: 'Reflector', rarity: 'rare', description: 'Near-black leaves splashed with lime, like light bouncing off water.', look: { hue: 125, sat: 40, light: 24, variegation: 'splash', variegationColor: [78, 75, 58] } },
      { id: 'sterling', name: 'Sterling', rarity: 'veryRare', description: 'Deep green with a bold silver midrib and pale veins fanning out from it.', look: { light: 28, variegation: 'veins', variegationColor: [150, 15, 88] } },
      { id: 'snowlight', name: 'Snowlight', rarity: 'unheardOf', sportOnly: true, description: 'The cream has turned to cold light, and the leaves hold it after dark.', look: { hue: 150, sat: 25, light: 28, variegation: 'glow', variegationColor: [170, 60, 90] } },
    ],
    growthRate: 1.05,
    spread: 0.45,
  },

  scindapsus: {
    id: 'scindapsus',
    name: 'Satin Pothos',
    latin: 'Scindapsus pictus',
    form: 'trailing',
    rarity: 'uncommon',
    habitat: ['woodland', 'overgrownClearing'],
    landscape: 'vine',
    description: 'Not a pothos at all, though it trails the same way: thick heart leaves of matte satin green, flecked with silver that catches the light.',
    hint: 'Something trails through the shade with silver on its leaves.',
    look: { hue: 118, sat: 35, light: 32, accentHue: 90, variegation: 'speckle', variegationColor: SILVER, size: 0.95, leafWidth: 0.95 },
    variants: [
      { id: 'argyraeus', name: 'Argyraeus', rarity: 'uncommon', description: 'Small dark hearts, evenly flecked with silver.', look: {} },
      { id: 'exotica', name: 'Exotica', rarity: 'rare', description: 'Bigger leaves with great splashes of silver, more silver than green.', look: { variegation: 'splash', variegationColor: SILVER, leafWidth: 1.1, size: 1.05 } },
      { id: 'jadeSatin', name: 'Jade Satin', rarity: 'rare', description: 'No silver at all: a thick, plain, deep-green satin.', look: { variegation: 'none', light: 28, sat: 42 } },
      { id: 'silveryAnn', name: 'Silvery Ann', rarity: 'veryRare', description: 'Almost entirely silver, with only a mist of green left.', look: { sat: 18, light: 62, variegation: 'speckle', variegationColor: [150, 8, 92] } },
      { id: 'starlitSatin', name: 'Starlit Satin', rarity: 'unheardOf', sportOnly: true, description: 'Midnight satin; every silver fleck is a star that comes out after dark.', look: { hue: 240, sat: 30, light: 16, variegation: 'glow', variegationColor: [55, 60, 78] } },
    ],
    growthRate: 1.1,
    spread: 0.65,
  },

  peaceLily: {
    id: 'peaceLily',
    name: 'Peace Lily',
    latin: 'Spathiphyllum wallisii',
    form: 'bloom',
    rarity: 'common',
    habitat: ['woodland', 'creek'],
    landscape: 'flower',
    description: 'Dark glossy leaves and white sail-like blooms that rise up once it’s settled in.',
    hint: 'White sails above dark leaves, in the shade.',
    look: { hue: 125, sat: 42, light: 28, accentHue: 60, accentSat: 20, accentLight: 95, variegation: 'none', size: 1, flowers: true },
    variants: [
      { id: 'standard', name: 'Standard', rarity: 'common', description: 'Classic white blooms.', look: {} },
      { id: 'domino', name: 'Domino', rarity: 'rare', description: 'Leaves streaked and flecked with white, like spilled paint.', look: { variegation: 'marble', variegationColor: WHITE } },
      { id: 'wraith', name: 'Wraith', rarity: 'unheardOf', sportOnly: true, description: 'White from stem to sail, leaves and all, and faintly luminous.', look: { hue: 90, sat: 8, light: 88, variegation: 'glow', variegationColor: [60, 40, 92] } },
    ],
    growthRate: 1.0,
    spread: 0.4,
  },

  // The figs: little indoor trees, slow to get going and tall once they have.
  fiddleLeafFig: {
    id: 'fiddleLeafFig',
    name: 'Fiddle Leaf Fig',
    latin: 'Ficus lyrata',
    form: 'fig',
    rarity: 'uncommon',
    habitat: ['woodland', 'overgrownClearing'],
    landscape: 'jungle',
    description: 'A little tree hung with huge, leathery leaves shaped like violins. Famously sulky about being moved — but it grows tall once it settles.',
    hint: 'A small tree whose leaves are shaped like violins.',
    look: { hue: 112, sat: 46, light: 30, accentHue: 85, accentSat: 55, accentLight: 48, variegation: 'veins', variegationColor: [95, 38, 42], size: 1.3, fiddle: true },
    variants: [
      { id: 'standard', name: 'Standard', rarity: 'uncommon', description: 'Glossy, dark violin leaves with pale ribs.', look: {} },
      { id: 'bambino', name: 'Bambino', rarity: 'rare', description: 'A dwarf: small, tight, upright leaves on a compact little trunk.', look: { size: 0.85, leafWidth: 0.85 } },
      { id: 'variegata', name: 'Variegata', rarity: 'veryRare', description: 'Every fiddle marbled with creamy yellow, no two alike.', look: { variegation: 'splash', variegationColor: CREAM, light: 34 } },
      { id: 'violinBlue', name: 'Violin Blue', rarity: 'unheardOf', sportOnly: true, description: 'Violins of dusty blue, veined with pale gold.', look: { hue: 215, sat: 30, light: 40, variegation: 'glow', variegationColor: [48, 90, 70] } },
    ],
    growthRate: 0.75,
    spread: 0.3,
  },

  rubberPlant: {
    id: 'rubberPlant',
    name: 'Rubber Plant',
    latin: 'Ficus elastica',
    form: 'fig',
    rarity: 'common',
    habitat: ['woodland', 'dampForest'],
    landscape: 'jungle',
    description: 'Thick, glossy, oval leaves, each unfurling from a blushing red sheath. Tough as old boots and happy almost anywhere.',
    hint: 'Leaves like polished leather, each new one wrapped in red.',
    look: { hue: 132, sat: 34, light: 22, accentHue: 350, accentSat: 60, accentLight: 42, variegation: 'none', size: 1.15, leafWidth: 0.9 },
    variants: [
      { id: 'robusta', name: 'Robusta', rarity: 'common', description: 'Deep green, almost black in the shade.', look: {} },
      { id: 'burgundy', name: 'Burgundy', rarity: 'uncommon', description: 'Leaves so dark a red they read as black until the light hits them.', look: { hue: 345, sat: 30, light: 17, accentHue: 355, accentLight: 36 } },
      { id: 'tineke', name: 'Tineke', rarity: 'rare', description: 'Cream and sage margins around a dark green heart, with a blush of pink on new growth.', look: { variegation: 'edge', variegationColor: CREAM, light: 30, accentHue: 340, accentLight: 66 } },
      { id: 'ruby', name: 'Ruby', rarity: 'veryRare', description: 'Splashed with bright pink where the Tineke is cream.', look: { variegation: 'splash', variegationColor: PINK, light: 28, accentHue: 340, accentLight: 62 } },
      { id: 'obsidian', name: 'Obsidian', rarity: 'unheardOf', sportOnly: true, description: 'Leaves like black glass, with a red ember at every vein.', look: { hue: 340, sat: 30, light: 10, variegation: 'glow', variegationColor: [355, 100, 55] } },
    ],
    growthRate: 0.95,
    spread: 0.35,
  },

  ficusAudrey: {
    id: 'ficusAudrey',
    name: 'Ficus Audrey',
    latin: 'Ficus benghalensis',
    form: 'fig',
    rarity: 'rare',
    habitat: ['overgrownClearing'],
    landscape: 'jungle',
    description: 'The banyan’s houseplant cousin: soft, velvety oval leaves traced with pale veins. Slow, steady and very hard to upset.',
    hint: 'Velvet leaves on a pale trunk, where the clearing is overgrown.',
    look: { hue: 100, sat: 36, light: 36, accentHue: 70, accentSat: 30, accentLight: 70, variegation: 'veins', variegationColor: [75, 35, 72], size: 1.2, leafWidth: 1.05 },
    variants: [
      { id: 'audrey', name: 'Audrey', rarity: 'rare', description: 'Matte green leaves traced with cream veins.', look: {} },
      { id: 'krishna', name: 'Krishna', rarity: 'veryRare', description: 'Every leaf folded into a little cup at the base — the legend says, for stealing butter.', look: { leafWidth: 0.75, ruffled: true, size: 1.05 } },
      { id: 'ghost', name: 'Ghost', rarity: 'unheardOf', sportOnly: true, description: 'Velvet leaves gone the grey of moth wings, veined with light.', look: { hue: 90, sat: 8, light: 70, variegation: 'glow', variegationColor: [70, 60, 88] } },
    ],
    growthRate: 0.8,
    spread: 0.3,
  },

  parlourPalm: {
    id: 'parlourPalm',
    name: 'Parlour Palm',
    latin: 'Chamaedorea elegans',
    form: 'palm',
    rarity: 'common',
    habitat: ['woodland', 'dampForest'],
    landscape: 'jungle',
    description: 'A clump of slender ringed canes, each topped with soft feathery fronds. The palm of every Victorian drawing room: slow, patient and impossible to offend.',
    hint: 'Feathery fronds on slim canes, deep in the shade.',
    look: { hue: 110, sat: 42, light: 36, accentHue: 80, variegation: 'none', size: 1.1 },
    variants: [
      { id: 'elegans', name: 'Elegans', rarity: 'common', description: 'Soft green fronds on green canes.', look: {} },
      { id: 'bella', name: 'Bella', rarity: 'uncommon', description: 'A dwarf: tight, compact, and happy on a windowsill.', look: { size: 0.8, leafWidth: 1.15 } },
      { id: 'goldenCane', name: 'Golden Cane', rarity: 'rare', description: 'Yellow-green fronds on canes the colour of butter.', look: { hue: 82, sat: 55, light: 46 } },
      { id: 'kentia', name: 'Kentia', rarity: 'veryRare', description: 'Tall, dark and stately, with wide arching fronds. The palm of hotel lobbies and ocean liners.', look: { size: 1.4, light: 28, sat: 45, leafWidth: 1.3 } },
      { id: 'moonfrond', name: 'Moonfrond', rarity: 'unheardOf', sportOnly: true, description: 'Fronds of pale silver-blue, each leaflet tipped with light.', look: { hue: 205, sat: 25, light: 62, variegation: 'glow', variegationColor: [195, 90, 85] } },
    ],
    growthRate: 0.8,
    spread: 0.35,
  },

  // ----------------------------------------------------------------- Creek
  syngonium: {
    id: 'syngonium',
    name: 'Arrowhead Vine',
    latin: 'Syngonium podophyllum',
    form: 'heart',
    rarity: 'common',
    habitat: ['creek'],
    landscape: 'vine',
    description: 'Arrow-shaped leaves that go from compact clump to rambling vine as it grows.',
    hint: 'Arrowheads pointing down to the water.',
    look: { hue: 100, sat: 40, light: 45, accentHue: 90, variegation: 'veins', variegationColor: [90, 40, 78], size: 0.95, leafWidth: 0.85 },
    variants: [
      { id: 'whiteButterfly', name: 'White Butterfly', rarity: 'common', description: 'Pale green centres with soft white veins.', look: {} },
      { id: 'neonRobusta', name: 'Neon Robusta', rarity: 'rare', description: 'Soft, blushing pink all over.', look: { hue: 345, sat: 55, light: 72, variegation: 'none' } },
      { id: 'albo', name: 'Albo', rarity: 'veryRare', description: 'Stark white sectors, some leaves entirely ghostly.', look: { variegation: 'splash', variegationColor: WHITE, light: 38 } },
      { id: 'moth', name: 'Moth', rarity: 'unheardOf', sportOnly: true, description: 'Pale arrowheads with a dusting that glows blue-green.', look: { hue: 170, sat: 25, light: 78, variegation: 'glow', variegationColor: [165, 90, 72] } },
    ],
    growthRate: 1.15,
    spread: 0.75,
  },

  peperomia: {
    id: 'peperomia',
    name: 'Radiator Plant',
    latin: 'Peperomia argyreia',
    form: 'coin',
    rarity: 'uncommon',
    habitat: ['creek', 'meadow'],
    landscape: 'color',
    description: 'A neat little mound of fleshy leaves on red stems. The standard one is striped exactly like a watermelon; its cousins come rippled, silvered and red-backed.',
    hint: 'Little striped melons held up on red stems.',
    look: { hue: 120, sat: 38, light: 34, accentHue: 355, accentSat: 55, accentLight: 45, variegation: 'stripe', variegationColor: SILVER, size: 0.7 },
    variants: [
      { id: 'watermelon', name: 'Watermelon', rarity: 'uncommon', description: 'Silver stripes on a green rind.', look: {} },
      { id: 'emeraldRipple', name: 'Emerald Ripple', rarity: 'rare', description: 'Deep green leaves puckered into ridges, like a crumpled heart.', look: { hue: 130, sat: 40, light: 24, variegation: 'none', ruffled: true, leafWidth: 0.85 } },
      { id: 'frost', name: 'Frost', rarity: 'rare', description: 'Rippled leaves gone silver all over, veined in dark green.', look: { sat: 14, light: 72, variegation: 'veins', variegationColor: [130, 30, 30], ruffled: true } },
      { id: 'rosso', name: 'Rosso', rarity: 'veryRare', description: 'Glossy dark tops and undersides of deep red, in a tight little rosette.', look: { hue: 135, sat: 40, light: 22, accentHue: 355, accentLight: 40, variegation: 'veins', variegationColor: [355, 60, 40], size: 0.65 } },
      { id: 'melonlight', name: 'Melonlight', rarity: 'unheardOf', sportOnly: true, description: 'Little melons of dark glass, their stripes lit from inside.', look: { hue: 160, sat: 35, light: 22, variegation: 'glow', variegationColor: [165, 100, 80] } },
    ],
    growthRate: 1.0,
    spread: 0.45,
  },

  calathea: {
    id: 'calathea',
    name: 'Prayer Plant',
    latin: 'Maranta leuconeura',
    form: 'patterned',
    rarity: 'uncommon',
    habitat: ['creek', 'dampForest'],
    landscape: 'color',
    description: 'Its painted leaves fold up at night like hands in prayer. The patterns look hand-drawn.',
    hint: 'Leaves that fold up when the light goes.',
    look: { hue: 110, sat: 38, light: 35, accentHue: 350, accentSat: 60, accentLight: 45, variegation: 'veins', variegationColor: [350, 70, 55], size: 0.9 },
    variants: [
      { id: 'redVein', name: 'Red Vein', rarity: 'uncommon', description: 'Herringbone veins in bright red.', look: {} },
      { id: 'lemonLime', name: 'Lemon Lime', rarity: 'rare', description: 'Zesty yellow-green veins on a lime ground.', look: { hue: 90, light: 42, variegation: 'veins', variegationColor: [65, 80, 68] } },
      { id: 'orbifolia', name: 'Orbifolia', rarity: 'veryRare', description: 'Enormous round leaves, silver-banded like a watermelon rind.', look: { variegation: 'stripe', variegationColor: SILVER, leafWidth: 1.5, size: 1.2 } },
      { id: 'aurora', name: 'Aurora', rarity: 'unheardOf', sportOnly: true, description: 'The pattern runs teal and violet, and keeps its colour after the light has gone.', look: { hue: 190, sat: 50, light: 30, variegation: 'glow', variegationColor: [290, 80, 72] } },
    ],
    growthRate: 0.9,
    spread: 0.35,
  },

  goeppertia: {
    id: 'goeppertia',
    name: 'Calathea',
    latin: 'Goeppertia insignis',
    form: 'patterned',
    rarity: 'uncommon',
    habitat: ['dampForest', 'creek'],
    landscape: 'color',
    description: 'The prayer plant’s showier relations: leaves painted in stripes, spots and feathers, often purple underneath, and just as fussy about dry air.',
    hint: 'Painted leaves with purple backs, where the air is wet.',
    look: { hue: 105, sat: 42, light: 40, accentHue: 290, accentSat: 45, accentLight: 35, variegation: 'speckle', variegationColor: [125, 45, 22], size: 1, leafWidth: 0.75, ruffled: true },
    variants: [
      { id: 'rattlesnake', name: 'Rattlesnake', rarity: 'uncommon', description: 'Long wavy leaves spotted dark green, like a snake’s back.', look: {} },
      { id: 'pinstripe', name: 'Pinstripe', rarity: 'rare', description: 'Near-black leaves ruled with fine pink lines.', look: { hue: 130, sat: 35, light: 22, variegation: 'veins', variegationColor: [340, 70, 72], ruffled: false, leafWidth: 0.95 } },
      { id: 'medallion', name: 'Medallion', rarity: 'veryRare', description: 'Big round leaves feathered silver and dark green, backed in deep purple.', look: { light: 30, variegation: 'marble', variegationColor: SILVER, ruffled: false, leafWidth: 1.35 } },
      { id: 'whiteFusion', name: 'White Fusion', rarity: 'extremelyRare', description: 'Marbled white and green with lilac undersides — beautiful, and notoriously difficult.', look: { light: 44, variegation: 'splash', variegationColor: WHITE, ruffled: false, leafWidth: 1.1, accentHue: 285, accentLight: 60 } },
      { id: 'peacockEye', name: 'Peacock Eye', rarity: 'unheardOf', sportOnly: true, description: 'The spots are eyes now, teal and violet, and they watch you back after dark.', look: { hue: 180, sat: 45, light: 26, variegation: 'glow', variegationColor: [285, 85, 70] } },
    ],
    growthRate: 0.85,
    spread: 0.35,
  },

  // ----------------------------------------------------------- Damp Forest
  bostonFern: {
    id: 'bostonFern',
    name: 'Boston Fern',
    latin: 'Nephrolepis exaltata',
    form: 'fern',
    rarity: 'common',
    habitat: ['dampForest', 'woodland'],
    landscape: 'fern',
    description: 'A fountain of feathery fronds. In numbers, it turns the forest floor into a soft green sea.',
    hint: 'A fountain of feathers in the wet shade.',
    look: { hue: 100, sat: 50, light: 40, accentHue: 90, variegation: 'none', size: 1.05 },
    variants: [
      { id: 'standard', name: 'Standard', rarity: 'common', description: 'Classic arching fronds.', look: {} },
      { id: 'fluffyRuffles', name: 'Fluffy Ruffles', rarity: 'uncommon', description: 'Dense, frilly, overexcited fronds.', look: { ruffled: true, hue: 92, light: 45 } },
      { id: 'tigerFern', name: 'Tiger Fern', rarity: 'rare', description: 'Fronds striped in gold like a lazy cat.', look: { variegation: 'stripe', variegationColor: GOLD } },
      { id: 'frostfeather', name: 'Frostfeather', rarity: 'unheardOf', sportOnly: true, description: 'Fronds of pale ice-blue, tipped with light.', look: { hue: 195, sat: 40, light: 68, variegation: 'glow', variegationColor: [190, 90, 85] } },
    ],
    growthRate: 1.1,
    spread: 0.8,
  },

  birdsNestFern: {
    id: 'birdsNestFern',
    name: "Bird's Nest Fern",
    latin: 'Asplenium nidus',
    form: 'strappy',
    rarity: 'uncommon',
    habitat: ['dampForest'],
    landscape: 'fern',
    description: 'Broad, glossy, wavy blades unfurling from a fuzzy nest at the centre.',
    hint: 'A nest of wavy green blades.',
    look: { hue: 90, sat: 55, light: 45, accentHue: 30, variegation: 'none', size: 1.2, leafWidth: 1.8, ruffled: true },
    variants: [
      { id: 'standard', name: 'Standard', rarity: 'uncommon', description: 'Glossy apple-green blades.', look: {} },
      { id: 'crispyWave', name: 'Crispy Wave', rarity: 'rare', description: 'Tightly crimped blades, like a green lasagne.', look: { hue: 105, light: 38 } },
      { id: 'tidePool', name: 'Tide Pool', rarity: 'unheardOf', sportOnly: true, description: 'A nest of blades gone sea-green and glassy, lit at the rim.', look: { hue: 175, sat: 45, light: 45, variegation: 'glow', variegationColor: [170, 100, 82] } },
    ],
    growthRate: 0.9,
    spread: 0.4,
  },

  alocasia: {
    id: 'alocasia',
    name: 'Dragon Scale Alocasia',
    latin: 'Alocasia baginda',
    form: 'heart',
    rarity: 'rare',
    habitat: ['dampForest'],
    landscape: 'strange',
    description: 'Thick, textured leaves with a metallic sheen, like the hide of something ancient. It only shows itself in the rain.',
    hint: 'Something scaled and silver, glimpsed only in the rain.',
    look: { hue: 160, sat: 18, light: 42, accentHue: 150, variegation: 'veins', variegationColor: [150, 25, 22], size: 1.1, leafWidth: 0.95 },
    variants: [
      { id: 'dragonScale', name: 'Dragon Scale', rarity: 'rare', description: 'Silvery-green scales and dark veins.', look: {} },
      { id: 'silverDragon', name: 'Silver Dragon', rarity: 'veryRare', description: 'Almost entirely pewter-grey, with ghostly veins.', look: { sat: 8, light: 70, variegationColor: [150, 15, 45] } },
      { id: 'wyrm', name: 'Wyrm', rarity: 'unheardOf', sportOnly: true, description: 'Scales of bronze on black, and the veins run gold.', look: { hue: 30, sat: 35, light: 16, variegation: 'glow', variegationColor: [42, 100, 62] } },
    ],
    growthRate: 0.75,
    spread: 0.3,
    appearsWhen: 'rain',
  },

  jewelOrchid: {
    id: 'jewelOrchid',
    name: 'Jewel Orchid',
    latin: 'Ludisia discolor',
    form: 'patterned',
    rarity: 'rare',
    habitat: ['dampForest'],
    landscape: 'strange',
    description: 'Velvet leaves as dark as wine, traced with glittering pink lines that catch lantern light.',
    hint: 'Glittering lines in the dark. You’d need a light to see it.',
    look: { hue: 330, sat: 25, light: 18, accentHue: 50, accentSat: 20, accentLight: 95, variegation: 'veins', variegationColor: [340, 80, 70], size: 0.75, flowers: true },
    variants: [
      { id: 'standard', name: 'Discolor', rarity: 'rare', description: 'Wine-dark velvet with pink veins.', look: {} },
      { id: 'alba', name: 'Alba', rarity: 'veryRare', description: 'Emerald velvet with veins of pure silver.', look: { hue: 140, sat: 35, light: 22, variegationColor: [0, 0, 85] } },
      { id: 'nebula', name: 'Nebula', rarity: 'unheardOf', sportOnly: true, description: 'Velvet so dark it’s blue, netted with veins that shine like a night sky.', look: { hue: 240, sat: 40, light: 12, variegation: 'glow', variegationColor: [40, 60, 90] } },
    ],
    growthRate: 0.7,
    spread: 0.3,
    appearsWhen: 'night',
    needsLantern: true,
  },

  // --------------------------------------------------------- Rocky Clearing
  snakePlant: {
    id: 'snakePlant',
    name: 'Snake Plant',
    latin: 'Dracaena trifasciata',
    form: 'spear',
    rarity: 'common',
    habitat: ['rockyClearing'],
    landscape: 'arid',
    description: 'Stiff sword-leaves banded like snakeskin. Almost impossible to kill, and it spreads by stubborn underground runners.',
    hint: 'Green swords standing up out of the rocks.',
    look: { hue: 105, sat: 35, light: 30, accentHue: 55, variegation: 'stripe', variegationColor: [100, 25, 55], size: 1 },
    variants: [
      { id: 'standard', name: 'Standard', rarity: 'common', description: 'Dark banded green swords.', look: {} },
      { id: 'laurentii', name: 'Laurentii', rarity: 'uncommon', description: 'Each sword trimmed in a golden margin.', look: { variegation: 'edge', variegationColor: GOLD } },
      { id: 'moonshine', name: 'Moonshine', rarity: 'rare', description: 'Pale, silvery mint all over, as if carved from moonlight.', look: { sat: 18, light: 72, variegation: 'none' } },
      { id: 'lightblade', name: 'Lightblade', rarity: 'unheardOf', sportOnly: true, description: 'Blades of pale silver-green, each edge a line of cold light.', look: { hue: 110, sat: 15, light: 62, variegation: 'glow', variegationColor: [170, 90, 80] } },
    ],
    growthRate: 0.8,
    spread: 0.5,
  },

  dracaena: {
    id: 'dracaena',
    name: 'Dragon Tree',
    latin: 'Dracaena marginata',
    form: 'cane',
    rarity: 'common',
    habitat: ['rockyClearing', 'overgrownClearing'],
    landscape: 'jungle',
    description: 'Slim grey canes, each topped with a spiky tuft of narrow leaves edged in red. Old ones fork into several heads and look like something from a dinosaur book.',
    hint: 'Spiky tufts on bare stems, above the rocks.',
    look: { hue: 118, sat: 40, light: 36, accentHue: 355, variegation: 'edge', variegationColor: [355, 55, 36], size: 1.1, leafWidth: 0.85 },
    variants: [
      { id: 'marginata', name: 'Marginata', rarity: 'common', description: 'Dark green blades with a fine red edge.', look: {} },
      { id: 'tricolor', name: 'Tricolor', rarity: 'uncommon', description: 'Cream, green and red striped down every blade.', look: { variegation: 'stripe', variegationColor: CREAM, light: 40 } },
      { id: 'colorama', name: 'Colorama', rarity: 'rare', description: 'The red has taken over: tufts of hot pink with only a thread of green.', look: { hue: 345, sat: 55, light: 50, variegation: 'stripe', variegationColor: [110, 35, 40] } },
      { id: 'songOfIndia', name: 'Song of India', rarity: 'veryRare', description: 'Shorter, broader leaves whorled up the cane, each edged in bright gold.', look: { variegation: 'edge', variegationColor: GOLD, leafWidth: 1.3, light: 36 } },
      { id: 'dragonfire', name: 'Dragonfire', rarity: 'unheardOf', sportOnly: true, description: 'Blades of charcoal, each edge a line of ember-red light.', look: { hue: 20, sat: 20, light: 18, variegation: 'glow', variegationColor: [15, 100, 58] } },
    ],
    growthRate: 0.85,
    spread: 0.35,
  },

  ponytailPalm: {
    id: 'ponytailPalm',
    name: 'Ponytail Palm',
    latin: 'Beaucarnea recurvata',
    form: 'cane',
    rarity: 'uncommon',
    habitat: ['rockyClearing', 'meadow'],
    landscape: 'arid',
    description: 'Not a palm at all, but a desert cousin of the dragon tree: a swollen, elephant-foot trunk that stores water, topped with a fountain of long curling leaves.',
    hint: 'A fat grey foot with a green ponytail.',
    look: { hue: 108, sat: 40, light: 40, accentHue: 70, variegation: 'none', size: 1.05, leafWidth: 0.85, bulb: true },
    variants: [
      { id: 'recurvata', name: 'Recurvata', rarity: 'uncommon', description: 'A tousled green fountain on a cracked grey foot.', look: {} },
      { id: 'goldStar', name: 'Gold Star', rarity: 'rare', description: 'Every leaf edged in a bright yellow stripe.', look: { variegation: 'edge', variegationColor: GOLD } },
      { id: 'stricta', name: 'Stricta', rarity: 'veryRare', description: 'Stiff, straight, blue-grey blades that stand up instead of tumbling.', look: { hue: 165, sat: 20, light: 52, leafWidth: 1.2 } },
      { id: 'fountainlight', name: 'Fountainlight', rarity: 'unheardOf', sportOnly: true, description: 'The ponytail has gone silver, and streams light after dark like a fountain in the moon.', look: { hue: 200, sat: 15, light: 68, variegation: 'glow', variegationColor: [195, 90, 86] } },
    ],
    growthRate: 0.7,
    spread: 0.3,
  },

  echeveria: {
    id: 'echeveria',
    name: 'Echeveria',
    latin: 'Echeveria elegans',
    form: 'rosette',
    rarity: 'common',
    habitat: ['rockyClearing'],
    landscape: 'arid',
    description: 'A perfect frosted rose made of fat succulent leaves. Offsets huddle round the mother like chicks.',
    hint: 'A stone rose, frosted blue.',
    look: { hue: 165, sat: 22, light: 62, accentHue: 350, accentSat: 50, accentLight: 70, variegation: 'none', size: 0.95 },
    variants: [
      { id: 'elegans', name: 'Mexican Snowball', rarity: 'common', description: 'Powdery blue-green rosettes.', look: {} },
      { id: 'perle', name: 'Perle von Nürnberg', rarity: 'uncommon', description: 'Dusky lavender-pink, pearlescent at the tips.', look: { hue: 300, sat: 25, light: 62 } },
      { id: 'cristata', name: 'Cristata', rarity: 'veryRare', description: 'A mutant crest: the rosette has grown into a wavy fan of brains.', look: { ruffled: true, size: 0.9, hue: 150 } },
      { id: 'nightlight', name: 'Nightlight', rarity: 'unheardOf', sportOnly: true, description: 'A rosette of deep indigo that glows from the heart.', look: { hue: 250, sat: 50, light: 35, variegation: 'glow', variegationColor: [260, 100, 78] } },
    ],
    growthRate: 0.9,
    spread: 0.55,
  },

  stringOfPearls: {
    id: 'stringOfPearls',
    name: 'String of Pearls',
    latin: 'Curio rowleyanus',
    form: 'beads',
    rarity: 'uncommon',
    habitat: ['rockyClearing'],
    landscape: 'vine',
    description: 'Long strands of tiny green peas, spilling over stones like a broken necklace.',
    hint: 'Strands of beads spilling over the rocks.',
    look: { hue: 110, sat: 45, light: 48, accentHue: 90, variegation: 'none', size: 0.8 },
    variants: [
      { id: 'standard', name: 'Standard', rarity: 'uncommon', description: 'Bright green pearls.', look: {} },
      { id: 'variegata', name: 'Variegata', rarity: 'veryRare', description: 'Pearls blushing pink and cream.', look: { variegation: 'splash', variegationColor: PINK } },
      { id: 'moonpearls', name: 'Moonpearls', rarity: 'unheardOf', sportOnly: true, description: 'Pearls the milky white of moonstone, each with its own faint light.', look: { hue: 210, sat: 20, light: 85, variegation: 'glow', variegationColor: [200, 80, 88] } },
    ],
    growthRate: 1.0,
    spread: 0.65,
  },

  zzPlant: {
    id: 'zzPlant',
    name: 'ZZ Plant',
    latin: 'Zamioculcas zamiifolia',
    form: 'spear',
    rarity: 'uncommon',
    habitat: ['rockyClearing', 'woodland'],
    landscape: 'jungle',
    description: 'Waxy leaflets marching up stiff stems. It shrugs off drought, darkness and neglect.',
    hint: 'Waxy ladders of leaves, gleaming.',
    look: { hue: 120, sat: 45, light: 30, accentHue: 100, variegation: 'none', size: 0.95, leafWidth: 1.2 },
    variants: [
      { id: 'standard', name: 'Standard', rarity: 'uncommon', description: 'Glossy green ladders.', look: {} },
      { id: 'raven', name: 'Raven', rarity: 'rare', description: 'Leaves that ripen to a glossy near-black.', look: { hue: 260, sat: 15, light: 13 } },
      { id: 'oilslick', name: 'Oilslick', rarity: 'unheardOf', sportOnly: true, description: 'Leaves black-green with the colours of oil on water.', look: { hue: 280, sat: 40, light: 22, variegation: 'glow', variegationColor: [160, 90, 60] } },
    ],
    growthRate: 0.8,
    spread: 0.35,
  },

  // ------------------------------------------------ Rocky Clearing: cacti
  bunnyEars: {
    id: 'bunnyEars',
    name: 'Bunny Ear Cactus',
    latin: 'Opuntia microdasys',
    form: 'paddle',
    rarity: 'common',
    habitat: ['rockyClearing'],
    landscape: 'arid',
    description: 'Flat pads stacked two by two like rabbit ears, dotted with soft-looking tufts. Don’t pet it — those tufts are glochids, and they get everywhere.',
    hint: 'Polka-dotted ears poking up between the stones.',
    look: { hue: 95, sat: 38, light: 44, accentHue: 52, accentSat: 90, accentLight: 66, variegation: 'none', size: 0.95, spines: [50, 85, 70], spineLength: 0, flowers: true },
    variants: [
      { id: 'golden', name: 'Golden', rarity: 'common', description: 'Fresh green pads with golden polka dots.', look: {} },
      { id: 'albata', name: 'Albata', rarity: 'uncommon', description: 'Snow-white dots — the “angel wings” form.', look: { spines: [60, 15, 96], light: 46 } },
      { id: 'rufida', name: 'Rufida', rarity: 'rare', description: 'Blue-grey pads freckled with cinnamon-red tufts.', look: { hue: 150, sat: 18, light: 46, spines: [18, 60, 42] } },
      { id: 'variegata', name: 'Variegata', rarity: 'veryRare', description: 'Pads splashed with buttery cream, every one different.', look: { variegation: 'splash', variegationColor: CREAM } },
      { id: 'seaGlass', name: 'Sea Glass', rarity: 'unheardOf', sportOnly: true, description: 'Pads of frosted turquoise, the spines white and faintly bright.', look: { hue: 175, sat: 55, light: 62, variegation: 'glow', variegationColor: [180, 100, 85], spines: [180, 40, 92] } },
    ],
    growthRate: 0.75,
    spread: 0.35,
  },

  goldenBarrel: {
    id: 'goldenBarrel',
    name: 'Golden Barrel Cactus',
    latin: 'Echinocactus grusonii',
    form: 'globe',
    rarity: 'uncommon',
    habitat: ['rockyClearing'],
    landscape: 'arid',
    description: 'A fat green ball striped with ribs of golden spines, slowly nesting a ring of pups around its base.',
    hint: 'A green ball bristling gold, sitting in the sun.',
    look: { hue: 110, sat: 40, light: 36, accentHue: 50, accentSat: 90, accentLight: 62, variegation: 'none', size: 1, spines: [48, 90, 62], flowers: true },
    variants: [
      { id: 'golden', name: 'Golden', rarity: 'uncommon', description: 'The classic ball of gold.', look: {} },
      { id: 'albispinus', name: 'Albispinus', rarity: 'rare', description: 'Every spine bleached bone white.', look: { spines: [50, 15, 94] } },
      { id: 'inermis', name: 'Inermis', rarity: 'veryRare', description: 'Almost spineless — just soft woolly buttons down smooth green ribs.', look: { spineLength: 0.15, light: 40 } },
      { id: 'emberBarrel', name: 'Ember Barrel', rarity: 'unheardOf', sportOnly: true, description: 'A ball of dark coal, its ribs lit orange from within.', look: { hue: 20, sat: 40, light: 20, variegation: 'glow', variegationColor: [25, 100, 60], spines: [25, 90, 60] } },
    ],
    growthRate: 0.6,
    spread: 0.25,
  },

  moonCactus: {
    id: 'moonCactus',
    name: 'Moon Cactus',
    latin: 'Gymnocalycium mihanovichii',
    form: 'globe',
    rarity: 'uncommon',
    habitat: ['rockyClearing'],
    landscape: 'strange',
    description: 'A ball with no green at all, so bright it can’t feed itself — it rides on the shoulders of a plainer cactus. Only seems to turn up after dark.',
    hint: 'Something glows like a sweet on a stick, only by moonlight.',
    look: { hue: 355, sat: 80, light: 52, accentHue: 330, accentSat: 60, accentLight: 82, variegation: 'none', size: 0.9, spines: [40, 20, 80], spineLength: 0.4, grafted: true, flowers: true },
    variants: [
      { id: 'ruby', name: 'Ruby', rarity: 'uncommon', description: 'Lipstick red.', look: {} },
      { id: 'sunset', name: 'Sunset', rarity: 'uncommon', description: 'Tangerine orange.', look: { hue: 25, sat: 90, light: 56 } },
      { id: 'lemon', name: 'Lemon', rarity: 'rare', description: 'Sherbet yellow.', look: { hue: 52, sat: 90, light: 60 } },
      { id: 'bubblegum', name: 'Bubblegum', rarity: 'rare', description: 'Candy pink.', look: { hue: 330, sat: 75, light: 70 } },
      { id: 'harlequin', name: 'Harlequin', rarity: 'veryRare', description: 'Red patched with gold and green, like it couldn’t decide.', look: { variegation: 'splash', variegationColor: GOLD } },
      { id: 'eclipse', name: 'Eclipse', rarity: 'unheardOf', sportOnly: true, description: 'The grafted ball gone black, with a corona of light around its rim.', look: { hue: 270, sat: 40, light: 14, variegation: 'glow', variegationColor: [50, 100, 80] } },
    ],
    growthRate: 0.8,
    spread: 0.2,
    appearsWhen: 'night',
  },

  fairyCastle: {
    id: 'fairyCastle',
    name: 'Fairy Castle Cactus',
    latin: 'Acanthocereus tetragonus',
    form: 'column',
    rarity: 'common',
    habitat: ['rockyClearing', 'meadow'],
    landscape: 'arid',
    description: 'A cluster of little ribbed towers that keeps adding turrets. Said to flower once a decade, which may just be a story.',
    hint: 'A tiny green city of towers among the rocks.',
    look: { hue: 118, sat: 42, light: 38, accentHue: 50, accentSat: 30, accentLight: 94, variegation: 'none', size: 0.9, spines: [45, 30, 86], spineLength: 0.6 },
    variants: [
      { id: 'standard', name: 'Standard', rarity: 'common', description: 'Deep green towers.', look: {} },
      { id: 'blueSpire', name: 'Blue Spire', rarity: 'uncommon', description: 'Frosted blue-green, as if dusted with chalk.', look: { hue: 170, sat: 22, light: 48 } },
      { id: 'fairyGold', name: 'Fairy Gold', rarity: 'rare', description: 'Towers streaked and capped with gold.', look: { variegation: 'splash', variegationColor: GOLD } },
      { id: 'moonlit', name: 'Moonlit', rarity: 'veryRare', description: 'It finally flowered: big white blossoms on every tower.', look: { flowers: true } },
      { id: 'lanternTown', name: 'Lantern Town', rarity: 'unheardOf', sportOnly: true, description: 'Every tower topped with a window of warm light.', look: { hue: 120, sat: 30, light: 30, variegation: 'glow', variegationColor: [40, 100, 70] } },
    ],
    growthRate: 0.85,
    spread: 0.4,
  },

  oldManCactus: {
    id: 'oldManCactus',
    name: 'Old Man Cactus',
    latin: 'Cephalocereus senilis',
    form: 'column',
    rarity: 'rare',
    habitat: ['rockyClearing'],
    landscape: 'strange',
    description: 'A column wrapped in long, shaggy white hair — sunscreen for the cactus, and a very good beard.',
    hint: 'A little grey-haired figure standing very still.',
    look: { hue: 120, sat: 25, light: 40, accentHue: 340, accentSat: 55, accentLight: 70, variegation: 'none', size: 0.85, spines: [50, 8, 95], spineLength: 0.3, hairy: true, leafWidth: 1.25 },
    variants: [
      { id: 'silver', name: 'Silver', rarity: 'rare', description: 'A full head of white hair.', look: {} },
      { id: 'goldenLocks', name: 'Golden Locks', rarity: 'veryRare', description: 'Hair the colour of straw in the sun.', look: { spines: [45, 70, 72] } },
      { id: 'blossom', name: 'Blossom', rarity: 'extremelyRare', description: 'An old, old plant, crowned with pink flowers.', look: { flowers: true } },
      { id: 'wisp', name: 'Will-o’-the-Wisp', rarity: 'unheardOf', sportOnly: true, description: 'Hair of pale blue that drifts, and glows.', look: { hue: 200, sat: 30, light: 45, variegation: 'glow', variegationColor: [195, 100, 82], hairy: true } },
    ],
    growthRate: 0.6,
    spread: 0.15,
  },

  // --------------------------------------------- Rocky Clearing: succulents
  jadePlant: {
    id: 'jadePlant',
    name: 'Jade Plant',
    latin: 'Crassula ovata',
    form: 'jade',
    rarity: 'common',
    habitat: ['rockyClearing', 'meadow'],
    landscape: 'arid',
    description: 'A tiny tree with a thick trunk and fat, glossy, coin-shaped leaves. Snap off a leaf and it becomes a new tree.',
    hint: 'A bonsai nobody planted, with leaves like green coins.',
    look: { hue: 125, sat: 40, light: 36, accentHue: 0, accentSat: 60, accentLight: 45, variegation: 'none', size: 1 },
    variants: [
      { id: 'standard', name: 'Standard', rarity: 'common', description: 'Deep jade green leaves, blushed red at the rims.', look: {} },
      { id: 'hummelsSunset', name: 'Hummel’s Sunset', rarity: 'uncommon', description: 'Golden leaves with fiery red edges.', look: { hue: 55, sat: 60, light: 50, variegation: 'edge', variegationColor: [5, 70, 50] } },
      { id: 'gollum', name: 'Gollum', rarity: 'rare', description: 'Tubular leaves with little red suction cups at the tips. Looks like it wants to shake hands.', look: { leafWidth: 0.5 } },
      { id: 'tricolor', name: 'Tricolor', rarity: 'veryRare', description: 'Green, cream and pink, all on one leaf.', look: { variegation: 'splash', variegationColor: CREAM, accentHue: 340, accentLight: 65 } },
      { id: 'lapis', name: 'Lapis', rarity: 'unheardOf', sportOnly: true, description: 'Fat leaves of deep lapis blue, each edged in gold.', look: { hue: 225, sat: 60, light: 38, variegation: 'glow', variegationColor: [45, 90, 65] } },
    ],
    growthRate: 0.8,
    spread: 0.35,
  },

  aloe: {
    id: 'aloe',
    name: 'Aloe Vera',
    latin: 'Aloe barbadensis miller',
    form: 'spiky',
    rarity: 'common',
    habitat: ['rockyClearing', 'meadow'],
    landscape: 'arid',
    description: 'Plump, toothed spears full of cool gel. Makes pups all around itself until the pot gives up.',
    hint: 'Fat green spears with soft teeth along the edges.',
    look: { hue: 120, sat: 24, light: 46, accentHue: 28, accentSat: 90, accentLight: 58, variegation: 'speckle', variegationColor: [90, 20, 80], size: 1, spines: [60, 25, 88], flowers: true },
    variants: [
      { id: 'standard', name: 'Standard', rarity: 'common', description: 'Grey-green and faintly freckled.', look: {} },
      { id: 'pinkBlush', name: 'Pink Blush', rarity: 'rare', description: 'Dark leaves covered in raised pink freckles.', look: { hue: 150, sat: 25, light: 30, variegationColor: PINK, spines: [340, 60, 72] } },
      { id: 'crosby', name: 'Crosby’s Prolific', rarity: 'uncommon', description: 'Short, stubby and pupping like mad.', look: { size: 0.8, leafWidth: 1.2, variegation: 'none' } },
      { id: 'seafire', name: 'Seafire', rarity: 'unheardOf', sportOnly: true, description: 'Translucent teal leaves, speckled with points of light.', look: { hue: 180, sat: 50, light: 50, variegation: 'glow', variegationColor: [170, 100, 85] } },
    ],
    growthRate: 1.0,
    spread: 0.5,
  },

  zebraHaworthia: {
    id: 'zebraHaworthia',
    name: 'Zebra Haworthia',
    latin: 'Haworthiopsis attenuata',
    form: 'spiky',
    rarity: 'uncommon',
    habitat: ['rockyClearing'],
    landscape: 'arid',
    description: 'A little dark rosette banded with raised white stripes. Happy in the shadow of a bigger rock.',
    hint: 'Stripes like a zebra, tucked under a rock.',
    look: { hue: 140, sat: 35, light: 26, accentHue: 90, variegation: 'stripe', variegationColor: WHITE, size: 0.75 },
    variants: [
      { id: 'standard', name: 'Standard', rarity: 'uncommon', description: 'Dark green with pearly bands.', look: {} },
      { id: 'superWhite', name: 'Super White', rarity: 'rare', description: 'Bands so thick and white it’s almost more white than green.', look: { light: 18, leafWidth: 1.3 } },
      { id: 'variegata', name: 'Variegata', rarity: 'veryRare', description: 'Whole leaves turned gold, stripes and all.', look: { hue: 50, sat: 60, light: 52, variegationColor: [40, 30, 92] } },
      { id: 'constellation', name: 'Constellation', rarity: 'unheardOf', sportOnly: true, description: 'Black leaves banded with stars instead of stripes.', look: { hue: 220, sat: 30, light: 14, variegation: 'glow', variegationColor: [55, 60, 92] } },
    ],
    growthRate: 0.8,
    spread: 0.45,
  },

  burrosTail: {
    id: 'burrosTail',
    name: 'Burro’s Tail',
    latin: 'Sedum morganianum',
    form: 'beads',
    rarity: 'uncommon',
    habitat: ['rockyClearing'],
    landscape: 'vine',
    description: 'Ropes of plump, powder-blue leaves that tumble over ledges. Brush past it and it drops leaves — each one a new plant.',
    hint: 'Blue ropes spilling off a ledge.',
    look: { hue: 160, sat: 22, light: 58, accentHue: 330, variegation: 'none', size: 1.05 },
    variants: [
      { id: 'standard', name: 'Standard', rarity: 'uncommon', description: 'Frosted blue-green braids.', look: {} },
      { id: 'burrito', name: 'Burrito', rarity: 'rare', description: 'Tighter, rounder, bluer beads.', look: { hue: 185, sat: 28, light: 62, size: 0.85 } },
      { id: 'blushing', name: 'Blushing', rarity: 'veryRare', description: 'Sun-stressed tips gone rosy pink.', look: { variegation: 'splash', variegationColor: PINK } },
      { id: 'auroraTail', name: 'Aurora Tail', rarity: 'unheardOf', sportOnly: true, description: 'Ropes of leaves that shift green to violet, and light up at dusk.', look: { hue: 290, sat: 35, light: 55, variegation: 'glow', variegationColor: [300, 90, 78] } },
    ],
    growthRate: 0.9,
    spread: 0.5,
  },

  livingStones: {
    id: 'livingStones',
    name: 'Living Stones',
    latin: 'Lithops',
    form: 'stones',
    rarity: 'rare',
    habitat: ['rockyClearing'],
    landscape: 'strange',
    description: 'A pair of leaves pretending to be a pebble, right down to the speckles. You could walk past a hundred and never know.',
    hint: 'One of the pebbles here is alive.',
    look: { hue: 34, sat: 22, light: 62, accentHue: 25, accentSat: 20, accentLight: 42, variegation: 'none', size: 1.1, flowers: true },
    variants: [
      { id: 'sandstone', name: 'Sandstone', rarity: 'rare', description: 'Sandy tan with a darker, mottled window.', look: {} },
      { id: 'olive', name: 'Olive', rarity: 'rare', description: 'Olive-green stones with spotted tops.', look: { hue: 75, sat: 25, light: 48, accentHue: 70, accentLight: 32 } },
      { id: 'rubra', name: 'Optica Rubra', rarity: 'extremelyRare', description: 'Glowing ruby-red, like a pair of cherry sweets.', look: { hue: 350, sat: 50, light: 48, accentHue: 350, accentSat: 45, accentLight: 62 } },
      { id: 'meteorite', name: 'Meteorite', rarity: 'unheardOf', sportOnly: true, description: 'Pebbles of iron-black with a seam of molten light.', look: { hue: 20, sat: 15, light: 22, variegation: 'glow', variegationColor: [25, 100, 62] } },
    ],
    growthRate: 0.55,
    spread: 0.2,
  },

  // ------------------------------------------------------ Overgrown Clearing
  hoya: {
    id: 'hoya',
    name: 'Wax Plant',
    latin: 'Hoya carnosa',
    form: 'trailing',
    rarity: 'uncommon',
    habitat: ['overgrownClearing'],
    landscape: 'flower',
    description: 'Thick waxy leaves on long vines, and — once it’s old enough — clusters of star-shaped flowers that smell of honey at night.',
    hint: 'Waxy stars hanging from the tangle.',
    look: { hue: 120, sat: 35, light: 32, accentHue: 345, accentSat: 55, accentLight: 82, variegation: 'none', size: 1, leafWidth: 0.9, flowers: true },
    variants: [
      { id: 'carnosa', name: 'Carnosa', rarity: 'uncommon', description: 'Glossy green leaves, pale pink stars.', look: {} },
      { id: 'krimsonQueen', name: 'Krimson Queen', rarity: 'rare', description: 'Cream-edged leaves with pink new growth.', look: { variegation: 'edge', variegationColor: [345, 60, 85] } },
      { id: 'compacta', name: 'Hindu Rope', rarity: 'veryRare', description: 'Leaves curled and crumpled into thick green ropes.', look: { ruffled: true, leafWidth: 0.7 } },
      { id: 'starCluster', name: 'Star Cluster', rarity: 'unheardOf', sportOnly: true, description: 'Waxy leaves of midnight blue; the flowers are clusters of small lights.', look: { hue: 230, sat: 45, light: 25, variegation: 'glow', variegationColor: [50, 80, 88], flowers: true } },
    ],
    growthRate: 0.95,
    spread: 0.6,
  },

  begonia: {
    id: 'begonia',
    name: 'Polka Dot Begonia',
    latin: 'Begonia maculata',
    form: 'patterned',
    rarity: 'uncommon',
    habitat: ['overgrownClearing'],
    landscape: 'color',
    description: 'Angel-wing leaves, olive on top with silver polka dots, blood-red underneath. It looks invented.',
    hint: 'Silver polka dots under the brambles.',
    look: { hue: 110, sat: 35, light: 26, accentHue: 355, accentSat: 60, accentLight: 45, variegation: 'speckle', variegationColor: SILVER, size: 0.95, leafWidth: 0.75, flowers: true },
    variants: [
      { id: 'maculata', name: 'Maculata', rarity: 'uncommon', description: 'Silver dots on olive angel wings.', look: {} },
      { id: 'wightii', name: 'Wightii', rarity: 'rare', description: 'Bigger, brighter dots — almost more silver than leaf.', look: { variegationColor: WHITE, leafWidth: 0.85 } },
      { id: 'galaxy', name: 'Galaxy', rarity: 'unheardOf', sportOnly: true, description: 'The dots are lit: a leaf full of stars on a black sky.', look: { hue: 260, sat: 35, light: 14, variegation: 'glow', variegationColor: [55, 60, 92] } },
    ],
    growthRate: 1.05,
    spread: 0.45,
  },

  fittonia: {
    id: 'fittonia',
    name: 'Nerve Plant',
    latin: 'Fittonia albivenis',
    form: 'patterned',
    rarity: 'common',
    habitat: ['overgrownClearing', 'creek'],
    landscape: 'color',
    description: 'Small leaves netted with brilliant veins. En masse it looks like stained glass on the ground.',
    hint: 'A net of bright veins, low to the ground.',
    look: { hue: 115, sat: 40, light: 32, accentHue: 0, variegation: 'veins', variegationColor: [0, 0, 92], size: 0.6 },
    variants: [
      { id: 'white', name: 'White Anne', rarity: 'common', description: 'Crisp white veins on dark green.', look: {} },
      { id: 'ruby', name: 'Ruby Red', rarity: 'uncommon', description: 'Hot-pink veins bleeding into the leaf.', look: { variegationColor: [345, 75, 58] } },
      { id: 'frankie', name: 'Frankie', rarity: 'rare', description: 'Almost entirely soft pink, edged in green.', look: { hue: 345, sat: 55, light: 70, variegation: 'edge', variegationColor: [110, 40, 35] } },
      { id: 'liveWire', name: 'Live Wire', rarity: 'unheardOf', sportOnly: true, description: 'Veins of electric blue that pulse faintly after dark.', look: { hue: 115, sat: 30, light: 20, variegation: 'glow', variegationColor: [200, 100, 70] } },
    ],
    growthRate: 1.2,
    spread: 0.7,
  },

  anthurium: {
    id: 'anthurium',
    name: 'Velvet Anthurium',
    latin: 'Anthurium clarinervium',
    form: 'heart',
    rarity: 'veryRare',
    habitat: ['overgrownClearing'],
    landscape: 'strange',
    description: 'Deep velvet hearts with veins like white chalk lines. Grown ones look like they’re lit from inside.',
    hint: 'The fox knows something about this clearing.',
    look: { hue: 135, sat: 45, light: 18, accentHue: 0, variegation: 'veins', variegationColor: [90, 20, 88], size: 1.15, leafWidth: 1.15 },
    variants: [
      { id: 'clarinervium', name: 'Clarinervium', rarity: 'veryRare', description: 'Black-green velvet, chalk-white veins.', look: {} },
      { id: 'crystallinum', name: 'Crystallinum', rarity: 'extremelyRare', description: 'Huge, glittering leaves with crystalline silver veins and blushing new growth.', look: { size: 1.4, light: 24, variegationColor: [180, 30, 92] } },
      { id: 'phosphor', name: 'Phosphor', rarity: 'unheardOf', sportOnly: true, description: 'Velvet gone the green of deep water, with veins of white fire.', look: { hue: 165, sat: 50, light: 15, variegation: 'glow', variegationColor: [140, 100, 85], size: 1.2 } },
    ],
    growthRate: 0.65,
    spread: 0.25,
    foxOnly: true,
  },

  // -------------------------------------------------- Creek & Damp Forest bogs
  sundew: {
    id: 'sundew',
    name: 'Sundew',
    latin: 'Drosera spatulata',
    form: 'dew',
    rarity: 'common',
    habitat: ['creek', 'dampForest'],
    landscape: 'strange',
    description: 'A rosette no bigger than a coin, every spoon-shaped leaf bristling with hairs tipped in glue. It sparkles in the sun like it’s just been rained on — and anything that lands stays.',
    hint: 'Something tiny sparkles in the wet ground.',
    look: { hue: 95, sat: 45, light: 42, accentHue: 352, accentSat: 72, accentLight: 46, variegation: 'none', size: 0.7, flowers: true },
    variants: [
      { id: 'spoonleaf', name: 'Spoon-leaf', rarity: 'common', description: 'Green spoons fringed with red, dew-tipped hairs.', look: {} },
      { id: 'alba', name: 'Alba', rarity: 'uncommon', description: 'Pale hairs and clear dew, like frost that never melts.', look: { hue: 88, light: 50, accentHue: 80, accentSat: 30, accentLight: 82 } },
      { id: 'ruby', name: 'Ruby', rarity: 'rare', description: 'Red to the tips, glittering all over.', look: { hue: 356, sat: 52, light: 36, accentHue: 350, accentLight: 56 } },
      { id: 'starlight', name: 'Starlight', rarity: 'unheardOf', sportOnly: true, description: 'Each drop of dew a point of cold light.', look: { hue: 95, sat: 30, light: 42, variegation: 'glow', variegationColor: [190, 100, 88] } },
    ],
    growthRate: 1.1,
    spread: 0.55,
  },

  venusFlytrap: {
    id: 'venusFlytrap',
    name: 'Venus Flytrap',
    latin: 'Dionaea muscipula',
    form: 'trap',
    rarity: 'uncommon',
    habitat: ['creek'],
    landscape: 'strange',
    description: 'Every leaf ends in a hinged trap fringed with teeth. Brush two of the trigger hairs inside and it snaps shut — so please don’t.',
    hint: 'Little green mouths, open by the water.',
    look: { hue: 100, sat: 50, light: 40, accentHue: 355, accentSat: 68, accentLight: 44, variegation: 'none', size: 0.85 },
    variants: [
      { id: 'typical', name: 'Typical', rarity: 'uncommon', description: 'Green traps blushing red inside.', look: {} },
      { id: 'sawtooth', name: 'Sawtooth', rarity: 'rare', description: 'Stubby, jagged teeth like a bread knife.', look: { spineLength: 0.4 } },
      { id: 'b52', name: 'B52', rarity: 'rare', description: 'Huge traps on a hungry-looking plant.', look: { size: 1.1 } },
      { id: 'redDragon', name: 'Red Dragon', rarity: 'veryRare', description: 'Deep burgundy from root to tooth.', look: { hue: 350, sat: 55, light: 26, accentHue: 352, accentLight: 36 } },
      { id: 'lanternJaw', name: 'Lantern Jaw', rarity: 'unheardOf', sportOnly: true, description: 'The traps glow red from inside, like a coal in a grate.', look: { hue: 100, sat: 45, light: 36, accentHue: 355, variegation: 'glow', variegationColor: [355, 100, 60] } },
    ],
    growthRate: 0.8,
    spread: 0.35,
  },

  trumpetPitcher: {
    id: 'trumpetPitcher',
    name: 'Trumpet Pitcher',
    latin: 'Sarracenia flava',
    form: 'pitcher',
    rarity: 'uncommon',
    habitat: ['creek'],
    landscape: 'strange',
    description: 'Hollow leaves standing up like trumpets, each with a little hood to keep the rain out. Insects follow the nectar in and find there’s no way back up.',
    hint: 'Tall trumpets standing in the shallows.',
    look: { hue: 75, sat: 55, light: 46, accentHue: 58, accentSat: 80, accentLight: 60, variegation: 'none', variegationColor: [355, 60, 38], size: 1, flowers: true },
    variants: [
      { id: 'flava', name: 'Yellow', rarity: 'uncommon', description: 'Yellow-green trumpets with a faint red throat.', look: {} },
      { id: 'copper', name: 'Copper Top', rarity: 'rare', description: 'Trumpets flushed coppery red from the hood down.', look: { hue: 40, sat: 45, light: 40, accentHue: 12, accentSat: 60, accentLight: 44, variegationColor: [355, 55, 28] } },
      { id: 'whiteTop', name: 'White Top', rarity: 'veryRare', description: 'Frosted white hoods netted with crimson veins.', look: { accentHue: 60, accentSat: 15, accentLight: 92, variegationColor: [350, 70, 42] } },
      { id: 'candle', name: 'Candle', rarity: 'unheardOf', sportOnly: true, description: 'Pale trumpets lit from within, a flame in each hood.', look: { hue: 55, sat: 35, light: 78, variegation: 'glow', variegationColor: [40, 100, 70] } },
    ],
    growthRate: 0.9,
    spread: 0.45,
  },

  monkeyCups: {
    id: 'monkeyCups',
    name: 'Tropical Pitcher Plant',
    latin: 'Nepenthes × ventrata',
    form: 'cups',
    rarity: 'rare',
    habitat: ['dampForest'],
    landscape: 'strange',
    description: 'A scrambling vine whose leaf tips stretch into tendrils, each ending in a lidded cup of rainwater. It only seems to show itself when the forest is dripping.',
    hint: 'In the dripping forest, something hangs little lidded cups.',
    look: { hue: 100, sat: 45, light: 38, accentHue: 88, accentSat: 45, accentLight: 46, variegation: 'none', variegationColor: [355, 60, 40], size: 1.1 },
    variants: [
      { id: 'ventrata', name: 'Ventrata', rarity: 'rare', description: 'Green cups speckled and lipped with red.', look: {} },
      { id: 'bloodyMary', name: 'Bloody Mary', rarity: 'veryRare', description: 'Claret cups with a glossy red lip.', look: { accentHue: 355, accentSat: 58, accentLight: 34, variegationColor: [350, 70, 24] } },
      { id: 'rajah', name: 'Rajah', rarity: 'extremelyRare', description: 'Enormous wine-red cups with a ribbed golden lip, big enough to hold a teacup of rain.', look: { size: 1.45, accentHue: 5, accentSat: 55, accentLight: 36, variegationColor: [40, 75, 55] } },
      { id: 'abyss', name: 'Abyss', rarity: 'unheardOf', sportOnly: true, description: 'Cups of deep violet-black, each with a light at the bottom like a lure.', look: { hue: 270, sat: 40, light: 18, variegation: 'glow', variegationColor: [180, 100, 70] } },
    ],
    growthRate: 0.75,
    spread: 0.35,
    appearsWhen: 'rain',
  },

  foxglowAroid: {
    id: 'foxglowAroid',
    name: 'Foxglow Aroid',
    latin: 'Vulpicarpa nocturna',
    form: 'splitleaf',
    rarity: 'extremelyRare',
    habitat: ['dampForest', 'woodland'],
    landscape: 'strange',
    description: 'Not in any book. Russet leaves with veins that glow faintly amber after dark. The fox seems to tend to it.',
    hint: 'There is something the fox has never shown you.',
    look: { hue: 18, sat: 55, light: 36, accentHue: 38, accentSat: 95, accentLight: 62, variegation: 'glow', variegationColor: [38, 95, 62], size: 1.15 },
    variants: [
      { id: 'ember', name: 'Ember', rarity: 'extremelyRare', description: 'Russet leaves, amber glow.', look: {} },
      { id: 'moonfox', name: 'Moonfox', rarity: 'extremelyRare', description: 'Pale silver leaves with a cold blue glow.', look: { hue: 200, sat: 20, light: 62, accentHue: 190, variegationColor: [190, 90, 70] } },
      { id: 'sunfox', name: 'Sunfox', rarity: 'unheardOf', sportOnly: true, description: 'Gold leaves that glow even by day. The fox won’t go near it.', look: { hue: 45, sat: 80, light: 55, accentHue: 50, variegationColor: [50, 100, 75] } },
    ],
    growthRate: 0.7,
    spread: 0.3,
    foxOnly: true,
  },
};

// The single rarest plant in the valley. It is never announced and never
// explained: it doesn't grow in any ordinary patch, can't be bought or sold,
// and only turns up through a handful of unlikely ecological chances (see
// systems/rarity.ts). It is simply a plant — discovered, grown, propagated
// and planted out like any other.
PLANTS.cannabisSativa = {
  id: 'cannabisSativa',
  name: 'Cannabis sativa',
  latin: 'Cannabis sativa',
  form: 'palmate',
  rarity: 'mythic',
  habitat: ['meadow', 'overgrownClearing'],
  landscape: 'jungle',
  description: 'A tall, quick annual herb. Each leaf is an open hand of narrow, saw-edged leaflets. Nobody in the valley has a record of it growing here.',
  hint: 'An open hand of narrow, saw-edged leaves. Nobody has recorded it here.',
  look: { hue: 104, sat: 46, light: 36, accentHue: 80, variegation: 'none', size: 1.15, leafWidth: 0.8 },
  variants: [{ id: 'wild', name: 'Wild', rarity: 'mythic', description: 'Unmistakable, once you have seen it.', look: {} }],
  growthRate: 1.25,
  spread: 0.4,
  secret: true,
  keepsake: true,
  unlisted: true,
};

// Its shorter, broad-leafed cousin, from the rocky high ground. It turns up
// the same unlikely ways the sativa does.
PLANTS.cannabisIndica = {
  id: 'cannabisIndica',
  name: 'Cannabis indica',
  latin: 'Cannabis indica',
  form: 'palmate',
  rarity: 'mythic',
  habitat: ['rockyClearing', 'woodland'],
  landscape: 'jungle',
  description: 'A short, bushy herb with broad, dark leaflets spread like a wide hand. Nobody in the valley has a record of it growing here.',
  hint: 'A broad, dark, open hand of leaves. Nobody has recorded it here.',
  look: { hue: 118, sat: 42, light: 28, accentHue: 96, variegation: 'none', size: 0.95, leafWidth: 1.15 },
  variants: [{ id: 'wild', name: 'Wild', rarity: 'mythic', description: 'Broad-leafed and compact.', look: {} }],
  growthRate: 1.1,
  spread: 0.35,
  secret: true,
  keepsake: true,
  unlisted: true,
};

// Never found: only made, by crossing the two.
PLANTS.cannabisHybrid = {
  id: 'cannabisHybrid',
  name: 'Cannabis hybrid',
  latin: 'Cannabis sativa × indica',
  form: 'palmate',
  rarity: 'mythic',
  habitat: ['meadow', 'rockyClearing'],
  landscape: 'jungle',
  description: 'A cross of the sativa and the indica: taller than one, fuller than the other, with leaflets somewhere in between.',
  hint: 'Something that only comes from two others.',
  look: { hue: 110, sat: 44, light: 32, accentHue: 88, variegation: 'none', size: 1.05, leafWidth: 0.98 },
  variants: [{ id: 'cross', name: 'Cross', rarity: 'mythic', description: 'Half of each parent.', look: {} }],
  growthRate: 1.2,
  spread: 0.35,
  secret: true,
  keepsake: true,
  unlisted: true,
  parents: ['cannabisSativa', 'cannabisIndica'],
};

export const PLANT_LIST: PlantDef[] = Object.values(PLANTS);

export const RARITY_ORDER: Rarity[] = ['common', 'uncommon', 'rare', 'veryRare', 'extremelyRare', 'unheardOf', 'mythic'];

export const RARITY_LABEL: Record<Rarity, string> = {
  common: 'Common',
  uncommon: 'Uncommon',
  rare: 'Rare',
  veryRare: 'Very Rare',
  extremelyRare: 'Extremely Rare',
  unheardOf: 'Unheard Of',
  mythic: 'Mythic',
};

export function rarityRank(r: Rarity): number {
  return RARITY_ORDER.indexOf(r);
}

export function findVariant(defId: string, variantId: string) {
  const def = PLANTS[defId];
  return def?.variants.find((v) => v.id === variantId) ?? def?.variants[0];
}

/** A specimen is as rare as the rarer of its species and its variant. */
export function specimenRarity(defId: string, variantId: string): Rarity {
  const def = PLANTS[defId];
  const variant = findVariant(defId, variantId);
  if (!def || !variant) return 'common';
  return rarityRank(variant.rarity) > rarityRank(def.rarity) ? variant.rarity : def.rarity;
}

export function specimenName(defId: string, variantId: string): string {
  const def = PLANTS[defId];
  if (!def) return defId;
  const variant = findVariant(defId, variantId);
  if (!variant || variant.id === def.variants[0].id) return def.name;
  return `${def.name} ‘${variant.name}’`;
}

/** Name that always includes the variant, for "new variant" moments. */
export function fullName(defId: string, variantId: string): string {
  const def = PLANTS[defId];
  const variant = findVariant(defId, variantId);
  if (def && def.variants.length === 1) return def.name;
  return def && variant ? `${def.name} ‘${variant.name}’` : defId;
}

/** The latin name, unless it's the same as the plant's own name. */
export function latinLine(defId: string): string {
  const def = PLANTS[defId];
  return def && def.latin !== def.name ? def.latin : '';
}

export function lookFor(defId: string, variantId: string) {
  const def = PLANTS[defId];
  const variant = findVariant(defId, variantId);
  return { ...def.look, ...(variant?.look ?? {}) };
}
