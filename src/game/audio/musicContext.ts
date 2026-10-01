import { DAWN, isNight, minuteOfDay } from '../engine/Clock';
import type { ZoneId } from '../types';
import type { MusicState } from './soundtrack';

// Where Ellen is and what time it is, decided into a musical state — and
// held steady, so stepping through a doorway or brushing the edge of a zone
// never yanks the music around. Opening a panel isn't part of the input at
// all: menus and cards never change what's playing.

export interface MusicSituation {
  /** False while the title screen is up. */
  started: boolean;
  /** Which room indoors, or null outdoors. */
  room: 'living' | 'greenhouse' | null;
  zone: ZoneId;
  totalMinutes: number;
}

/** Wilder, rarer ground: the deep wild music plays here. */
export const DEEP_ZONES: ReadonlySet<ZoneId> = new Set<ZoneId>(['dampForest', 'overgrownClearing']);

/** Indoors, the evening music starts a little before full dark. */
export const EVENING_START = 19 * 60;

export function musicStateFor(s: MusicSituation): MusicState {
  if (!s.started) return 'menu';
  const m = minuteOfDay(s.totalMinutes);
  if (s.room) {
    if (m >= EVENING_START || m < DAWN) return 'evening';
    return s.room === 'living' ? 'home' : 'greenhouse';
  }
  // Out in the dark, lantern-lit, the valley feels like the deep wild everywhere.
  if (isNight(s.totalMinutes) || DEEP_ZONES.has(s.zone)) return 'deepWild';
  return 'wild';
}

/** How long a new situation must hold before the music follows it, in seconds. */
export const SETTLE_SECONDS = 5;

/**
 * Debounces the musical state. The first state (and leaving the title
 * screen) applies at once; after that a change has to persist for
 * SETTLE_SECONDS, so a quick dash through the greenhouse doesn't swap the
 * music twice.
 */
export class MusicDirector {
  private current: MusicState | null = null;
  private pending: MusicState | null = null;
  private pendingFor = 0;

  /** Feeds the latest situation; returns the state to play now, or null if unchanged. */
  update(next: MusicState, dtSeconds: number): MusicState | null {
    if (this.current === null || this.current === 'menu') {
      if (next === this.current) return null;
      this.current = next;
      this.pending = null;
      return next;
    }
    if (next === this.current) {
      this.pending = null;
      this.pendingFor = 0;
      return null;
    }
    if (next !== this.pending) {
      this.pending = next;
      this.pendingFor = 0;
    }
    this.pendingFor += dtSeconds;
    if (this.pendingFor < SETTLE_SECONDS) return null;
    this.current = next;
    this.pending = null;
    this.pendingFor = 0;
    return next;
  }

  get state(): MusicState | null {
    return this.current;
  }
}
