import { launch } from './cdp.mjs';
const api = await launch({ width: 1440, height: 810 });
try {
  await api.goto('http://127.0.0.1:8123/index.html?debug=1&channel=internal', 2500);
  await api.waitFor("window.__mfp && window.__mfp.state === 'internal'", { timeout: 150000 });
  const res = await api.evaluate(async () => {
    const THREE = await import('three');
    const g = window.__mfp, st = g.story;
    const items = [];
    g.world.group.traverse((o) => {
      if (!o.isMesh || !o.visible) return;
      if (o.geometry?.type === 'PlaneGeometry') return;
      if (o.material && o.material.blending === THREE.AdditiveBlending) return;
      const b = new THREE.Box3().setFromObject(o);
      if (b.isEmpty() || b.max.x - b.min.x > 20) return;
      items.push({ b, name: o.geometry.type });
    });
    st.duration = 32; st.playing = true; st.elapsed = 0; st.startCamera();
    let minGap = 99, at = 0;
    for (let i = 0; i < 32 * 60; i++) {
      st.update(1/60);
      const p = g.camera.position;
      for (const it of items) {
        const b = it.b;
        const nx = Math.max(b.min.x, Math.min(p.x, b.max.x));
        const ny = Math.max(b.min.y, Math.min(p.y, b.max.y));
        const nz = Math.max(b.min.z, Math.min(p.z, b.max.z));
        const d = Math.hypot(p.x-nx, p.y-ny, p.z-nz);
        if (d < minGap) { minGap = d; at = +st.elapsed.toFixed(1); }
      }
    }
    // 是否所有采样点都在可行走格内
    let outOfBounds = 0;
    st.playing = true; st.elapsed = 0; st.startCamera();
    for (let i = 0; i < 32 * 60; i++) {
      st.update(1/60);
      const p = g.camera.position;
      if (g.world.pointBlocked(p.x, p.z, 0.15)) outOfBounds++;
    }
    return { minGap: +minGap.toFixed(2), atSecond: at, outOfBoundsFrames: outOfBounds, duration: +st.duration.toFixed(1), railTotal: +st.railTotal.toFixed(1) };
  });
  console.log(JSON.stringify(res, null, 1));
} finally { await api.close(); }
