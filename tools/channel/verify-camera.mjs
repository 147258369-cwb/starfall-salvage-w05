// 片头镜头三合一验收：位置平滑度 + 转向平滑度 + 不穿墙
import { launch } from './cdp.mjs';
const api = await launch({ width: 1280, height: 720 });
try {
  await api.goto('http://127.0.0.1:8123/index.html?debug=1', 2500);
  await api.waitFor("window.__mfp && window.__mfp.state === 'menu'", { timeout: 150000 });
  const res = await api.evaluate(async () => {
    const THREE = await import('three');
    const g = window.__mfp, st = g.story, w = g.world;
    const C = 3.2;
    const meshes = [];
    w.group.traverse((o) => {
      if (!o.isMesh || !o.visible) return;
      if (o.geometry?.type === 'PlaneGeometry') return;
      if (o.material && o.material.blending === THREE.AdditiveBlending) return;
      const b = new THREE.Box3().setFromObject(o);
      if (b.isEmpty() || b.max.x - b.min.x > 20) return;
      meshes.push({ b, name: o.geometry.type });
    });

    st.playing = true; st.duration = 32; st.elapsed = 0; st.startCamera();
    const dt = 1 / 60;
    let prev = null;
    const spd = [], yawRate = [], pitchRate = [], wallGap = [];
    let inside = 0;
    for (let t = 0; t <= 32; t += dt) {
      st.elapsed = t; st.update(dt);
      const p = g.camera.position.clone();
      const yaw = g.camera.rotation.y, pitch = g.camera.rotation.x;
      if (prev) {
        spd.push(Math.hypot(p.x - prev.p.x, p.z - prev.p.z) / dt);
        let dy = ((yaw - prev.yaw + 540) % 360) - 180;
        yawRate.push(Math.abs(dy) / dt * 180 / Math.PI);
        pitchRate.push(Math.abs((pitch - prev.pitch) / dt * 180 / Math.PI));
      }
      // 与几何最近距离
      let mg = 99;
      for (const it of meshes) {
        const b = it.b;
        const nx = Math.max(b.min.x, Math.min(p.x, b.max.x));
        const ny = Math.max(b.min.y, Math.min(p.y, b.max.y));
        const nz = Math.max(b.min.z, Math.min(p.z, b.max.z));
        const d = Math.hypot(p.x - nx, p.y - ny, p.z - nz);
        if (d < mg) mg = d;
      }
      wallGap.push(mg);
      if (mg < 0.1) inside++;
      prev = { p, yaw, pitch };
    }
    const stat = (a) => {
      const s = [...a].sort((x, y) => x - y);
      return { median: +s[Math.floor(s.length / 2)].toFixed(2), p95: +s[Math.floor(s.length * 0.95)].toFixed(2), max: +s[s.length - 1].toFixed(2) };
    };
    // 速度突变统计（相邻帧速度差最大的几次）
    const dv = [];
    for (let i = 1; i < spd.length; i++) dv.push(Math.abs(spd[i] - spd[i - 1]));
    const dw = [];
    for (let i = 1; i < yawRate.length; i++) dw.push(Math.abs(yawRate[i] - yawRate[i - 1]));
    return {
      speed: stat(spd),
      yawRateDegPerSec: stat(yawRate),
      pitchRateDegPerSec: stat(pitchRate),
      wallGap: { min: +Math.min(...wallGap).toFixed(2) },
      cameraInsideGeometryFrames: inside,
      maxSpeedJumpPerFrame: +Math.max(...dv).toFixed(2),
      maxYawRateJumpPerFrame: +Math.max(...dw).toFixed(1),
    };
  });
  console.log(JSON.stringify(res, null, 1));
} finally { await api.close(); }
