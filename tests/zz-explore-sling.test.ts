import { it } from 'vitest';
import { ROUNDS, simulateShot, roundScore, type Round } from '../src/game/systems/minigames/slingshot';
import { mulberry32 } from '../src/game/engine/Random';
const DEG = Math.PI / 180;
function g(r: () => number) { let u = 0; for (let i = 0; i < 6; i++) u += r(); return (u - 3) / Math.sqrt(0.5); }
function findShot(round: Round, up: boolean[], t: number, idx: number) {
  const sols: [number, number][] = [];
  for (let a = -6; a <= 35; a += 0.5) for (let p = 0.4; p <= 1; p += 0.05) {
    const u = up.slice(); const r = simulateShot(round, u, t, a * DEG, p);
    if (r.hits.includes(idx)) sols.push([a, p]);
  }
  return sols;
}
function play(rand: () => number, sa: number, sp: number, st: number, log = false) {
  let total = 0;
  for (const round of ROUNDS) {
    const up = round.targets.map(() => true); let cones = round.cones; let t = 1.5;
    while (cones > 0 && up.some(Boolean)) {
      // try each standing target, take the one with the most solutions
      let best: [number, number][] = []; 
      up.forEach((u, i) => { if (!u) return; const s = findShot(round, up, t, i); if (s.length > best.length) best = s; });
      let a = 10, p = 0.7;
      if (best.length) { const ps = [...new Set(best.map(s => s[1]))]; const pc = ps.reduce((b, x) => best.filter(s => s[1] === x).length > best.filter(s => s[1] === b).length ? x : b); p = pc; const near = best.filter(s => s[1] === p); a = near.reduce((s, x) => s + x[0], 0) / near.length; }
      simulateShot(round, up, t + g(rand) * st, (a + g(rand) * sa) * DEG, p + g(rand) * sp);
      cones--; t += 3;
    }
    if (log) console.log('ROUND', round.name, JSON.stringify(up), cones, roundScore(round, up, cones));
    total += roundScore(round, up, cones);
  }
  return total;
}
it('explore', () => {
  play(mulberry32(1), 0, 0, 0, true);
  for (const [sa, sp, st] of [[1, 0.02, 0.06], [1.5, 0.03, 0.1], [2.5, 0.05, 0.15]]) {
    const rand = mulberry32(9); const s: number[] = [];
    for (let i = 0; i < 6; i++) s.push(play(rand, sa, sp, st));
    console.log('PLAYER', sa, sp, st, JSON.stringify(s), 'mean', s.reduce((a, b) => a + b, 0) / s.length);
  }
  const rand = mulberry32(4); const s: number[] = [];
  for (let k = 0; k < 30; k++) { let tot = 0; for (const round of ROUNDS) { const up = round.targets.map(() => true); let cones = round.cones; let t = 1; while (cones > 0 && up.some(Boolean)) { simulateShot(round, up, t, (-15 + rand() * 65) * DEG, rand()); cones--; t += 2.5; } tot += roundScore(round, up, cones); } s.push(tot); }
  console.log('PLAYER aimless', JSON.stringify(s.sort((a,b)=>a-b)));
}, 600000);
