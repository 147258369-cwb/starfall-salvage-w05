import { launch } from './cdp.mjs';
const api = await launch({ width: 1280, height: 720 });
try {
  await api.goto('http://127.0.0.1:8123/index.html?debug=1', 2500);
  await api.waitFor("window.__mfp && window.__mfp.state === 'menu'", { timeout: 150000 });
  const res = await api.evaluate(async () => {
    const THREE = await import('three');
    const g = window.__mfp;
    const st = g.story;
    st.playing = true; st.duration = 32; st.elapsed = 0;
    st.startCamera();

    // 收集所有非 InstancedMesh 的可见网格 AABB（排除地面/天花平面）
    const items = [];
    g.world.group.traverse((o) => {
      if (!o.isMesh || !o.visible || o.isInstancedMesh) return;
      const t = o.geometry?.type;
      if (t === 'PlaneGeometry' || t === 'LineSegments') return; // 地面/天花/光斑/海报，跳过
      const b = new THREE.Box3().setFromObject(o);
      if (b.isEmpty()) return;
      if (b.max.x - b.min.x > 20) return; // 大件（墙块合并）跳过
      items.push({ o, b, name: t });
    });

    const step = 1 / 30;
    const hits = [];
    let worst = { d: 99 };
    for (let t = 0; t <= 32; t += step) {
      st.elapsed = t;
      st.update(step);
      const p = g.camera.position;
      for (const it of items) {
        const b = it.b;
        const nx = Math.max(b.min.x, Math.min(p.x, b.max.x));
        const ny = Math.max(b.min.y, Math.min(p.y, b.max.y));
        const nz = Math.max(b.min.z, Math.min(p.z, b.max.z));
        const d = Math.hypot(p.x - nx, p.y - ny, p.z - nz);
        if (d < worst.d) worst = { d: +d.toFixed(3), t: +t.toFixed(2), name: it.name, box: [b.min.toArray().map(v=>+v.toFixed(2)), b.max.toArray().map(v=>+v.toFixed(2))] };
        if (d < 0.12) {
          hits.push({ t: +t.toFixed(2), d: +d.toFixed(3), name: it.name, cam: [+p.x.toFixed(2), +p.y.toFixed(2), +p.z.toFixed(2)], box: [b.min.toArray().map(v=>+v.toFixed(2)), b.max.toArray().map(v=>+v.toFixed(2))] });
        }
      }
    }
    // 按时间聚合成段
    const segs = [];
    for (const h of hits) {
      const last = segs[segs.length - 1];
      if (last && h.t - last.t1 < 0.2) { last.t1 = h.t; last.n.add(h.name); last.min = Math.min(last.min, h.d); }
      else segs.push({ t0: h.t, t1: h.t, n: new Set([h.name]), min: h.d, at: h.cam, box: h.box });
    }
    return {
      worst,
      hitFrames: hits.length,
      segs: segs.map((s) => ({ t0: s.t0, t1: s.t1, minD: +s.min.toFixed(3), geos: [...s.n].join('+'), at: s.at, box: s.box })),
    };
  });
  console.log(JSON.stringify(res, null, 1));
} finally { await api.close(); }
