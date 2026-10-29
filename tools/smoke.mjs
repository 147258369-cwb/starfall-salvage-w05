// 最终冒烟：加载/菜单/帮助/开始/剧情/进入/静音/暂停/恢复/解锁HUD
import { chromium } from 'playwright-core';
const edge = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const b = await chromium.launch({ executablePath: edge, headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
const errs = []; p.on('pageerror', e => errs.push('PAGEERROR ' + e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
const bad = []; p.on('response', r => { if (r.status() >= 400) bad.push(r.status() + ' ' + r.url()); });
const t0 = Date.now();
await p.goto('http://127.0.0.1:8010/', { waitUntil: 'domcontentloaded' });
await p.waitForFunction(() => window.__game?.state === 'menu', null, { timeout: 60000 });
const loadSec = (Date.now() - t0) / 1000;
const boot = await p.evaluate(() => ({
  state: window.__game.state,
  buffers: window.__game.audio.buffers.size,
  frogs: window.__game.audio.frogs.filter(Boolean).length,
  heartbeat: !!window.__game.audio.heartbeat,
  storyLines: window.__game.story.lineCount,
  hudPauseBtn: !!document.getElementById('btn-pause'),
  hudHint: document.querySelector('.hud-hint-text')?.textContent || '',
}));
await p.click('#btn-help'); await p.waitForTimeout(250);
const helpOpen = await p.evaluate(() => !document.getElementById('help').classList.contains('hidden'));
await p.click('#btn-help-close'); await p.waitForTimeout(250);
const helpClosed = await p.evaluate(() => document.getElementById('help').classList.contains('hidden'));
await p.click('#btn-start'); await p.waitForTimeout(2500);
const story = await p.evaluate(() => ({ state: window.__game.state, line: document.getElementById('story-line').textContent, voice: !!window.__game.audio.voice }));
await p.click('#story-skip'); await p.waitForTimeout(900);
const ready = await p.evaluate(() => window.__game.state);
await p.click('#btn-enter'); await p.waitForTimeout(1500);
const play = await p.evaluate(() => ({
  state: window.__game.state, locked: !!document.pointerLockElement,
  music: window.__game.audio.musicKey,
  hintHidden: document.getElementById('pointer-hint').classList.contains('hidden'),
}));
await p.keyboard.press('m');
const muted = await p.evaluate(() => ({ muted: window.__game.audio.muted, master: +window.__game.audio.master.gain.value.toFixed(2) }));
await p.keyboard.press('m');
await p.keyboard.press('Escape'); await p.waitForTimeout(700);
const paused = await p.evaluate(() => ({ state: window.__game.state, pauseShown: !document.getElementById('pause').classList.contains('hidden'), locked: !!document.pointerLockElement }));
const slider = await p.$('#pause-volume');
await slider.fill('35');
const vol = await p.evaluate(() => ({ volume: window.__game.volume, master: +window.__game.audio.master.gain.value.toFixed(2) }));
await p.click('#btn-resume'); await p.waitForTimeout(800);
const resumed = await p.evaluate(() => ({ state: window.__game.state, locked: !!document.pointerLockElement }));

// 解锁 HUD（直接收集，视觉检查）
await p.evaluate(() => {
  const g = window.__game;
  g.grace = 999;
  for (let k = 0; k < 6; k++) g.collectCandy(g.world.candies[k]);
  g.ui.drawMinimap({ x: g.player.position.x, z: g.player.position.z, yaw: g.player.yaw, frogs: [] });
});
await p.waitForTimeout(500);
const unlocks = await p.evaluate(() => ({
  candies: window.__game.candiesCollected,
  map: window.__game.mapUnlocked,
  speed: window.__game.speedUnlocked,
  mapShown: !document.getElementById('minimap-wrap').classList.contains('hidden'),
  staminaShown: !document.getElementById('stamina-wrap').classList.contains('hidden'),
}));
await p.screenshot({ path: 'tools/qa/out/final-smoke.png' });
console.log(JSON.stringify({ loadSec, boot, helpOpen, helpClosed, story, ready, play, muted, paused, vol, resumed, unlocks, bad, errs }, null, 2));
await b.close();
