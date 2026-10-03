import type { DecorKind } from '../data/october';
import { drawPumpkin, LEAF_COLORS } from './OctoberArt';

// The yard dressed up for Halloween: string lights, a pretend graveyard,
// hay and corn and gourds, a cauldron, cheesecloth ghosts, a skeleton who
// waves, crows, candles in paper bags — and a few older things further out
// that nobody dressed up at all. Same hand-drawn style as everything else.

type Ctx = CanvasRenderingContext2D;

const BULBS = ['#ff8a2a', '#b06cff', '#ffb43a', '#8ad44a'];

/** A string of bulbs sagging between points (screen coords). Lit, each bulb glows. */
export function drawStringLights(ctx: Ctx, pts: { x: number; y: number }[], tile: number, lit: number, now: number, seed: number) {
  if (pts.length < 2) return;
  const sag = tile * 0.22;
  const samples: { x: number; y: number }[] = [];
  ctx.strokeStyle = '#1c1612';
  ctx.lineWidth = Math.max(1, tile * 0.02);
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const mx = (a.x + b.x) / 2;
    const my = (a.y + b.y) / 2 + sag;
    ctx.quadraticCurveTo(mx, my, b.x, b.y);
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const n = Math.max(2, Math.round(len / (tile * 0.32)));
    for (let k = 0; k < n; k++) {
      const t = (k + 0.5) / n;
      const x = (1 - t) * (1 - t) * a.x + 2 * (1 - t) * t * mx + t * t * b.x;
      const y = (1 - t) * (1 - t) * a.y + 2 * (1 - t) * t * my + t * t * b.y;
      samples.push({ x, y });
    }
  }
  ctx.stroke();
  samples.forEach((p, i) => {
    const color = BULBS[(i + seed) % BULBS.length];
    // A slow chase along the string, so it feels alive.
    const chase = 0.75 + 0.25 * Math.sin(now * 0.004 - i * 0.9);
    const r = tile * 0.045;
    if (lit > 0.05) {
      const sprite = glowSprite(color);
      if (sprite) {
        ctx.globalAlpha = 0.55 * lit * chase;
        ctx.drawImage(sprite, p.x - tile * 0.28, p.y + r - tile * 0.28, tile * 0.56, tile * 0.56);
        ctx.globalAlpha = 1;
      }
    }
    ctx.fillStyle = '#222';
    ctx.fillRect(p.x - r * 0.5, p.y - r * 0.2, r, r * 0.6);
    ctx.fillStyle = lit > 0.05 ? color : shade(color);
    ctx.beginPath();
    ctx.ellipse(p.x, p.y + r * 1.1, r * 0.75, r * 1.05, 0, 0, Math.PI * 2);
    ctx.fill();
    if (lit > 0.05) {
      ctx.fillStyle = `rgba(255,255,240,${0.7 * lit * chase})`;
      ctx.beginPath();
      ctx.arc(p.x - r * 0.2, p.y + r * 0.8, r * 0.28, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

const glows = new Map<string, HTMLCanvasElement>();

/** A soft round glow in one colour, drawn once and reused for every bulb of it. */
function glowSprite(color: string): HTMLCanvasElement | null {
  const hit = glows.get(color);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = 32;
  c.height = 32;
  const g = c.getContext('2d');
  if (!g) return null;
  const gr = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  gr.addColorStop(0, hexA(color, 1));
  gr.addColorStop(1, hexA(color, 0));
  g.fillStyle = gr;
  g.fillRect(0, 0, 32, 32);
  glows.set(color, c);
  return c;
}

function hexA(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

function shade(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const f = (v: number) => Math.round(v * 0.55);
  return `rgb(${f((n >> 16) & 255)},${f((n >> 8) & 255)},${f(n & 255)})`;
}

function shadow(ctx: Ctx, x: number, y: number, w: number, h: number) {
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.beginPath();
  ctx.ellipse(x, y, w, h, 0, 0, Math.PI * 2);
  ctx.fill();
}

/** One of the yard's Halloween things, standing at (x, y) on screen. `glow` is how dark it is (for anything lit). */
export function drawHalloweenDecor(ctx: Ctx, kind: DecorKind, x: number, y: number, tile: number, glow: number, now: number, v = 0) {
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  switch (kind) {
    case 'grave': {
      // A pretend headstone, a bit too neat, with a joke on it.
      shadow(ctx, x, y, tile * 0.3, tile * 0.07);
      const w = tile * (0.42 + (v % 2) * 0.08);
      const h = tile * (0.55 + (v % 3) * 0.08);
      const tilt = (v - 1.5) * 0.06;
      ctx.translate(x, y);
      ctx.rotate(tilt);
      ctx.fillStyle = v === 2 ? '#8e8a96' : '#a8a4ae';
      ctx.beginPath();
      if (v === 1) {
        // A cross.
        ctx.rect(-w * 0.12, -h * 1.15, w * 0.24, h * 1.15);
        ctx.rect(-w * 0.42, -h * 0.9, w * 0.84, w * 0.22);
      } else {
        ctx.moveTo(-w / 2, 0);
        ctx.lineTo(-w / 2, -h + w / 2);
        ctx.arc(0, -h + w / 2, w / 2, Math.PI, 0);
        ctx.lineTo(w / 2, 0);
        ctx.closePath();
      }
      ctx.fill();
      ctx.strokeStyle = 'rgba(40,36,48,0.5)';
      ctx.lineWidth = Math.max(0.8, tile * 0.02);
      ctx.stroke();
      if (v !== 1) {
        ctx.fillStyle = '#4a4652';
        ctx.font = `bold ${Math.max(6, tile * 0.12)}px Georgia, serif`;
        ctx.textAlign = 'center';
        ctx.fillText(['RIP', 'BOO', 'I’LL BE', 'BRB'][v % 4], 0, -h * 0.52);
        if (v === 2) ctx.fillText('BACK', 0, -h * 0.3);
      }
      // A tuft of grass and a fallen leaf at its foot.
      ctx.fillStyle = '#4e6a34';
      ctx.beginPath();
      ctx.ellipse(-w * 0.35, 0, w * 0.22, h * 0.07, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = LEAF_COLORS[v % LEAF_COLORS.length];
      ctx.beginPath();
      ctx.ellipse(w * 0.3, -h * 0.02, tile * 0.05, tile * 0.025, 0.7, 0, Math.PI * 2);
      ctx.fill();
      // A skeleton hand poking out of the ground, at the BRB one.
      if (v === 3) {
        ctx.strokeStyle = '#efe8d8';
        ctx.lineWidth = Math.max(1, tile * 0.03);
        const wave = Math.sin(now * 0.003) * 0.25;
        ctx.save();
        ctx.translate(w * 0.75, tile * 0.05);
        ctx.rotate(wave);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(0, -tile * 0.16);
        for (let f = -1.5; f <= 1.5; f++) {
          ctx.moveTo(0, -tile * 0.16);
          ctx.lineTo(f * tile * 0.03, -tile * 0.25);
        }
        ctx.stroke();
        ctx.restore();
      }
      break;
    }
    case 'oldGrave': {
      // Real ones: worn soft, mossed, leaning, the names long gone.
      shadow(ctx, x, y, tile * 0.28, tile * 0.06);
      ctx.translate(x, y);
      ctx.rotate((v - 1.5) * 0.18);
      const w = tile * 0.38;
      const h = tile * (0.5 + (v % 2) * 0.12);
      ctx.fillStyle = '#6c6a64';
      ctx.beginPath();
      ctx.moveTo(-w / 2, 0);
      ctx.lineTo(-w / 2, -h + w * 0.3);
      ctx.quadraticCurveTo(0, -h - w * 0.25, w / 2, -h + w * 0.3);
      ctx.lineTo(w / 2, 0);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = 'rgba(90,120,60,0.75)';
      ctx.beginPath();
      ctx.ellipse(-w * 0.2, -h * 0.85, w * 0.28, h * 0.12, 0.3, 0, Math.PI * 2);
      ctx.ellipse(w * 0.3, -h * 0.15, w * 0.2, h * 0.18, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(40,38,34,0.45)';
      ctx.lineWidth = Math.max(0.6, tile * 0.012);
      ctx.beginPath();
      for (let i = 0; i < 3; i++) {
        ctx.moveTo(-w * 0.28, -h * (0.62 - i * 0.12));
        ctx.lineTo(w * (0.1 + (i % 2) * 0.12), -h * (0.62 - i * 0.12));
      }
      ctx.stroke();
      break;
    }
    case 'booSign': {
      shadow(ctx, x, y, tile * 0.2, tile * 0.05);
      ctx.fillStyle = '#5a4430';
      ctx.fillRect(x - tile * 0.025, y - tile * 0.6, tile * 0.05, tile * 0.6);
      ctx.translate(x, y - tile * 0.62);
      ctx.rotate(-0.08);
      ctx.fillStyle = '#e8dcc0';
      ctx.fillRect(-tile * 0.32, -tile * 0.2, tile * 0.64, tile * 0.26);
      ctx.strokeStyle = '#5a4430';
      ctx.lineWidth = Math.max(1, tile * 0.025);
      ctx.strokeRect(-tile * 0.32, -tile * 0.2, tile * 0.64, tile * 0.26);
      ctx.fillStyle = '#d0601c';
      ctx.font = `bold ${Math.max(7, tile * 0.17)}px Georgia, serif`;
      ctx.textAlign = 'center';
      ctx.fillText('BOO!', 0, -tile * 0.02);
      break;
    }
    case 'hayBale': {
      shadow(ctx, x, y, tile * 0.5, tile * 0.1);
      const w = tile * 0.9;
      const h = tile * 0.42;
      ctx.fillStyle = '#c8a24e';
      ctx.fillRect(x - w / 2, y - h, w, h);
      ctx.fillStyle = '#ddb95e';
      ctx.fillRect(x - w / 2, y - h, w, h * 0.3);
      ctx.strokeStyle = 'rgba(120,90,30,0.55)';
      ctx.lineWidth = Math.max(0.6, tile * 0.012);
      ctx.beginPath();
      for (let i = 0; i < 12; i++) {
        const sx = x - w / 2 + (i / 11) * w;
        ctx.moveTo(sx, y - h + tile * 0.03);
        ctx.lineTo(sx + tile * 0.03, y - tile * 0.02);
      }
      ctx.stroke();
      ctx.strokeStyle = '#7a4a24';
      ctx.lineWidth = Math.max(1, tile * 0.022);
      ctx.beginPath();
      ctx.moveTo(x - w * 0.25, y - h);
      ctx.lineTo(x - w * 0.25, y);
      ctx.moveTo(x + w * 0.25, y - h);
      ctx.lineTo(x + w * 0.25, y);
      ctx.stroke();
      // A pumpkin on top, and gourds tumbled at the foot.
      drawPumpkin(ctx, x - tile * 0.12, y - h - tile * 0.02, tile, 0.85, glow > 0.35 ? 'goofy' : null, glow, now, 11);
      const gourds: [string, number, number][] = [
        ['#e6d39a', 0.4, 0.04],
        ['#6f8a3a', 0.52, -0.02],
        ['#e09030', -0.48, 0.05],
      ];
      for (const [c, dx, dy] of gourds) {
        ctx.fillStyle = c;
        ctx.beginPath();
        ctx.ellipse(x + dx * tile, y + dy * tile, tile * 0.08, tile * 0.06, dx, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(x + dx * tile + tile * 0.05, y + dy * tile - tile * 0.05, tile * 0.045, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case 'cornStalks': {
      shadow(ctx, x, y, tile * 0.18, tile * 0.05);
      const sway = Math.sin(now * 0.0013 + x) * tile * 0.02;
      for (let i = -2; i <= 2; i++) {
        ctx.strokeStyle = i % 2 ? '#b89a50' : '#a4863e';
        ctx.lineWidth = Math.max(1, tile * 0.03);
        ctx.beginPath();
        ctx.moveTo(x + i * tile * 0.03, y);
        ctx.quadraticCurveTo(x + i * tile * 0.05, y - tile * 0.6, x + i * tile * 0.1 + sway, y - tile * (1.05 + Math.abs(i) * -0.06));
        ctx.stroke();
        // Dry leaves hanging off each stalk.
        ctx.fillStyle = '#c9ad66';
        ctx.beginPath();
        ctx.moveTo(x + i * tile * 0.05, y - tile * 0.5);
        ctx.quadraticCurveTo(x + i * tile * 0.05 + (i >= 0 ? 1 : -1) * tile * 0.25, y - tile * 0.55, x + i * tile * 0.05 + (i >= 0 ? 1 : -1) * tile * 0.3 + sway, y - tile * 0.35);
        ctx.quadraticCurveTo(x + i * tile * 0.05 + (i >= 0 ? 1 : -1) * tile * 0.15, y - tile * 0.48, x + i * tile * 0.05, y - tile * 0.45);
        ctx.fill();
      }
      // Tied at the waist with twine.
      ctx.strokeStyle = '#7a4a24';
      ctx.lineWidth = Math.max(1, tile * 0.03);
      ctx.beginPath();
      ctx.moveTo(x - tile * 0.12, y - tile * 0.3);
      ctx.lineTo(x + tile * 0.12, y - tile * 0.3);
      ctx.stroke();
      break;
    }
    case 'pumpkinStack': {
      shadow(ctx, x, y, tile * 0.3, tile * 0.07);
      const lit = glow > 0.35 ? glow : 0;
      drawPumpkin(ctx, x, y, tile, 1.25, 'happy', lit, now, 21);
      drawPumpkin(ctx, x + tile * 0.02, y - tile * 0.32, tile, 0.95, 'spooky', lit, now, 22);
      drawPumpkin(ctx, x - tile * 0.01, y - tile * 0.56, tile, 0.65, 'surprised', lit, now, 23);
      break;
    }
    case 'cauldron': {
      shadow(ctx, x, y, tile * 0.32, tile * 0.07);
      // Logs, a little fire, the pot on its legs, and green brew bubbling over.
      ctx.strokeStyle = '#5a3a22';
      ctx.lineWidth = Math.max(1.5, tile * 0.06);
      ctx.beginPath();
      ctx.moveTo(x - tile * 0.28, y + tile * 0.02);
      ctx.lineTo(x + tile * 0.22, y - tile * 0.06);
      ctx.moveTo(x - tile * 0.22, y - tile * 0.06);
      ctx.lineTo(x + tile * 0.28, y + tile * 0.02);
      ctx.stroke();
      for (let i = 0; i < 3; i++) {
        const fl = Math.sin(now * 0.02 + i * 2) * tile * 0.02;
        ctx.fillStyle = i === 1 ? '#ffd24a' : '#ff7a24';
        ctx.beginPath();
        ctx.moveTo(x + (i - 1) * tile * 0.08 - tile * 0.05, y - tile * 0.04);
        ctx.quadraticCurveTo(x + (i - 1) * tile * 0.08 + fl, y - tile * (0.24 + (i === 1 ? 0.06 : 0)), x + (i - 1) * tile * 0.08 + tile * 0.05, y - tile * 0.04);
        ctx.fill();
      }
      ctx.fillStyle = '#1c1a1e';
      ctx.beginPath();
      ctx.ellipse(x, y - tile * 0.3, tile * 0.28, tile * 0.22, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#2a282e';
      ctx.fillRect(x - tile * 0.3, y - tile * 0.48, tile * 0.6, tile * 0.06);
      const brew = ctx.createRadialGradient(x, y - tile * 0.48, 0, x, y - tile * 0.48, tile * 0.26);
      brew.addColorStop(0, '#b8ff6a');
      brew.addColorStop(1, '#4aa83a');
      ctx.fillStyle = brew;
      ctx.beginPath();
      ctx.ellipse(x, y - tile * 0.48, tile * 0.25, tile * 0.07, 0, 0, Math.PI * 2);
      ctx.fill();
      for (let i = 0; i < 4; i++) {
        const t = ((now * 0.0011 + i * 0.27) % 1);
        ctx.fillStyle = `rgba(190,255,140,${0.8 * (1 - t)})`;
        ctx.beginPath();
        ctx.arc(x + Math.sin(i * 2.1 + now * 0.002) * tile * 0.16, y - tile * 0.5 - t * tile * 0.12, tile * (0.025 + t * 0.03), 0, Math.PI * 2);
        ctx.fill();
      }
      // Green steam curling up.
      for (let i = 0; i < 3; i++) {
        const t = ((now * 0.0004 + i / 3) % 1);
        ctx.fillStyle = `rgba(170,240,150,${0.22 * (1 - t)})`;
        ctx.beginPath();
        ctx.arc(x + Math.sin(t * 6 + i) * tile * 0.15, y - tile * (0.6 + t * 0.9), tile * (0.08 + t * 0.14), 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case 'hangingGhost': {
      // A cheesecloth ghost on a shepherd's hook, stirring in the breeze.
      shadow(ctx, x, y, tile * 0.12, tile * 0.04);
      ctx.strokeStyle = '#1e1a18';
      ctx.lineWidth = Math.max(1.2, tile * 0.04);
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x, y - tile * 1.25);
      ctx.arc(x + tile * 0.14, y - tile * 1.25, tile * 0.14, Math.PI, 0);
      ctx.stroke();
      const swing = Math.sin(now * 0.0019 + v * 2) * 0.18;
      ctx.translate(x + tile * 0.28, y - tile * 1.22);
      ctx.rotate(swing);
      ctx.strokeStyle = 'rgba(30,26,24,0.8)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(0, tile * 0.1);
      ctx.stroke();
      ctx.fillStyle = 'rgba(244,244,250,0.92)';
      ctx.beginPath();
      ctx.arc(0, tile * 0.2, tile * 0.1, Math.PI, 0);
      const flutter = (i: number) => Math.sin(now * 0.008 + i + v) * tile * 0.03;
      ctx.lineTo(tile * 0.16 + flutter(0), tile * 0.55);
      ctx.lineTo(tile * 0.08, tile * 0.48);
      ctx.lineTo(tile * 0.02 + flutter(1), tile * 0.58);
      ctx.lineTo(-tile * 0.05, tile * 0.48);
      ctx.lineTo(-tile * 0.15 + flutter(2), tile * 0.56);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#1a1820';
      ctx.beginPath();
      ctx.ellipse(-tile * 0.035, tile * 0.19, tile * 0.018, tile * 0.03, 0, 0, Math.PI * 2);
      ctx.ellipse(tile * 0.035, tile * 0.19, tile * 0.018, tile * 0.03, 0, 0, Math.PI * 2);
      ctx.ellipse(0, tile * 0.27, tile * 0.025, tile * 0.03, 0, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'skeleton': {
      // Sitting on the old bench, one leg crossed, waving now and then at nobody.
      const bone = '#eee6d2';
      const outline = 'rgba(60,50,40,0.6)';
      ctx.strokeStyle = bone;
      ctx.lineWidth = Math.max(1.2, tile * 0.035);
      const hip = { x, y: y - tile * 0.34 };
      // Legs over the seat edge.
      ctx.beginPath();
      ctx.moveTo(hip.x, hip.y);
      ctx.lineTo(hip.x + tile * 0.16, hip.y + tile * 0.02);
      ctx.lineTo(hip.x + tile * 0.16, hip.y + tile * 0.3);
      ctx.moveTo(hip.x + tile * 0.02, hip.y);
      ctx.lineTo(hip.x + tile * 0.2, hip.y - tile * 0.04);
      ctx.lineTo(hip.x + tile * 0.26, hip.y + tile * 0.18);
      ctx.stroke();
      // Spine and ribs.
      ctx.beginPath();
      ctx.moveTo(hip.x, hip.y);
      ctx.lineTo(hip.x - tile * 0.01, hip.y - tile * 0.34);
      ctx.stroke();
      ctx.lineWidth = Math.max(0.8, tile * 0.022);
      for (let i = 0; i < 3; i++) {
        const ry = hip.y - tile * (0.14 + i * 0.065);
        ctx.beginPath();
        ctx.ellipse(hip.x, ry, tile * (0.09 - i * 0.008), tile * 0.02, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
      // One arm on the knee, one waving.
      const wave = Math.max(0, Math.sin(now * 0.0012)) * Math.sin(now * 0.012) * 0.5;
      ctx.lineWidth = Math.max(1, tile * 0.028);
      ctx.beginPath();
      ctx.moveTo(hip.x, hip.y - tile * 0.3);
      ctx.lineTo(hip.x + tile * 0.1, hip.y - tile * 0.14);
      ctx.lineTo(hip.x + tile * 0.18, hip.y - tile * 0.05);
      ctx.moveTo(hip.x, hip.y - tile * 0.3);
      ctx.lineTo(hip.x - tile * 0.12, hip.y - tile * 0.38);
      ctx.lineTo(hip.x - tile * 0.14 + Math.sin(wave) * tile * 0.08, hip.y - tile * 0.54);
      ctx.stroke();
      // Skull.
      ctx.fillStyle = bone;
      ctx.beginPath();
      ctx.arc(hip.x, hip.y - tile * 0.46, tile * 0.1, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = outline;
      ctx.lineWidth = 0.8;
      ctx.stroke();
      ctx.fillStyle = '#2a2420';
      ctx.beginPath();
      ctx.arc(hip.x - tile * 0.035, hip.y - tile * 0.47, tile * 0.025, 0, Math.PI * 2);
      ctx.arc(hip.x + tile * 0.035, hip.y - tile * 0.47, tile * 0.025, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillRect(hip.x - tile * 0.04, hip.y - tile * 0.405, tile * 0.08, tile * 0.012);
      // Someone gave him a little witch's hat.
      ctx.fillStyle = '#2a1a36';
      ctx.beginPath();
      ctx.ellipse(hip.x + tile * 0.01, hip.y - tile * 0.55, tile * 0.13, tile * 0.03, -0.15, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(hip.x - tile * 0.07, hip.y - tile * 0.56);
      ctx.lineTo(hip.x + tile * 0.12, hip.y - tile * 0.78);
      ctx.lineTo(hip.x + tile * 0.08, hip.y - tile * 0.56);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case 'broom': {
      ctx.translate(x, y);
      ctx.rotate(0.22);
      ctx.strokeStyle = '#6a4a2a';
      ctx.lineWidth = Math.max(1.2, tile * 0.035);
      ctx.beginPath();
      ctx.moveTo(0, -tile * 0.95);
      ctx.lineTo(0, -tile * 0.22);
      ctx.stroke();
      ctx.fillStyle = '#c9a050';
      ctx.beginPath();
      ctx.moveTo(-tile * 0.04, -tile * 0.25);
      ctx.lineTo(-tile * 0.13, 0);
      ctx.lineTo(tile * 0.13, 0);
      ctx.lineTo(tile * 0.04, -tile * 0.25);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#8a3a8a';
      ctx.lineWidth = Math.max(1, tile * 0.025);
      ctx.beginPath();
      ctx.moveTo(-tile * 0.06, -tile * 0.2);
      ctx.lineTo(tile * 0.06, -tile * 0.2);
      ctx.stroke();
      break;
    }
    case 'candyBowl': {
      ctx.fillStyle = '#d05a1a';
      ctx.beginPath();
      ctx.ellipse(x, y - tile * 0.06, tile * 0.13, tile * 0.07, 0, 0, Math.PI);
      ctx.fill();
      const sweets = ['#ff8a2a', '#fff2c0', '#b06cff', '#7ad04a', '#ff5a6a'];
      for (let i = 0; i < 7; i++) {
        ctx.fillStyle = sweets[i % sweets.length];
        ctx.beginPath();
        ctx.arc(x + (i - 3) * tile * 0.032, y - tile * 0.07 - (i % 2) * tile * 0.03, tile * 0.025, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case 'luminaria': {
      // A paper bag weighed down with sand, a candle inside.
      const w = tile * 0.14;
      const h = tile * 0.2;
      ctx.fillStyle = glow > 0.35 ? `rgba(255,${200 + 30 * Math.sin(now * 0.017 + x)},120,0.95)` : '#d8c49a';
      ctx.fillRect(x - w / 2, y - h, w, h);
      ctx.fillStyle = 'rgba(120,80,40,0.35)';
      ctx.fillRect(x - w / 2, y - h, w, h * 0.12);
      // A little cut-out bat on the front.
      ctx.fillStyle = glow > 0.35 ? '#5a2a10' : '#8a6a44';
      ctx.beginPath();
      ctx.moveTo(x, y - h * 0.5);
      ctx.lineTo(x - w * 0.35, y - h * 0.62);
      ctx.lineTo(x - w * 0.2, y - h * 0.45);
      ctx.lineTo(x, y - h * 0.38);
      ctx.lineTo(x + w * 0.2, y - h * 0.45);
      ctx.lineTo(x + w * 0.35, y - h * 0.62);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case 'crow': {
      // A crow, which turns its head, and now and then shuffles.
      const hop = Math.max(0, Math.sin(now * 0.0009 + v * 1.7) - 0.92) * tile * 1.2;
      const look = Math.sin(now * 0.0007 + v * 2.3) > 0 ? 1 : -1;
      ctx.translate(x, y - hop);
      ctx.scale(look, 1);
      ctx.fillStyle = '#16141a';
      ctx.beginPath();
      ctx.ellipse(0, -tile * 0.1, tile * 0.1, tile * 0.07, -0.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(tile * 0.08, -tile * 0.17, tile * 0.05, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(-tile * 0.08, -tile * 0.08);
      ctx.lineTo(-tile * 0.2, -tile * 0.03);
      ctx.lineTo(-tile * 0.08, -tile * 0.12);
      ctx.fill();
      ctx.fillStyle = '#3a3640';
      ctx.beginPath();
      ctx.moveTo(tile * 0.12, -tile * 0.18);
      ctx.lineTo(tile * 0.19, -tile * 0.16);
      ctx.lineTo(tile * 0.12, -tile * 0.15);
      ctx.fill();
      ctx.fillStyle = '#e8d24a';
      ctx.beginPath();
      ctx.arc(tile * 0.095, -tile * 0.18, tile * 0.012, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#16141a';
      ctx.lineWidth = Math.max(0.6, tile * 0.012);
      ctx.beginPath();
      ctx.moveTo(-tile * 0.01, -tile * 0.04);
      ctx.lineTo(-tile * 0.01, 0);
      ctx.moveTo(tile * 0.03, -tile * 0.04);
      ctx.lineTo(tile * 0.03, 0);
      ctx.stroke();
      break;
    }
  }
  ctx.restore();
}

/** Which decor gives off light after dark, and how: [colour, radius in tiles, strength]. */
export const DECOR_LIGHT: Partial<Record<DecorKind, [[number, number, number], number, number]>> = {
  luminaria: [[255, 190, 100], 0.8, 0.5],
  cauldron: [[150, 255, 110], 1.6, 0.4],
  pumpkinStack: [[255, 150, 50], 1.6, 0.45],
  hayBale: [[255, 150, 50], 1.0, 0.3],
};

/** The moon, in the creek: a pale disc broken up by the current. */
export function drawMoonInWater(ctx: Ctx, x: number, y: number, tile: number, alpha: number, now: number) {
  if (alpha <= 0.01) return;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 7; i++) {
    const dy = (i - 3) * tile * 0.09;
    const wob = Math.sin(now * 0.003 + i * 1.3) * tile * 0.08;
    const w = tile * (0.42 - Math.abs(i - 3) * 0.08);
    ctx.fillStyle = `rgba(220,230,255,${alpha * (0.32 - Math.abs(i - 3) * 0.04)})`;
    ctx.beginPath();
    ctx.ellipse(x + wob, y + dy, w, tile * 0.035, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  const g = ctx.createRadialGradient(x, y, 0, x, y, tile * 1.4);
  g.addColorStop(0, `rgba(180,200,255,${0.18 * alpha})`);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(x - tile * 1.4, y - tile * 1.4, tile * 2.8, tile * 2.8);
  ctx.restore();
}

/** A swarm of bats crossing the sky at dusk, in screen space: a few seconds, once in a while. */
export function drawBatSwarm(ctx: Ctx, w: number, h: number, darkness: number, now: number, draw: (x: number, y: number, s: number, phase: number) => void) {
  if (darkness < 0.25 || darkness > 0.9) return;
  const period = 45000;
  const t = (now % period) / 7000;
  if (t > 1) return;
  ctx.save();
  ctx.fillStyle = 'rgba(24,18,30,0.85)';
  for (let i = 0; i < 14; i++) {
    const lag = i * 0.025;
    const k = t - lag;
    if (k < 0 || k > 1) continue;
    const x = -40 + k * (w + 80) + Math.sin(i * 3.1) * 40;
    const y = h * (0.15 + ((i * 37) % 30) / 100) + Math.sin(k * 12 + i) * 12 - k * h * 0.08;
    draw(x, y, 9 + (i % 4) * 2, now * 0.035 + i);
  }
  ctx.restore();
}

// ---------------------------------------------------------------- indoors

/** Paper bats hung on threads from the ceiling, turning slowly. */
export function drawHangingBats(ctx: Ctx, at: (x: number, y: number) => { x: number; y: number }, spots: { x: number; y: number }[], tile: number, now: number) {
  spots.forEach((p, i) => {
    const s = at(p.x, p.y);
    const turn = Math.sin(now * 0.0012 + i * 1.9);
    ctx.strokeStyle = 'rgba(30,26,24,0.5)';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(s.x, s.y - tile * 0.5);
    ctx.lineTo(s.x, s.y);
    ctx.stroke();
    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.scale(Math.max(0.15, Math.abs(turn)), 1);
    ctx.fillStyle = '#231c22';
    const sz = tile * 0.18;
    ctx.beginPath();
    ctx.moveTo(0, -sz * 0.2);
    ctx.quadraticCurveTo(-sz * 0.5, -sz * 0.6, -sz, -sz * 0.2);
    ctx.quadraticCurveTo(-sz * 0.7, -sz * 0.05, -sz * 0.6, sz * 0.25);
    ctx.quadraticCurveTo(-sz * 0.3, 0, 0, sz * 0.3);
    ctx.quadraticCurveTo(sz * 0.3, 0, sz * 0.6, sz * 0.25);
    ctx.quadraticCurveTo(sz * 0.7, -sz * 0.05, sz, -sz * 0.2);
    ctx.quadraticCurveTo(sz * 0.5, -sz * 0.6, 0, -sz * 0.2);
    ctx.fill();
    ctx.restore();
  });
}

/** A skull with a candle stuck on top, wax run down its face. Cosy, honestly. */
export function drawSkullCandle(ctx: Ctx, x: number, y: number, tile: number, now: number) {
  ctx.fillStyle = '#efe6d2';
  ctx.beginPath();
  ctx.arc(x, y - tile * 0.12, tile * 0.11, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillRect(x - tile * 0.07, y - tile * 0.06, tile * 0.14, tile * 0.07);
  ctx.fillStyle = '#2a2420';
  ctx.beginPath();
  ctx.arc(x - tile * 0.04, y - tile * 0.12, tile * 0.03, 0, Math.PI * 2);
  ctx.arc(x + tile * 0.04, y - tile * 0.12, tile * 0.03, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#7a2a8a';
  ctx.fillRect(x - tile * 0.025, y - tile * 0.34, tile * 0.05, tile * 0.13);
  ctx.fillStyle = '#9a4aaa';
  ctx.fillRect(x - tile * 0.035, y - tile * 0.23, tile * 0.03, tile * 0.08);
  const fl = Math.sin(now * 0.02) * tile * 0.008;
  ctx.fillStyle = '#ffd77a';
  ctx.beginPath();
  ctx.ellipse(x + fl, y - tile * 0.38, tile * 0.022, tile * 0.042, 0, 0, Math.PI * 2);
  ctx.fill();
}
