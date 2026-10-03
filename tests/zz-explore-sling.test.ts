import { it } from 'vitest';
import { ROUNDS, simulateShot, roundScore, MAX_SCORE, type Round } from '../src/game/systems/minigames/slingshot';
import { mulberry32 } from '../src/game/engine/Random';
const DEG = Math.PI / 180;
function g(r: () => number) { let u = 0; for (let i = 0; i < 6; i++) u += r(); return (u - 3) / Math.sqrt(0.5); }
function findShot(round: Round, up: boolean[], t: number, idx: number) {
  const sols: [number, number][] = [];
  for (let a = -6; a <= 35; a += 0.5) for (let p = 0.3; p <= 1; p += 0.025) {
    const u = up.slice(); const r = simulateShot(round, u, t, a * DEG, p);
    if (r.hits.includes(idx)) sols.push([a, p]);
  }
  return sols;
}
function play(rand: () => number, sa: number, sp: number, st: number) {
  let total = 0; let secs = 0;
  for (const round of ROUNDS) {
    const up = round.targets.map(() => true); let cones = round.cones; let t = 1.5;
    while (cones > 0 && up.some(Boolean)) {
      const idx = up.indexOf(true);
      const sols = findShot(round, up, t, idx);
      let a = 10, p = 0.7;
      if (sols.length) { const pick = sols.reduce((b, s) => (Math.abs(s[1] - 0.8) < Math.abs(b[1] - 0.8) ? s : b)); [a, p] = pick; }
      // aim the middle of the solution band at that power
      const near = sols.filter(s => Math.abs(s[1]-p) < 0.001); if (near.length) a = near.reduce((s, x) => s + x[0], 0) / near.length;
      const r = simulateShot(round, up, t + g(rand) * st, (a + g(rand) * sa) * DEG, p + g(rand) * sp);
      cones--; t += 3; secs += 3;
    }
    total += roundScore(round, up, cones); secs += 3;
  }
  return { total, secs };
}
it('explore', () => {
  console.log('MAX', MAX_SCORE);
  for (const [sa, sp, st] of [[0.5, 0.01, 0.03], [1, 0.02, 0.06], [1.5, 0.03, 0.1], [2.5, 0.05, 0.15]]) {
    const rand = mulberry32(9); const s: number[] = []; let secs = 0;
    for (let i = 0; i < 8; i++) { const r = play(rand, sa, sp, st); s.push(r.total); secs += r.secs; }
    console.log('PLAYER', sa, sp, st, JSON.stringify(s), 'mean', s.reduce((a, b) => a + b, 0) / s.length, 'secs', secs / 8);
  }
  const rand = mulberry32(4); const s: number[] = [];
  for (let k = 0; k < 20; k++) { let tot = 0; for (const round of ROUNDS) { const up = round.targets.map(() => true); let cones = round.cones; let t = 1; while (cones > 0 && up.some(Boolean)) { simulateShot(round, up, t, (-10 + rand() * 50) * DEG, rand()); cones--; t += 2.5; } tot += roundScore(round, up, cones); } s.push(tot); }
  console.log('PLAYER aimless', JSON.stringify(s));
}, 600000);
