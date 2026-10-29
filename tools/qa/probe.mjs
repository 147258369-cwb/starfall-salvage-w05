// 交互探针：菜单→跳过剧情→进入游戏→截图；node tools/qa/probe.mjs
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const root = process.cwd();
fs.mkdirSync('tools/qa/out', { recursive: true });
const edge = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const browser = await chromium.launch({
  executablePath: process.env.EDGE_PATH || edge,
  headless: true,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message));
await page.goto('http://127.0.0.1:8010/', { waitUntil: 'networkidle' });
await page.waitForSelector('#loading.hidden', { timeout: 30000 }).catch(() => {});
await page.waitForTimeout(1200);
const state = async () => page.evaluate(() => window.__game?.state);
console.log('state after load:', await state());
await page.screenshot({ path: 'tools/qa/out/01-menu.png' });

await page.click('#btn-start');
await page.waitForTimeout(2600);
console.log('state after start:', await state());
await page.screenshot({ path: 'tools/qa/out/02-story.png' });

await page.click('#story-skip');
await page.waitForTimeout(1500);
console.log('state after skip:', await state());
await page.screenshot({ path: 'tools/qa/out/03-ready.png' });

await page.click('#btn-enter');
await page.waitForTimeout(2500);
console.log('state after enter:', await state());
console.log('pointer lock:', await page.evaluate(() => !!document.pointerLockElement));
await page.screenshot({ path: 'tools/qa/out/04-play.png' });

// 按 E 看看出口提示、W 走动
await page.keyboard.down('w');
await page.waitForTimeout(1800);
await page.keyboard.up('w');
await page.waitForTimeout(300);
const info = await page.evaluate(() => {
  const g = window.__game;
  return { state: g.state, pos: [g.player.position.x, g.player.position.z], candies: g.candiesCollected, fps: g.renderer.info.render };
});
console.log('play info:', JSON.stringify(info));
await page.screenshot({ path: 'tools/qa/out/05-play-moved.png' });

console.log('ERRORS:', JSON.stringify(errors, null, 2));
await browser.close();
