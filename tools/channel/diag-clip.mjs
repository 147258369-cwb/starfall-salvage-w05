// 剧情镜头"穿模"专项：机位本身有没有进几何体、以及画面中央被什么挡住
import { launch } from './cdp.mjs';
const api = await launch({ width: 1280, height: 720 });
try {
  await api.goto('http://127.0.0.1:8123/index.html?debug=1', 2500);
  await api.waitFor("window.__mfp && window.__mfp.state === 'menu'", { timeout: 150000 });
  const res = await api.evaluate(async () => {
    const THREE = await import('three');
    const g = window.__mfp, st = g.story, w = g.world;
    const items = [];
    w.group.traverse((o) => {
      if (!o.isMesh || !o.visible) return;
      const t = o.geometry?.type;
      if (t === 'PlaneGeometry') return;
      if (o.material && o.material.blending === THREE.AdditiveBlending) return;
      const b = new THREE.Box3().setFromObject(o);
      if (b.isEmpty()) return;
      if (b.max.x - b.min.x > 20) return;
      items.push({ b, name: t, o });
    });
    st.playing = true; st.duration = 32; st.elapsed = 0; st.startCamera();
    const camHits = [];      // 机位进几何体
    const pitchOut = [];     // 俯仰超范围（会看到地面/天花之外）
    let minGap = { d: 99, t: 0 };
    for (let t = 0.2; t < 31.8; t += 1 / 60) {
      st.elapsed = t; st.update(1 / 60);
      const p = g.camera.position;
      for (const it of items) {
        const b = it.b;
        const nx = Math.max(b.min.x, Math.min(p.x, b.max.x));
        const ny = Math.max(b.min.y, Math.min(p.y, b.max.y));
        const nz = Math.max(b.min.z, Math.min(p.z, b.max.z));
        const d = Math.hypot(p.x - nx, p.y - ny, p.z - nz);
        if (d < minGap.d) minGap = { d: +d.toFixed(3), t: +t.toFixed(2), name: it.name, box: [b.min.toArray().map(v=>+v.toFixed(1)), b.max.toArray().map(v=>+v.toFixed(1))] };
        if (d < 0.10) camHits.push({ t: +t.toFixed(2), d: +d.toFixed(3), name: it.name });
      }
      const pitch = g.camera.rotation.x;
      if (pitch > 0.3 || pitch < -0.7) pitchOut.push({ t: +t.toFixed(2), pitch: +(pitch * 57.3).toFixed(1) });
    }
    return {
      cameraInsideGeometry: camHits.length,
      camHits: camHits.slice(0, 10),
      pitchOutOfRange: pitchOut.length,
      minGap,
    };
  });
  console.log(JSON.stringify(res, null, 1));
} finally { await api.close(); }
