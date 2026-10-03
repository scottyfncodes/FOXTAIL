import type { GolfBallLook } from '../data/golfBalls';

// The golf balls, painted small: a shaded ball, a few dimples, and the one
// mark that tells each kind apart. Drawn the same way in the journal, in
// the discovery card and on the rack by the putting mat, so a ball looks
// like itself wherever it is.

type Ctx = CanvasRenderingContext2D;

export interface BallPaint {
  /** Not found yet: a plain shape, nothing of its colour or markings. */
  silhouette?: boolean;
  /** A hidden ball not yet found: the shape with a question mark on it. */
  mystery?: boolean;
  /** Fine detail (dimples, sparkles) only where there's room for it. */
  detail?: boolean;
}

function shade(hex: string, f: number): string {
  const n = parseInt(hex.slice(1), 16);
  const ch = (v: number) => Math.max(0, Math.min(255, Math.round(f < 0 ? v * (1 + f) : v + (255 - v) * f)));
  return `rgb(${ch((n >> 16) & 255)},${ch((n >> 8) & 255)},${ch(n & 255)})`;
}

export function drawGolfBall(ctx: Ctx, x: number, y: number, r: number, look: GolfBallLook, paint: BallPaint = {}) {
  ctx.save();
  if (paint.silhouette || paint.mystery) {
    ctx.fillStyle = 'rgba(70,60,48,0.22)';
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(70,60,48,0.35)';
    ctx.lineWidth = Math.max(1, r * 0.08);
    ctx.setLineDash([Math.max(1.5, r * 0.25), Math.max(1.5, r * 0.2)]);
    ctx.stroke();
    if (paint.mystery) {
      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(70,60,48,0.6)';
      ctx.font = `700 ${Math.round(r * 1.2)}px Georgia, serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('?', x, y + r * 0.06);
    }
    ctx.restore();
    return;
  }
  const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r);
  g.addColorStop(0, shade(look.base, 0.45));
  g.addColorStop(0.6, look.base);
  g.addColorStop(1, shade(look.base, -0.28));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.save();
  ctx.clip();
  drawMark(ctx, x, y, r, look);
  if (paint.detail) {
    // Dimples: a loose lattice of faint dots.
    ctx.fillStyle = look.mark === 'vintage' ? 'rgba(80,50,20,0.22)' : 'rgba(0,0,0,0.09)';
    const d = r * 0.3;
    for (let i = -3; i <= 3; i++) {
      for (let j = -3; j <= 3; j++) {
        const px = x + i * d + (j % 2 ? d / 2 : 0);
        const py = y + j * d * 0.86;
        if (Math.hypot(px - x, py - y) > r * 0.88) continue;
        ctx.beginPath();
        ctx.arc(px, py, r * 0.055, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
  ctx.restore();
  ctx.strokeStyle = 'rgba(40,30,20,0.28)';
  ctx.lineWidth = Math.max(0.75, r * 0.05);
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function drawMark(ctx: Ctx, x: number, y: number, r: number, look: GolfBallLook) {
  const a = look.accent ?? '#333333';
  switch (look.mark) {
    case 'none':
      break;
    case 'scuff':
      ctx.fillStyle = a;
      ctx.globalAlpha = 0.5;
      ctx.beginPath();
      ctx.ellipse(x + r * 0.3, y + r * 0.35, r * 0.45, r * 0.2, 0.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = 'rgba(90,80,60,0.45)';
      ctx.lineWidth = Math.max(0.75, r * 0.06);
      ctx.beginPath();
      ctx.moveTo(x - r * 0.5, y - r * 0.1);
      ctx.lineTo(x - r * 0.1, y + r * 0.05);
      ctx.stroke();
      break;
    case 'range':
      ctx.fillStyle = a;
      ctx.fillRect(x - r, y - r * 0.14, r * 2, r * 0.28);
      break;
    case 'stripe':
      ctx.strokeStyle = a;
      ctx.lineWidth = Math.max(1, r * 0.12);
      ctx.beginPath();
      ctx.ellipse(x, y, r, r * 0.32, -0.35, 0, Math.PI * 2);
      ctx.stroke();
      break;
    case 'logo':
      ctx.fillStyle = a;
      ctx.globalAlpha = 0.8;
      ctx.beginPath();
      ctx.moveTo(x - r * 0.4, y + r * 0.2);
      ctx.lineTo(x - r * 0.1, y - r * 0.35);
      ctx.lineTo(x + r * 0.05, y - r * 0.05);
      ctx.lineTo(x + r * 0.2, y - r * 0.3);
      ctx.lineTo(x + r * 0.45, y + r * 0.2);
      ctx.closePath();
      ctx.fill();
      ctx.globalAlpha = 1;
      break;
    case 'vintage':
      // Crazed old cover: a few hairline cracks.
      ctx.strokeStyle = a;
      ctx.globalAlpha = 0.45;
      ctx.lineWidth = Math.max(0.6, r * 0.04);
      ctx.beginPath();
      ctx.moveTo(x - r * 0.6, y - r * 0.3);
      ctx.lineTo(x - r * 0.15, y - r * 0.1);
      ctx.lineTo(x + r * 0.1, y + r * 0.35);
      ctx.moveTo(x - r * 0.15, y - r * 0.1);
      ctx.lineTo(x + r * 0.45, y - r * 0.4);
      ctx.stroke();
      ctx.globalAlpha = 1;
      break;
    case 'tournament':
      ctx.strokeStyle = a;
      ctx.lineWidth = Math.max(0.8, r * 0.09);
      ctx.beginPath();
      ctx.arc(x, y, r * 0.42, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = a;
      ctx.beginPath();
      ctx.moveTo(x, y - r * 0.24);
      ctx.lineTo(x + r * 0.07, y - r * 0.05);
      ctx.lineTo(x + r * 0.24, y - r * 0.05);
      ctx.lineTo(x + r * 0.1, y + r * 0.07);
      ctx.lineTo(x + r * 0.15, y + r * 0.25);
      ctx.lineTo(x, y + r * 0.13);
      ctx.lineTo(x - r * 0.15, y + r * 0.25);
      ctx.lineTo(x - r * 0.1, y + r * 0.07);
      ctx.lineTo(x - r * 0.24, y - r * 0.05);
      ctx.lineTo(x - r * 0.07, y - r * 0.05);
      ctx.closePath();
      ctx.fill();
      break;
    case 'glitter':
      for (const [dx, dy, s, c] of [[-0.4, -0.2, 0.09, '#ffffff'], [0.3, -0.45, 0.07, '#f0c8e8'], [0.1, 0.1, 0.1, '#ffffff'], [-0.15, 0.45, 0.07, '#c8e8f0'], [0.5, 0.25, 0.08, '#f8e8a0'], [-0.55, 0.2, 0.06, '#f0c8e8']] as const) {
        ctx.fillStyle = c;
        ctx.beginPath();
        ctx.arc(x + dx * r, y + dy * r, Math.max(0.7, s * r), 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    case 'number':
      ctx.fillStyle = a;
      ctx.font = `700 ${Math.max(5, Math.round(r * 1.05))}px Georgia, serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('7', x + r * 0.05, y + r * 0.08);
      break;
    case 'gold':
      ctx.fillStyle = a;
      ctx.globalAlpha = 0.7;
      ctx.beginPath();
      ctx.ellipse(x - r * 0.3, y - r * 0.38, r * 0.3, r * 0.14, -0.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      break;
    case 'fox': {
      // A curl of white-tipped tail round its side.
      ctx.strokeStyle = shade(look.base, -0.3);
      ctx.lineWidth = Math.max(1, r * 0.22);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.arc(x + r * 0.05, y + r * 0.1, r * 0.55, Math.PI * 0.85, Math.PI * 1.9);
      ctx.stroke();
      ctx.fillStyle = a;
      const tx = x + r * 0.05 + Math.cos(Math.PI * 1.9) * r * 0.55;
      const ty = y + r * 0.1 + Math.sin(Math.PI * 1.9) * r * 0.55;
      ctx.beginPath();
      ctx.arc(tx, ty, Math.max(0.8, r * 0.16), 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'ace':
      // A signature, a date, and a little star.
      ctx.strokeStyle = a;
      ctx.lineWidth = Math.max(0.6, r * 0.06);
      ctx.beginPath();
      ctx.moveTo(x - r * 0.55, y);
      ctx.bezierCurveTo(x - r * 0.35, y - r * 0.35, x - r * 0.2, y + r * 0.25, x, y - r * 0.05);
      ctx.bezierCurveTo(x + r * 0.15, y - r * 0.3, x + r * 0.3, y + r * 0.2, x + r * 0.55, y - r * 0.1);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x - r * 0.3, y + r * 0.35);
      ctx.lineTo(x + r * 0.3, y + r * 0.35);
      ctx.stroke();
      ctx.fillStyle = '#d8a838';
      ctx.beginPath();
      ctx.arc(x + r * 0.35, y - r * 0.45, Math.max(0.8, r * 0.12), 0, Math.PI * 2);
      ctx.fill();
      break;
  }
}
