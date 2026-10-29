// 房间巡览截图（格子坐标）
import { chromium } from 'playwright-core';
import fs from 'node:fs';
fs.mkdirSync('tools/qa/out', { recursive: true });
const edge = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const browser = await chromium.launch({
  executablePath: process.env.EDGE_PATH || edge, headless: true,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const bad = [];
page.on('response', (r) => { if (r.status() >= 400) bad.push(r.status() + ' ' + r.url()); });
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
await page.goto('http://127.0.0.1:8010/', { waitUntil: 'networkidle' });
await page.waitForSelector('#loading.hidden', { timeout: 30000 }).catch(() => {});
await page.waitForTimeout(800);
console.log('404s:', bad);
const spots = [
  { name: 'entry', cx: 3.5, cz: 5.6, yaw: 0.0 },
  { name: 'classroom', cx: 12.2, cz: 5.4, yaw: -0.35 },
  { name: 'nap', cx: 5.6, cz: 12.3, yaw: 2.55 },
  { name: 'canteen', cx: 12.2, cz: 17.2, yaw: 0.0 },
  { name: 'exit', cx: 22.2, cz: 12.2, yaw: -2.2 },
  { name: 'corridor', cx: 4.0, cz: 8.6, yaw: -1.57 },
];
for (const s of spots) {
  await page.evaluate(({ cx, cz, yaw }) => {
    const g = window.__game;
    g.resetStage(false);
    g.state = 'playing';
    for (const id of ['menu','loading','story','ready','pause','win','lose','help']) {
      document.getElementById(id)?.classList.add('hidden');
    }
    document.getElementById('fade')?.classList.remove('on');
    g.ui.showHud();
    const C = 3.2;
    g.player.position.set((cx + 0.5) * C, 0, (cz + 0.5) * C);
    g.player.yaw = yaw;
    g.player.pitch = -0.04;
    g.player.velocity.set(0, 0, 0);
    g.player.updateCamera(0, 0);
    g.frogs.active = false;
  }, s);
  await page.waitForTimeout(700);
  await page.screenshot({ path: `tools/qa/out/room-${s.name}.png` });
  console.log('shot', s.name);
}
await browser.close();
