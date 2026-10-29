// 奶蛙乐园：午夜奶片 — 独立 QA 全量验收脚本
// 运行: node tools/qa/full.mjs   (需先启动 http://127.0.0.1:8010)
// 输出: tools/qa/out/report.json + 截图
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';

const ROOT = process.cwd();
const OUT = path.join(ROOT, 'tools', 'qa', 'out');
fs.mkdirSync(OUT, { recursive: true });
const BASE = process.env.QA_BASE || 'http://127.0.0.1:8010/';
const EDGE = process.env.EDGE_PATH || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const ARGS = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'];
const startedAt = new Date();

const checks = [];
const consoleErrors = [];
const pageErrors = [];
const consoleWarnings = [];
const requests = [];
const badResponses = [];
const requestFailures = [];
const screenshots = [];
const notes = [];
let page = null;
let browser = null;
let reportWritten = false;

function addCheck(id, group, name, pass, detail, evidence = [], severity = 'info') {
  const c = { id, group, name, status: pass ? 'PASS' : 'FAIL', detail, evidence, severity: pass ? 'info' : severity };
  checks.push(c);
  console.log((pass ? '  PASS ' : '  FAIL ') + id + ' — ' + name + (detail ? ' :: ' + detail : ''));
  return c;
}
function rel(p) { return path.relative(ROOT, p).replace(/\\/g, '/'); }
async function shot(name) {
  const p = path.join(OUT, name + '.png');
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      await page.screenshot({ path: p, timeout: 15000, animations: 'disabled' });
      screenshots.push(rel(p));
      return rel(p);
    } catch (e) {
      console.log('  WARN screenshot failed (' + (attempt + 1) + '): ' + name + ' :: ' + String(e.message).split('\n')[0]);
      await page.waitForTimeout(800);
    }
  }
  notes.push('screenshot failed: ' + name);
  return null;
}
async function installAudioProbe() {
  await page.evaluate(() => {
    const g = window.__game;
    if (!g || g.__qaProbe) return;
    g.__qaProbe = true;
    window.__qa = { sfx: [], music: [], voice: [] };
    const os = g.audio.playSfx.bind(g.audio);
    g.audio.playSfx = (k, o) => { window.__qa.sfx.push(k); return os(k, o); };
    const om = g.audio.playMusic.bind(g.audio);
    g.audio.playMusic = (k, o) => { window.__qa.music.push(k); return om(k, o); };
    const ov = g.audio.playVoice.bind(g.audio);
    g.audio.playVoice = (k) => { window.__qa.voice.push(k); return ov(k); };
  });
}
async function reloadToMenu(tag) {
  console.log('  reload [' + tag + '] ' + new Date().toISOString());
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => window.__game && window.__game.state === 'menu', null, { timeout: 60000, polling: 200 });
  await page.waitForTimeout(600);
  await installAudioProbe();
}
async function state() { return await page.evaluate(() => window.__game && window.__game.state); }
async function waitState(s, timeout = 20000) {
  await page.waitForFunction((x) => window.__game && window.__game.state === x, s, { timeout, polling: 100 });
}
async function waitFn(fn, arg, timeout = 15000) {
  await page.waitForFunction(fn, arg, { timeout, polling: 80 });
}
async function ensureMenu() {
  const s = await state();
  if (s !== 'menu') {
    await page.evaluate(() => window.__game.goMenu());
    await waitState('menu', 15000);
    await page.waitForTimeout(300);
  }
}
async function startHumanToPlay() {
  await ensureMenu();
  await page.click('#btn-start');
  await waitState('story', 20000);
  await page.click('#story-skip');
  await waitState('ready', 20000);
  await page.click('#btn-enter');
  await waitState('playing', 20000);
  await waitFn(() => !!document.pointerLockElement, null, 8000).catch(() => {});
  await page.waitForTimeout(350);
}
async function collectCandies(from, to) {
  for (let i = from; i <= to; i++) {
    await page.evaluate((idx) => {
      const g = window.__game;
      const c = g.world.candies[idx];
      g.player.position.set(c.group.position.x, 0, c.group.position.z);
      g.player.velocity.set(0, 0, 0);
    }, i);
    await page.waitForFunction((idx) => window.__game.collected[idx], i, { timeout: 10000, polling: 80 });
  }
}
async function layoutSnapshot() {
  return await page.evaluate(() => {
    const sels = {
      objective: '.objective-card', topRight: '.hud-top-right', minimap: '#minimap-wrap',
      bottom: '.hud-bottom', stamina: '#stamina-wrap', items: '#items',
      subtitles: '#subtitles', interact: '#interact-prompt',
    };
    const rects = {};
    for (const [k, s] of Object.entries(sels)) {
      const el = document.querySelector(s);
      if (!el) { rects[k] = null; continue; }
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      const hidden = el.classList.contains('hidden') || cs.display === 'none' || cs.visibility === 'hidden';
      rects[k] = { x: +r.x.toFixed(1), y: +r.y.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1), hidden: hidden || r.width === 0 };
    }
    return {
      rects, vw: innerWidth, vh: innerHeight,
      scrollW: document.documentElement.scrollWidth, scrollH: document.documentElement.scrollHeight,
      title: document.querySelector('.title-cn') ? document.querySelector('.title-cn').textContent : '',
      mojibake: document.body.innerText.includes(String.fromCharCode(0xfffd)),
      favicon: (document.querySelector('link[rel="icon"]') || {}).href || '',
      ctx: window.__game.audio.ctx ? window.__game.audio.ctx.state : 'none',
    };
  });
}
function overlap(a, b) {
  if (!a || !b || a.hidden || b.hidden) return 0;
  const x = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
  const y = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  return x * y;
}
function checkLayout(tag, snap) {
  const issues = [];
  const overflow = [];
  for (const [k, r] of Object.entries(snap.rects)) {
    if (!r || r.hidden) continue;
    if (r.x < -1 || r.y < -1 || r.x + r.w > snap.vw + 1 || r.y + r.h > snap.vh + 1) {
      overflow.push(k + '(' + r.x + ',' + r.y + ',' + r.w + 'x' + r.h + ')');
    }
  }
  if (snap.scrollW > snap.vw + 1 || snap.scrollH > snap.vh + 1) overflow.push('document ' + snap.scrollW + 'x' + snap.scrollH);
  for (const pair of [['objective', 'topRight'], ['minimap', 'objective'], ['minimap', 'bottom'], ['stamina', 'items'], ['items', 'subtitles'], ['interact', 'subtitles']]) {
    const a = overlap(snap.rects[pair[0]], snap.rects[pair[1]]);
    if (a > 4) issues.push(pair[0] + ' x ' + pair[1] + ' = ' + Math.round(a) + 'px2');
  }
  addCheck('layout-' + tag, '10 分辨率/HUD', 'HUD 不重叠、不溢出 @ ' + tag, overflow.length === 0 && issues.length === 0,
    JSON.stringify({ overflow, overlaps: issues, vw: snap.vw, vh: snap.vh }), [], 'major');
  return { overflow, issues };
}

