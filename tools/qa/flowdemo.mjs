// 真实点击 Demo + 第三人称 + 出口亮度
import { chromium } from 'playwright-core';
import fs from 'node:fs';
fs.mkdirSync('tools/qa/out', { recursive: true });
const edge = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const browser = await chromium.launch({ executablePath: edge, headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message));
await page.goto('http://127.0.0.1:8010/', { waitUntil: 'networkidle' });
await page.waitForSelector('#loading.hidden', { timeout: 30000 }).catch(() => {});
await page.waitForTimeout(600);

await page.click('#btn-demo');
await page.waitForTimeout(4000);
console.log('demo state after 4s:', await page.evaluate(() => ({ state: window.__game.state, active: window.__game.demo.active, candies: window.__game.candiesCollected, banner: !document.getElementById('demo-banner').classList.contains('hidden') })));
await page.screenshot({ path: 'tools/qa/out/demo-1.png' });
await page.waitForTimeout(5000);
console.log('demo state after 9s:', await page.evaluate(() => ({ state: window.__game.state, candies: window.__game.candiesCollected, pos: [window.__game.player.position.x.toFixed(1), window.__game.player.position.z.toFixed(1)] })));
await page.screenshot({ path: 'tools/qa/out/demo-2.png' });

// 快速步进完成 Demo
const done = await page.evaluate(() => {
  const g = window.__game;
  let i = 0;
  for (; i < 3000; i++) { if (g.state !== 'demo') break; g.updatePlay(0.05, i * 0.05); }
  return { steps: i, state: g.state, candies: g.candiesCollected, reachedExit: g.demo.reachedExit };
});
console.log('demo finish:', JSON.stringify(done));
await page.waitForTimeout(2500);
await page.screenshot({ path: 'tools/qa/out/demo-win.png' });
await page.waitForTimeout(4500);
console.log('after demo auto return:', await page.evaluate(() => window.__game.state));
await page.screenshot({ path: 'tools/qa/out/demo-return.png' });

// 第三人称 + 出口
await page.evaluate(() => {
  const g = window.__game;
  g.resetStage(false);
  for (const id of ['menu','loading','story','ready','pause','win','lose','help']) document.getElementById(id)?.classList.add('hidden');
  document.getElementById('fade').classList.remove('on');
  g.ui.showHud();
  g.state = 'playing';
  g.player.position.set(8, 0, 8);
  g.player.yaw = -Math.PI * 0.75;
  g.player.setCameraMode(false);
  g.player.updateCamera(0, 0);
});
await page.waitForTimeout(700);
await page.screenshot({ path: 'tools/qa/out/third-person.png' });

await page.evaluate(() => {
  const g = window.__game;
  g.state = 'playing';
  g.player.position.set(78.5, 0, 46.4); g.player.yaw = -Math.PI / 2; g.player.pitch = 0;
  for (let k = 0; k < 8; k++) g.collectCandy(g.world.candies[k]);
  g.world.exitOpenT = 1;
  g.world.update(0.1, 10);
  g.player.updateCamera(0, 0);
});
await page.waitForTimeout(600);
await page.screenshot({ path: 'tools/qa/out/exit-open-2.png' });

console.log('ERRORS', JSON.stringify(errors));
await browser.close();
