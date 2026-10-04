import type { PumpkinCarving } from '../types';

// Jack-o'-lantern faces, shared by October's carved pumpkins and the
// pumpkins grown in the garden.

type Ctx = CanvasRenderingContext2D;

function tri(ctx: Ctx, ax: number, ay: number, bx: number, by: number, cx: number, cy: number) {
  ctx.moveTo(ax, ay);
  ctx.lineTo(bx, by);
  ctx.lineTo(cx, cy);
  ctx.closePath();
}

/**
 * Cuts a jack-o'-lantern's face into a pumpkin of radius `r` centred on
 * (x, y), in whatever fill is current (dark for an unlit one, candle-light
 * for a lit one).
 */
export function carveFace(ctx: Ctx, x: number, y: number, r: number, face: PumpkinCarving) {
  ctx.beginPath();
  const ey = y - r * 0.18;
  const ex = r * 0.3;
  switch (face) {
    case 'happy':
      tri(ctx, x - ex - r * 0.12, ey + r * 0.08, x - ex, ey - r * 0.14, x - ex + r * 0.12, ey + r * 0.08);
      tri(ctx, x + ex - r * 0.12, ey + r * 0.08, x + ex, ey - r * 0.14, x + ex + r * 0.12, ey + r * 0.08);
      ctx.moveTo(x - r * 0.42, y + r * 0.12);
      ctx.quadraticCurveTo(x, y + r * 0.62, x + r * 0.42, y + r * 0.12);
      ctx.quadraticCurveTo(x, y + r * 0.36, x - r * 0.42, y + r * 0.12);
      break;
    case 'goofy':
      ctx.ellipse(x - ex, ey, r * 0.11, r * 0.13, 0, 0, Math.PI * 2);
      ctx.moveTo(x + ex + r * 0.07, ey - r * 0.02);
      ctx.ellipse(x + ex, ey - r * 0.02, r * 0.07, r * 0.08, 0, 0, Math.PI * 2);
      ctx.moveTo(x - r * 0.35, y + r * 0.15);
      ctx.quadraticCurveTo(x, y + r * 0.42, x + r * 0.35, y + r * 0.12);
      ctx.lineTo(x + r * 0.12, y + r * 0.3);
      ctx.lineTo(x + r * 0.05, y + r * 0.45);
      ctx.lineTo(x - r * 0.05, y + r * 0.31);
      ctx.closePath();
      break;
    case 'surprised':
      ctx.ellipse(x - ex, ey, r * 0.1, r * 0.14, 0, 0, Math.PI * 2);
      ctx.moveTo(x + ex + r * 0.1, ey);
      ctx.ellipse(x + ex, ey, r * 0.1, r * 0.14, 0, 0, Math.PI * 2);
      ctx.moveTo(x + r * 0.12, y + r * 0.3);
      ctx.ellipse(x, y + r * 0.3, r * 0.12, r * 0.16, 0, 0, Math.PI * 2);
      break;
    case 'spooky':
      tri(ctx, x - ex - r * 0.14, ey - r * 0.1, x - ex + r * 0.12, ey - r * 0.02, x - ex - r * 0.06, ey + r * 0.1);
      tri(ctx, x + ex + r * 0.14, ey - r * 0.1, x + ex - r * 0.12, ey - r * 0.02, x + ex + r * 0.06, ey + r * 0.1);
      ctx.moveTo(x - r * 0.45, y + r * 0.12);
      for (let i = 0; i <= 6; i++) ctx.lineTo(x - r * 0.45 + (i * r * 0.9) / 6, y + r * (i % 2 ? 0.26 : 0.12));
      ctx.lineTo(x + r * 0.35, y + r * 0.42);
      ctx.lineTo(x - r * 0.35, y + r * 0.42);
      ctx.closePath();
      break;
    case 'verySpooky':
      tri(ctx, x - ex - r * 0.16, ey - r * 0.16, x - ex + r * 0.14, ey - r * 0.02, x - ex - r * 0.1, ey + r * 0.14);
      tri(ctx, x + ex + r * 0.16, ey - r * 0.16, x + ex - r * 0.14, ey - r * 0.02, x + ex + r * 0.1, ey + r * 0.14);
      // A wide jagged grin, all teeth.
      ctx.moveTo(x - r * 0.55, y + r * 0.05);
      ctx.quadraticCurveTo(x, y + r * 0.75, x + r * 0.55, y + r * 0.05);
      for (let i = 0; i <= 8; i++) {
        const px = x + r * 0.55 - (i * r * 1.1) / 8;
        ctx.lineTo(px, y + r * (0.18 + (i % 2 ? 0.16 : 0) + Math.sin((i / 8) * Math.PI) * 0.12));
      }
      ctx.closePath();
      break;
    case 'wink':
      tri(ctx, x - ex - r * 0.12, ey + r * 0.08, x - ex, ey - r * 0.14, x - ex + r * 0.12, ey + r * 0.08);
      ctx.moveTo(x + ex - r * 0.14, ey + r * 0.02);
      ctx.lineTo(x + ex + r * 0.14, ey - r * 0.02);
      ctx.lineTo(x + ex + r * 0.14, ey + r * 0.05);
      ctx.lineTo(x + ex - r * 0.14, ey + r * 0.07);
      ctx.closePath();
      ctx.moveTo(x - r * 0.3, y + r * 0.2);
      ctx.quadraticCurveTo(x + r * 0.05, y + r * 0.5, x + r * 0.38, y + r * 0.12);
      ctx.quadraticCurveTo(x + r * 0.05, y + r * 0.32, x - r * 0.3, y + r * 0.2);
      break;
    case 'moon':
      // Crescent eyes and a star where the nose would be.
      for (const s of [-1, 1]) {
        ctx.moveTo(x + s * ex + r * 0.12, ey);
        ctx.arc(x + s * ex, ey, r * 0.12, 0, Math.PI, false);
        ctx.arc(x + s * ex, ey - r * 0.04, r * 0.09, Math.PI, 0, true);
      }
      for (let i = 0; i < 5; i++) {
        const a = -Math.PI / 2 + (i * Math.PI * 2) / 5;
        const b = a + Math.PI / 5;
        if (i === 0) ctx.moveTo(x + Math.cos(a) * r * 0.13, y + r * 0.22 + Math.sin(a) * r * 0.13);
        else ctx.lineTo(x + Math.cos(a) * r * 0.13, y + r * 0.22 + Math.sin(a) * r * 0.13);
        ctx.lineTo(x + Math.cos(b) * r * 0.055, y + r * 0.22 + Math.sin(b) * r * 0.055);
      }
      ctx.closePath();
      break;
    case 'fox':
      // Two slanted eyes and a pointed muzzle: someone was thinking of something.
      tri(ctx, x - ex - r * 0.14, ey + r * 0.06, x - ex + r * 0.12, ey - r * 0.04, x - ex + r * 0.06, ey + r * 0.1);
      tri(ctx, x + ex + r * 0.14, ey + r * 0.06, x + ex - r * 0.12, ey - r * 0.04, x + ex - r * 0.06, ey + r * 0.1);
      tri(ctx, x - r * 0.16, y + r * 0.12, x + r * 0.16, y + r * 0.12, x, y + r * 0.4);
      // Ears cut in the top.
      tri(ctx, x - r * 0.42, y - r * 0.38, x - r * 0.26, y - r * 0.62, x - r * 0.16, y - r * 0.36);
      tri(ctx, x + r * 0.42, y - r * 0.38, x + r * 0.26, y - r * 0.62, x + r * 0.16, y - r * 0.36);
      break;
    case 'king': {
      // A crown cut across the brow, fierce eyes under it, and a grin that runs ear to ear, every tooth carved.
      const cy = y - r * 0.5;
      ctx.moveTo(x - r * 0.36, cy + r * 0.1);
      ctx.lineTo(x - r * 0.36, cy - r * 0.08);
      ctx.lineTo(x - r * 0.22, cy + r * 0.02);
      ctx.lineTo(x - r * 0.12, cy - r * 0.14);
      ctx.lineTo(x, cy + r * 0.0);
      ctx.lineTo(x + r * 0.12, cy - r * 0.14);
      ctx.lineTo(x + r * 0.22, cy + r * 0.02);
      ctx.lineTo(x + r * 0.36, cy - r * 0.08);
      ctx.lineTo(x + r * 0.36, cy + r * 0.1);
      ctx.closePath();
      tri(ctx, x - ex - r * 0.15, ey - r * 0.04, x - ex + r * 0.14, ey + r * 0.04, x - ex - r * 0.04, ey + r * 0.16);
      tri(ctx, x + ex + r * 0.15, ey - r * 0.04, x + ex - r * 0.14, ey + r * 0.04, x + ex + r * 0.04, ey + r * 0.16);
      // A little diamond nose.
      ctx.moveTo(x, y + r * 0.02);
      ctx.lineTo(x + r * 0.06, y + r * 0.1);
      ctx.lineTo(x, y + r * 0.18);
      ctx.lineTo(x - r * 0.06, y + r * 0.1);
      ctx.closePath();
      ctx.moveTo(x - r * 0.62, y + r * 0.12);
      ctx.quadraticCurveTo(x, y + r * 0.82, x + r * 0.62, y + r * 0.12);
      for (let i = 0; i <= 10; i++) {
        const px = x + r * 0.62 - (i * r * 1.24) / 10;
        ctx.lineTo(px, y + r * (0.24 + (i % 2 ? 0.14 : 0) + Math.sin((i / 10) * Math.PI) * 0.14));
      }
      ctx.closePath();
      break;
    }
  }
  ctx.fill('evenodd');
}
