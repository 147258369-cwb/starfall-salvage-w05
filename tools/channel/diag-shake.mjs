// 量化片头镜头的"抖"：位置增量、转向角速度、加速度
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
      const p = g.camera.position.clone();
      const yaw = g.camera.rotation.y, pitch = g.camera.rotation.x;
      if (prev) {
        const spd = Math.hypot(p.x - prev.p.x, p.z - prev.p.z) / dt;
        let dy = ((yaw - prev.yaw + 540) % 360) - 180;
        const yawRate = dy / dt * 180 / Math.PI;
        const pitchRate = (pitch - prev.pitch) / dt * 180 / Math.PI;
        rows.push({ t: +t.toFixed(2), spd: +spd.toFixed(2), yawRate: +yawRate.toFixed(1), pitchRate: +pitchRate.toFixed(1) });
      }
      prev = { p, yaw, pitch };
    }
    // 速度突变（加速度绝对值大）就是"抽搐"
    const spikes = [];
    for (let i = 1; i < rows.length; i++) {
      const dv = Math.abs(rows[i].spd - rows[i - 1].spd);
      const dw = Math.abs(rows[i].yawRate - rows[i - 1].yawRate);
      if (dv > 2.5 || dw > 90) spikes.push({ t: rows[i].t, dSpeed: +dv.toFixed(1), dYawRate: +dw.toFixed(0), spd: rows[i].spd, yawRate: rows[i].yawRate });
    }
    const speeds = rows.map((r) => r.spd).sort((a, b) => a - b);
    const yawRates = rows.map((r) => Math.abs(r.yawRate)).sort((a, b) => a - b);
    return {
      frames: rows.length,
      speedMedian: +speeds[Math.floor(speeds.length / 2)].toFixed(2),
      speedP95: +speeds[Math.floor(speeds.length * 0.95)].toFixed(2),
      speedMax: +speeds[speeds.length - 1].toFixed(2),
      yawRateMedian: +yawRates[Math.floor(yawRates.length / 2)].toFixed(1),
      yawRateP95: +yawRates[Math.floor(yawRates.length * 0.95)].toFixed(1),
      yawRateMax: +yawRates[yawRates.length - 1].toFixed(1),
      spikeCount: spikes.length,
      spikes: spikes.slice(0, 15),
    };
  });
  console.log(JSON.stringify(res, null, 1));
} finally { await api.close(); }
