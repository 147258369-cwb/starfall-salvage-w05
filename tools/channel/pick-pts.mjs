import { launch } from './cdp.mjs';
const api = await launch({ width: 1677, height: 793 });
try {
  await api.goto('http://127.0.0.1:8123/index.html?debug=1&channel=internal', 2500);
  await api.waitFor("window.__mfp && window.__mfp.state === 'internal'", { timeout: 120000 });
  await api.evaluate("(() => { const g = window.__mfp; g.player.position.set(20.88, 2.34, 19.52); g.player.yaw = 120*Math.PI/180; g.player.pitch = -6*Math.PI/180; g.player.updateCamera(0,0); g.channel.bright = true; g.channel.applyLighting(); })()");
  await new Promise((r) => setTimeout(r, 700));
  const out = await api.evaluate(() => {
    const ch = window.__mfp.channel;
    const pts = [[700, 300], [760, 420], [800, 550], [760, 290], [754, 200], [1000, 430], [1450, 600]];
    return pts.map(([x, y]) => {
      const p = ch.pickAt(x, y);
      if (!p) return { at: [x, y], none: true };
      const q = p.params || {};
      return { at: [x, y], geo: p.geometry, p: [q.width, q.height, q.depth, q.radius, q.radiusTop], color: p.color, hasMap: p.hasMap, point: p.point, cell: p.cell, walkable: p.walkableCell, dist: p.distance };
    });
  });
  console.log(JSON.stringify(out, null, 1));
} finally { await api.close(); }
