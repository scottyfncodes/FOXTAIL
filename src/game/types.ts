// Core shared types for Foxtail's data-driven systems.
// Adding new content (species, variants, shop items, spots) means adding
// data, not touching these types or the systems that consume them.

export type ZoneId =
  | 'greenhouse'
  | 'meadow'
  | 'woodland'
  | 'creek'
  | 'dampForest'
  | 'rockyClearing'
  | 'overgrownClearing';

export type OutdoorZoneId = Exclude<ZoneId, 'greenhouse'>;

/**
 * 'unheardOf' is the form of a species that nature never made: never found
 * wild, only ever thrown as a sport. 'mythic' sits above everything else
 * and is reserved for a single species that the game never announces.
 */
export type Rarity = 'common' | 'uncommon' | 'rare' | 'veryRare' | 'extremelyRare' | 'unheardOf' | 'mythic';

/**
 * How a plant is drawn. Each form is a distinct silhouette so a landscape
 * reads differently depending on what the player planted there.
 */
export type PlantForm =
  | 'fern' // feathery arching fronds
  | 'splitleaf' // big fenestrated leaves (monstera)
  | 'heart' // broad heart/arrow leaves on petioles (philodendron, alocasia)
  | 'trailing' // vines that drape and creep (pothos, hoya)
  | 'strappy' // arching ribbon leaves (spider plant)
  | 'spear' // stiff upright blades (snake plant)
  | 'rosette' // stacked round succulent rosette (echeveria)
  | 'coin' // round leaves on long stems (pilea)
  | 'patterned' // broad oval showpiece leaves (calathea, begonia)
  | 'beads' // strings of pearls
  | 'bloom' // upright clump topped with flowers (peace lily, orchid)
  | 'column' // ribbed upright cactus stems that branch into arms (fairy castle)
  | 'globe' // ribbed ball cactus, pupping at the base (golden barrel)
  | 'paddle' // flat pads stacked on pads (bunny ear cactus)
  | 'jade' // a little woody tree tipped with fat leaves (jade plant)
  | 'spiky' // fleshy pointed leaves in an upright clump (aloe, haworthia)
  | 'stones' // squat split pebbles (living stones)
  | 'palmate' // tall stems of saw-edged leaflets fanned like an open hand
  | 'trap' // low rosette of hinged, toothed snap-traps (venus flytrap)
  | 'dew' // spoon leaves bristling with dew-tipped hairs (sundew)
  | 'pitcher' // upright hooded trumpets (sarracenia)
  | 'cups' // a scrambling vine hanging lidded cups from its leaf tips (nepenthes)
  | 'fig' // a little indoor tree: a woody trunk hung with big leathery leaves (fiddle leaf fig, rubber plant)
  | 'fan' // long-stalked paddle leaves fanning up from the base in one plane, crane-headed flowers (bird of paradise)
  | 'palm' // a clump of slender ringed canes, each crowned with arching pinnate fronds (parlour palm)
  | 'cane' // a bare stem or trunk topped with a tuft of ribbon leaves (dragon tree, ponytail palm)
  | 'mushroom' // a little cluster of capped fruiting bodies on stems (fly agaric, chanterelle, morel)
  | 'coral' // branching fingers, or a shaggy mass of hanging spines (coral fungus, lion's mane)
  | 'moss' // low, springy cushions hugging the ground (moss)
  | 'mat' // a dense, flat mat of tiny leaves on wiry stems (creeping thyme)
  | 'trefoil' // a low carpet of three-leaflet leaves on short stalks (clover)
  | 'runner' // flat stems strung with paired round leaves, running over the ground or spilling down (creeping jenny)
  | 'climber' // a scrambling vine of five-leaflet hands that climbs a trellis (virginia creeper)
  | 'clump' // a wide mound of broad, ribbed leaves on short stalks (hosta)
  | 'bamboo' // tall jointed canes with sprays of narrow leaves at the nodes (bamboo)
  | 'lilypad' // round notched pads floating flat on the water (water lily)
  | 'cattail'; // a stand of tall blades with brown velvet seed heads on stiff stalks (cattail)

/** How a mushroom's cap is shaped. */
export type CapShape = 'dome' | 'flat' | 'funnel' | 'shaggy' | 'honeycomb' | 'nodding';

/**
 * What kind of landscape a species pushes an area toward once it's
 * planted out in numbers. Drives ground tint and ambient detail.
 */
export type LandscapeCharacter = 'fern' | 'jungle' | 'vine' | 'flower' | 'arid' | 'color' | 'strange';

export type Variegation = 'none' | 'marble' | 'splash' | 'edge' | 'speckle' | 'stripe' | 'veins' | 'glow';

