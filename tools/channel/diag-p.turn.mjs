import { launch } from './cdp.mjs';
const api = await launch({ width: 1280, height: 720 });
try {
  await api.goto('http://127.0.0.1:8123/index.html?debug=1', 2500);
  await api.waitFor("window.__mfp && window.__mfp.state === 'menu'", { timeout: 150000 });
  const res = await api.evaluate(() => {
    const g = window.__mfp, st = g.story;
    st.duration = 32;
    const DUR = 32, FPS = 60, dt = 1 / FPS;
    const rows = [];
    let prevYaw = null, prevPos = null;
    for (let i = 0; i <= DUR * FPS; i++) {
      const t = i * dt;
      const p = Math.min(1, t / DUR);
      const pos = st.camPath(p);
      const yaw = st.yawAt(p);
      if (prevYaw !== null) {
        let d = ((yaw - prevYaw + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
        rows.push({
          t: +t.toFixed(2),
          degPerSec: +(Math.abs(d) / dt * 180 / Math.PI).toFixed(1),
          speed: +(Math.hypot(pos.x - prevPos.x, pos.z - prevPos.z) / dt).toFixed(2),
        });
      }
      prevYaw = yaw; prevPos = pos;
    }
    const v = rows.map((r) => r.degPerSec).sort((a, b) => a - b);
    const sp = rows.map((r) => r.speed).sort((a, b) => a - b);
    const over = rows.filter((r) => r.degPerSec > 45);
    const segs = [];
    for (const r of over) {
      const last = segs[segs.length - 1];
      if (last && r.t - last.t1 < 0.2) { last.t1 = r.t; last.max = Math.max(last.max, r.degPerSec); }
      else segs.push({ t0: r.t, t1: r.t, max: r.degPerSec });
    }
    return {
      turn: { median: +v[Math.floor(v.length / 2)].toFixed(1), p90: +v[Math.floor(v.length * 0.9)].toFixed(1), p99: +v[Math.floor(v.length * 0.99)].toFixed(1), max: +v[v.length - 1].toFixed(1) },
      speed: { median: +sp[Math.floor(sp.length / 2)].toFixed(2), p99: +sp[Math.floor(sp.length * 0.99)].toFixed(2), max: +sp[sp.length - 1].toFixed(2) },
      segmentsOver45: segs.map((x) => ({ t0: x.t0, dur: +(x.t1 - x.t0).toFixed(2), max: +x.max.toFixed(0) })),
    };
  });
  console.log(JSON.stringify(res, null, 1));
} finally { await api.close(); }
