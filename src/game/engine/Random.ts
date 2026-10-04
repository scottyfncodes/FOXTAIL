/** Small deterministic PRNG (mulberry32) for reproducible world decoration. */
export function mulberry32(seed: number): () => number {
  let a = seed;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Stable 32-bit hash of a string, for seeding per-spot/per-plant rolls. */
export function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Picks an entry with probability proportional to its weight. */
export function weightedPick<T>(items: readonly T[], weight: (t: T) => number, rand: () => number): T | undefined {
  const total = items.reduce((s, t) => s + Math.max(0, weight(t)), 0);
  if (total <= 0) return undefined;
  let r = rand() * total;
  for (const t of items) {
    r -= Math.max(0, weight(t));
    if (r < 0) return t;
  }
  return items[items.length - 1];
}
