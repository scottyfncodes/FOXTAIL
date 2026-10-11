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
  // Strongest a little after sunrise and a little before sunset; the evening's is the deeper one.
  return Math.min(1, Math.max(bell(DAWN + 100, 150) * 0.75, bell(DUSK - 70, 190)));
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
    // A breath of shade at the edges by day, deeper as the light goes.
    edge: 0.14 + darkness * 0.34,
    // Less than the old flat 0.55, because the edges now carry the rest.
    wash: darkness * 0.4,
  };
}

/**
 * Drawn once into a small canvas whenever the light has moved on enough,
 * then stretched over the view: a full-screen gradient every frame is dear
 * on a phone, one quarter-size drawImage is not.
 */
export class ClassicLight {
  private canvas: HTMLCanvasElement | null = null;
  private key = '';

  draw(ctx: CanvasRenderingContext2D, camera: Camera, totalMinutes: number, overcast: number) {
    const w = camera.viewW;
    const h = camera.viewH;
    const cw = Math.max(8, Math.ceil(w / 4));
    const ch = Math.max(8, Math.ceil(h / 4));
    const l = lightLevels(totalMinutes, overcast);
    const key = `${cw}x${ch}|${Math.round(l.darkness * 40)}|${Math.round(l.gold * 40)}`;
    if (key !== this.key || !this.canvas) {
      this.canvas ??= typeof document !== 'undefined' ? document.createElement('canvas') : null;
      if (!this.canvas) return;
      this.canvas.width = cw;
      this.canvas.height = ch;
      const g = this.canvas.getContext('2d');
      if (!g) return;
      this.key = key;
      g.clearRect(0, 0, cw, ch);
      if (l.wash > 0.01) {
        g.fillStyle = `rgba(8,16,30,${l.wash})`;
        g.fillRect(0, 0, cw, ch);
      }
      if (l.gold > 0.02) {
        // The low sun comes in from the upper left, warmest there, and lays a gentle amber over everything.
        const lg = g.createLinearGradient(0, 0, cw, ch);
        lg.addColorStop(0, `rgba(255,214,140,${0.22 * l.gold})`);
        lg.addColorStop(0.45, 'rgba(255,190,120,0)');
        lg.addColorStop(1, `rgba(90,50,100,${0.14 * l.gold})`);
        g.fillStyle = lg;
        g.fillRect(0, 0, cw, ch);
      }
      // The fall-off: the middle, where Ellen is, stays clear.
      const r = Math.hypot(cw, ch) / 2;
      const v = g.createRadialGradient(cw / 2, ch * 0.52, Math.min(cw, ch) * (0.36 - l.darkness * 0.06), cw / 2, ch * 0.52, r);
      const shade = l.darkness > 0.5 ? '6,12,26' : '16,28,18';
      v.addColorStop(0, `rgba(${shade},0)`);
      v.addColorStop(0.6, `rgba(${shade},${l.edge * 0.45})`);
      v.addColorStop(1, `rgba(${shade},${l.edge})`);
      g.fillStyle = v;
      g.fillRect(0, 0, cw, ch);
    }
    if (l.gold > 0.02) {
      // The warmth itself is laid on by multiplying, so the greens turn amber instead of going hazy.
      ctx.save();
      ctx.globalCompositeOperation = 'multiply';
      ctx.fillStyle = `rgba(255,196,128,${0.42 * l.gold})`;
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
    }
    ctx.drawImage(this.canvas, 0, 0, w, h);
  }
}
