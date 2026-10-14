import { CAT_APPEARANCE } from '../../game/data/character';
import { TUBE_R, obstacleAt, type CircleObstacle, type Obstacle, type Tube, type Zone } from '../../game/systems/putting';

// How the living-room mat looks: the bath mat, the glossy magazine, the
// paperback ramp, the paper-towel tube, and everything lying on the mat
// (mugs, books, a slipper, and Ranger, asleep, with his tail going).

/** Ranger's tail runs from him out to its swishing tip: the length of it, drawn under its tip. */
export function drawMatTailLength(ctx: CanvasRenderingContext2D, o: CircleObstacle, holeT: number, X: (x: number) => number, Y: (y: number) => number, s: number) {
  if (!o.anchor) return;
  const tip = obstacleAt(o, holeT);
  const base = o.anchor;
  const n = 10;
  for (let i = 0; i < n; i++) {
    const u = i / n;
    const px = base.x + (tip.x - base.x) * u;
    const py = base.y + (tip.y - base.y) * u;
    ctx.fillStyle = CAT_APPEARANCE.furBase;
    ctx.beginPath();
    ctx.arc(X(px), Y(py), s * (0.13 + 0.05 * Math.sin(u * Math.PI)), 0, Math.PI * 2);
    ctx.fill();
  }
}

/** A bath mat (soft, fringed: it drags), a magazine left open (glossy: it runs), or a paperback under the mat (a ramp: arrows show which way it leans). */
export function drawMatZone(ctx: CanvasRenderingContext2D, z: Zone, X: (x: number) => number, Y: (y: number) => number, s: number, t: number) {
  const x = X(z.x);
  const y = Y(z.y);
  const w = z.w * s;
  const h = z.h * s;
  ctx.save();
  if (z.kind === 'rough') {
    ctx.fillStyle = '#9cc3cf';
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    for (let yy = y + 4; yy < y + h; yy += 7) for (let xx = x + ((yy / 7) % 2) * 3; xx < x + w; xx += 6) ctx.fillRect(xx, yy, 2, 2);
    ctx.strokeStyle = '#e8f1f2';
    ctx.lineWidth = 1.5;
    for (let xx = x + 3; xx < x + w; xx += 6) {
      ctx.beginPath();
      ctx.moveTo(xx, y);
      ctx.lineTo(xx, y - 5);
      ctx.moveTo(xx, y + h);
      ctx.lineTo(xx, y + h + 5);
      ctx.stroke();
    }
  } else if (z.kind === 'slick') {
    ctx.fillStyle = '#f4f0e6';
    ctx.fillRect(x, y, w, h);
    // Two open pages: a photo, some columns of text.
    ctx.fillStyle = '#c96a5a';
    ctx.fillRect(x + w * 0.08, y + h * 0.1, w * 0.35, h * 0.35);
    ctx.fillStyle = 'rgba(60,60,60,0.35)';
    for (let i = 0; i < 7; i++) ctx.fillRect(x + w * 0.55, y + h * (0.12 + i * 0.1), w * 0.36, 2);
    for (let i = 0; i < 4; i++) ctx.fillRect(x + w * 0.08, y + h * (0.55 + i * 0.1), w * 0.35, 2);
    ctx.strokeStyle = 'rgba(0,0,0,0.15)';
    ctx.beginPath();
    ctx.moveTo(x + w / 2, y);
    ctx.lineTo(x + w / 2, y + h);
    ctx.stroke();
    // Its glossy sheen, sliding slowly.
    const g = ctx.createLinearGradient(x, y, x + w, y + h);
    const k = (t / 3000) % 1;
    g.addColorStop(Math.max(0, k - 0.15), 'rgba(255,255,255,0)');
    g.addColorStop(k, 'rgba(255,255,255,0.45)');
    g.addColorStop(Math.min(1, k + 0.15), 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x, y, w, h);
  } else {
    // A raised hump in the mat, lighter where it's lifted, with arrows down the lean.
    const sl = z.slope ?? { x: 0, y: 0 };
    const a = Math.atan2(sl.y, sl.x);
    const g = ctx.createLinearGradient(x, y, x + Math.cos(a) * w, y + Math.sin(a) * h);
    g.addColorStop(0, 'rgba(255,255,220,0.28)');
    g.addColorStop(1, 'rgba(0,0,0,0.12)');
    ctx.fillStyle = g;
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = 'rgba(255,240,180,0.6)';
    ctx.lineWidth = 2;
    for (let gy = y + h * 0.25; gy < y + h; gy += h * 0.5) {
      for (let gx = x + w * 0.2; gx < x + w; gx += w * 0.3) {
        const phase = ((t / 700) % 1) * 8;
        ctx.save();
        ctx.translate(gx + Math.cos(a) * phase, gy + Math.sin(a) * phase);
        ctx.rotate(a);
        ctx.beginPath();
        ctx.moveTo(-5, -6);
        ctx.lineTo(3, 0);
        ctx.lineTo(-5, 6);
        ctx.stroke();
        ctx.restore();
      }
    }
  }
  ctx.restore();
}