async function main() {
  browser = await chromium.launch({ executablePath: EDGE, headless: true, args: ARGS });
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  page = await context.newPage();
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push({ text: m.text(), at: new Date().toISOString() });
    else if (m.type() === 'warning') consoleWarnings.push(m.text());
  });
  page.on('pageerror', (e) => pageErrors.push({ message: e.message, stack: e.stack, at: new Date().toISOString() }));
  page.on('request', (r) => requests.push({ url: r.url(), type: r.resourceType(), method: r.method() }));
  page.on('response', (r) => { if (r.status() >= 400) badResponses.push({ url: r.url(), status: r.status() }); });
  page.on('requestfailed', (r) => requestFailures.push({ url: r.url(), err: r.failure() && r.failure().errorText }));

  // ---------------- 1. 冷启动 ----------------
  const t0 = Date.now();
  let navErr = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try { await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 60000 }); navErr = null; break; }
    catch (e) { navErr = e; console.log('  WARN goto retry ' + (attempt + 1) + ': ' + String(e.message).split('\n')[0]); await page.waitForTimeout(1200); }
  }
  if (navErr) throw navErr;
  await page.waitForFunction(() => window.__game && window.__game.state === 'menu', null, { timeout: 90000, polling: 200 });
  await page.waitForTimeout(600);
  const loadMs = Date.now() - t0;
  const coldSnap = await layoutSnapshot();
  const menuVisible = await page.evaluate(() => !document.getElementById('menu').classList.contains('hidden'));
  const loadingHidden = await page.evaluate(() => document.getElementById('loading').classList.contains('hidden'));
  addCheck('cold-start', '1 冷启动', '加载页→菜单，状态机进入 menu', menuVisible && loadingHidden && coldSnap.ctx === 'running', 'load=' + loadMs + 'ms, menu=' + menuVisible + ', loadingHidden=' + loadingHidden + ', AudioContext=' + coldSnap.ctx, [await shot('menu-1280')], 'blocking');
  addCheck('cold-errors', '1 冷启动', '0 console error / 0 pageerror', consoleErrors.length === 0 && pageErrors.length === 0, 'consoleError=' + consoleErrors.length + ', pageerror=' + pageErrors.length, [], 'blocking');
  const origins = [...new Set(requests.map((r) => { try { return new URL(r.url).origin; } catch (e) { return 'data:'; } }))].filter((o) => o !== 'data:' && o !== 'null');
  const external = requests.filter((r) => { try { const u = new URL(r.url); return u.protocol.startsWith('http') && u.origin !== new URL(BASE).origin; } catch (e) { return false; } });
  addCheck('cold-network', '1 冷启动', '所有网络请求同源，无 CDN/外网', external.length === 0 && origins.length === 1 && origins[0] === new URL(BASE).origin, 'origins=' + JSON.stringify(origins) + ', external=' + JSON.stringify(external), [], 'blocking');
  const favicon = await page.evaluate(() => (document.querySelector('link[rel="icon"]') || {}).getAttribute('href') || '');
  const favicon404 = badResponses.some((r) => /favicon/i.test(r.url));
  addCheck('favicon', '1 冷启动', 'favicon 不 404（内联 data: 图标）', favicon.startsWith('data:') && !favicon404, 'href=' + favicon.slice(0, 40) + '..., 404=' + favicon404, [], 'minor');
  addCheck('cold-chinese', '1 冷启动', '中文标题无乱码', coldSnap.title === '奶蛙乐园' && !coldSnap.mojibake, 'title=' + coldSnap.title + ', mojibake=' + coldSnap.mojibake, [], 'blocking');

  // ============ 音频调用插桩（仅观测） ============
  await installAudioProbe();

  // ---------------- 2. 菜单 ----------------
  const btnState = await page.evaluate(() => {
    const out = {};
    for (const id of ['btn-start', 'btn-demo', 'btn-help', 'btn-mute']) {
      const el = document.getElementById(id);
      const r = el.getBoundingClientRect();
      out[id] = { visible: r.width > 0 && r.height > 0 && !el.disabled, disabled: el.disabled, cursor: getComputedStyle(el).cursor };
    }
    return out;
  });
  addCheck('menu-buttons', '2 菜单', '主菜单按钮可见/可用', Object.values(btnState).every((b) => b.visible), JSON.stringify(btnState), [], 'blocking');
  const hoverBefore = await page.evaluate(() => { const s = getComputedStyle(document.getElementById('btn-start')); return s.backgroundImage + '|' + s.boxShadow + '|' + s.transform; });
  await page.hover('#btn-start');
  await page.waitForTimeout(350);
  const hoverAfter = await page.evaluate(() => { const s = getComputedStyle(document.getElementById('btn-start')); return s.backgroundImage + '|' + s.boxShadow + '|' + s.transform; });
  addCheck('menu-hover', '2 菜单', '按钮 hover 有视觉反馈', hoverBefore !== hoverAfter, 'changed=' + (hoverBefore !== hoverAfter), [await shot('menu-hover-1280')], 'minor');
  const vbox = await page.locator('#volume').boundingBox();
  await page.mouse.click(vbox.x + vbox.width * 0.31, vbox.y + vbox.height / 2);
  await page.waitForTimeout(250);
  const vol = await page.evaluate(() => ({ v: window.__game.volume, input: document.getElementById('volume').value, master: window.__game.audio.master.gain.value }));
  addCheck('menu-volume', '2 菜单', '音量滑条可调（点击 31%）', Math.abs(vol.v - 0.31) < 0.08 && vol.input === String(Math.round(vol.v * 100)), JSON.stringify(vol), [], 'major');
  await page.mouse.click(vbox.x + vbox.width * 0.7, vbox.y + vbox.height / 2);
  await page.waitForTimeout(200);
  await page.click('#btn-mute');
  await page.waitForTimeout(400);
  const muted = await page.evaluate(() => ({ muted: window.__game.audio.muted, gain: window.__game.audio.master.gain.value, icon: document.getElementById('btn-mute').textContent }));
  await page.click('#btn-mute');
  await page.waitForTimeout(400);
  const unmuted = await page.evaluate(() => ({ muted: window.__game.audio.muted, gain: window.__game.audio.master.gain.value }));
  addCheck('menu-mute', '2 菜单', '静音按钮生效（master gain→0）并恢复', muted.muted && muted.gain < 0.02 && !unmuted.muted && unmuted.gain > 0.1, JSON.stringify({ muted, unmuted }), [], 'major');
  await page.click('#btn-help');
  await page.waitForTimeout(400);
  const helpOpen = await page.evaluate(() => !document.getElementById('help').classList.contains('hidden'));
  await shot('help-1280');
  await page.click('#btn-help-close');
  await page.waitForTimeout(400);
  const helpClosed = await page.evaluate(() => document.getElementById('help').classList.contains('hidden') && !document.getElementById('menu').classList.contains('hidden'));
  addCheck('menu-help', '2 菜单', '操作说明可开可关（按钮）', helpOpen && helpClosed, 'open=' + helpOpen + ', closed=' + helpClosed, ['tools/qa/out/help-1280.png'], 'minor');

  // ---------------- 3. 开始游戏 / 剧情 ----------------
  await page.click('#btn-start');
  await waitState('story', 20000);
  await page.waitForTimeout(1200);
  const storyInfo = await page.evaluate(() => {
    const g = window.__game;
    return {
      storyVisible: !document.getElementById('story').classList.contains('hidden'),
      line: document.getElementById('story-line').textContent,
      chapter: document.getElementById('story-chapter').textContent,
      voice: !!g.audio.voice,
      ctx: g.audio.ctx && g.audio.ctx.state,
      music: g.audio.musicKey,
      sfx: window.__qa.sfx.slice(),
      musicLog: window.__qa.music.slice(),
    };
  });
  await shot('story-1280');
  addCheck('start-state', '3 开始游戏', '点击开始→进入剧情，剧情文字出现', storyInfo.storyVisible && storyInfo.line.length > 8, JSON.stringify({ line: storyInfo.line, chapter: storyInfo.chapter }), ['tools/qa/out/story-1280.png'], 'blocking');
  addCheck('start-sting', '3 开始游戏', '阴森音效触发 (sfx_start_sting) 且 AudioContext running', storyInfo.sfx.includes('sfx_start_sting') && storyInfo.ctx === 'running', 'sfx=' + JSON.stringify(storyInfo.sfx) + ', ctx=' + storyInfo.ctx, [], 'major');
  addCheck('start-voice', '3 开始游戏', '旁白音频播放（audio.voice 非空）', storyInfo.voice === true, 'voice=' + storyInfo.voice + ', music=' + storyInfo.music, [], 'major');
  await page.click('#story-skip');
  await waitState('ready', 20000);
  await page.waitForTimeout(500);
  const readyInfo = await page.evaluate(() => ({ ready: !document.getElementById('ready').classList.contains('hidden'), story: !document.getElementById('story').classList.contains('hidden'), progress: document.getElementById('story-progress').style.width }));
  await shot('ready-1280');
  addCheck('story-skip', '3 开始游戏', '跳过剧情→ready 页', readyInfo.ready && !readyInfo.story, JSON.stringify(readyInfo), ['tools/qa/out/ready-1280.png'], 'blocking');
  await page.click('#btn-enter');
  await waitState('playing', 20000);
  await page.waitForTimeout(1000);
  const lockInfo = await page.evaluate(() => ({ lock: !!document.pointerLockElement, state: window.__game.state, look: window.__game.player.lookEnabled, hud: !document.getElementById('hud').classList.contains('hidden') }));
  await shot('play-1280');
  addCheck('enter-lock', '3 开始游戏', '点击进入后 pointerLockElement 存在', lockInfo.lock === true && lockInfo.look === true && lockInfo.hud, JSON.stringify(lockInfo), ['tools/qa/out/play-1280.png'], 'blocking');

  // ---------------- 4. 游玩基础 ----------------
  await page.evaluate(() => { window.__game.player.yaw = -Math.PI * 0.75; window.__game.player.pitch = 0; });
  const yaw0 = await page.evaluate(() => window.__game.player.yaw);
  await page.mouse.move(320, 320);
  await page.mouse.move(760, 320);
  await page.mouse.move(1040, 400);
  await page.waitForTimeout(400);
  const yaw1 = await page.evaluate(() => window.__game.player.yaw);
  addCheck('play-mouse', '4 游玩', '鼠标移动改变 yaw（pointer lock 下）', Math.abs(yaw1 - yaw0) > 0.15, 'yaw ' + yaw0.toFixed(3) + ' -> ' + yaw1.toFixed(3), [], 'blocking');
  await page.evaluate(() => { window.__game.player.yaw = -Math.PI * 0.75; });
  const pos0 = await page.evaluate(() => [window.__game.player.position.x, window.__game.player.position.z]);
  await page.keyboard.down('w');
  await page.waitForTimeout(7000);
  await page.keyboard.up('w');
  await page.waitForTimeout(400);
  const pos1 = await page.evaluate(() => [window.__game.player.position.x, window.__game.player.position.z]);
  const moved = Math.hypot(pos1[0] - pos0[0], pos1[1] - pos0[1]);
  addCheck('play-wasd', '4 游玩', 'WASD 位移 > 2m（真实按键）', moved > 2, 'moved=' + moved.toFixed(2) + 'm, ' + JSON.stringify(pos0) + ' -> ' + JSON.stringify(pos1), [], 'blocking');
  await page.evaluate(() => {
    const g = window.__game; const ex = g.world.exitInfo;
    g.player.position.set(ex.x - 2.2, 0, ex.z);
    g.player.velocity.set(0, 0, 0);
    g.player.yaw = -Math.PI / 2;
  });
  await page.waitForTimeout(900);
  const prompt0 = await page.evaluate(() => ({ show: !document.getElementById('interact-prompt').classList.contains('hidden'), text: document.getElementById('interact-prompt').textContent }));
  await page.keyboard.press('e');
  await page.waitForTimeout(900);
  const toast0 = await page.evaluate(() => { const t = document.querySelectorAll('#toasts .toast'); return t.length ? t[t.length - 1].innerText : ''; });
  addCheck('play-interact', '4 游玩', 'E 互动提示与锁定门反馈', prompt0.show && /奶片/.test(prompt0.text) && /锁/.test(toast0), JSON.stringify({ prompt: prompt0, toast: toast0 }), [], 'major');
  await page.keyboard.press('v');
  await page.waitForTimeout(900);
  const vInfo = await page.evaluate(() => ({ visible: window.__game.player.model.visible, first: window.__game.player.firstPerson }));
  await shot('thirdperson-1280');
  await page.keyboard.press('v');
  await page.waitForTimeout(500);
  const vBack = await page.evaluate(() => ({ visible: window.__game.player.model.visible, first: window.__game.player.firstPerson }));
  addCheck('play-thirdperson', '4 游玩', 'V 切换第三人称（model.visible 变化）', vInfo.visible === true && vInfo.first === false && vBack.visible === false, JSON.stringify({ vInfo, vBack }), ['tools/qa/out/thirdperson-1280.png'], 'major');
  await page.keyboard.press('f');
  await page.waitForTimeout(400);
  const fOff = await page.evaluate(() => ({ on: window.__game.player.flashOn, visible: window.__game.player.flashlight.visible }));
  await page.keyboard.press('f');
  await page.waitForTimeout(400);
  const fOn = await page.evaluate(() => ({ on: window.__game.player.flashOn, visible: window.__game.player.flashlight.visible }));
  addCheck('play-flashlight', '4 游玩', 'F 切换手电（flashlight.visible）', fOff.visible === false && fOn.visible === true, JSON.stringify({ fOff, fOn }), [], 'major');
  await page.keyboard.press('m');
  await page.waitForTimeout(600);
  const mOn = await page.evaluate(() => ({ muted: window.__game.audio.muted, gain: window.__game.audio.master.gain.value }));
  await page.keyboard.press('m');
  await page.waitForTimeout(600);
  const mOff = await page.evaluate(() => ({ muted: window.__game.audio.muted, gain: window.__game.audio.master.gain.value }));
  addCheck('play-mute', '4 游玩', 'M 静音（master gain→0）并恢复', mOn.muted && mOn.gain < 0.02 && !mOff.muted && mOff.gain > 0.1, JSON.stringify({ mOn, mOff }), [], 'major');
  const hudHint = await page.evaluate(() => {
    const el = document.querySelector('.hud-top-right');
    return { text: el ? el.innerText : '', buttons: el ? el.querySelectorAll('button').length : -1 };
  });
  addCheck('pause-hint', '7 暂停/恢复', 'HUD 右上角改为文字提示（ESC 暂停 · M 静音），无锁定态下不可点的按钮', /ESC/.test(hudHint.text) && /M/.test(hudHint.text) && hudHint.buttons === 0, JSON.stringify(hudHint), [], 'minor');

  // ---------------- 5. 进度 ----------------
  await page.evaluate(() => { window.__game.grace = 9999; });
  await collectCandies(0, 2);
  await page.waitForTimeout(900);
  const at3 = await page.evaluate(() => {
    const g = window.__game;
    const cv = document.getElementById('minimap');
    const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
    let px = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 0) px++;
    return {
      n: g.candiesCollected, map: g.mapUnlocked, mapWrap: !document.getElementById('minimap-wrap').classList.contains('hidden'),
      item: document.getElementById('item-map').className, pixels: px,
      mapUrl: cv.toDataURL('image/png'),
    };
  });
  await shot('progress-map-1280');
  addCheck('progress-map', '5 进度', '3 片→地图解锁、小地图出现且 canvas 非空', at3.n === 3 && at3.map && at3.mapWrap && /unlocked/.test(at3.item) && at3.pixels > 500, JSON.stringify({ n: at3.n, map: at3.map, mapWrap: at3.mapWrap, item: at3.item, pixels: at3.pixels }), ['tools/qa/out/progress-map-1280.png'], 'blocking');
  await page.evaluate(() => { const g = window.__game; g.player.position.set(30, 0, 55); });
  await page.waitForTimeout(700);
  const mapUrl2 = await page.evaluate(() => document.getElementById('minimap').toDataURL('image/png'));
  addCheck('progress-map-arrow', '5 进度', '小地图玩家箭头随移动更新', mapUrl2 !== at3.mapUrl, 'dataURL changed=' + (mapUrl2 !== at3.mapUrl), [], 'major');
  await collectCandies(3, 5);
  await page.waitForTimeout(800);
  const at6 = await page.evaluate(() => {
    const g = window.__game;
    return {
      n: g.candiesCollected, speed: g.speedUnlocked, playerSpeed: g.player.speedUnlocked,
      staminaWrap: !document.getElementById('stamina-wrap').classList.contains('hidden'),
      item: document.getElementById('item-speed').className,
      map: g.mapUnlocked,
    };
  });
  await page.waitForFunction(() => !document.querySelector('#toasts .toast'), null, { timeout: 9000, polling: 200 }).catch(() => {});
  await page.evaluate(() => {
    const g = window.__game;
    if (g.mapUnlocked) g.ui.drawMinimap({ x: g.player.position.x, z: g.player.position.z, yaw: g.player.yaw, frogs: g.frogs.frogs.map((f) => ({ x: f.pos.x, z: f.pos.z, dist: f.distanceToPlayer })) });
  });
  await page.waitForTimeout(500);
  const speedShot = await shot('progress-speed-1280');
  if (!speedShot) notes.push('progress-speed-1280 screenshot failed (non-blocking; state JSON is the evidence)');
  addCheck('progress-speed', '5 进度', '6 片→体力条+加速解锁', at6.n === 6 && at6.speed && at6.playerSpeed && at6.staminaWrap && /unlocked/.test(at6.item), JSON.stringify(at6), ['tools/qa/out/progress-speed-1280.png'], 'blocking');
  await page.evaluate(() => {
    const g = window.__game;
    g.player.position.set(8, 0, 8); g.player.velocity.set(0, 0, 0);
    g.player.yaw = -Math.PI * 0.75; g.player.stamina = 100; g.grace = 9999;
  });
  await page.waitForTimeout(300);
  await page.keyboard.down('Shift');
  await page.keyboard.down('w');
  await page.waitForTimeout(4000);
  const sprint = await page.evaluate(() => { const g = window.__game; return { sprinting: g.player.sprinting, stamina: g.player.stamina, speed: Math.hypot(g.player.velocity.x, g.player.velocity.z), state: g.state }; });
  await page.keyboard.up('w');
  await page.keyboard.up('Shift');
  addCheck('progress-sprint', '5 进度', '6 后 Shift 冲刺：体力下降且速度提升', sprint.sprinting && sprint.stamina < 95 && sprint.speed > 4.6, JSON.stringify(sprint), [], 'major');
  await collectCandies(6, 7);
  await page.waitForTimeout(1600);
  const at8 = await page.evaluate(() => {
    const g = window.__game;
    return {
      n: g.candiesCollected, exit: g.world.exitUnlocked, openT: g.world.exitOpenT,
      glow: g.world.exitGlowPlane.material.opacity, light: g.world.exitLight.intensity,
      objective: document.getElementById('objective-text').textContent,
    };
  });
  addCheck('progress-exit', '5 进度', '8 片→出口开启并发光', at8.n === 8 && at8.exit && at8.glow > 0.08 && at8.light > 3 && /出口/.test(at8.objective), JSON.stringify(at8), [], 'blocking');
  await page.evaluate(() => {
    const g = window.__game; const ex = g.world.exitInfo;
    g.player.position.set(ex.x - 2.0, 0, ex.z); g.player.velocity.set(0, 0, 0);
    g.player.yaw = -Math.PI / 2; g.player.pitch = 0;
  });
  await page.waitForTimeout(900);
  const exitPrompt = await page.evaluate(() => ({ show: !document.getElementById('interact-prompt').classList.contains('hidden'), text: document.getElementById('interact-prompt').textContent }));
  await shot('exit-open-1280');
  addCheck('progress-exit-prompt', '5 进度', '8 片后出口提示 E 离开', exitPrompt.show && /离开乐园/.test(exitPrompt.text), JSON.stringify(exitPrompt), ['tools/qa/out/exit-open-1280.png'], 'major');
  await page.evaluate(() => window.__game.ui.showSubtitle('奶蛙', '它就在你身后', { frog: true, duration: 20 }));
  await page.waitForTimeout(400);
  const snap1280 = await layoutSnapshot();
  await shot('hud-1280');
  checkLayout('1280x720', snap1280);
  await page.evaluate(() => window.__game.ui.hideSubtitle());

  // ---------------- 7. 暂停/恢复/重开/菜单 ----------------
  await page.keyboard.press('Escape');
  await waitState('paused', 10000);
  await page.waitForTimeout(400);
  const pauseInfo = await page.evaluate(() => ({ visible: !document.getElementById('pause').classList.contains('hidden'), lock: !!document.pointerLockElement }));
  await shot('pause-1280');
  addCheck('pause-esc', '7 暂停/恢复', 'ESC 暂停（指针解锁、暂停层出现）', pauseInfo.visible && !pauseInfo.lock, JSON.stringify(pauseInfo), ['tools/qa/out/pause-1280.png'], 'blocking');
  const pvbox = await page.locator('#pause-volume').boundingBox();
  await page.mouse.click(pvbox.x + pvbox.width * 0.42, pvbox.y + pvbox.height / 2);
  await page.waitForTimeout(300);
  const pvol = await page.evaluate(() => ({ v: window.__game.volume, input: document.getElementById('pause-volume').value }));
  await page.click('#btn-pause-mute');
  await page.waitForTimeout(400);
  const pmute = await page.evaluate(() => ({ muted: window.__game.audio.muted, gain: window.__game.audio.master.gain.value }));
  await page.click('#btn-pause-mute');
  await page.waitForTimeout(400);
  const punmute = await page.evaluate(() => ({ muted: window.__game.audio.muted, gain: window.__game.audio.master.gain.value }));
  addCheck('pause-audio-controls', '7 暂停/恢复', '暂停面板音量滑条+静音可点（指针已解锁）', Math.abs(pvol.v - 0.42) < 0.09 && pmute.muted && pmute.gain < 0.02 && !punmute.muted && punmute.gain > 0.1, JSON.stringify({ pvol, pmute, punmute }), [], 'major');
  await page.click('#btn-resume');
  await waitState('playing', 10000);
  await waitFn(() => !!document.pointerLockElement, null, 8000);
  addCheck('resume-button', '7 暂停/恢复', '继续游戏按钮恢复并重新锁定指针', true, 'state playing + lock ok', [], 'major');
  await page.keyboard.press('Escape');
  await waitState('paused', 10000);
  await page.click('#btn-restart');
  await waitState('playing', 10000);
  await page.waitForTimeout(800);
  const restarted = await page.evaluate(() => {
    const g = window.__game;
    return { state: g.state, candies: g.candiesCollected, map: g.mapUnlocked, speed: g.speedUnlocked, exit: g.world.exitUnlocked, stamina: g.player.stamina, pos: [g.player.position.x, g.player.position.z], mapWrap: document.getElementById('minimap-wrap').classList.contains('hidden'), staminaWrap: document.getElementById('stamina-wrap').classList.contains('hidden') };
  });
  addCheck('restart-reset', '7 暂停/恢复', '重新开始：奶片/解锁/出口/位置归零', restarted.state === 'playing' && restarted.candies === 0 && !restarted.map && !restarted.speed && !restarted.exit && restarted.mapWrap && restarted.staminaWrap && Math.hypot(restarted.pos[0] - 8, restarted.pos[1] - 8) < 0.8, JSON.stringify(restarted), [], 'blocking');
  await page.keyboard.press('Escape');
  await waitState('paused', 10000);
  await page.click('#btn-menu');
  await waitState('menu', 10000);
  addCheck('pause-menu', '7 暂停/恢复', '暂停→返回主菜单', true, 'state menu', [], 'major');
  await reloadToMenu('before-frogs');

  // ---------------- 6. 奶蛙 ----------------
  await startHumanToPlay();
  await page.evaluate(() => { window.__game.grace = 9999; window.__game.frogs.grace = 0; });
  await collectCandies(0, 0);
  await page.waitForTimeout(800);
  const frogActive = await page.evaluate(() => ({ active: window.__game.frogs.active, sfxAlert: window.__qa.sfx.includes('sfx_frog_alert') }));
  addCheck('frog-activate', '6 奶蛙', '拾取后奶蛙激活并播放 alert', frogActive.active && frogActive.sfxAlert, JSON.stringify(frogActive), [], 'major');
  await page.evaluate(() => {
    const g = window.__game; const f = g.frogs.frogs[0];
    f.stillT = 5;
    g.player.position.set(f.pos.x + 2.2, 0, f.pos.z);
    g.player.velocity.set(0, 0, 0);
    g.player.yaw = Math.PI / 2;
    g.frogs.nearLineCooldown = 0;
    g.grace = 9999; g.frogs.grace = 0;
  });
  await page.waitForTimeout(3000);
  const frogAudio = await page.evaluate(() => {
    const g = window.__game;
    return {
      nearest: g.frogs.nearest,
      frogGain: g.audio.frogs[0] ? g.audio.frogs[0].gain.gain.value : -1,
      heartbeat: g.audio.heartbeat ? g.audio.heartbeat.gain.gain.value : -1,
      subShow: document.getElementById('subtitles').classList.contains('show'),
      subText: document.getElementById('sub-text').textContent,
      subSpeaker: document.getElementById('sub-speaker').textContent,
    };
  });
  await shot('frog-close-1280');
  addCheck('frog-audio', '6 奶蛙', '靠近奶蛙：gain/heartbeat > 0 且字幕出现', frogAudio.nearest < 7 && frogAudio.frogGain > 0.005 && frogAudio.heartbeat > 0.005 && frogAudio.subShow && frogAudio.subText.length > 0, JSON.stringify(frogAudio), ['tools/qa/out/frog-close-1280.png'], 'blocking');
  await page.evaluate(() => {
    const g = window.__game; const f = g.frogs.frogs[0];
    f.stillT = 5;
    g.player.position.set(f.pos.x - 1.6, 0, f.pos.z);
    g.player.velocity.set(0, 0, 0);
    g.grace = 0; g.frogs.grace = 0;
  });
  await page.waitForFunction(() => ['caught', 'lose'].includes(window.__game.state), null, { timeout: 30000, polling: 100 });
  const caughtState = await state();
  await page.waitForTimeout(1000);
  const caughtSnap = await page.evaluate(() => ({ state: window.__game.state, jumpscare: !document.getElementById('jumpscare').classList.contains('hidden'), frozen: window.__game.player.frozen }));
  await page.waitForFunction(() => window.__game.state === 'lose', null, { timeout: 12000, polling: 100 });
  await page.waitForTimeout(400);
  const loseVisible = await page.evaluate(() => ({ visible: !document.getElementById('lose').classList.contains('hidden'), text: document.querySelector('#lose h2').textContent }));
  await shot('lose-1280');
  addCheck('frog-catch', '6 奶蛙', '站立不动会被抓：caught→lose', caughtState === 'caught' && caughtSnap.jumpscare && caughtSnap.frozen && loseVisible.visible, JSON.stringify({ caughtState, caughtSnap, loseVisible }), ['tools/qa/out/lose-1280.png'], 'blocking');
  await page.click('#btn-lose-retry');
  await waitState('playing', 10000);
  await waitFn(() => !!document.pointerLockElement, null, 8000).catch(() => {});
  await page.waitForTimeout(500);
  await page.evaluate(() => { window.__game.grace = 9999; });
  await collectCandies(0, 0);
  await page.evaluate(() => {
    const g = window.__game; const f = g.frogs.frogs[0];
    g.player.position.set(f.pos.x - 2.2, 0, f.pos.z);
    g.player.velocity.set(0, 0, 0);
    g.player.yaw = Math.PI / 2;
    f.stillT = 0;
    g.grace = 0; g.frogs.grace = 0;
  });
  const nearest0 = await page.evaluate(() => window.__game.frogs.nearest);
  await page.keyboard.down('w');
  await page.waitForTimeout(7000);
  await page.keyboard.up('w');
  await page.waitForTimeout(300);
  const movingResult = await page.evaluate(() => ({ state: window.__game.state, nearest: window.__game.frogs.nearest, speed: Math.hypot(window.__game.player.velocity.x, window.__game.player.velocity.z) }));
  addCheck('frog-move-safe', '6 奶蛙', '移动时不会被抓（保持 playing）', movingResult.state === 'playing', JSON.stringify({ nearest0, movingResult }), [], 'blocking');
  await page.evaluate(() => {
    const g = window.__game;
    g.player.position.set(8, 0, 8); g.player.velocity.set(0, 0, 0); g.player.yaw = -Math.PI * 0.75;
    g.player.speedUnlocked = true; g.player.stamina = 100; g.grace = 9999; g.frogs.grace = 0;
  });
  await page.keyboard.down('Shift');
  await page.keyboard.down('w');
  await page.waitForTimeout(9000);
  const daze = await page.evaluate(() => ({ states: window.__game.frogs.frogs.map((f) => f.state), stamina: window.__game.player.stamina, sprinting: window.__game.player.sprinting }));
  await page.keyboard.up('w');
  await page.keyboard.up('Shift');
  addCheck('frog-daze', '6 奶蛙', '冲刺把它们甩到 daze', daze.states.filter((s) => s === 'dazed').length > 0, JSON.stringify(daze), [], 'major');
  await page.keyboard.press('Escape');
  await waitState('paused', 10000);
  await page.click('#btn-menu');
  await waitState('menu', 10000);

  // ---------------- 8. Demo ----------------
  await page.click('#btn-demo');
  await waitState('demo', 20000);
  await page.waitForTimeout(10000);
  const demoReal = await page.evaluate(() => {
    const g = window.__game;
    return {
      state: g.state, active: g.demo.active, candies: g.candiesCollected, playTime: g.playTime,
      banner: !document.getElementById('demo-banner').classList.contains('hidden'),
      hud: !document.getElementById('hud').classList.contains('hidden'),
      music: g.audio.musicKey, ctx: g.audio.ctx.state,
      sfx: window.__qa.sfx.slice(), musicLog: window.__qa.music.slice(),
    };
  });
  await shot('demo-10s-1280');
  addCheck('demo-real-10s', '8 Demo', '真实点击 Demo：10 秒内自动游玩、HUD/音频工作', (demoReal.state === 'demo' || demoReal.state === 'win') && demoReal.active && demoReal.banner && demoReal.hud && demoReal.playTime > 0.2 && demoReal.music === 'amb_game' && demoReal.ctx === 'running', JSON.stringify(demoReal), ['tools/qa/out/demo-10s-1280.png'], 'blocking');
  await page.keyboard.press('Escape');
  await waitState('menu', 10000);
  const demoEsc = await page.evaluate(() => ({ state: window.__game.state, banner: !document.getElementById('demo-banner').classList.contains('hidden') }));
  addCheck('demo-esc', '8 Demo', 'ESC 退出 Demo 回菜单', demoEsc.state === 'menu' && !demoEsc.banner, JSON.stringify(demoEsc), [], 'major');
  const sim = await page.evaluate(() => {
    const g = window.__game;
    g.demo.stop();
    g.resetStage(true);
    for (const id of ['menu', 'loading', 'story', 'ready', 'pause', 'win', 'lose', 'help']) {
      const el = document.getElementById(id); if (el) el.classList.add('hidden');
    }
    g.ui.showHud(); g.ui.setDemo(true);
    g.state = 'demo'; g.mode = 'demo'; g.player.lookEnabled = false;
    g.demo.start();
    const log = [];
    let i = 0;
    for (; i < 3600; i++) {
      if (g.state !== 'demo') break;
      g.updatePlay(0.05, i * 0.05);
      if (i % 100 === 0) {
        log.push({
          t: +(i * 0.05).toFixed(1), candies: g.candiesCollected, route: g.demo.routeIndex,
          x: +g.player.position.x.toFixed(1), z: +g.player.position.z.toFixed(1),
          sprint: g.player.sprinting, stamina: +g.player.stamina.toFixed(0),
          dazed: g.frogs.frogs.filter((f) => f.state === 'dazed').length,
          near: +g.frogs.nearest.toFixed(1), state: g.state,
        });
      }
    }
    return {
      steps: i, simTime: +(i * 0.05).toFixed(1), state: g.state, candies: g.candiesCollected,
      route: g.demo.routeIndex, reachedExit: g.demo.reachedExit,
      mapUnlocked: g.mapUnlocked, speedUnlocked: g.speedUnlocked, log,
    };
  });
  addCheck('demo-sim-logic', '8 Demo', 'Demo 完整逻辑：自动拾取 8 片→解锁→到出口', sim.candies === 8 && sim.route >= 8 && sim.reachedExit && sim.mapUnlocked && sim.speedUnlocked, JSON.stringify({ steps: sim.steps, simTime: sim.simTime, state: sim.state, candies: sim.candies, route: sim.route, reachedExit: sim.reachedExit, map: sim.mapUnlocked, speed: sim.speedUnlocked }), [], 'blocking');
  await page.waitForFunction(() => window.__game.state === 'win', null, { timeout: 15000, polling: 100 });
  await page.waitForTimeout(600);
  const demoWin = await page.evaluate(() => ({ visible: !document.getElementById('win').classList.contains('hidden'), stats: [...document.querySelectorAll('#win-stats .v')].map((e) => e.textContent) }));
  await shot('demo-win-1280');
  addCheck('demo-win', '8 Demo', 'Demo 到出口→胜利页统计', demoWin.visible && demoWin.stats.length === 3, JSON.stringify(demoWin), ['tools/qa/out/demo-win-1280.png'], 'major');
  await page.waitForFunction(() => window.__game.state === 'menu', null, { timeout: 15000, polling: 100 });
  const demoReturn = await page.evaluate(() => ({ state: window.__game.state, menu: !document.getElementById('menu').classList.contains('hidden'), banner: !document.getElementById('demo-banner').classList.contains('hidden') }));
  addCheck('demo-auto-return', '8 Demo', 'Demo 结束自动回主菜单', demoReturn.state === 'menu' && demoReturn.menu && !demoReturn.banner, JSON.stringify(demoReturn), [], 'major');
  await reloadToMenu('before-results');

  // ---------------- 9. 胜负（人类流程） ----------------
  await startHumanToPlay();
  await page.evaluate(() => { window.__game.grace = 9999; });
  await collectCandies(0, 7);
  await page.waitForTimeout(500);
  await page.evaluate(() => { const g = window.__game; const ex = g.world.exitInfo; g.player.position.set(ex.x - 2.0, 0, ex.z); g.player.yaw = -Math.PI / 2; });
  await page.waitForTimeout(700);
  await page.keyboard.press('e');
  await page.waitForFunction(() => window.__game.state === 'win', null, { timeout: 15000, polling: 100 });
  await page.waitForTimeout(500);
  const winInfo = await page.evaluate(() => ({
    visible: !document.getElementById('win').classList.contains('hidden'),
    h2: document.querySelector('#win h2').textContent,
    stats: [...document.querySelectorAll('#win-stats .k')].map((e) => e.textContent),
    vals: [...document.querySelectorAll('#win-stats .v')].map((e) => e.textContent),
  }));
  await shot('win-1280');
  addCheck('win-stats', '9 胜负', '胜利页显示统计（时间/奶片/惊险）', winInfo.visible && winInfo.stats.join(',') === '存活时间,奶片,惊险时刻' && winInfo.vals[1] === '8 / 8', JSON.stringify(winInfo), ['tools/qa/out/win-1280.png'], 'blocking');
  await page.click('#btn-win-replay');
  await waitState('playing', 10000);
  await waitFn(() => !!document.pointerLockElement, null, 8000).catch(() => {});
  await page.waitForTimeout(500);
  const replayReset = await page.evaluate(() => ({ candies: window.__game.candiesCollected, map: window.__game.mapUnlocked, speed: window.__game.speedUnlocked }));
  addCheck('win-replay', '9 胜负', '胜利页再玩一次→重置', replayReset.candies === 0 && !replayReset.map && !replayReset.speed, JSON.stringify(replayReset), [], 'major');
  await page.evaluate(() => { window.__game.grace = 9999; });
  await collectCandies(0, 7);
  await page.evaluate(() => { const g = window.__game; const ex = g.world.exitInfo; g.player.position.set(ex.x - 2.0, 0, ex.z); g.player.yaw = -Math.PI / 2; });
  await page.waitForTimeout(600);
  await page.keyboard.press('e');
  await page.waitForFunction(() => window.__game.state === 'win', null, { timeout: 15000, polling: 100 });
  await page.waitForTimeout(400);
  await page.click('#btn-win-menu');
  await waitState('menu', 10000);
  addCheck('win-menu', '9 胜负', '胜利页返回主菜单', true, 'state menu', [], 'minor');
  await startHumanToPlay();
  await page.evaluate(() => { const g = window.__game; g.grace = 0; g.frogs.grace = 0; g.onCaught(g.frogs.frogs[0]); });
  await page.waitForFunction(() => window.__game.state === 'lose', null, { timeout: 12000, polling: 100 });
  await page.waitForTimeout(500);
  const loseInfo = await page.evaluate(() => ({ visible: !document.getElementById('lose').classList.contains('hidden'), h2: document.querySelector('#lose h2').textContent }));
  await shot('lose-triggered-1280');
  addCheck('lose-page', '9 胜负', '失败页出现并可重试', loseInfo.visible && loseInfo.h2.includes('被找到'), JSON.stringify(loseInfo), ['tools/qa/out/lose-triggered-1280.png'], 'blocking');
  await page.click('#btn-lose-retry');
  await waitState('playing', 10000);
  await page.waitForTimeout(600);
  const loseRetry = await page.evaluate(() => ({ state: window.__game.state, candies: window.__game.candiesCollected }));
  addCheck('lose-retry', '9 胜负', '失败页再试一次→重置并进入游玩', loseRetry.state === 'playing' && loseRetry.candies === 0, JSON.stringify(loseRetry), [], 'major');
  await page.keyboard.press('Escape');
  await waitState('paused', 10000);
  await page.click('#btn-menu');
  await waitState('menu', 10000);
  await reloadToMenu('before-resolutions');

  // ---------------- 10. 分辨率 ----------------
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.waitForTimeout(1200);
  await ensureMenu();
  await shot('menu-1920');
  await startHumanToPlay();
  await page.evaluate(() => { window.__game.grace = 9999; });
  await collectCandies(0, 7);
  await page.evaluate(() => { const g = window.__game; const ex = g.world.exitInfo; g.player.position.set(ex.x - 2.2, 0, ex.z); g.player.yaw = -Math.PI / 2; });
  await page.waitForTimeout(1200);
  const snap1920 = await layoutSnapshot();
  await shot('play-1920');
  checkLayout('1920x1080', snap1920);
  await page.keyboard.press('e');
  await page.waitForFunction(() => window.__game.state === 'win', null, { timeout: 15000, polling: 100 });
  await page.waitForTimeout(600);
  const win1920 = await page.evaluate(() => {
    const el = document.querySelector('#win .result-inner'); const r = el.getBoundingClientRect();
    return { visible: !document.getElementById('win').classList.contains('hidden'), rect: { x: r.x, y: r.y, w: r.width, h: r.height }, vw: innerWidth, vh: innerHeight, scrollW: document.documentElement.scrollWidth, scrollH: document.documentElement.scrollHeight };
  });
  await shot('win-1920');
  const winFits = win1920.rect.x >= -1 && win1920.rect.y >= -1 && win1920.rect.x + win1920.rect.w <= win1920.vw + 1 && win1920.rect.y + win1920.rect.h <= win1920.vh + 1 && win1920.scrollW <= win1920.vw + 1;
  addCheck('win-layout-1920', '10 分辨率/HUD', '胜利页 1920×1080 不溢出', winFits, JSON.stringify(win1920), ['tools/qa/out/win-1920.png'], 'major');

  // ---------------- 11. 音频资产 ----------------
  const audioInfo = await page.evaluate(() => {
    const a = window.__game.audio;
    const out = { size: a.buffers.size, keys: [...a.buffers.keys()], durations: {}, manifestKeys: a.manifest ? Object.keys(a.manifest.tracks) : [], manifest: a.manifest ? a.manifest.tracks : {}, ctx: a.ctx ? a.ctx.state : 'none', frogs: a.frogs.length, heartbeat: !!a.heartbeat, voiceKeys: window.__qa.voice.slice(), musicKeys: window.__qa.music.slice(), sfxKeys: [...new Set(window.__qa.sfx)] };
    for (const [k, b] of a.buffers) out.durations[k] = +b.duration.toFixed(2);
    return out;
  });
  const required = ['music_menu', 'music_story', 'amb_game', 'heartbeat',
    'vo_01', 'vo_02', 'vo_03', 'vo_04', 'vo_05',
    'frog_voice_1', 'frog_voice_2', 'frog_voice_3', 'frog_voice_4',
    'sfx_click', 'sfx_start_sting', 'sfx_pickup', 'sfx_unlock_map', 'sfx_unlock_speed',
    'sfx_exit_open', 'sfx_win', 'sfx_lose', 'sfx_screech', 'sfx_footstep_1',
    'sfx_footstep_2', 'sfx_sprint', 'sfx_frog_alert'];
  const missing = required.filter((k) => !audioInfo.manifestKeys.includes(k) && !audioInfo.keys.includes(k));
  const extra = audioInfo.manifestKeys.filter((k) => !required.includes(k));
  const extraUnexpected = extra.filter((k) => k !== 'sfx_ui_hover');
  addCheck('audio-load', '11 音频资产', 'WAV 全部解码加载（27/27）且 frogs=4、heartbeat 已建', audioInfo.size === 27 && audioInfo.frogs === 4 && audioInfo.heartbeat === true, 'buffers.size=' + audioInfo.size + '/27, ctx=' + audioInfo.ctx + ', manifest=' + audioInfo.manifestKeys.length + ', frogs=' + audioInfo.frogs + ', heartbeat=' + audioInfo.heartbeat, [], 'major');
  addCheck('audio-keys', '11 音频资产', 'manifest 键齐全（26 必需 + 可选 sfx_ui_hover）', missing.length === 0 && extraUnexpected.length === 0, 'missing=' + JSON.stringify(missing) + ', extra=' + JSON.stringify(extra) + ', unexpected=' + JSON.stringify(extraUnexpected), [], 'major');
  const durMismatch = Object.entries(audioInfo.manifest).filter(([k, t]) => audioInfo.durations[k] && Math.abs(audioInfo.durations[k] - t.duration) > 0.15).map(([k, t]) => k + ':' + audioInfo.durations[k] + ' vs ' + t.duration);
  addCheck('audio-duration', '11 音频资产', 'manifest 时长与解码 buffer 一致', durMismatch.length === 0, 'mismatch=' + JSON.stringify(durMismatch), [], 'minor');
  const wavs = fs.readdirSync(path.join(ROOT, 'assets', 'audio')).filter((f) => f.endsWith('.wav'));
  const badWav = wavs.filter((f) => { const b = fs.readFileSync(path.join(ROOT, 'assets', 'audio', f)); return b.length < 100 || b.toString('ascii', 0, 4) !== 'RIFF' || b.toString('ascii', 8, 12) !== 'WAVE'; });
  addCheck('audio-wav-headers', '11 音频资产', 'WAV 文件头有效（RIFF/WAVE）', badWav.length === 0 && wavs.length > 0, 'wav=' + wavs.length + ', bad=' + JSON.stringify(badWav), [], 'minor');

  // ---------------- 12. 交付自检 ----------------
  const indexHtml = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const extRefs = [...indexHtml.matchAll(/(?:src|href)\s*=\s*["'](https?:\/\/[^"']+)/g)].map((m) => m[1]);
  addCheck('deliver-no-cdn', '12 交付自检', 'index.html 无 CDN/外链', extRefs.length === 0, 'externalRefs=' + JSON.stringify(extRefs), [], 'blocking');
  const three = fs.readFileSync(path.join(ROOT, 'vendor', 'three.module.js'), 'utf8');
  const threeImports = [...three.matchAll(/^\s*import\b/gm)].length + [...three.matchAll(/from\s+['"]https?:/g)].length;
  const revMatch = three.match(/REVISION\s*=\s*['"](\d+)['"]/);
  addCheck('deliver-three', '12 交付自检', 'vendor/three.module.js 自包含、无 import', threeImports === 0 && revMatch && revMatch[1] === '160', 'imports=' + threeImports + ', REVISION=' + (revMatch ? revMatch[1] : '?'), [], 'blocking');
  let srcExternal = [];
  let aiRefs = [];
  const walk = (dir) => {
    for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, f.name);
      if (f.isDirectory()) walk(p);
      else if (/\.(js|mjs|html|css)$/.test(f.name)) {
        const s = fs.readFileSync(p, 'utf8');
        for (const m of s.matchAll(/https?:\/\/[^\s"')]+/g)) { if (!/w3\.org/.test(m[0])) srcExternal.push(rel(p) + ': ' + m[0]); }
        for (const m of s.matchAll(/openai|anthropic|deepseek|api\.|cdn\.|unpkg|jsdelivr/gi)) aiRefs.push(rel(p) + ': ' + m[0]);
      }
    }
  };
  walk(path.join(ROOT, 'src'));
  addCheck('deliver-local', '12 交付自检', '游戏不依赖网络/AI 服务（源码扫描）', srcExternal.length === 0 && aiRefs.length === 0, 'external=' + JSON.stringify(srcExternal) + ', ai=' + JSON.stringify(aiRefs), [], 'blocking');
  const readme = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8');
  const readmeStale = /Starfall Salvage|jsDelivr|six energy|six glowing|internet access/i.test(readme);
  const readmeHasServe = /python\s+serve\.py|npm\s+run\s+start/.test(readme);
  addCheck('deliver-readme', '12 交付自检', 'README 运行命令可执行、内容与游戏一致', !readmeStale && readmeHasServe, 'stale=' + readmeStale + ', hasServeCommand=' + readmeHasServe + ', head=' + JSON.stringify(readme.slice(0, 120)), [], 'major');
  let serveResult = { ok: false };
  try {
    const port = 8033;
    const child = spawn('python', ['serve.py', String(port)], { cwd: ROOT, stdio: 'ignore', env: Object.assign({}, process.env, { NO_BROWSER: '1' }) });
    await new Promise((r) => setTimeout(r, 1700));
    let ok = false;
    for (let i = 0; i < 15; i++) {
      try { const res = await fetch('http://127.0.0.1:' + port + '/'); if (res.ok) { ok = true; break; } } catch (e) { /* retry */ }
      await new Promise((r) => setTimeout(r, 250));
    }
    const statuses = {};
    let manifestBytes = 0;
    if (ok) {
      for (const u of ['/', '/assets/audio/manifest.json']) {
        const r = await fetch('http://127.0.0.1:' + port + u);
        statuses[u] = r.status;
        if (u.endsWith('manifest.json')) manifestBytes = (await r.arrayBuffer()).byteLength;
      }
    }
    try { execFileSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' }); } catch (e) { /* ignore */ }
    serveResult = { port: port, ok: ok, statuses: statuses, manifestBytes: manifestBytes };
    addCheck('deliver-serve', '12 交付自检', 'serve.py 可启动并正确返回资源（NO_BROWSER=1, 8033）', ok && statuses['/'] === 200 && statuses['/assets/audio/manifest.json'] === 200 && manifestBytes > 5000, JSON.stringify(serveResult), [], 'blocking');
  } catch (e) {
    addCheck('deliver-serve', '12 交付自检', 'serve.py 可启动并正确返回资源（NO_BROWSER=1, 8033）', false, 'serve probe error: ' + e.message, [], 'blocking');
  }
  const audioDoc = fs.readFileSync(path.join(ROOT, 'docs', 'AUDIO.md'), 'utf8');
  const texDoc = fs.readFileSync(path.join(ROOT, 'docs', 'TEXTURES.md'), 'utf8');
  const genAudio = fs.existsSync(path.join(ROOT, 'tools', 'gen_audio.py'));
  addCheck('deliver-assets', '12 交付自检', '素材原创/程序生成声明与生成脚本齐全', /原创|程序化|没有第三方|无第三方/.test(audioDoc + texDoc) && genAudio, 'gen_audio.py=' + genAudio + ', AUDIO.md=' + audioDoc.length + 'B, TEXTURES.md=' + texDoc.length + 'B', [], 'major');
  const configSrc = fs.readFileSync(path.join(ROOT, 'src', 'config.js'), 'utf8');
  const storyBlock = configSrc.match(/export const STORY = \[[\s\S]*?\];/);
  const storyLines = storyBlock ? (storyBlock[0].match(/text:\s*'/g) || []).length : -1;
  const contractSrc = fs.readFileSync(path.join(ROOT, 'docs', 'CONTRACT.md'), 'utf8');
  const contractNarr = (contractSrc.match(/^[1-6]\.\s.+$/gm) || []).length;
  addCheck('deliver-story-contract', '12 交付自检', '旁白 5 句与更新后的契约同步（vo_01..vo_05，无 vo_06）', storyLines === 5 && contractNarr === 5 && !audioInfo.manifestKeys.includes('vo_06') && /vo_06.*删除/.test(contractSrc), 'config STORY lines=' + storyLines + ', contract lines=' + contractNarr + ', vo_06=' + audioInfo.manifestKeys.includes('vo_06'), [], 'major');

  // ---------------- 汇总 ----------------
  addCheck('final-console', '1 冷启动', '整轮运行 0 console error / 0 pageerror', consoleErrors.length === 0 && pageErrors.length === 0, 'consoleError=' + consoleErrors.length + ', pageerror=' + pageErrors.length + ', warning=' + consoleWarnings.length, [], 'blocking');
  addCheck('final-network', '1 冷启动', '整轮网络请求同源、无 4xx/5xx/failed', external.length === 0 && badResponses.length === 0 && requestFailures.length === 0, 'bad=' + JSON.stringify(badResponses) + ', failed=' + JSON.stringify(requestFailures), [], 'blocking');

  const summary = {
    total: checks.length,
    pass: checks.filter((c) => c.status === 'PASS').length,
    fail: checks.filter((c) => c.status === 'FAIL').length,
  };
  const report = {
    generatedAt: new Date().toISOString(),
    startedAt: startedAt.toISOString(),
    durationMs: Date.now() - startedAt.getTime(),
    baseUrl: BASE,
    browser: { executable: EDGE, headless: true, args: ARGS, version: browser.version() },
    viewport: { primary: '1280x720', additional: '1920x1080' },
    summary,
    checks,
    failures: checks.filter((c) => c.status === 'FAIL'),
    console: { errors: consoleErrors, warnings: consoleWarnings, pageErrors },
    network: { requestCount: requests.length, origins, external, badResponses, requestFailures },
    audio: { buffers: audioInfo.size, frogs: audioInfo.frogs, heartbeat: audioInfo.heartbeat, keys: audioInfo.keys, manifestKeys: audioInfo.manifestKeys, missing, extra, durations: audioInfo.durations, voiceKeys: audioInfo.voiceKeys, musicKeys: audioInfo.musicKeys, sfxKeys: audioInfo.sfxKeys },
    demo: { real10s: demoReal, sim: { steps: sim.steps, simTime: sim.simTime, state: sim.state, candies: sim.candies, route: sim.route, reachedExit: sim.reachedExit, log: sim.log }, win: demoWin, autoReturn: demoReturn },
    screenshots,
    notes,
  };
  fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2));
  reportWritten = true;
  console.log('\nSUMMARY ' + JSON.stringify(summary));
  console.log('REPORT ' + rel(path.join(OUT, 'report.json')));
  if (summary.fail) console.log('FAILED: ' + checks.filter((c) => c.status === 'FAIL').map((c) => c.id).join(', '));
  return report;
}

let fatal = null;
try {
  await main();
} catch (e) {
  fatal = e;
  console.error('FATAL', e && e.stack || e);
} finally {
  if (page && !reportWritten) {
    try {
      const report = {
        generatedAt: new Date().toISOString(),
        fatal: fatal ? String(fatal.stack || fatal) : null,
        checks,
        failures: checks.filter((c) => c.status === 'FAIL'),
        console: { errors: consoleErrors, warnings: consoleWarnings, pageErrors },
        network: { requestCount: requests.length, badResponses, requestFailures },
        screenshots,
        notes,
      };
      fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2));
    } catch (e) { /* ignore */ }
  }
  if (browser) await browser.close().catch(() => {});
  if (fatal) process.exitCode = 1;
}
