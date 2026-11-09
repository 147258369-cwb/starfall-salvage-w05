import { launch } from './cdp.mjs';
const api = await launch({ width: 1280, height: 720 });
try {
  await api.goto('http://127.0.0.1:8123/index.html?debug=1&channel=internal', 2500);
  await api.waitFor("window.__mfp && window.__mfp.state === 'internal'", { timeout: 120000 });
  const rows = await api.evaluate(async () => {
    const cfg = await import('./src/config.js');
    const w = window.__mfp.world;
    const C = 3.2;
    const doors = new Set(cfg.DOORS.map(([x, z]) => x + ',' + z));
    const inDoor = (x, z) => doors.has(Math.floor(x / C) + ',' + Math.floor(z / C));
    const out = [];
    for (const p of w.posters) {
      const half = p.w / 2;
      let hit = 0;
      for (let t = -half; t <= half; t += 0.1) {
        const sx = p.x + Math.cos(p.ry) * t;
        const sz = p.z - Math.sin(p.ry) * t;
        if (inDoor(sx, sz)) hit++;
      }
      // 竖向：牌匾是否压到门框横梁（2.73 以上）
      out.push({
        kind: p.kind, x: +p.x.toFixed(2), z: +p.z.toFixed(2), y: p.y, h: p.h, w: p.w,
        ry: +p.ry.toFixed(2),
        doorCells: hit,
        yHi: +(p.y + p.h / 2).toFixed(2), yLo: +(p.y - p.h / 2).toFixed(2),
      });
    }
    return out;
  });
  for (const r of rows) {
    const flag = r.doorCells > 2 ? '  <== 压在门洞上' : '';
    console.log([r.kind.padEnd(18), ('(' + r.x + ',' + r.z + ')').padEnd(18), 'y=' + r.y, 'y范围 ' + r.yLo + '..' + r.yHi, 'w=' + r.w, 'ry=' + r.ry, '门洞采样=' + r.doorCells].join(' ') + flag);
  }
} finally { await api.close(); }
