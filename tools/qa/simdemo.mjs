// Demo 逻辑快速模拟：不渲染，直接步进 updatePlay
import { chromium } from 'playwright-core';
const edge = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const browser = await chromium.launch({ executablePath: edge, headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1024, height: 640 } });
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
await page.goto('http://127.0.0.1:8010/', { waitUntil: 'networkidle' });
await page.waitForSelector('#loading.hidden', { timeout: 30000 }).catch(() => {});
const result = await page.evaluate(() => {
  const g = window.__game;
  g.resetStage(true);
  for (const id of ['menu','loading','story','ready','pause','win','lose','help']) document.getElementById(id)?.classList.add('hidden');
  g.ui.showHud();
  g.ui.setDemo(true);
  g.state = 'demo';
  g.mode = 'demo';
  g.player.lookEnabled = false;
  g.demo.start();
  const log = [];
  let i = 0;
  for (; i < 3600; i++) {
    if (g.state !== 'demo') break;
    g.updatePlay(0.05, i * 0.05);
    if (i % 100 === 0) {
      log.push({
        t: +(i * 0.05).toFixed(1),
        candies: g.candiesCollected,
        route: g.demo.routeIndex,
        x: +g.player.position.x.toFixed(1),
        z: +g.player.position.z.toFixed(1),
        sprint: g.player.sprinting,
        stamina: +g.player.stamina.toFixed(0),
        dazed: g.frogs.frogs.filter((f) => f.state === 'dazed').length,
        near: +g.frogs.nearest.toFixed(1),
        state: g.state,
      });
    }
  }
  return { steps: i, simTime: +(i * 0.05).toFixed(1), state: g.state, candies: g.candiesCollected, route: g.demo.routeIndex, reachedExit: g.demo.reachedExit, log };
});
console.log(JSON.stringify(result, null, 2));
await browser.close();
