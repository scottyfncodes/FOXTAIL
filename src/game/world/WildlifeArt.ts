import type { FrogAt, TurtleAt } from '../systems/wildlife';

// The creek's and ponds' small residents, drawn procedurally like
// everything else: turtles seen from above (they're mostly shell), and
// frogs side-on, sitting or mid-hop.

type Ctx = CanvasRenderingContext2D;

/** A flat, sun-warmed stone at the water's edge, `size` pixels across. */
export function drawBaskingStone(ctx: Ctx, x: number, y: number, size: number, seed: number) {
  ctx.fillStyle = 'rgba(0,0,0,0.2)';
  ctx.beginPath();
  ctx.ellipse(x + size * 0.04, y + size * 0.08, size * 0.55, size * 0.3, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = seed % 2 ? '#8d8676' : '#9a9282';
  ctx.beginPath();
  ctx.ellipse(x, y, size * 0.52, size * 0.3, (seed % 7) * 0.1 - 0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.14)';
  ctx.beginPath();
  ctx.ellipse(x - size * 0.12, y - size * 0.08, size * 0.26, size * 0.12, -0.2, 0, Math.PI * 2);
  ctx.fill();
}

const SHELL = '#566436';
const SHELL_DARK = '#3b4724';
const SHELL_RIM = '#b59f48';
const SKIN = '#5d6a44';
const STRIPE = '#d8c25a';

/**
 * A turtle from above at (x, y), `len` pixels nose to tail. Swimming, it
 * sinks into the water until only the shell's dome shows; basking, it
 * stretches its head out and its legs splay.
 */
export function drawTurtle(ctx: Ctx, t: TurtleAt, x: number, y: number, len: number, now: number, alpha = 1) {
  const L = len / 2;
  const W = len * 0.36;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(t.heading);
  ctx.globalAlpha *= alpha;
  // Ripples round it in the water.
  if (t.wet > 0.05) {
    ctx.strokeStyle = `rgba(255,255,255,${0.25 * t.wet})`;
    ctx.lineWidth = Math.max(0.5, len * 0.03);
    const r = ((now * 0.0012 + (t.seed % 10)) % 1) * len * 0.4;
    ctx.beginPath();
    ctx.ellipse(0, 0, W * 1.1 + r, L * 0.9 + r, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  const limbs = 1 - t.wet * 0.75;
  const paddle = t.basking ? 0 : Math.sin(now * 0.008 + t.seed) * 0.4;
  ctx.globalAlpha *= limbs;
  ctx.fillStyle = SKIN;
  // Legs: front pair reaching forward, back pair trailing.
  for (const [sx, sy, rot] of [
    [-1, 0.45, -0.6 + paddle],
    [1, 0.45, 0.6 - paddle],
    [-1, -0.45, 0.5 - paddle],
    [1, -0.45, -0.5 + paddle],
  ] as const) {
    ctx.beginPath();
    ctx.ellipse(sx * W * 0.95, sy * L * 0.85, W * 0.28, L * 0.2, rot, 0, Math.PI * 2);
    ctx.fill();
  }
  // Tail.
  ctx.beginPath();
  ctx.moveTo(-W * 0.12, -L * 0.7);
  ctx.lineTo(0, -L * 1.05);
  ctx.lineTo(W * 0.12, -L * 0.7);
  ctx.fill();
  // Head and neck, further out while it suns itself; yellow stripes down it.
  const reach = t.basking ? 1.08 + Math.sin(now * 0.0015 + t.seed) * 0.05 : 0.95;
  ctx.beginPath();
  ctx.ellipse(0, L * reach, W * 0.32, L * 0.26, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = STRIPE;
  ctx.lineWidth = Math.max(0.5, len * 0.025);
  ctx.beginPath();
  ctx.moveTo(-W * 0.12, L * (reach - 0.2));
  ctx.lineTo(-W * 0.1, L * (reach + 0.15));
  ctx.moveTo(W * 0.12, L * (reach - 0.2));
  ctx.lineTo(W * 0.1, L * (reach + 0.15));
  ctx.stroke();
  ctx.fillStyle = '#1b1a14';
  for (const sx of [-1, 1]) {
    ctx.beginPath();
    ctx.arc(sx * W * 0.2, L * (reach + 0.1), Math.max(0.6, len * 0.025), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha /= limbs;
  // The shell: a rim, a dome, and its plates.
  const shellA = 1 - t.wet * 0.35;
  ctx.globalAlpha *= shellA;
  ctx.fillStyle = SHELL_RIM;
  ctx.beginPath();
  ctx.ellipse(0, 0, W, L * 0.78, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = SHELL;
  ctx.beginPath();
  ctx.ellipse(0, 0, W * 0.88, L * 0.68, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = SHELL_DARK;
  ctx.lineWidth = Math.max(0.5, len * 0.022);
  ctx.beginPath();
  ctx.ellipse(0, 0, W * 0.4, L * 0.3, 0, 0, Math.PI * 2);
  ctx.moveTo(0, -L * 0.68);
  ctx.lineTo(0, -L * 0.3);
  ctx.moveTo(0, L * 0.3);
  ctx.lineTo(0, L * 0.68);
  for (const sx of [-1, 1]) {
    ctx.moveTo(sx * W * 0.38, -L * 0.1);
    ctx.lineTo(sx * W * 0.86, -L * 0.18);
    ctx.moveTo(sx * W * 0.38, L * 0.1);
    ctx.lineTo(sx * W * 0.86, L * 0.18);
  }
  ctx.stroke();
  // Wet and shining, or dry and dull in the sun.
  ctx.fillStyle = `rgba(255,255,240,${t.basking ? 0.12 : 0.25})`;
  ctx.beginPath();
  ctx.ellipse(-W * 0.25, L * 0.15, W * 0.25, L * 0.18, 0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/**
 * A frog side-on, sitting at (x, y) on the ground or a pad, `size` pixels
 * tall-ish: haunches folded, eyes up top, a pale throat that puffs out when
 * it croaks. Mid-hop it's stretched out, legs trailing, above its shadow.
 */
export function drawFrog(ctx: Ctx, f: FrogAt, x: number, y: number, size: number, tilePx: number, alpha = 1) {
  const s = size;
  const green = f.seed % 3 === 0 ? '#6f9a3c' : f.seed % 3 === 1 ? '#557f36' : '#7c8e3a';
  const dark = '#3b5a24';
  const belly = '#e3dca0';
  ctx.save();
  ctx.globalAlpha *= alpha;
  // Shadow stays on the ground.
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.beginPath();
  ctx.ellipse(x, y + s * 0.08, s * 0.38 * (1 - f.lift * 0.6), s * 0.12, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.translate(x, y - f.lift * tilePx);
  if (!f.right) ctx.scale(-1, 1);
  const hopping = f.hop !== null;
  if (hopping) {
    // Stretched out in the air: body tipped up, back legs long behind.
    ctx.rotate(-0.35 * Math.sin((f.hop ?? 0) * Math.PI));
    ctx.fillStyle = green;
    ctx.strokeStyle = green;
    ctx.lineCap = 'round';
    ctx.lineWidth = s * 0.1;
    ctx.beginPath();
    ctx.moveTo(-s * 0.1, -s * 0.12);
    ctx.lineTo(-s * 0.48, s * 0.02);
    ctx.lineTo(-s * 0.62, s * 0.08);
    ctx.stroke();
    ctx.lineCap = 'butt';
    ctx.beginPath();
    ctx.ellipse(0, -s * 0.16, s * 0.3, s * 0.14, 0, 0, Math.PI * 2);
    ctx.fill();
  } else {
    // Haunch, folded.
    ctx.fillStyle = dark;
    ctx.beginPath();
    ctx.ellipse(-s * 0.16, -s * 0.04, s * 0.2, s * 0.13, -0.3, 0, Math.PI * 2);
    ctx.fill();
    // Body, sitting up a little.
    ctx.fillStyle = green;
    ctx.beginPath();
    ctx.ellipse(0, -s * 0.13, s * 0.27, s * 0.17, -0.25, 0, Math.PI * 2);
    ctx.fill();
    // Front leg.
    ctx.fillStyle = dark;
    ctx.fillRect(s * 0.14, -s * 0.06, s * 0.05, s * 0.1);
  }
  // Throat: pale, and ballooning mid-croak.
  if (f.croak > 0) {
    ctx.fillStyle = 'rgba(240,232,190,0.9)';
    ctx.beginPath();
    ctx.arc(s * 0.22, -s * 0.12, s * (0.06 + f.croak * 0.1), 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.fillStyle = belly;
    ctx.beginPath();
    ctx.ellipse(s * 0.16, -s * 0.08, s * 0.1, s * 0.05, -0.3, 0, Math.PI * 2);
    ctx.fill();
  }
  // Head and its bulging eye.
  ctx.fillStyle = green;
  ctx.beginPath();
  ctx.ellipse(s * 0.2, -s * 0.22, s * 0.14, s * 0.1, -0.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(s * 0.17, -s * 0.31, s * 0.065, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#d9b84a';
  ctx.beginPath();
  ctx.arc(s * 0.18, -s * 0.32, s * 0.042, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#141410';
  ctx.fillRect(s * 0.16, -s * 0.33, s * 0.045, s * 0.018);
  // A few darker spots on the back.
  ctx.fillStyle = 'rgba(40,60,20,0.45)';
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.arc(-s * 0.12 + i * s * 0.08, -s * 0.2 + (i % 2) * s * 0.04, s * 0.025, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}
