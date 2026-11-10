import { launch } from './cdp.mjs';
const api = await launch({ width: 1280, height: 720 });
try {
  await api.goto('http://127.0.0.1:8123/index.html?debug=1', 2500);
  await api.waitFor("window.__mfp && window.__mfp.state === 'menu'", { timeout: 150000 });
  const res = await api.evaluate(() => {
    const g = window.__mfp, st = g.story;
    st.playing = true; st.duration = 32; st.elapsed = 0; st.startCamera();
    const dt = 1 / 60;
    const rows = [];
    let prev = null;
    for (let t = 0; t <= 32; t += dt) {
      st.elapsed = t; st.update(dt);
      const yaw = g.camera.rotation.y;
      if (prev !== null) {
        let d = ((yaw - prev + 540) % 360) - 180;
        rows.push({ t: +t.toFixed(2), degPerSec: +(Math.abs(d) / dt).toFixed(1) });
      }
      prev = yaw;
    }
    const vals = rows.map((r) => r.degPerSec).sort((a, b) => a - b);
    const over = rows.filter((r) => r.degPerSec > 60);
    // 连续超过 60 的时间段
    const segs = [];
    for (const r of over) {
      const last = segs[segs.length - 1];
      if (last && r.t - last.t1 < 0.2) { last.t1 = r.t; last.max = Math.max(last.max, r.degPerSec); }
      else segs.push({ t0: r.t, t1: r.t, max: r.degPerSec });
    }
    return {
      median: +vals[Math.floor(vals.length / 2)].toFixed(1),
      p90: +vals[Math.floor(vals.length * 0.9)].toFixed(1),
      p99: +vals[Math.floor(vals.length * 0.99)].toFixed(1),
      max: +vals[vals.length - 1].toFixed(1),
      segsOver60: segs.map((x) => ({ t0: x.t0, dur: +(x.t1 - x.t0).toFixed(2), max: +x.max.toFixed(0) })),
    };
  });
  console.log(JSON.stringify(res, null, 1));
} finally { await api.close(); }
