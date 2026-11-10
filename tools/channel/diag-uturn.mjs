import { launch } from './cdp.mjs';
const api = await launch({ width: 1280, height: 720 });
try {
  await api.goto('http://127.0.0.1:8123/index.html?debug=1', 2500);
  await api.waitFor("window.__mfp && window.__mfp.state === 'menu'", { timeout: 150000 });
  const res = await api.evaluate(() => {
    const g = window.__mfp, st = g.story;
    const sk = st.camSkel;
    // 找出方向突变 > 1.2 rad 的位置，打印前后的坐标
    const out = [];
    for (let i = 2; i < sk.length - 2; i++) {
      const a = Math.atan2(-(sk[i].x - sk[i - 1].x), -(sk[i].z - sk[i - 1].z));
      const b = Math.atan2(-(sk[i + 1].x - sk[i].x), -(sk[i + 1].z - sk[i].z));
      let d = Math.abs(((b - a + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI);
      if (d > 1.2) {
        out.push({
          i, cell: [(sk[i].x / 3.2).toFixed(2), (sk[i].z / 3.2).toFixed(2)],
          turnDeg: +(d * 57.3).toFixed(0),
          prev: [(sk[i - 1].x / 3.2).toFixed(2), (sk[i - 1].z / 3.2).toFixed(2)],
          next: [(sk[i + 1].x / 3.2).toFixed(2), (sk[i + 1].z / 3.2).toFixed(2)],
        });
      }
    }
    const w = g.world;
    return {
      skelPts: sk.length,
      uturns: out.length,
      list: out,
      walkableAt: out.map((o) => w.isWalkable(Math.floor(o.cell[0]), Math.floor(o.cell[1]))),
    };
  });
  console.log(JSON.stringify(res, null, 1).slice(0, 4000));
} finally { await api.close(); }
