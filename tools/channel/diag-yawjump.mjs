import { launch } from './cdp.mjs';
const api = await launch({ width: 1280, height: 720 });
try {
  await api.goto('http://127.0.0.1:8123/index.html?debug=1', 2500);
  await api.waitFor("window.__mfp && window.__mfp.state === 'menu'", { timeout: 150000 });
  const res = await api.evaluate(() => {
    const g = window.__mfp, st = g.story;
    st.playing = true; st.duration = 32; st.elapsed = 0; st.startCamera();
    const dt = 1 / 60;
    const jumps = [];
    let prev = null;
    for (let t = 0; t <= 32; t += dt) {
      st.elapsed = t; st.update(dt);
      const yaw = g.camera.rotation.y;
      if (prev !== null) {
        let d = ((yaw - prev + 540) % 360) - 180;
        if (Math.abs(d) > 30) jumps.push({ t: +t.toFixed(2), from: +(prev * 57.3).toFixed(1), to: +(yaw * 57.3).toFixed(1), delta: +d.toFixed(1) });
      }
      prev = yaw;
    }
    // 也看展开后的连续值是否单调合理
    return { jumpCount: jumps.length, jumps: jumps.slice(0, 8), camTotal: +(st.camTotal || 0).toFixed(1), skel: st.camSkel?.length };
  });
  console.log(JSON.stringify(res, null, 1));
} finally { await api.close(); }
