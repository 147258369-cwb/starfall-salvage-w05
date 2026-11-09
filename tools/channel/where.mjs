import { launch } from './cdp.mjs';
const api = await launch();
try {
  await api.goto('http://127.0.0.1:8123/index.html?debug=1&channel=internal', 2500);
  await api.waitFor("window.__mfp && window.__mfp.state === 'internal'", { timeout: 120000 });
  const out = await api.evaluate(() => {
    const ch = window.__mfp.channel;
    const ctx = ch.buildContext();
    const cls = ch.cluster(ctx);
    return cls.filter((c) => ['BoxGeometry', 'SphereGeometry', 'CylinderGeometry', 'ConeGeometry'].includes(c.geo))
      .map((c) => ({
        label: c.label, geo: c.geo, center: c.box.getCenter(new c.box.min.constructor()).toArray().map((v) => +v.toFixed(2)),
        min: c.box.min.toArray().map((v) => +v.toFixed(2)), roots: c.roots.length, room: c.room,
      }))
      .filter((c) => c.center[0] > 16 && c.center[0] < 20 && c.center[1] < 1.2 && c.center[2] > 6 && c.center[2] < 10);
  });
  console.log(JSON.stringify(out, null, 1));
} finally { await api.close(); }