/** A paper-towel tube lying across whatever's in the way, open at both ends. */
export function drawMatTube(ctx: CanvasRenderingContext2D, tube: Tube, X: (x: number) => number, Y: (y: number) => number, s: number) {
  const ax = X(tube.a.x);
  const ay = Y(tube.a.y);
  const bx = X(tube.b.x);
  const by = Y(tube.b.y);
  const r = TUBE_R * s * 1.15;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.strokeStyle = 'rgba(0,0,0,0.25)';
  ctx.lineWidth = r * 2 + 4;
  ctx.beginPath();
  ctx.moveTo(ax + 3, ay + 4);
  ctx.lineTo(bx + 3, by + 4);
  ctx.stroke();
  ctx.strokeStyle = '#c9a274';
  ctx.lineWidth = r * 2;
  ctx.beginPath();
  ctx.moveTo(ax, ay);
  ctx.lineTo(bx, by);
  ctx.stroke();
  // The spiral seam round the cardboard.
  ctx.strokeStyle = 'rgba(120,84,48,0.45)';
  ctx.lineWidth = 1.5;
  const n = Math.max(3, Math.round(Math.hypot(bx - ax, by - ay) / (r * 1.6)));
  const a = Math.atan2(by - ay, bx - ax);
  for (let i = 1; i < n; i++) {
    const cx = ax + ((bx - ax) * i) / n;
    const cy = ay + ((by - ay) * i) / n;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a + 1.2) * r, cy + Math.sin(a + 1.2) * r);
    ctx.lineTo(cx + Math.cos(a + Math.PI + 1.2) * r, cy + Math.sin(a + Math.PI + 1.2) * r);
    ctx.stroke();
  }
  // The open ends.
  for (const [x, y] of [
    [ax, ay],
    [bx, by],
  ]) {
    ctx.fillStyle = '#3a2a1a';
    ctx.beginPath();
    ctx.arc(x, y, r * 0.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#e0bf8f';
    ctx.lineWidth = 2;
    ctx.stroke();
  }
  ctx.restore();
}

