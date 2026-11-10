// 校验每个奶片格子：是否可行走、是否被家具占住、离门洞是否太近
import { launch } from './cdp.mjs';
const api = await launch({ width: 1280, height: 720 });
try {
  await api.goto('http://127.0.0.1:8123/index.html?debug=1', 2500);
  await api.waitFor("window.__mfp && window.__mfp.state === 'menu'", { timeout: 150000 });
  const res = await api.evaluate(async () => {
    const cfg = await import('./src/config.js');
    const w = window.__mfp.world;
    const C = 3.2;
    const doors = new Set(cfg.DOORS.map(([x, z]) => x + ',' + z));
    const out = [];
    cfg.CANDY_CELLS.forEach(([cx, cz], i) => {
      const wx = (cx + 0.5) * C, wz = (cz + 0.5) * C;
      const walkable = w.isWalkable(cx, cz);
      const botFree = w.isBotWalkable(cx, cz);
      const blocked = w.pointBlocked(wx, wz, 0.3);
      const nearDoor = [...doors].some((k) => {
        const [dx, dz] = k.split(',').map(Number);
        return Math.abs(dx - cx) + Math.abs(dz - cz) <= 1;
      });
      let worst = null;
      for (const o of w.obstacles) {
        const gap = Math.max(Math.abs(wx - o.x) - o.hx, Math.abs(wz - o.z) - o.hz);
        if (worst === null || gap < worst.gap) worst = { gap: +gap.toFixed(2), at: [+o.x.toFixed(1), +o.z.toFixed(1)] };
      }
      out.push({ i, cell: [cx, cz], walkable, botFree, blocked, nearDoor, nearestObstacleGap: worst && worst.gap });
    });
    return { total: cfg.CANDY_CELLS.length, list: out };
  });
  console.log('total', res.total);
  for (const c of res.list) {
    const bad = !c.walkable || !c.botFree || c.blocked || c.nearDoor;
    console.log((bad ? '!! ' : '   ') + String(c.i).padStart(2) + ' 格子(' + c.cell.join(',') + ') 走=' + (c.walkable ? 'Y' : 'N')
      + ' 空=' + (c.botFree ? 'Y' : 'N') + ' 挡=' + (c.blocked ? 'Y' : 'N') + ' 近门=' + (c.nearDoor ? 'Y' : 'N')
      + ' 最近家具间隙=' + c.nearestObstacleGap);
  }
} finally { await api.close(); }
