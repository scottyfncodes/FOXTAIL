import type { ZoneId } from '../types';

export interface ZoneDef {
  id: ZoneId;
  name: string;
  blurb: string;
  ambient: string; // description of soundscape, used for subtle audio cue selection
  tint: string; // subtle atmospheric color used in rendering
  groundColors: string[]; // palette for procedural ground texture
}

export const ZONES: Record<ZoneId, ZoneDef> = {
  greenhouse: {
    id: 'greenhouse',
    name: "Ellen's Greenhouse",
    blurb: 'Warm glass and old wood. Her laboratory, nursery, and workshop, and Scout\'s favorite place to nap.',
    ambient: 'creaking wood, dripping condensation, muffled wind',
    tint: '#2a4038',
    groundColors: ['#5a4632', '#4d3c2a'],
  },
  meadow: {
    id: 'meadow',
    name: 'The Meadow',
    blurb: 'Open grass, warm light, the hum of bees.',
    ambient: 'wind through grass, bees, distant birdsong',
    tint: '#3c5a3a',
    groundColors: ['#5f8a4c', '#6c9756', '#527940'],
  },
  woodland: {
    id: 'woodland',
    name: 'The Woodland',
    blurb: 'Dappled shade beneath old trees.',
    ambient: 'rustling canopy, woodpeckers, creaking branches',
    tint: '#233c2e',
    groundColors: ['#3f5a3a', '#375234', '#2f4a2e'],
  },
  creek: {
    id: 'creek',
    name: 'The Creek',
    blurb: 'Cold, moving water over smooth stone.',
    ambient: 'running water, dragonfly wings, frogs',
    tint: '#254a4d',
    groundColors: ['#3f6b6e', '#4a7a7a', '#356060'],
  },
  dampForest: {
    id: 'dampForest',
    name: 'The Damp Forest',
    blurb: 'Thick moss and heavy air. Things grow strangely here.',
    ambient: 'dripping water, muffled silence, distant owls',
    tint: '#1c3330',
    groundColors: ['#2e4a3c', '#294435', '#233a2e'],
  },
  rockyClearing: {
    id: 'rockyClearing',
    name: 'The Rocky Clearing',
    blurb: 'Sun-baked stone and thin, hardy soil.',
    ambient: 'wind over stone, cicadas, lizards skittering',
    tint: '#4a4230',
    groundColors: ['#8a7a5c', '#7c6c4e', '#94825f'],
  },
  overgrownClearing: {
    id: 'overgrownClearing',
    name: 'The Overgrown Clearing',
    blurb: 'Something outcompeted everything else here.',
    ambient: 'buzzing insects, rustling brambles',
    tint: '#3a3f22',
    groundColors: ['#5c6a34', '#4f5c2c', '#66742f'],
  },
};

export const ZONE_LIST: ZoneDef[] = Object.values(ZONES);
