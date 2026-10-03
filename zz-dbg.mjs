import { chromium } from 'playwright';
import * as S from './src/game/systems/minigames/slingshot.ts';
const DEG = Math.PI / 180;
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, serviceWorkers: 'block' });
const page = await ctx.newPage();
await page.goto('http://localhost:5181/');
await page.click('.primary-btn');
await page.waitForTimeout(1000);
await page.evaluate(() => window.__foxtail.miniGames.slingshot.open());
await page.waitForTimeout(2500);
const box = await page.locator('.mg-slingshot canvas').boundingBox();
const full = await page.evaluate(() => window.__foxtail.miniGames.slingshot.fullPull());
for (const [a, p] of [[10, 0.8], [5, 0.9]]) {
  const sx = box.x + box.width * 0.5, sy = box.y + box.height * 0.5;
  const d = p * full; const ex = sx - Math.cos(a * DEG) * d, ey = sy + Math.sin(a * DEG) * d;
  await page.mouse.move(sx, sy); await page.mouse.down();
  for (let i = 1; i <= 5; i++) await page.mouse.move(sx + (ex - sx) * i / 5, sy + (ey - sy) * i / 5);
  console.log('aim', JSON.stringify(await page.evaluate(() => window.__foxtail.miniGames.slingshot.aim())));
  await page.mouse.up();
  const c = await page.evaluate(() => ({ ...window.__foxtail.miniGames.slingshot.cone }));
  const v = Math.hypot(c.vx, c.vy);
  console.log('want', a, S.launchSpeed(p).toFixed(2), 'got', (Math.atan2(c.vy, c.vx) / DEG).toFixed(2), v.toFixed(2), 'x', c.x.toFixed(2));
  await page.waitForTimeout(3000);
}
await browser.close();
