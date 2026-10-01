import type { OutdoorZoneId, Rarity } from '../types';

// Small wonders that aren't plants: insects, creatures, and the odd thing
// left lying about. (Mushrooms used to be noted here; they're grown now,
// like the plants, and live in data/plants.ts.) They can't be taken home — they're recorded in the journal,
// and only ever turn up at the end of a fox's trail. What decides which one
// is waiting (the region, the hour, the weather) is never spelled out.

export type CuriosityKind = 'creature' | 'insect' | 'oddity';

export interface CuriosityDef {
  id: string;
  name: string;
  kind: CuriosityKind;
  rarity: Rarity;
  zones: OutdoorZoneId[];
  when?: 'night' | 'rain' | 'day';
  description: string;
}

export const CURIOSITIES: CuriosityDef[] = [
  { id: 'lostGolfBall', name: 'A Lost Golf Ball', kind: 'oddity', rarity: 'common', zones: ['meadow', 'rockyClearing', 'overgrownClearing'], description: 'Scuffed, grass-stained, and a long way from any hole. Someone around here has a slice.' },
  { id: 'treeFrog', name: 'Tree Frog', kind: 'creature', rarity: 'uncommon', zones: ['dampForest', 'creek', 'woodland'], description: 'Bright green, no bigger than a thumbnail, clinging to the underside of a leaf with its sticky toes.' },
  { id: 'hedgehog', name: 'Hedgehog', kind: 'creature', rarity: 'uncommon', zones: ['meadow', 'overgrownClearing', 'woodland'], when: 'night', description: 'Snuffling through the grass, too busy with beetles to mind you. It rolls up if you get too close.' },
  { id: 'swallowtail', name: 'Swallowtail', kind: 'insect', rarity: 'uncommon', zones: ['meadow', 'overgrownClearing'], when: 'day', description: 'Cream and black, with a blue-and-red eye on each tail. It rests with its wings flat in the sun.' },
  { id: 'emeraldDragonfly', name: 'Emerald Dragonfly', kind: 'insect', rarity: 'uncommon', zones: ['creek', 'meadow'], when: 'day', description: 'Metallic green, hovering and darting and hovering again.' },
  { id: 'fireSalamander', name: 'Fire Salamander', kind: 'creature', rarity: 'rare', zones: ['dampForest', 'creek'], when: 'rain', description: 'Glossy black splashed with yellow, out walking slowly in the wet as if it owned the forest.' },
  { id: 'jewelBeetle', name: 'Jewel Beetle', kind: 'insect', rarity: 'rare', zones: ['rockyClearing', 'overgrownClearing'], when: 'day', description: 'Shell like polished copper turning to green as it moves.' },
  { id: 'splitGeode', name: 'Split Geode', kind: 'oddity', rarity: 'rare', zones: ['rockyClearing', 'creek'], description: 'An ordinary grey stone, broken open. Inside: violet crystal.' },
  { id: 'lunaMoth', name: 'Luna Moth', kind: 'insect', rarity: 'veryRare', zones: ['woodland', 'dampForest'], when: 'night', description: 'Pale green wings as wide as a hand, with long trailing tails. It barely moves.' },
  { id: 'glowworms', name: 'Glow-worms', kind: 'insect', rarity: 'veryRare', zones: ['creek', 'dampForest', 'overgrownClearing'], when: 'night', description: 'A scatter of cold green lights low in the grass, each one waiting.' },
  { id: 'foxDen', name: 'The Fox’s Den', kind: 'oddity', rarity: 'extremelyRare', zones: ['overgrownClearing', 'woodland'], description: 'A dark mouth under the roots, the ground in front worn smooth. So this is where it goes.' },
];

/** Curiosities that became species of their own: an old save's note of one counts as having found it. */
export const CURIOSITY_SPECIES: Record<string, { defId: string; variantId: string }> = {
  flyAgaric: { defId: 'flyAgaric', variantId: 'scarlet' },
  fairyRing: { defId: 'fairyRingChampignon', variantId: 'buff' },
  coralFungus: { defId: 'coralFungus', variantId: 'butter' },
  ghostPipe: { defId: 'ghostPipe', variantId: 'white' },
};

export function findCuriosity(id: string): CuriosityDef | undefined {
  return CURIOSITIES.find((c) => c.id === id);
}