export function drawMatObstacle(ctx: CanvasRenderingContext2D, o: Obstacle, X: (x: number) => number, Y: (y: number) => number, s: number, t: number) {
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  if (o.shape === 'circle') {
    ctx.beginPath();
    ctx.arc(X(o.x) + 3, Y(o.y) + 4, o.r * s, 0, Math.PI * 2);
    ctx.fill();
  } else if (o.shape === 'rect') ctx.fillRect(X(o.x) + 3, Y(o.y) + 4, o.w * s, o.h * s);

  if (o.kind === 'mug' && o.shape === 'circle') {
    const cx = X(o.x);
    const cy = Y(o.y);
    const r = o.r * s;
    ctx.strokeStyle = '#e9e2d4';
    ctx.lineWidth = r * 0.28;
    ctx.beginPath();
    ctx.arc(cx + r * 0.95, cy, r * 0.42, -Math.PI / 2, Math.PI / 2);
    ctx.stroke();
    ctx.fillStyle = '#e9e2d4';
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#5a3a22';
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.72, 0, Math.PI * 2);
    ctx.fill();
  } else if (o.kind === 'tail' && o.shape === 'circle') {
    // The end of Ranger's tail, fluffy and swishing: orange, white at the tip.
    const cx = X(o.x);
    const cy = Y(o.y);
    const r = o.r * s;
    ctx.fillStyle = CAT_APPEARANCE.furBase;
    for (let k = 0; k < 5; k++) {
      ctx.beginPath();
      ctx.arc(cx + Math.cos(k * 1.3) * r * 0.45, cy + Math.sin(k * 1.3) * r * 0.45, r * 0.62, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = CAT_APPEARANCE.furLight;
    ctx.beginPath();
    ctx.arc(cx, cy - r * 0.15, r * 0.55, 0, Math.PI * 2);
    ctx.fill();
  } else if (o.kind === 'cat' && o.shape === 'circle') {
    // Ranger, curled up asleep, his fluffy tail round his nose, breathing slowly.
    const cx = X(o.x);
    const cy = Y(o.y);
    const r = o.r * s * (1 + Math.sin(t / 700) * 0.02);
    ctx.fillStyle = CAT_APPEARANCE.furBase;
    ctx.beginPath();
    ctx.ellipse(cx, cy, r, r * 0.86, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = CAT_APPEARANCE.furDark;
    ctx.lineWidth = r * 0.12;
    for (const k of [0.35, 0.6]) {
      ctx.beginPath();
      ctx.arc(cx, cy, r * k, Math.PI * 0.9, Math.PI * 1.9);
      ctx.stroke();
    }
    ctx.fillStyle = CAT_APPEARANCE.furLight;
    ctx.beginPath();
    ctx.arc(cx + r * 0.45, cy + r * 0.3, r * 0.34, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = CAT_APPEARANCE.furBase;
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(cx + r * 0.45 + side * r * 0.22, cy + r * 0.06);
      ctx.lineTo(cx + r * 0.45 + side * r * 0.08, cy - r * 0.18);
      ctx.lineTo(cx + r * 0.45 + side * r * 0.02, cy + r * 0.06);
      ctx.fill();
    }
    // The long plumed tail, orange to a white tip.
    for (let i = 0; i <= 10; i++) {
      const u = i / 10;
      const a = Math.PI * (0.05 + u * 0.8);
      ctx.fillStyle = u > 0.75 ? CAT_APPEARANCE.furLight : CAT_APPEARANCE.furBase;
      ctx.beginPath();
      ctx.arc(cx + Math.cos(a) * r * 0.98, cy + Math.sin(a) * r * 0.86, r * (0.2 - u * 0.05), 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (o.shape === 'rect') {
    const x = X(o.x);
    const y = Y(o.y);
    const w = o.w * s;
    const h = o.h * s;
    if (o.kind === 'slipper') {
      ctx.fillStyle = '#c96f86';
      ctx.beginPath();
      ctx.roundRect(x, y, w, h, h / 2);
      ctx.fill();
      ctx.fillStyle = '#f2e4d8';
      ctx.beginPath();
      ctx.roundRect(x + w * 0.55, y + h * 0.15, w * 0.4, h * 0.7, h * 0.35);
      ctx.fill();
    } else {
      ctx.fillStyle = '#2f5a7a';
      ctx.fillRect(x, y, w, h);
      ctx.fillStyle = '#efe6d2';
      ctx.fillRect(x, y + h * 0.72, w, h * 0.2);
      ctx.fillStyle = '#d8b24a';
      ctx.fillRect(x + w * 0.1, y + h * 0.2, w * 0.35, h * 0.12);
    }
  }
  ctx.restore();
}
