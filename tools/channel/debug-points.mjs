import { launch } from './cdp.mjs';
const api = await launch();
try {
  await api.goto('http://127.0.0.1:8123/index.html?debug=1&channel=internal', 2500);
  await api.waitFor("window.__mfp && window.__mfp.state === 'internal'", { timeout: 120000 });
  const out = await api.evaluate(() => {
    const ch = window.__mfp.channel;
    const ctx = ch.buildContext();
    const cls = ch.cluster(ctx);
    const pts = [[49.92, 1.65, 3.46, 'chalk'], [50.18, 1.4, 39.04, 'fridge-handle'], [71.52, 1.31, 6.4, 'desk-lamp'], [49.92, 1.17, 49.92, 'party-hat']];
    return pts.map(([x, y, z, tag]) => {
      const cl = cls.find((c) => Math.abs(c.center.x - x) < 0.35 && Math.abs(c.center.y - y) < 0.35 && Math.abs(c.center.z - z) < 0.35);
      if (!cl) return { tag, miss: true };
      const s = ch.supportGap(cl, ctx);
      return {
        tag, label: cl.label, box: [cl.box.min.toArray().map((v) => +v.toFixed(3)), cl.box.max.toArray().map((v) => +v.toFixed(3))],
        gap: +String(s.gap).slice(0, 6), supportY: s.supportY && +s.supportY.toFixed(3), attach: +String(s.attach).slice(0, 6),
        roots: cl.roots.length,
      };
    });
  });
  console.log(JSON.stringify(out, null, 1));
} finally { await api.close(); }
