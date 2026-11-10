// 剧情镜头诊断：逐帧记录机位/朝向，找穿墙点与"翻转"帧
import { launch } from './cdp.mjs';
const api = await launch({ width: 1280, height: 720 });
try {
  await api.goto('http://127.0.0.1:8123/index.html?debug=1', 2500);
  await api.waitFor("window.__mfp && window.__mfp.state === 'menu'", { timeout: 150000 });

  const res = await api.evaluate(() => {
    const g = window.__mfp;
    const st = g.story;
    const C = 3.2;
    st.playing = true;
    st.duration = 32;
    st.elapsed = 0;
    st.startCamera();
    const samples = [];
    const step = 1 / 30;
    let prevYaw = null, prevPos = null;
    const maxYawJump = { v: 0, t: 0 };
    const maxPitch = { v: 0, t: 0 };
    const badPos = [];
    for (let t = 0; t <= 32; t += step) {
      st.elapsed = t;
      st.update(step);
      const p = g.camera.position.clone();
      // 与墙体：机位所在格 + 8 邻居里所有不可走格的最近距离
      const cx = Math.floor(p.x / C), cz = Math.floor(p.z / C);
      let minWall = 99;
      for (let dz = -1; dz <= 1; dz++) {
        for (let dx = -1; dx <= 1; dx++) {
          const gx = cx + dx, gz = cz + dz;
          if (g.world.isWalkable(gx, gz)) continue;
          const x0 = gx * C, x1 = x0 + C, z0 = gz * C, z1 = z0 + C;
          const nx = Math.max(x0, Math.min(p.x, x1));
          const nz = Math.max(z0, Math.min(p.z, z1));
          const d = Math.hypot(p.x - nx, p.z - nz);
          if (d < minWall) minWall = d;
        }
      }
      const e = g.camera.rotation;
      const pitchDeg = e.x * 180 / Math.PI;
      const yawDeg = e.y * 180 / Math.PI;
      const rollDeg = e.z * 180 / Math.PI;
      let yawJump = 0;
      if (prevYaw !== null) {
        let d = ((yawDeg - prevYaw + 540) % 360) - 180;
        yawJump = Math.abs(d);
        if (yawJump > maxYawJump.v) { maxYawJump.v = yawJump; maxYawJump.t = +t.toFixed(2); }
      }
      if (Math.abs(pitchDeg) > Math.abs(maxPitch.v)) { maxPitch.v = pitchDeg; maxPitch.t = +t.toFixed(2); }
      if (minWall < 0.1) badPos.push({ t: +t.toFixed(2), x: +p.x.toFixed(2), z: +p.z.toFixed(2), wall: +minWall.toFixed(3), pitch: +pitchDeg.toFixed(1) });
      samples.push({ t: +t.toFixed(2), x: +p.x.toFixed(1), z: +p.z.toFixed(1), pitch: +pitchDeg.toFixed(1), yaw: +yawDeg.toFixed(1), roll: +rollDeg.toFixed(1), wall: +minWall.toFixed(2), yawJump: +yawJump.toFixed(1) });
      prevYaw = yawDeg;
      prevPos = p;
    }
    // 找出朝向突变最大与最陡俯仰的几帧
    const byYaw = [...samples].sort((a, b) => b.yawJump - a.yawJump).slice(0, 8);
    const byPitch = [...samples].sort((a, b) => Math.abs(b.pitch) - Math.abs(a.pitch)).slice(0, 8);
    return {
      frames: samples.length,
      minWallOverall: Math.min(...samples.map((s) => s.wall)),
      insideWallCount: badPos.length,
      badPos: badPos.slice(0, 12),
      maxYawJump, maxPitch,
      worstYaw: byYaw,
      worstPitch: byPitch,
    };
  });
  console.log(JSON.stringify(res, null, 1));
} finally { await api.close(); }
