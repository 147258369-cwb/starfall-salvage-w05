import { launch } from './cdp.mjs';
const api = await launch({ width: 1280, height: 720 });
try {
  await api.goto('http://127.0.0.1:8123/index.html?debug=1', 2500);
  await api.waitFor("window.__mfp && window.__mfp.state === 'menu'", { timeout: 150000 });
  const res = await api.evaluate(() => {
    const g = window.__mfp, st = g.story;
    // 逐弧长打印朝向与变化率
    const STEP = 0.5;
    const rows = [];
    let prev = null;
    for (let s = 0; s <= st.camTotal; s += STEP) {
      const y = st.yawField(s);
      const d = prev === null ? 0 : (y - prev) / STEP; // rad/m
      rows.push({ s: +s.toFixed(1), yaw: +(y * 57.3).toFixed(1), radPerM: +d.toFixed(3) });
      prev = y;
    }
    const worst = [...rows].sort((a, b) => Math.abs(b.radPerM) - Math.abs(a.radPerM)).slice(0, 12);
    // 骨架中相邻点的距离分布
    const sk = st.camSkel;
    const gaps = [];
    for (let i = 1; i < sk.length; i++) gaps.push(+Math.hypot(sk[i].x - sk[i - 1].x, sk[i].z - sk[i - 1].z).toFixed(2));
    const tiny = gaps.filter((g) => g < 0.5).length;
    return { camTotal: +st.camTotal.toFixed(1), skelPts: sk.length, tinyGaps: tiny, gapMin: Math.min(...gaps), gapMax: Math.max(...gaps), worst };
  });
  console.log(JSON.stringify(res, null, 1));
} finally { await api.close(); }
