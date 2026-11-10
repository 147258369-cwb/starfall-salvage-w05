// 采样转向角速度曲线，看有没有"急转"
import { launch } from './cdp.mjs';
const api = await launch({ width: 1280, height: 720 });
try {
  await api.goto('http://127.0.0.1:8123/index.html?debug=1', 2500);
  await api.waitFor("window.__mfp && window.__mfp.state === 'menu'", { timeout: 150000 });
  const res = await api.evaluate(() => {
    const g = window.__mfp, st = g.story;
    st.playing = true; st.duration = 32; st.elapsed = 0; st.startCamera();
    const dt = 1 / 60;
    // 直接对 yawAt 采样（不经渲染），得到干净的曲线
    const samples = [];
    for (let p = 0; p <= 1; p += 1 / 900) {
      samples.push({ p, yaw: st.yawAt(p) * 180 / Math.PI });
    }
    const rate = [];
    for (let i = 1; i < samples.length; i++) {
      let d = samples[i].yaw - samples[i - 1].yaw;
      d = ((d + 540) % 360) - 180;
      rate.push({ p: +samples[i].p.toFixed(3), rate: +(d / (32 / 900)).toFixed(1) });
    }
    const abs = rate.map((r) => Math.abs(r.rate)).sort((a, b) => a - b);
    const top = [...rate].sort((a, b) => Math.abs(b.rate) - Math.abs(a.rate)).slice(0, 10);
    const peaks = rate.filter((r) => Math.abs(r.rate) > 45).length;
    return {
      rateMedian: +abs[Math.floor(abs.length / 2)].toFixed(1),
      rateP95: +abs[Math.floor(abs.length * 0.95)].toFixed(1),
      rateMax: +abs[abs.length - 1].toFixed(1),
      framesOver45degPerSec: peaks,
      top,
      pivots: (st.camPivots || []).map((p) => ({ s: +p.s.toFixed(1), d: +p.d.toFixed(2) })),
    };
  });
  console.log(JSON.stringify(res, null, 1));
} finally { await api.close(); }
