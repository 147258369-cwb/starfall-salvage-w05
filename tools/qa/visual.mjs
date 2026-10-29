// 视觉验收截图：出生点、房间、奶蛙特写、解锁 HUD、出口
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
const shot = async (name) => { await page.screenshot({ path: `tools/qa/out/v-${name}.png` }); console.log('shot', name); };

await prep(`
  g.player.position.set(8,0,8); g.player.yaw = -Math.PI*0.75; g.player.pitch=-0.03;
`);
await shot('spawn');

await prep(`
  g.player.position.set(39.0,0,37.8); g.player.yaw = 0.05; g.player.pitch=-0.02;
`);
await shot('canteen');

await prep(`
  g.player.position.set(18.4,0,38.5); g.player.yaw = 2.55; g.player.pitch=-0.05;
`);
await shot('nap');

await prep(`
  g.player.position.set(41.5,0,44.5); g.player.yaw = -1.15; g.player.pitch=-0.05;
  const f = g.frogs.frogs[0];
  f.pos.set(44.2,0,46.2); f.group.position.copy(f.pos); f.state='idle'; f.group.rotation.y = -2.2;
  g.frogs.frogs.forEach((ff,i)=>{ if(i>0){ ff.pos.set(200,0,200); ff.group.position.copy(ff.pos); }});
`);
await shot('frog-closeup');

await prep(`
  g.player.position.set(14.4,0,14.4); g.player.yaw = 1.2; g.player.pitch=-0.1;
  for(let k=0;k<3;k++) g.collectCandy(g.world.candies[k]);
  g.ui.drawMinimap({x:g.player.position.x,z:g.player.position.z,yaw:g.player.yaw,frogs:g.frogs.frogs.map(f=>({x:f.pos.x,z:f.pos.z,dist:f.distanceToPlayer}))});
`);
await shot('map-unlocked');

await prep(`
  g.player.position.set(14.4,0,14.4); g.player.yaw = 1.2;
  for(let k=0;k<6;k++) g.collectCandy(g.world.candies[k]);
  g.ui.drawMinimap({x:g.player.position.x,z:g.player.position.z,yaw:g.player.yaw,frogs:g.frogs.frogs.map(f=>({x:f.pos.x,z:f.pos.z,dist:f.distanceToPlayer}))});
`);
await shot('speed-unlocked');

await prep(`
  g.player.position.set(79.5,0,46.4); g.player.yaw = -Math.PI/2; g.player.pitch=-0.02;
  for(let k=0;k<8;k++) g.collectCandy(g.world.candies[k]);
  g.world.exitOpenT = 1;
  g.world.update(0.1, 10);
  g.ui.showInteract('<kbd>E</kbd> 离开乐园');
  g.state='playing';
`);
await shot('exit-open');
await browser.close();
