// 视觉验收 2：食堂角度、奶蛙特写、惊吓、剧情镜头
import { chromium } from 'playwright-core';
import fs from 'node:fs';
fs.mkdirSync('tools/qa/out', { recursive: true });
const edge = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const browser = await chromium.launch({ executablePath: edge, headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
await page.goto('http://127.0.0.1:8010/', { waitUntil: 'networkidle' });
await page.waitForSelector('#loading.hidden', { timeout: 30000 }).catch(() => {});
await page.waitForTimeout(700);
const prep = async (fn) => {
  await page.evaluate((src) => {
    const g = window.__game;
    const C = 3.2;
    g.resetStage(false);
    for (const id of ['menu','loading','story','ready','pause','win','lose','help']) document.getElementById(id)?.classList.add('hidden');
    document.getElementById('fade')?.classList.remove('on');
    g.ui.showHud();
    g.state = 'playing';
    g.player.lookEnabled = false;
    g.frogs.active = false;
    g.grace = 999;
    new Function('g', 'C', src)(g, C);
    g.player.updateCamera(0, 0);
  }, fn);
  await page.waitForTimeout(500);
};
const shot = async (name) => { await page.screenshot({ path: `tools/qa/out/v2-${name}.png` }); console.log('shot', name); };

await prep(`
  g.player.position.set(39.4,0,36.4); g.player.yaw = Math.PI; g.player.pitch=-0.06;
`);
await shot('canteen');

await prep(`
  g.player.position.set(44.6,0,42.4);
  const f = g.frogs.frogs[0];
  f.pos.set(47.4,0,43.2); f.group.position.copy(f.pos); f.state='idle';
  f.group.rotation.y = Math.atan2(44.6-47.4, 42.4-43.2);
  const dx = f.pos.x - g.player.position.x, dz = f.pos.z - g.player.position.z;
  g.player.yaw = Math.atan2(-dx,-dz); g.player.pitch=-0.12;
  g.frogs.frogs.forEach((ff,i)=>{ if(i>0){ ff.pos.set(200,0,200); ff.group.position.copy(ff.pos); }});
`);
await shot('frog');

await prep(`
  g.player.position.set(18.4,0,38.5); g.player.yaw = 2.55; g.player.pitch=-0.05;
`);
await shot('nap');

// 惊吓画面
await page.evaluate(() => {
  const g = window.__game;
  g.resetStage(false);
  for (const id of ['menu','loading','story','ready','pause','win','lose','help']) document.getElementById(id)?.classList.add('hidden');
  g.ui.showHud();
  g.state = 'playing'; g.grace = 0; g.frogs.active = true;
  g.player.position.set(43.2,0,43.2);
  const f = g.frogs.frogs[0];
  f.pos.set(44.0,0,43.2); f.group.position.copy(f.pos);
  g.onCaught(f);
});
await page.waitForTimeout(500);
await shot('jumpscare');
await page.waitForTimeout(2500);

// 剧情镜头
await page.evaluate(() => {
  const g = window.__game;
  g.resetStage(false);
  for (const id of ['menu','loading','ready','pause','win','lose','help']) document.getElementById(id)?.classList.add('hidden');
  g.state='story';
  g.story.play();
  window.__storyMode = true;
});
for (const [i, ms] of [[1, 5000], [2, 9000], [3, 9000]]) {
  await page.waitForTimeout(ms);
  await page.screenshot({ path: `tools/qa/out/v2-story-${i}.png` });
  console.log('shot story', i);
}
await browser.close();
