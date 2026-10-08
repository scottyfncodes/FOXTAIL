import type { GameState, WeatherCondition } from '../state';

// Pacing: on average 2 game-minutes pass per real second, so a full day/night
// cycle (1440 game-minutes) takes about 12 real minutes — enough for the world
// to visibly shift within a session, and enough that coming back later always
// shows a changed world.
//
// The clock doesn't run evenly, though. Sunny daytime is the garden at its
// best, so the day lingers and the dark hours pass quickly: time eases from
// DAY_RATE up to NIGHT_RATE through dusk and back down through dawn. The two
// rates are balanced so the average (and so growth per real hour) is unchanged.
export const GAME_MINUTES_PER_REAL_SECOND = 2;
export const DAY_RATE = 1.4;
export const NIGHT_RATE = 4.5;
export const MINUTES_PER_DAY = 1440;
// Cap how much time we simulate for a single "welcome back" catch-up so an
// abandoned tab doesn't spin the world through weeks of growth at once.
export const OFFLINE_CAP_MINUTES = 3 * MINUTES_PER_DAY;

// The living things don't stop at that cap, though. The clock (and with it
// the weather, the market's day, the request board) catches up at most
// OFFLINE_CAP_MINUTES, but the plants, the spreading and the ground cover
// get an extra "ecology" allowance for every real hour beyond it, tapering
// off so a short absence shows small changes, a few days noticeable ones
// and a long time away a much wilder valley, without ever running away.
/** Extra growth-minutes for each doubling of the real time away past the cap. */
export const ECOLOGY_PER_DOUBLING = 3600;
/** Real hours past the cap that the first doubling is measured against. */
export const ECOLOGY_TAPER_HOURS = 2;
/** However long you're gone, the extra allowance stops here (about three weeks away). */
export const ECOLOGY_MAX_EXTRA = 30000;

/**
 * Growth-minutes the living world gets for `realMs` away: the same as the
 * clock up to the offline cap, then a tapering extra allowance.
 */
export function ecologyMinutesFor(realMs: number): number {
  const full = Math.min((Math.max(0, realMs) / 1000) * GAME_MINUTES_PER_REAL_SECOND, OFFLINE_CAP_MINUTES);
  const capMs = (OFFLINE_CAP_MINUTES / GAME_MINUTES_PER_REAL_SECOND) * 1000;
  const beyondHours = Math.max(0, realMs - capMs) / 3_600_000;
  const extra = Math.min(ECOLOGY_MAX_EXTRA, ECOLOGY_PER_DOUBLING * Math.log2(1 + beyondHours / ECOLOGY_TAPER_HOURS));
  return full + extra;
}

export const DAWN = 5 * 60;
export const DUSK = 20 * 60;

