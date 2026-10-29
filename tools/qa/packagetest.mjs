import { chromium } from 'playwright-core';
const edge = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const b = await chromium.launch({ executablePath: edge, headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
const bad = []; const errs = [];
p.on('response', r => { if (r.status() >= 400) bad.push(r.status() + ' ' + r.url()); });
p.on('pageerror', e => errs.push(e.message));
p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
await p.goto('http://127.0.0.1:8021/', { waitUntil: 'networkidle' });
await p.waitForSelector('#loading.hidden', { timeout: 30000 }).catch(() => {});
await p.waitForTimeout(800);
const info = await p.evaluate(() => ({
  state: window.__game.state,
  tracks: window.__game.audio.buffers.size,
  menuVisible: !document.getElementById('menu').classList.contains('hidden'),
  title: document.title,
}));
await p.screenshot({ path: 'tools/qa/out/package-menu.png' });
await p.click('#btn-help'); await p.waitForTimeout(300);
const help = await p.evaluate(() => !document.getElementById('help').classList.contains('hidden'));
await b.close();
console.log(JSON.stringify({ info, help, bad, errs }, null, 2));
