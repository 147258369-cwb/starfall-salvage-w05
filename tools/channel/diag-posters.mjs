import { launch } from './cdp.mjs';
const api = await launch({ width: 1280, height: 720 });
try {
  await api.goto('http://127.0.0.1:8123/index.html?debug=1&channel=internal', 2500);
  await api.waitFor("window.__mfp && window.__mfp.state === 'internal'", { timeout: 120000 });
  const rows = await api.evaluate(() => {
    const w = window.__mfp.world;
    const C = 3.2;
    const cellOf = (x, z) => [Math.floor(x / C), Math.floor(z / C)];
    return w.posters.map((p) => {
      const nx = Math.sin(p.ry), nz = Math.cos(p.ry);
      const front = [p.x + nx * 0.45, p.z + nz * 0.45];
      const back = [p.x - nx * 0.45, p.z - nz * 0.45];
      const fW = w.isWalkable(...cellOf(front[0], front[1]));
      const bW = w.isWalkable(...cellOf(back[0], back[1]));
      // 海报板面覆盖到的格子（沿墙方向展宽 w/2）
      const half = p.w / 2;
      const span = [];
      for (let t = -half; t <= half; t += 0.2) {
        const sx = p.x + Math.cos(p.ry) * t;
        const sz = p.z - Math.sin(p.ry) * t;
        span.push([sx, sz]);
      }
      const overWalkable = span.filter(([x, z]) => w.isWalkable(...cellOf(x, z))).length;
      return {
        kind: p.kind, x: +p.x.toFixed(2), z: +p.z.toFixed(2), y: p.y,
        ry: +(p.ry).toFixed(2), w: p.w, h: p.h,
        facing: fW ? 'ok' : (bW ? 'FLIPPED' : 'no-room'),
        overWalkable,
        snapped: +(p.snapped || 0).toFixed(3),
        cell: cellOf(p.x, p.z),
      };
    });
  });
  for (const r of rows) {
    const bad = r.facing !== 'ok' || r.overWalkable > 4;
    console.log((bad ? '!! ' : '   ') + [r.kind.padEnd(18), ('(' + r.x + ',' + r.z + ')').padEnd(18), 'ry=' + String(r.ry).padEnd(7), 'w=' + r.w, 'facing=' + r.facing.padEnd(8), '跨行走格=' + r.overWalkable, 'snap=' + r.snapped].join(' '));
  }
} finally { await api.close(); }
