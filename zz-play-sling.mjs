import { chromium } from 'playwright';
import * as S from './src/game/systems/minigames/slingshot.ts';
const SP = process.argv[2];
const DEG = Math.PI / 180;
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, serviceWorkers: 'block' });
const page = await ctx.newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto('http://localhost:5181/');
await page.click('.primary-btn');
await page.waitForTimeout(1000);
await page.evaluate(() => window.__foxtail.miniGames.slingshot.open());
await page.waitForTimeout(800);
await page.screenshot({ path: `${SP}/slingshot-1-intro.png` });
await page.waitForTimeout(1500);
await page.screenshot({ path: `${SP}/slingshot-2-ready.png` });
const box = await page.locator('.mg-slingshot canvas').boundingBox();
const full = await page.evaluate(() => window.__foxtail.miniGames.slingshot.fullPull());
const st = () => page.evaluate(() => { const p = window.__foxtail.miniGames.slingshot; return { ph: p.phase, ri: p.ri, up: p.up, t: p.roundT, fin: p.finished, cones: p.cones }; });
function solve(round, up, t) {
  let best = null;
  up.forEach((u, i) => { if (!u) return;
    for (let p = 0.6; p <= 1; p += 0.1) { const sols = []; for (let a = -6; a <= 35; a += 0.5) { const r = S.simulateShot(round, up.slice(), t, a * DEG, p); if (r.hits.includes(i)) sols.push(a); }
      if (sols.length && (!best || sols.length > best.n)) best = { n: sols.length, a: sols.reduce((x, y) => x + y, 0) / sols.length, p }; }
  });
  return best ?? { a: 10, p: 0.8 };
}
async function shoot(a, p, shot, miss = false) {
  const sx = box.x + box.width * 0.5, sy = box.y + box.height * 0.5;
  const d = p * full; const ex = sx - Math.cos(a * DEG) * d, ey = sy + Math.sin(a * DEG) * d;
  await page.mouse.move(sx, sy); await page.mouse.down();
  for (let i = 1; i <= 5; i++) await page.mouse.move(sx + (ex - sx) * i / 5, sy + (ey - sy) * i / 5);
  if (shot) await page.screenshot({ path: `${SP}/${shot}` });
  await page.mouse.up();
}
let n = 0; let shots = 0;
while (shots < 40) {
  const s = await st();
  if (s.fin) break;
  if (s.ph !== 'aim' || s.t < 0) { await page.waitForTimeout(250); continue; }
  const round = S.ROUNDS[s.ri];
  const lead = 0.35; // time for the drag to happen
  const sol = solve(round, s.up, s.t + lead);
  const name = (n === 0 ? 'slingshot-3-aim.png' : s.ri === 2 && n % 3 === 0 ? `slingshot-moving-${n}.png` : s.ri === 3 && n % 3 === 0 ? `slingshot-mixed-${n}.png` : undefined);
  await shoot(sol.a, sol.p, name);
  const c = await page.evaluate(() => ({ ...window.__foxtail.miniGames.slingshot.cone, t: window.__foxtail.miniGames.slingshot.roundT }));
  console.log('shot', s.ri, JSON.stringify(s.up), sol.a.toFixed(1), sol.p.toFixed(2), 'planned t', (s.t+lead).toFixed(2), 'actual t', c.t.toFixed(2));
  n++; shots++;
  if (n === 1) { await page.waitForTimeout(250); await page.screenshot({ path: `${SP}/slingshot-4-flying.png` }); await page.waitForTimeout(800); await page.screenshot({ path: `${SP}/slingshot-5-hit.png` }); }
  await page.waitForTimeout(300);
}
await page.waitForTimeout(2500);
await page.screenshot({ path: `${SP}/slingshot-9-end.png` });
console.log(await page.evaluate(() => { const p = window.__foxtail.miniGames.slingshot; return JSON.stringify({ fin: p.finished, score: p.score, rs: p.roundScores, status: document.querySelector('.mg-slingshot .putt-status').textContent, btns: [...document.querySelectorAll('.mg-slingshot .putt-actions button')].map(b => b.textContent) }); }), 'shots', shots);
await page.click('.mg-slingshot .putt-actions button:first-child');
await page.waitForTimeout(400);
console.log('after play again', JSON.stringify(await st()));
await page.locator('.mg-slingshot .panel-close').click();
await page.waitForTimeout(300);
console.log('open after x', await page.evaluate(() => window.__foxtail.miniGames.slingshot.isOpen));
await page.evaluate(() => window.__foxtail.miniGames.slingshot.open());
await page.waitForTimeout(400);
console.log('reopen', JSON.stringify(await st()));
// Done button path: finish quickly by forcing
console.log('errors', JSON.stringify(errors));
await browser.close();