export interface PlantLook {
  /** Base leaf hue/saturation/lightness. */
  hue: number;
  sat: number;
  light: number;
  /** Accent: flowers, undersides, veins, stems. */
  accentHue: number;
  accentSat?: number;
  accentLight?: number;
  variegation: Variegation;
  /** Colour used by variegation patterns, as `h s l` numbers. */
  variegationColor?: [number, number, number];
  /** Scales the whole plant. */
  size: number;
  /** Leaf shape tweak: >1 wider leaves, <1 narrower. */
  leafWidth?: number;
  /** Adds ruffled/wavy leaf edges. */
  ruffled?: boolean;
  /** Draws flowers at established+ stages. */
  flowers?: boolean;
  /** Cacti and toothed succulents: spine colour as `h s l`. */
  spines?: [number, number, number];
  /** Multiplies spine length (or a flytrap's teeth); 0 leaves only the woolly areoles. */
  spineLength?: number;
  /** Moon cactus: a bright ball grafted onto a green rootstock. */
  grafted?: boolean;
  /** Old man cactus: shaggy white hair over the stems. */
  hairy?: boolean;
  /** Figs: violin-waisted leaves (fiddle leaf) instead of plain ovals. */
  fiddle?: boolean;
  /** Canes: a swollen, water-storing base under the trunk, and a long drooping fountain of leaves (ponytail palm). */
  bulb?: boolean;
  /** Mushrooms: the cap's shape (dome if unset). Its colour is the look's hue; the gills are the accent. */
  cap?: CapShape;
  /** Mushrooms: flecks on the cap, as `h s l` (a fly agaric's white warts). */
  warts?: [number, number, number];
  /** Mushrooms: the stem's colour, as `h s l` (pale cream if unset). */
  stipe?: [number, number, number];
  /** Mushrooms: come up in a ring rather than a clump. */
  ring?: boolean;
  /** Coral form: a rounded mass hung with soft spines instead of branching fingers (lion's mane). */
  icicles?: boolean;
  /** Moss: upright stems each tipped with a little star of leaves (haircap). */
  tufts?: boolean;
  /** Clover: four leaflets to a stalk instead of three. */
  fourLeaf?: boolean;
}

export interface VariantDef {
  id: string;
  name: string;
  rarity: Rarity;
  description: string;
  /** Never grows wild and is never at the end of a trail: it can only come up as a sport. */
  sportOnly?: boolean;
  /** Partial overrides of the species look. */
  look: Partial<PlantLook>;
}

export type SpotCondition = 'night' | 'rain' | null;

export interface PlantDef {
  id: string;
  name: string;
  latin: string;
  form: PlantForm;
  rarity: Rarity;
  /** Regions where it grows wild, and where it thrives when planted out. */
  habitat: OutdoorZoneId[];
  landscape: LandscapeCharacter;
  description: string;
  /** Shown in the collection before the species has been found. */
  hint: string;
  look: PlantLook;
  /** First entry is always the standard form. */
  variants: VariantDef[];
  /** 0.6 (slow) – 1.4 (fast) growth multiplier. */
  growthRate: number;
  /** 0–1: how readily it seeds or creeps into new ground outdoors. */
  spread: number;
  /** Only found in the wild under these conditions. */
  appearsWhen?: SpotCondition;
  /** Needs the lantern to be noticed at all. */
  needsLantern?: boolean;
  /** Only ever found where the fox leads. */
  foxOnly?: boolean;
  /**
   * Never grows in an ordinary wild patch, never shows up as the market's
   * "wanted" plant: it turns up only through rare ecological chances.
   */
  secret?: boolean;
  /** Can't be sold: the market simply won't take it. */
  keepsake?: boolean;
  /** Kept out of the field journal's collection entirely. */
  unlisted?: boolean;
  /**
   * A water plant. 'only': it can only be planted (and only spreads) on
   * open water — the creek or a pond. 'also': it grows on the bank or out
   * in the shallows alike.
   */
  water?: 'only' | 'also';
  /** A vine: on a trellis it climbs, whatever shape its leaves. (Trailing, bead and climbing forms always do.) */
  vine?: boolean;
  /** Only comes from crossing these two species; never found anywhere. */
  parents?: [string, string];
}

export type ToolId = 'basket' | 'lantern';

export interface DiscoverySpot {
  id: string;
  zone: OutdoorZoneId;
  x: number;
  y: number;
  /** A fox-led spot stays hidden until the fox has shown it to you. */
  foxLed?: boolean;
  /** Restricts what can appear here to these species (otherwise the zone's habitat pool). */
  pool?: string[];
}