export function minuteOfDay(totalMinutes: number): number {
  return ((totalMinutes % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
}

export function isNight(totalMinutes: number): boolean {
  const m = minuteOfDay(totalMinutes);
  return m < DAWN || m >= DUSK;
}

/** 0 = full night, 1 = full day, smoothly blended through dawn/dusk. */
export function daylightFactor(totalMinutes: number): number {
  const m = minuteOfDay(totalMinutes);
  const fade = 90;
  if (m < DAWN - fade || m >= DUSK + fade) return 0;
  if (m < DAWN + fade) return clamp01((m - (DAWN - fade)) / (fade * 2));
  if (m < DUSK - fade) return 1;
  return clamp01(1 - (m - (DUSK - fade)) / (fade * 2));
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

/** Game-minutes per real second at this moment: slow by day, quick by night. */
export function clockRate(totalMinutes: number): number {
  return DAY_RATE + (NIGHT_RATE - DAY_RATE) * (1 - daylightFactor(totalMinutes));
}

/**
 * Game-minutes that pass in `realSeconds` starting from `totalMinutes`,
 * integrated in short steps so the rate follows dusk and dawn.
 */
export function gameMinutesFor(totalMinutes: number, realSeconds: number): number {
  let t = totalMinutes;
  let left = realSeconds;
  while (left > 0) {
    const step = Math.min(left, 1);
    t += clockRate(t) * step;
    left -= step;
  }
  return t - totalMinutes;
}

// Clear skies are the resting state and every departure resolves back to
// them: rain and cloud are punctuation, not a rotation. Where the weather goes
// next depends on where it is now, and each spell has its own length.
export const WEATHER_NEXT: Record<WeatherCondition, [WeatherCondition, number][]> = {
  clear: [
    ['clear', 0.55],
    ['overcast', 0.3],
    ['rain', 0.15],
  ],
  overcast: [
    ['clear', 0.7],
    ['rain', 0.3],
  ],
  rain: [
    ['clear', 0.8],
    ['overcast', 0.2],
  ],
};

/** How long a spell of each weather lasts, in game-minutes [min, max]. */
export const WEATHER_DURATION: Record<WeatherCondition, [number, number]> = {
  clear: [300, 540],
  overcast: [90, 180],
  rain: [120, 240],
};

export function rollWeather(from: WeatherCondition, rand: () => number): WeatherCondition {
  const options = WEATHER_NEXT[from] ?? WEATHER_NEXT.clear;
  const total = options.reduce((s, [, w]) => s + w, 0);
  let r = rand() * total;
  for (const [cond, w] of options) {
    if (r < w) return cond;
    r -= w;
  }
  return 'clear';
}

export function weatherDuration(cond: WeatherCondition, rand: () => number): number {
  const [min, max] = WEATHER_DURATION[cond] ?? WEATHER_DURATION.clear;
  return min + rand() * (max - min);
}

export interface ClockAdvanceResult {
  elapsedMinutes: number;
  /** Growth-minutes for the living world: the same as elapsedMinutes, unless a long absence earned more (see ecologyMinutesFor). */
  ecologyMinutes: number;
  /** Real milliseconds since the clock last ran. */
  realDeltaMs: number;
  wasOffline: boolean;
  weatherChanged: boolean;
}

/**
 * Advances the game clock from the last recorded real timestamp to `nowMs`,
 * updating weather along the way. Safe to call every frame (small deltas)
 * and once on load (large "offline" delta).
 */
export function advanceClock(state: GameState, nowMs: number, rand: () => number = Math.random): ClockAdvanceResult {
  const realDeltaMs = Math.max(0, nowMs - state.clock.lastRealTimestamp);
  const wasOffline = realDeltaMs > 60_000;
  // Away for a while: the day/night shape doesn't matter, only how much time passed.
  const elapsedMinutes = wasOffline
    ? Math.min((realDeltaMs / 1000) * GAME_MINUTES_PER_REAL_SECOND, OFFLINE_CAP_MINUTES)
    : gameMinutesFor(state.clock.totalMinutes, realDeltaMs / 1000);
  state.clock.totalMinutes += elapsedMinutes;
  state.clock.lastRealTimestamp = nowMs;

  let weatherChanged = false;
  let guard = 0;
  while (state.clock.totalMinutes >= state.weather.nextChangeAt && guard < 64) {
    guard += 1;
    const next = rollWeather(state.weather.condition, rand);
    if (next !== state.weather.condition) weatherChanged = true;
    state.weather.condition = next;
    state.weather.nextChangeAt = state.weather.nextChangeAt + weatherDuration(next, rand);
  }
  // If we jumped far ahead (offline), make sure nextChangeAt is back in the future.
  if (state.weather.nextChangeAt < state.clock.totalMinutes) {
    state.weather.nextChangeAt = state.clock.totalMinutes + weatherDuration(state.weather.condition, rand);
  }

  const ecologyMinutes = wasOffline ? Math.max(elapsedMinutes, ecologyMinutesFor(realDeltaMs)) : elapsedMinutes;
  return { elapsedMinutes, ecologyMinutes, realDeltaMs, wasOffline, weatherChanged };
}
