// 单独渲染奶蛙海报贴图，导出大图看画风
import { launch } from './cdp.mjs';
import { writeFileSync, mkdirSync } from 'node:fs';
mkdirSync('tools/channel/out', { recursive: true });

const html = [
  '<!doctype html><html><head><meta charset="utf-8"><style>',
  'body{margin:0;background:#111;display:grid;place-items:center;height:100vh}',
  'canvas{width:768px;height:768px;image-rendering:auto}',
  '</style><script type="importmap">{"imports":{"three":"/vendor/three.module.js"}}</script></head>',
  '<body><canvas id="c" width="768" height="768"></canvas>',
  '<script type="module">',
  'import { createTextures } from "/src/textures.js";',
  'const t = createTextures();',
  'const src = t.poster("frog").image;',
  'const c = document.getElementById("c");',
  'const g = c.getContext("2d");',
  'g.imageSmoothingQuality = "high";',
  'g.drawImage(src, 0, 0, 768, 768);',
  'window.__done = true;',
  '</script></body></html>',
].join('\n');
writeFileSync('tools/channel/out/poster-preview.html', html);

const api = await launch({ width: 800, height: 800 });
try {
  await api.goto('http://127.0.0.1:8123/tools/channel/out/poster-preview.html', 2500);
  await api.waitFor('window.__done === true', { timeout: 60000 });
  await new Promise((r) => setTimeout(r, 500));
  await api.screenshot('tools/channel/out/poster-frog-new.png');
  console.log('OK', JSON.stringify(api.errors.slice(0, 5)));
} finally { await api.close(); }
