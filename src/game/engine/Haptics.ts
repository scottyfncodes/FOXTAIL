/** How long the phone ticks when a press lands on something: a click under the thumb, not a buzz. */
export const TICK_MS = 12;

/**
 * One short tick, on phones that can (Android; iOS Safari has no vibration
 * API, and a desktop ignores it). Never throws: a browser that refuses is
 * simply a browser without it.
 */
export function tick(ms: number = TICK_MS): void {
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') navigator.vibrate(ms);
  } catch {
    // Not allowed here (no gesture yet, or a policy): nothing to do.
  }
}
