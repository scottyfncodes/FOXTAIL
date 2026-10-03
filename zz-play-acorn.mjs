import { chromium } from 'playwright';
const SP = process.argv[2];
const WIN = [0.265,0.411,0.49,0.575,0.741,0.762];
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' }).catch(() => chromium.launch());
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, serviceWorkers: 'block' });
const page = await ctx.newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto('http://localhost:5181/');
await page.click('.primary-btn');
await page.waitForTimeout(1000);
await page.evaluate(() => window.__foxtail.miniGames.acornPitch.open());
await page.waitForTimeout(800);
await page.screenshot({ path: `${SP}/acornPitch-1-intro.png` });
await page.waitForTimeout(1500);
await page.screenshot({ path: `${SP}/acornPitch-2-ready.png` });
const box = await page.locator('.mg-acornPitch canvas').boundingBox();
const full = await page.evaluate(() => window.__foxtail.miniGames.acornPitch.fullPull());
async function throwAt(power, angleDeg, shotName) {
  const sx = box.x + box.width * 0.6, sy = box.y + box.height * 0.4;
  const d = power * full, a = angleDeg * Math.PI / 180;
  const ex = sx - Math.cos(a) * d, ey = sy + Math.sin(a) * d;
  await page.mouse.move(sx, sy); await page.mouse.down();
  for (let i = 1; i <= 8; i++) await page.mouse.move(sx + (ex - sx) * i / 8, sy + (ey - sy) * i / 8);
  if (shotName) await page.screenshot({ path: `${SP}/${shotName}` });
  await page.mouse.up();
}
// Target 1: a short miss, then a hit.
await throwAt(0.15, 45, 'acornPitch-3-aiming.png');
await page.waitForTimeout(500);
await page.screenshot({ path: `${SP}/acornPitch-4-flying.png` });
await page.waitForTimeout(2200);
await page.screenshot({ path: `${SP}/acornPitch-5-trace.png` });
for (let i = 0; i < 6; i++) {
  if (i > 0) await page.waitForTimeout(1900);
  await throwAt(WIN[i], 45, i === 4 ? 'acornPitch-6-birdtable-aim.png' : undefined);
  await page.waitForTimeout(i === 0 ? 1500 : 1500);
  if (i === 2) await page.screenshot({ path: `${SP}/acornPitch-7-stump.png` });
  if (i === 5) await page.screenshot({ path: `${SP}/acornPitch-8-pail.png` });
  // keep throwing if missed
  for (let k = 0; k < 2; k++) {
    const st = await page.evaluate(() => { const p = window.__foxtail.miniGames.acornPitch; return { ph: p.phase, ti: p.ti, fin: p.finished }; });
    if (st.ti !== i || st.fin) break;
    if (st.ph === 'aim') { await throwAt(WIN[i], 45); await page.waitForTimeout(3000); } else await page.waitForTimeout(1500);
  }
}
await page.waitForTimeout(2500);
await page.screenshot({ path: `${SP}/acornPitch-9-end.png`, fullPage: false });
console.log(await page.evaluate(() => { const p = window.__foxtail.miniGames.acornPitch; return JSON.stringify({ fin: p.finished, pts: p.points, status: document.querySelector('.mg-acornPitch .putt-status').textContent, btns: [...document.querySelectorAll('.mg-acornPitch .putt-actions button')].map(b => b.textContent) }); }));
// Play again
await page.click('.mg-acornPitch .putt-actions button:first-child');
await page.waitForTimeout(400);
console.log('after play again', await page.evaluate(() => { const p = window.__foxtail.miniGames.acornPitch; return JSON.stringify({ fin: p.finished, ti: p.ti, pts: p.points, card: document.querySelector('.mg-acornPitch .putt-card').textContent }); }));
// close via x mid game
const closeBtn = page.locator('.mg-acornPitch .panel-close, .mg-acornPitch button[aria-label="Close"]').first();
console.log('close count', await closeBtn.count());
if (await closeBtn.count()) await closeBtn.click();
await page.waitForTimeout(300);
console.log('open after x', await page.evaluate(() => window.__foxtail.miniGames.acornPitch.isOpen));
await page.evaluate(() => window.__foxtail.miniGames.acornPitch.open());
await page.waitForTimeout(400);
console.log('reopen', await page.evaluate(() => { const p = window.__foxtail.miniGames.acornPitch; return JSON.stringify({ fin: p.finished, ti: p.ti, thrown: p.thrown }); }));
await page.screenshot({ path: `${SP}/acornPitch-10-reopen.png` });
console.log('errors', JSON.stringify(errors));
await browser.close();
