// 机制模拟：贴近被抓、行走保持距离、冲刺甩脱、解锁、出口
import { chromium } from 'playwright-core';
const edge = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const browser = await chromium.launch({ executablePath: edge, headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1024, height: 640 } });
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
await page.goto('http://127.0.0.1:8010/', { waitUntil: 'networkidle' });
await page.waitForSelector('#loading.hidden', { timeout: 30000 }).catch(() => {});
const out = await page.evaluate(() => {
  const g = window.__game;
  const hide = () => { for (const id of ['menu','loading','story','ready','pause','win','lose','help']) document.getElementById(id)?.classList.add('hidden'); };
  const start = (demo = false) => {
    g.resetStage(demo);
    hide();
    g.ui.showHud();
    g.state = demo ? 'demo' : 'playing';
    g.mode = demo ? 'demo' : 'human';
    g.player.lookEnabled = true;
    g.grace = 0;
    g.frogs.active = true;
  };
  const res = {};

  // 1) 站立不动 → 被抓
  start(false);
  g.player.position.set(43.2, 0, 43.2);
  g.player.yaw = 0;
  const frog = g.frogs.frogs[0];
  frog.pos.set(46.4, 0, 43.2);
  frog.group.position.copy(frog.pos);
  g.player.frozen = false;
  for (let i = 0; i < 200; i++) { if (g.state !== 'playing') break; g.updatePlay(0.05, i * 0.05); }
  res.catchTest = { state: g.state, nearest: +g.frogs.nearest.toFixed(2), candies: g.candiesCollected };

  // 2) 正常行走 → 距离保持，不会被抓
  start(false);
  g.player.speedUnlocked = true;
  g.player.position.set(30, 0, 27.2);
  g.player.yaw = -Math.PI / 2;
  g.player.keys.add('w');
  frog.pos.set(20, 0, 27.2); frog.group.position.copy(frog.pos);
  frog.state = 'chase';
  let minD = 99;
  for (let i = 0; i < 140; i++) { g.updatePlay(0.05, i * 0.05); minD = Math.min(minD, g.frogs.nearest); }
  g.player.keys.clear();
  res.walkTest = { minDistance: +minD.toFixed(2), nearestEnd: +g.frogs.nearest.toFixed(2), state: g.state };

  // 3) 冲刺 → 甩开并眩晕
  start(false);
  g.player.speedUnlocked = true;
  g.player.stamina = 100;
  g.player.position.set(20, 0, 27.2);
  g.player.yaw = -Math.PI / 2;
  g.player.keys.add('w'); g.player.keys.add('shift');
  frog.pos.set(14, 0, 27.2); frog.group.position.copy(frog.pos);
  frog.state = 'chase';
  let dazedSeen = 0, maxD = 0;
  for (let i = 0; i < 120; i++) {
    g.updatePlay(0.05, i * 0.05);
    maxD = Math.max(maxD, g.frogs.nearest);
    dazedSeen = Math.max(dazedSeen, g.frogs.frogs.filter((f) => f.state === 'dazed').length);
  }
  g.player.keys.clear();
  res.sprintTest = { maxDistance: +maxD.toFixed(1), dazedSeen, stamina: +g.player.stamina.toFixed(0), state: g.state };

  // 4) 解锁
  start(false);
  for (let k = 0; k < 3; k++) g.collectCandy(g.world.candies[k]);
  res.unlock3 = { candies: g.candiesCollected, map: g.mapUnlocked, speed: g.speedUnlocked, minimapHidden: document.getElementById('minimap-wrap').classList.contains('hidden') };
  for (let k = 3; k < 6; k++) g.collectCandy(g.world.candies[k]);
  res.unlock6 = { candies: g.candiesCollected, speed: g.speedUnlocked, staminaHidden: document.getElementById('stamina-wrap').classList.contains('hidden') };
  for (let k = 6; k < 8; k++) g.collectCandy(g.world.candies[k]);
  res.unlock8 = { candies: g.candiesCollected, exitUnlocked: g.world.exitUnlocked, state: g.state };

  // 5) 出口交互
  g.player.position.set(g.world.exitInfo.x, 0, g.world.exitInfo.z);
  g.tryInteract();
  res.exitTest = { state: g.state };
  return res;
});
console.log(JSON.stringify(out, null, 2));
await browser.close();
