// How long a message stays up, and what may interrupt it.
//
// Small feedback ("Took a cutting") should be quick and get out of the way;
// a new species or a garden milestone should stay long enough to read and
// absorb, and not be shoved off-screen by the next bit of chatter. This is
// pure bookkeeping — no DOM — so the HUD just renders what it's told.

export type Significance = 'minor' | 'normal' | 'important' | 'major';
export type ToastKind = 'info' | 'discovery' | 'growth' | 'hint' | 'coins';

/** What a message of each kind usually means; callers can say otherwise. */
export const KIND_SIGNIFICANCE: Record<ToastKind, Significance> = {
  info: 'minor',
  coins: 'minor',
  growth: 'normal',
  hint: 'important',
  discovery: 'important',
};

const RANK: Record<Significance, number> = { minor: 0, normal: 1, important: 2, major: 3 };

/** Base time on screen, before accounting for how much there is to read. */
const BASE_MS: Record<Significance, number> = { minor: 2200, normal: 3200, important: 5000, major: 7000 };
/** Extra time per character beyond a short phrase: slower for things that matter. */
const PER_CHAR_MS: Record<Significance, number> = { minor: 30, normal: 40, important: 50, major: 60 };
/** Nothing lingers: a line you can read in a glance shouldn't sit over the garden for a quarter of a minute. */
const MAX_MS: Record<Significance, number> = { minor: 3500, normal: 6000, important: 9000, major: 11000 };
/** Characters that read at a glance and earn no extra time. */
const GLANCE_CHARS = 32;

/** A quiet beat after something important leaves, before the next message. */
const PAUSE_AFTER_MS: Record<Significance, number> = { minor: 0, normal: 0, important: 400, major: 1100 };
/**
 * Queued messages that have waited this long are no longer worth showing.
 * Even guidance goes stale: a hint that couldn't get a word in for half a
 * minute is about a moment that has passed.
 */
const STALE_MS: Record<Significance, number> = { minor: 3500, normal: 8000, important: 25000, major: 40000 };

/** A major moment has the screen to itself this long; after that others may join below it. */
export const MOMENT_MS = 2500;

/** At most this many messages on screen at once — a phone is small. */
export const MAX_VISIBLE = 2;

/**
 * Whether the screen is too short to stack messages without them reaching
 * Ellen (who stands mid-screen) or the patch at her feet: an iPhone SE-sized
 * phone upright, or any phone on its side but the roomiest. There, messages
 * take turns, one at a time, rather than stacking.
 */
export function compactToasts(viewW: number, viewH: number): boolean {
  return (viewH <= 740 && viewH > viewW) || viewH <= 420;
}

export function toastDuration(text: string, sig: Significance): number {
  const extra = Math.max(0, text.length - GLANCE_CHARS) * PER_CHAR_MS[sig];
  return Math.min(MAX_MS[sig], BASE_MS[sig] + extra);
}

export function significanceRank(sig: Significance): number {
  return RANK[sig];
}

/** What a message may carry besides its text. */
export interface ToastOptions {
  /**
   * Whether the message is still worth showing. Checked before it's shown
   * and while it's up: guidance about a situation that has passed (the
   * cutting is already potted, the tool is already put away) is dropped
   * from the queue, and taken down early if it's on screen.
   */
  valid?: () => boolean;
  /** Called the moment it actually appears, so a one-time hint counts as seen only then. */
  onShown?: () => void;
  /** Called if it's dropped unshown (gone stale, or no longer valid), so it may be raised again when it next applies. */
  onDropped?: () => void;
}

interface Entry<T> {
  item: T;
  text: string;
  sig: Significance;
  queuedAt: number;
  shownAt: number;
  expiresAt: number;
  valid?: () => boolean;
  onShown?: () => void;
  onDropped?: () => void;
}

export interface ToastChanges<T> {
  show: T[];
  hide: T[];
}

export class ToastScheduler<T> {
  /** How many may be up at once; the HUD drops it to one on a short screen (see compactToasts). */
  maxVisible = MAX_VISIBLE;
  private visible: Entry<T>[] = [];
  private queue: Entry<T>[] = [];
  private holdUntil = 0;

  push(item: T, text: string, sig: Significance, now: number, opts: ToastOptions = {}) {
    // The same line again while it's still up or waiting is just noise.
    if (this.visible.some((e) => e.text === text) || this.queue.some((e) => e.text === text)) return;
    this.queue.push({ item, text, sig, queuedAt: now, shownAt: 0, expiresAt: 0, valid: opts.valid, onShown: opts.onShown, onDropped: opts.onDropped });
  }

  get showing(): readonly T[] {
    return this.visible.map((e) => e.item);
  }

  get pending(): number {
    return this.queue.length;
  }

  tick(now: number): ToastChanges<T> {
    const out: ToastChanges<T> = { show: [], hide: [] };

    for (const e of [...this.visible]) {
      if (e.expiresAt > now && (!e.valid || e.valid())) continue;
      this.remove(e, out);
      this.holdUntil = Math.max(this.holdUntil, now + PAUSE_AFTER_MS[e.sig]);
    }
    this.queue = this.queue.filter((e) => {
      const keep = now - e.queuedAt < STALE_MS[e.sig] && (!e.valid || e.valid());
      if (!keep) e.onDropped?.();
      return keep;
    });

    while (this.queue.length > 0 && now >= this.holdUntil) {
      // Highest significance first; among equals, first come first served.
      let next = this.queue[0];
      for (const e of this.queue) if (RANK[e.sig] > RANK[next.sig]) next = e;

      // A major moment gets the stage to itself for a beat.
      if (this.visible.some((e) => e.sig === 'major' && now - e.shownAt < MOMENT_MS)) break;
      if (next.sig === 'major') {
        // Clear the chatter; anything important already up may stay beside it.
        for (const e of [...this.visible]) if (RANK[e.sig] < RANK.important) this.remove(e, out);
        if (this.visible.length >= this.maxVisible) break;
      } else if (this.visible.length >= this.maxVisible) {
        // Make room only by retiring something no more important than the newcomer.
        const victim = this.visible.find((e) => RANK[e.sig] <= Math.min(RANK[next.sig], RANK.normal));
        if (!victim) break;
        this.remove(victim, out);
      }

      this.queue.splice(this.queue.indexOf(next), 1);
      next.shownAt = now;
      next.expiresAt = now + toastDuration(next.text, next.sig);
      this.visible.push(next);
      out.show.push(next.item);
      next.onShown?.();
    }
    return out;
  }

  private remove(e: Entry<T>, out: ToastChanges<T>) {
    this.visible.splice(this.visible.indexOf(e), 1);
    out.hide.push(e.item);
  }
}
