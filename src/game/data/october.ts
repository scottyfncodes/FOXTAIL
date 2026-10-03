// Where October puts things: the pumpkins, the lantern posts, the old
// forgotten things out in the valley, the places the pale thing likes, and
// the creatures that only come out this month. All in world tiles.

export interface PumpkinSpot {
  id: string;
  x: number;
  y: number;
  /** 0.8–1.25: how big a pumpkin it is. */
  size: number;
}

/** Pumpkins on the steps, by the stall, and a patch of them out in the east meadow. */
export const PUMPKINS: PumpkinSpot[] = [
  { id: 'pk-porch-1', x: 71.15, y: 40.75, size: 1.15 },
  { id: 'pk-porch-2', x: 73.9, y: 40.7, size: 0.95 },
  { id: 'pk-porch-3', x: 74.45, y: 41.15, size: 0.8 },
  { id: 'pk-glass-1', x: 63.9, y: 40.85, size: 1.0 },
  { id: 'pk-glass-2', x: 67.1, y: 40.8, size: 0.85 },
  { id: 'pk-stall', x: 68.4, y: 43.4, size: 1.05 },
  { id: 'pk-patch-1', x: 78.6, y: 37.6, size: 1.25 },
  { id: 'pk-patch-2', x: 79.8, y: 38.5, size: 0.9 },
  { id: 'pk-patch-3', x: 81.0, y: 37.3, size: 1.1 },
  { id: 'pk-patch-4', x: 79.3, y: 39.6, size: 1.0 },
  { id: 'pk-patch-5', x: 81.7, y: 38.9, size: 0.85 },
  { id: 'pk-patch-6', x: 80.3, y: 36.5, size: 0.95 },
  { id: 'pk-wood', x: 36.4, y: 21.6, size: 0.9 },
];

/** The pumpkin patch, for the vines between the pumpkins. */
export const PUMPKIN_PATCH = { x: 77.8, y: 35.9, w: 5, h: 4.4 };

export type FaceId = 'happy' | 'goofy' | 'surprised' | 'spooky' | 'verySpooky' | 'wink' | 'moon' | 'fox';

export interface FaceDef {
  id: FaceId;
  name: string;
  /** Relative odds when carving. */
  weight: number;
  /** A face you're lucky to get: it gets a line in the journal of its own. */
  rare?: boolean;
}

export const FACES: FaceDef[] = [
  { id: 'happy', name: 'Happy', weight: 28 },
  { id: 'goofy', name: 'Goofy', weight: 24 },
  { id: 'surprised', name: 'Surprised', weight: 20 },
  { id: 'spooky', name: 'Spooky', weight: 16 },
  { id: 'verySpooky', name: 'Very spooky', weight: 9 },
  { id: 'wink', name: 'Winking', weight: 1.6, rare: true },
  { id: 'moon', name: 'Moon-eyed', weight: 1.0, rare: true },
  { id: 'fox', name: 'The fox', weight: 0.5, rare: true },
];

export function findFace(id: string): FaceDef | undefined {
  return FACES.find((f) => f.id === id);
}

export interface LanternPost {
  x: number;
  y: number;
}

/** Old iron lantern posts: by home, at the ends of both bridges, and one at the woods' edge. */
export const LANTERN_POSTS: LanternPost[] = [
  { x: 63.0, y: 41.7 },
  { x: 75.8, y: 41.5 },
  { x: 39.2, y: 12.9 },
  { x: 44.8, y: 16.2 },
  { x: 39.2, y: 48.9 },
  { x: 44.8, y: 52.2 },
  { x: 37.4, y: 27.6 },
];

/** The lantern hung by the front door, where the odd spider keeps its web. */
export const PORCH_LANTERN = { x: 71.75, y: 39.0 };

export type OldThingKind = 'scarecrow' | 'signpost' | 'wheelbarrow' | 'bench' | 'gate';

/** Things somebody left out here a long time ago, and nobody's come back for. */
export const OLD_THINGS: { kind: OldThingKind; x: number; y: number }[] = [
  { kind: 'scarecrow', x: 80.6, y: 35.3 },
  { kind: 'signpost', x: 30.5, y: 39.5 },
  { kind: 'wheelbarrow', x: 14.5, y: 26.4 },
  { kind: 'bench', x: 55.5, y: 21.5 },
  { kind: 'gate', x: 8.5, y: 48.5 },
];

/** Low ground where the mist lies: the creek, the damp forest's hollows, the overgrown hollow. */
export const FOG_BANKS: { x: number; y: number; w: number; h: number; night?: boolean }[] = [
  { x: 37, y: 0, w: 10, h: 64 },
  { x: 47, y: 2, w: 20, h: 14 },
  { x: 70, y: 6, w: 18, h: 12 },
  { x: 3, y: 41, w: 22, h: 16 },
  { x: 15, y: 11, w: 18, h: 13, night: true },
  { x: 48, y: 25, w: 28, h: 5, night: true },
];

