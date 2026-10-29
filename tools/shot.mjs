// 通用截图脚本：node tools/shot.mjs <url> <out.png> [waitMs] [w] [h]
import { chromium } from 'playwright-core';

const [url, out, waitMs = '2500', w = '1280', h = '720'] = process.argv.slice(2);
const edge = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const browser = await chromium.launch({
  executablePath: process.env.EDGE_PATH || edge,
  headless: true,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage({ viewport: { width: +w, height: +h } });
page.on('console', (m) => console.log('[console]', m.type(), m.text()));
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto(url, { waitUntil: 'networkidle' });
await page.waitForTimeout(+waitMs);
await page.screenshot({ path: out });
console.log('saved', out);
await browser.close();
