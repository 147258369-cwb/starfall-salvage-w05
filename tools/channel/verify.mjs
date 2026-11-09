// 复验用户反馈的 10 条 + 找墙上物件重叠
import { launch } from './cdp.mjs';
import { mkdirSync, writeFileSync } from 'node:fs';
mkdirSync('tools/channel/out/verify', { recursive: true });

const api = await launch({ width: 1440, height: 810 });
try {
  await api.goto('http://127.0.0.1:8123/index.html?debug=1&channel=internal', 2500);
  await api.waitFor("window.__mfp && window.__mfp.state === 'internal'", { timeout: 120000 });

  const shot = async (name, x, y, z, yaw, pitch, bright) => {
    const expr = '(() => { const g = window.__mfp; const ch = g.channel;'
      + 'ch.bright = ' + (bright === false ? 'false' : 'true') + '; ch.applyLighting();'
      + 'g.player.position.set(' + x + ',' + y + ',' + z + ');'
      + 'g.player.yaw = ' + yaw + '; g.player.pitch = ' + pitch + ';'
      + 'g.player.updateCamera(0,0); return true; })()';
    await api.evaluate(expr);
    await new Promise((r) => setTimeout(r, 500));
    await api.screenshot('tools/channel/out/verify/' + name + '.png');
  };

  const PI = Math.PI;
  // 1 门框顶部
  await shot('01-doorframe', 12.5, 2.2, 20.5, PI, 0.28);
  // 2/7 海报是否还在门口
  await shot('02-poster-classroom', 33.0, 1.8, 14.72, -PI / 2, 0.0);
  await shot('07-poster-office', 65.5, 1.8, 16.64, -PI / 2, 0.0);
  // 3 生日横幅与食堂北门
  await shot('03-banner', 40.0, 1.9, 40.0, PI, 0.08);
  // 5 出口
  await shot('05-exit', 79.5, 1.7, 46.4, -PI / 2, 0.05);
  // 6 盆栽
  await shot('06-plant', 9.3, 1.6, 27.5, 0.0, -0.25);
  // 8 南墙海报正面（原来是纯黑背面）
  await shot('08-poster-south', 18.0, 1.7, 19.0, PI, 0.0);

  // 找墙上物件两两重叠
  const over = await api.evaluate(() => {
    const w = window.__mfp.world;
    const items = w.posters.map((p) => {
      const nx = Math.sin(p.ry), nz = Math.cos(p.ry);
      // 沿墙方向的切向量
      const tx = Math.cos(p.ry), tz = -Math.sin(p.ry);
      return {
        kind: p.kind, cx: p.x, cz: p.z, y: p.y, w: p.w, h: p.h, nx, nz, tx, tz,
      };
    });
    const pairs = [];
    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        const a = items[i], b = items[j];
        // 法线要平行且方向一致
        if (Math.abs(a.nx * b.nx + a.nz * b.nz) < 0.9) continue;
        // 换到 a 的局部系比较
        const dx = b.cx - a.cx, dz = b.cz - a.cz;
        const along = dx * a.tx + dz * a.tz;         // 沿墙
        const across = dx * a.nx + dz * a.nz;        // 垂直墙
        if (Math.abs(across) > 0.6) continue;
        const overlapAlong = (a.w + b.w) / 2 - Math.abs(along);
        const overlapY = (a.h + b.h) / 2 - Math.abs(a.y - b.y);
        if (overlapAlong > 0.05 && overlapY > 0.05) {
          pairs.push({ a: a.kind, b: b.kind, at: [+a.cx.toFixed(2), +a.cz.toFixed(2)], overlapAlong: +overlapAlong.toFixed(2), overlapY: +overlapY.toFixed(2) });
        }
      }
    }
    return pairs;
  });
  console.log('WALL_OVERLAPS', JSON.stringify(over, null, 1));
  console.log('ERRORS', JSON.stringify(api.errors.slice(0, 6)));
} finally { await api.close(); }