/** Open ground the moon finds first: lighter pockets in the dark. */
export const MOONLIT: { x: number; y: number; r: number }[] = [
  { x: 82, y: 30, r: 7 },
  { x: 64, y: 54, r: 8 },
  { x: 42, y: 14.5, r: 4 },
  { x: 42, y: 50.5, r: 4 },
  { x: 22, y: 18, r: 5 },
  { x: 12, y: 48, r: 6 },
];

/** Where the pale thing likes to be. */
export const HAUNTS: { x: number; y: number }[] = [
  { x: 66.5, y: 30.0 },
  { x: 42.0, y: 14.2 },
  { x: 12.0, y: 18.0 },
  { x: 79.9, y: 37.0 },
  { x: 56.2, y: 21.9 },
  { x: 30.9, y: 40.2 },
  { x: 58.2, y: 36.0 },
];

/** October's creatures, and where to look for them. */
export const OWL_PERCH = { x: 22.5, y: 14.5 };
export const BLACK_CAT_SPOT = { x: 77.4, y: 36.6 };

export type CreatureId = 'bats' | 'blackCat' | 'owl' | 'moth' | 'spider';

// The journal's October page. Each entry appears only once it has been
// seen, in Ellen's words, and says no more than she knows.
export interface OctoberNote {
  id: string;
  title: string;
  text: string;
  /** A second line that appears once it's been seen this many times. */
  more?: { after: number; text: string }[];
  /** Seen this many times before it goes in at all. */
  after?: number;
  /** One of the plain, findable ones (the creatures), rather than a strangeness. */
  creature?: boolean;
}

export const OCTOBER_NOTES: OctoberNote[] = [
  { id: 'bats', title: 'Bats', text: 'Bats over the roof at dusk, four or five of them, never quite where you look.', creature: true },
  { id: 'owl', title: 'An owl', text: 'An owl in the big tree in the woods. It turns its head to follow me the whole way past.', creature: true },
  { id: 'blackCat', title: 'A black cat', text: 'A black cat that sits by the pumpkins after dark. Not Ranger. It never lets me close.', creature: true },
  { id: 'moth', title: 'A pale moth', text: 'A moth round the lanterns, so pale it looks lit from inside.', creature: true },
  { id: 'spider', title: 'The lantern spider', text: 'A spider, orange and violet, has made the porch lantern its own. The web is a little bigger every day.', creature: true },
  { id: 'eyes', title: 'Eyes', text: 'Two small lights in the undergrowth. They blinked.', more: [{ after: 4, text: 'Scout always sees them first.' }] },
  { id: 'shadow', title: 'Behind the trees', text: 'Something moved behind a tree. It was the same shape as the tree, nearly.' },
  { id: 'wisp', title: 'A light between the trees', text: 'A light, low down, going from tree to tree. Too low for a star, too steady for a firefly.' },
  { id: 'silhouette', title: 'Someone on the far side', text: 'Someone walking along the far side of the valley. Nobody lives out that way.' },
  { id: 'stray', title: 'A pumpkin', text: 'A pumpkin I didn’t put there. Already carved. Facing the house.' },
  { id: 'watcher', title: 'The one at the edge', text: 'Someone standing at the edge of the trees, watching. When I went closer, nobody.', more: [{ after: 3, text: 'It’s never there when I get there. It’s always there when I look back.' }] },
  { id: 'lantern', title: 'The lantern', text: 'A lantern, floating along by itself. It waited for me.', more: [{ after: 3, text: 'It doesn’t always lead anywhere. Sometimes it does.' }] },
  { id: 'window', title: 'The front window', text: 'Somebody went past the front window. I’d have said the house was empty.' },
  { id: 'glassFigure', title: 'Outside the glass', text: 'Something stood outside the greenhouse glass, quite still. By the time I got to the door there was nothing there.' },
  { id: 'ghost', title: 'Something pale', text: 'Something small and pale. It doesn’t like to be looked at.', more: [
    { after: 3, text: 'It always seems to turn up near the pumpkins.' },
    { after: 6, text: 'It sat by a jack-o’-lantern and didn’t run. I think it likes them lit.' },
  ] },
  { id: 'gift', title: 'What it left', text: 'Where it sat, something small and pale came up. I don’t know what it wanted. I don’t think it wanted anything.' },
  { id: 'shadowFox', title: 'Another fox', text: 'A fox. Not ours: darker, and still as a post. It was there, and then it wasn’t.' },
  // The visitor goes in only once it has come back.
  { id: 'visitor', title: '…', text: 'It stood at the very edge, where the trees start, and looked at the house. Then it turned round and went back in.', after: 2, more: [
    { after: 3, text: 'The same each time. It never comes any closer. I don’t think it needs to.' },
    { after: 5, text: 'The ground where it stood is warm.' },
  ] },
];
