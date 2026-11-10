// 逐个检查剧情航点的视线：摄像机向前看，0.9 米处是否撞到墙/家具
import { launch } from './cdp.mjs';
const api = await launch({ width: 1280, height: 720 });
try {
  await api.goto('http://127.0.0.1:8123/index.html?debug=1', 2500);
  await api.waitFor("window.__mfp && window.__mfp.state === 'menu'", { timeout: 150000 });
  const res = await api.evaluate(async () => {
    const THREE = await import('three');
    const g = window.__mfp, st = g.story, w = g.world;
    // 所有网格（排除地面/天花平面与粒子）
    const meshes = [];
    w.group.traverse((o) => {
      if (!o.isMesh || !o.visible) return;
      const t = o.geometry?.type;
      if (t === 'PlaneGeometry') return;
      if (o.material && o.material.blending === THREE.AdditiveBlending) return;
      meshes.push(o);
    });
    st.playing = true; st.duration = 32; st.elapsed = 0; st.startCamera();
    const ray = new THREE.Raycaster();
    const dir = new THREE.Vector3();
    const near = [];
    for (let t = 0.5; t < 31.5; t += 1 / 30) {
      st.elapsed = t; st.update(1 / 30);
      const p = g.camera.position.clone();
      g.camera.getWorldDirection(dir);
      dir.y = 0; dir.normalize();
      ray.set(p, dir);
      ray.far = 3.2;
      const hits = ray.intersectObjects(meshes, false);
      const h = hits.find((x) => x.object.isMesh && !x.object.isInstancedMesh);
      if (h && h.distance < 0.85) near.push({ t: +t.toFixed(2), d: +h.distance.toFixed(2), geo: h.object.geometry?.type, at: [+p.x.toFixed(1), +p.z.toFixed(1)] });
    }
    // 聚合
    const segs = [];
    for (const n of near) {
      const last = segs[segs.length - 1];
      if (last && n.t - last.t1 < 0.25) { last.t1 = n.t; last.min = Math.min(last.min, n.d); }
      else segs.push({ t0: n.t, t1: n.t, min: n.d, geo: n.geo, at: n.at });
    }
    return { count: near.length, segs };
  });
  console.log(JSON.stringify(res, null, 1));
} finally { await api.close(); }
