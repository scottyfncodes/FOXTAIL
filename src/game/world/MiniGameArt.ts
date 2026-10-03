import type { MiniGameId } from '../systems/minigames';
import { SCOTT_APPEARANCE } from '../data/character';

// The little set-ups around the property where the games are played: a
// bucket and an upturned pot under the oaks, the kindling heap by the
// woodpile, a cairn of flat stones on the creek bank, a hedge arch into
// the maze, a bucket of throwing sticks, the painted target board and the
// lily pads in the slack water. Each is drawn standing on its point (x, y)
// on screen, about a tile across, in the world's own plain shapes.

type Ctx = CanvasRenderingContext2D;

function shadow(ctx: Ctx, x: number, y: number, rx: number, ry: number) {
  ctx.fillStyle = 'rgba(0,0,0,0.2)';
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
}

function acorn(ctx: Ctx, x: number, y: number, r: number) {
  ctx.fillStyle = '#9a6a3a';
  ctx.beginPath();
  ctx.ellipse(x, y + r * 0.2, r * 0.8, r, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#6a4a2a';
  ctx.beginPath();
  ctx.ellipse(x, y - r * 0.45, r * 0.9, r * 0.45, 0, 0, Math.PI * 2);
  ctx.fill();
}

function twig(ctx: Ctx, x0: number, y0: number, x1: number, y1: number, w: number, color = '#7a5a3a') {
  ctx.strokeStyle = color;
  ctx.lineWidth = w;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.stroke();
}

/**
 * One game's set-up at (x, y) on screen, `tile` pixels per tile. `bloom`
 * (0..1) is how far the garden's come along: the hedge arch flowers as it does.
 */
export function drawMiniGameProp(ctx: Ctx, id: MiniGameId, x: number, y: number, tile: number, now: number, bloom = 0) {
  const t = tile;
  ctx.save();
  switch (id) {
    case 'acornPitch': {
      // A wooden bucket, an upturned flower pot, and a little heap of acorns.
      shadow(ctx, x, y + t * 0.05, t * 0.42, t * 0.12);
      ctx.fillStyle = '#8a6440';
      ctx.beginPath();
      ctx.moveTo(x - t * 0.3, y - t * 0.34);
      ctx.lineTo(x - t * 0.06, y - t * 0.34);
      ctx.lineTo(x - t * 0.1, y + t * 0.02);
      ctx.lineTo(x - t * 0.26, y + t * 0.02);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#4a3420';
      ctx.beginPath();
      ctx.ellipse(x - t * 0.18, y - t * 0.34, t * 0.12, t * 0.04, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#3e3a34';
      ctx.lineWidth = Math.max(1, t * 0.025);
      for (const k of [0.25, 0.75]) {
        ctx.beginPath();
        ctx.moveTo(x - t * (0.3 - k * 0.04) + 0, y - t * 0.34 + t * 0.36 * k);
        ctx.lineTo(x - t * (0.06 + k * 0.04), y - t * 0.34 + t * 0.36 * k);
        ctx.stroke();
      }
      ctx.fillStyle = '#c0724a';
      ctx.beginPath();
      ctx.moveTo(x + t * 0.08, y + t * 0.02);
      ctx.lineTo(x + t * 0.34, y + t * 0.02);
      ctx.lineTo(x + t * 0.29, y - t * 0.2);
      ctx.lineTo(x + t * 0.13, y - t * 0.2);
      ctx.closePath();
      ctx.fill();
      for (const [dx, dy] of [
        [0.0, 0.14],
        [0.1, 0.18],
        [-0.08, 0.2],
      ])
        acorn(ctx, x + dx * t, y + dy * t, t * 0.05);
      break;
    }
    case 'twigJenga': {
      // Kindling stacked log-cabin fashion, a few layers high.
      shadow(ctx, x, y + t * 0.05, t * 0.38, t * 0.12);
      const w = Math.max(1.5, t * 0.07);
      for (let layer = 0; layer < 5; layer++) {
        const ly = y - layer * t * 0.08;
        if (layer % 2 === 0) {
          twig(ctx, x - t * 0.3, ly, x + t * 0.3, ly - t * 0.02, w, layer % 4 === 0 ? '#7a5a3a' : '#8a6a44');
        } else {
          for (const dx of [-0.2, 0, 0.2]) {
            ctx.fillStyle = '#c8a878';
            ctx.beginPath();
            ctx.arc(x + dx * t, ly, w * 0.6, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = '#6a4a2a';
            ctx.lineWidth = 1;
            ctx.stroke();
          }
        }
      }
      break;
    }
    case 'rockSkip': {
      // A cairn of flat skipping stones on the bank.
      shadow(ctx, x, y + t * 0.04, t * 0.34, t * 0.1);
      const cols = ['#8e949a', '#a8acae', '#7c8288', '#b4b2aa'];
      for (let i = 0; i < 4; i++) {
        ctx.fillStyle = cols[i];
        ctx.beginPath();
        ctx.ellipse(x + (i % 2 ? 0.03 : -0.02) * t, y - i * t * 0.07, t * (0.24 - i * 0.04), t * 0.055, 0.05 * (i - 1), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = '#9a9ea2';
      ctx.beginPath();
      ctx.ellipse(x + t * 0.3, y + t * 0.1, t * 0.09, t * 0.04, 0.3, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'gardenMaze': {
      // Two hedge pillars and the arch between them, flowering as the garden does.
      const hedge = '#2f5e2c';
      const leaf = '#3f7a38';
      shadow(ctx, x, y + t * 0.08, t * 0.7, t * 0.14);
      for (const side of [-1, 1]) {
        ctx.fillStyle = hedge;
        ctx.beginPath();
        ctx.roundRect(x + side * t * 0.42 - t * 0.2, y - t * 0.85, t * 0.4, t * 0.92, t * 0.12);
        ctx.fill();
        ctx.fillStyle = leaf;
        for (let k = 0; k < 5; k++) {
          ctx.beginPath();
          ctx.arc(x + side * t * 0.42 + ((k % 2) - 0.5) * t * 0.16, y - t * (0.18 + k * 0.15), t * 0.09, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.strokeStyle = hedge;
      ctx.lineWidth = t * 0.2;
      ctx.beginPath();
      ctx.arc(x, y - t * 0.8, t * 0.42, Math.PI, 0);
      ctx.stroke();
      ctx.strokeStyle = leaf;
      ctx.lineWidth = t * 0.08;
      ctx.beginPath();
      ctx.arc(x, y - t * 0.84, t * 0.42, Math.PI * 1.05, Math.PI * 1.95);
      ctx.stroke();
      // The path in, and flowers in the hedge once the garden's growing.
      ctx.fillStyle = 'rgba(214,190,140,0.55)';
      ctx.beginPath();
      ctx.ellipse(x, y + t * 0.02, t * 0.2, t * 0.08, 0, 0, Math.PI * 2);
      ctx.fill();
      const flowers = Math.round(bloom * 8);
      const colors = ['#f2d0e0', '#f6e27a', '#e8a0c0', '#ffffff'];
      for (let i = 0; i < flowers; i++) {
        const a = Math.PI * (1.08 + (i / 8) * 0.84);
        ctx.fillStyle = colors[i % colors.length];
        ctx.beginPath();
        ctx.arc(x + Math.cos(a) * t * 0.42, y - t * 0.8 + Math.sin(a) * t * 0.42, t * 0.04, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case 'stickFetch': {
      // An old bucket of good throwing sticks, one lying out on the grass.
      shadow(ctx, x, y + t * 0.04, t * 0.36, t * 0.1);
      twig(ctx, x - t * 0.12, y - t * 0.2, x - t * 0.22, y - t * 0.62, Math.max(1.5, t * 0.05));
      twig(ctx, x - t * 0.02, y - t * 0.2, x + t * 0.04, y - t * 0.7, Math.max(1.5, t * 0.055), '#8a6a44');
      twig(ctx, x + t * 0.06, y - t * 0.2, x + t * 0.2, y - t * 0.58, Math.max(1.5, t * 0.045), '#6a4a2a');
      ctx.fillStyle = '#6a7a84';
      ctx.beginPath();
      ctx.moveTo(x - t * 0.2, y - t * 0.24);
      ctx.lineTo(x + t * 0.14, y - t * 0.24);
      ctx.lineTo(x + t * 0.1, y + t * 0.02);
      ctx.lineTo(x - t * 0.16, y + t * 0.02);
      ctx.closePath();
      ctx.fill();
      twig(ctx, x + t * 0.18, y + t * 0.1, x + t * 0.5, y + t * 0.04, Math.max(1.5, t * 0.05));
      break;
    }
    case 'slingshot': {
      // A painted wooden board on a post: rings, and a dent or two from old pinecones.
      shadow(ctx, x, y + t * 0.04, t * 0.3, t * 0.08);
      ctx.fillStyle = '#6a4a2e';
      ctx.fillRect(x - t * 0.04, y - t * 0.5, t * 0.08, t * 0.52);
      const cy = y - t * 0.72;
      const rings = ['#e8dcc4', SCOTT_APPEARANCE.flag, '#e8dcc4', SCOTT_APPEARANCE.flag];
      rings.forEach((c, i) => {
        ctx.fillStyle = c;
        ctx.beginPath();
        ctx.arc(x, cy, t * (0.3 - i * 0.07), 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.strokeStyle = '#6a4a2e';
      ctx.lineWidth = Math.max(1, t * 0.03);
      ctx.beginPath();
      ctx.arc(x, cy, t * 0.3, 0, Math.PI * 2);
      ctx.stroke();
      // A basket of pinecones at its foot.
      ctx.fillStyle = '#a07a48';
      ctx.beginPath();
      ctx.ellipse(x + t * 0.32, y - t * 0.02, t * 0.14, t * 0.08, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#6a4a2a';
      for (const dx of [-0.05, 0.05, 0]) {
        ctx.beginPath();
        ctx.ellipse(x + t * (0.32 + dx), y - t * (0.07 + (dx === 0 ? 0.04 : 0)), t * 0.04, t * 0.055, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case 'frogJump': {
      // Lily pads out on the slack water, and the frog on the nearest one, throat going.
      const pads = [
        [0.85, -0.1, 0.22],
        [1.35, 0.25, 0.18],
        [1.15, -0.5, 0.16],
      ];
      for (const [dx, dy, r] of pads) {
        ctx.fillStyle = '#4f8a3a';
        ctx.beginPath();
        ctx.arc(x + dx * t, y + dy * t, r * t, 0.35, Math.PI * 2 - 0.05);
        ctx.lineTo(x + dx * t, y + dy * t);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = 'rgba(30,60,24,0.5)';
        ctx.lineWidth = 1;
        ctx.stroke();
      }
      const fx = x + 0.85 * t;
      const fy = y - 0.12 * t;
      ctx.fillStyle = '#6aa040';
      ctx.beginPath();
      ctx.ellipse(fx, fy, t * 0.09, t * 0.07, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#f2f0d8';
      const puff = 0.5 + 0.5 * Math.sin(now / 300);
      ctx.beginPath();
      ctx.ellipse(fx, fy + t * 0.04, t * 0.04 * (0.6 + puff * 0.5), t * 0.03 * (0.6 + puff * 0.5), 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#1a2a14';
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.arc(fx + s * t * 0.045, fy - t * 0.05, t * 0.02, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case 'catLaser':
      break;
  }
  ctx.restore();
}
