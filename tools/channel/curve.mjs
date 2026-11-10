import { launch } from './cdp.mjs';
import { writeFileSync } from 'node:fs';
const api = await launch({ width: 1280, height: 720 });
try {
  await api.goto('http://127.0.0.1:8123/index.html?debug=1', 2500);
  await api.waitFor("window.__mfp && window.__mfp.state === 'menu'", { timeout: 150000 });
  const res = await api.evaluate(() => {
    const g = window.__mfp, st = g.story;
    st.duration = 32;
    st.playing = true;
    st.elapsed = -1 / 60;
    st.startCamera();
    const FPS = 60, dt = 1 / FPS;
    const rows = [];
    let prevYaw = null, prevPos = null;
    for (let i = 0; i <= 32 * FPS; i++) {
      st.update(dt);          // 真实 update：自己累加 elapsed
      const p = g.camera.position;
      const yaw = g.camera.rotation.y;
      if (prevYaw !== null) {
        let d = ((yaw - prevYaw + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
        rows.push({
          t: +st.elapsed.toFixed(2),
          shot: st.currentShot || '',
          lt: +(st.currentT || 0).toFixed(3),
          turn: +(Math.abs(d) / dt * 180 / Math.PI).toFixed(0),
          speed: +(Math.hypot(p.x - prevPos.x, p.z - prevPos.z) / dt).toFixed(1),
        });
      }
      prevYaw = yaw; prevPos = p.clone();
    }
    const turnVals = rows.map((r) => r.turn).sort((a, b) => a - b);
    const spdVals = rows.map((r) => r.speed).sort((a, b) => a - b);
    const q = (arr, f) => +arr[Math.floor(arr.length * f)].toFixed(1);
    return {
      summary: {
        turn: { p50: q(turnVals, 0.5), p90: q(turnVals, 0.9), p99: q(turnVals, 0.99), max: +turnVals[turnVals.length - 1].toFixed(0) },
        speed: { p50: q(spdVals, 0.5), p90: q(spdVals, 0.9), p99: q(spdVals, 0.99), max: +spdVals[spdVals.length - 1].toFixed(1) },
      },
      rows,
    };
  });
  writeFileSync('out-curve.json', JSON.stringify(res.rows));
  console.log(JSON.stringify(res.summary, null, 1));
} finally { await api.close(); }
