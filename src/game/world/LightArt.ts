import type { Camera } from '../engine/Camera';
import { DAWN, DUSK, daylightFactor, minuteOfDay } from '../engine/Clock';

// Classic's light. The valley used to be lit evenly from edge to edge at
// noon and darkened by a single flat wash at night; this gives it the hour's
// colour instead: a low gold in the early morning and the evening, a soft
// fall-off toward the edges of the view by day (so the eye settles where
// Ellen is), and at night a darkness that gathers at the edges while the
// ground round her stays readable. It never changes what time it is, or what
// the weather does: only how the light falls.

/** How golden the light is at this minute of the day: 0 at noon and in the dark, 1 at its warmest. */
export function goldenHour(totalMinutes: number): number {
  const m = minuteOfDay(totalMinutes);
  const bell = (centre: number, width: number) => Math.max(0, 1 - Math.abs(m - centre) / width);
  // A golden hour, not a golden day: strongest a little after sunrise (about 5:30–8:30) and running
  // into the dusk (about 5:20pm–9pm), the evening's the deeper one. Between them, nothing is drawn at all.
  return Math.min(1, Math.max(bell(DAWN + 120, 90) * 0.75, bell(DUSK - 50, 110)));
}

export interface LightLevels {
  /** 0 by day, 1 in full dark. */
  darkness: number;
  /** 0–1: how warm the low sun is. */
  gold: number;
  /** Alpha of the darkening at the very edge of the view. */
  edge: number;
  /** Alpha of the flat night wash over everything (the edges get `edge` on top). */
  wash: number;
}

/** The light at this moment, as numbers (kept apart from the drawing so it can be tested). */
export function lightLevels(totalMinutes: number, overcast = 0): LightLevels {
  const darkness = 1 - daylightFactor(totalMinutes);
  const gold = goldenHour(totalMinutes) * (1 - overcast * 0.7);
  return {
    darkness,
    gold,
    // A breath of shade at the edges in the low light, deeper as it goes; none at all in full day, when there's nothing to draw.
    edge: 0.14 * Math.min(1, (gold + darkness) * 5) + darkness * 0.34,
    // Less than the old flat 0.55, because the edges now carry the rest.
    wash: darkness * 0.4,
  };
}

/**
 * The gradients are painted small (they're all soft) and scaled up once into
 * a layer the size of the canvas, only when the light has moved on enough;
 * each frame then lays that layer on 1:1, a single plain copy. Stretching a
 * small layer over the screen every frame, or painting gradients at full
 * size every time the light shifts, both cost a phone far more.
 */
export class ClassicLight {
  private small: HTMLCanvasElement | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private key = '';

  /** `focus` is where Ellen stands, as a fraction of the view: the light gathers round her, even where the camera stops at the valley's edge. */
  draw(ctx: CanvasRenderingContext2D, camera: Camera, totalMinutes: number, overcast: number, focus: { x: number; y: number } = { x: 0.5, y: 0.52 }) {
    const l = lightLevels(totalMinutes, overcast);
    // Full day: the valley as it is, and not a pixel spent on it.
    if (!lightVisible(l)) return;
    const cw = ctx.canvas.width;
    const ch = ctx.canvas.height;
    // Snapped to tenths of the view, so walking about repaints it only now and then.
    const fx = Math.round(Math.max(0.2, Math.min(0.8, focus.x)) * 10) / 10;
    const fy = Math.round(Math.max(0.2, Math.min(0.8, focus.y)) * 10) / 10;
    const key = `${cw}x${ch}|${Math.round(l.darkness * 24)}|${Math.round(l.gold * 24)}|${fx}|${fy}`;
    if (key !== this.key || !this.canvas) {
      if (typeof document === 'undefined') return;
      this.small ??= document.createElement('canvas');
      this.canvas ??= document.createElement('canvas');
      const sw = Math.max(8, Math.ceil(camera.viewW / 4));
      const sh = Math.max(8, Math.ceil(camera.viewH / 4));
      if (this.small.width !== sw || this.small.height !== sh) {
        this.small.width = sw;
        this.small.height = sh;
      }
      if (this.canvas.width !== cw || this.canvas.height !== ch) {
        this.canvas.width = cw;
        this.canvas.height = ch;
      }
      const g = this.small.getContext('2d');
      const big = this.canvas.getContext('2d');
      if (!g || !big) return;
      this.key = key;
      paintLight(g, sw, sh, l, fx, fy);
      big.clearRect(0, 0, cw, ch);
      big.imageSmoothingEnabled = true;
      big.imageSmoothingQuality = 'low';
      big.drawImage(this.small, 0, 0, cw, ch);
    }
    // One pass over the screen. Multiplying only darkens and tints, which is all this layer does
    // (its night and its shade are near-black, where multiplying and laying over agree), and it
    // is what warms the low sun; in the dark with no sun left a plain lay-over does as well.
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (l.gold > 0.02) ctx.globalCompositeOperation = 'multiply';
    ctx.drawImage(this.canvas, 0, 0);
    ctx.restore();
  }
}

function paintLight(g: CanvasRenderingContext2D, cw: number, ch: number, l: LightLevels, fx: number, fy: number) {
  g.clearRect(0, 0, cw, ch);
  if (l.wash > 0.01) {
    g.fillStyle = `rgba(8,16,30,${l.wash})`;
    g.fillRect(0, 0, cw, ch);
  }
  if (l.gold > 0.02) {
    // The low sun: an amber over everything (laid on by multiplying, so the greens turn warm
    // rather than hazy), lightest toward the upper left where it comes in, dusky opposite.
    const lg = g.createLinearGradient(0, 0, cw, ch);
    lg.addColorStop(0, `rgba(255,214,150,${0.3 * l.gold})`);
    lg.addColorStop(0.5, `rgba(255,190,120,${0.42 * l.gold})`);
    lg.addColorStop(1, `rgba(200,130,130,${0.5 * l.gold})`);
    g.fillStyle = lg;
    g.fillRect(0, 0, cw, ch);
  }
  // The fall-off: the middle, where Ellen is, stays clear.
  const cx = cw * fx;
  const cy = ch * fy;
  // Reaches the farthest corner, wherever she is.
  const r = Math.hypot(Math.max(cx, cw - cx), Math.max(cy, ch - cy));
  const v = g.createRadialGradient(cx, cy, Math.min(cw, ch) * (0.36 - l.darkness * 0.06), cx, cy, r);
  const shade = l.darkness > 0.5 ? '6,12,26' : '16,28,18';
  v.addColorStop(0, `rgba(${shade},0)`);
  v.addColorStop(0.6, `rgba(${shade},${l.edge * 0.45})`);
  v.addColorStop(1, `rgba(${shade},${l.edge})`);
  g.fillStyle = v;
  g.fillRect(0, 0, cw, ch);
}

/** Whether there's any light to lay over the valley at all (not in plain daylight). */
export function lightVisible(l: LightLevels): boolean {
  return l.darkness > 0.01 || l.gold > 0.01;
}
