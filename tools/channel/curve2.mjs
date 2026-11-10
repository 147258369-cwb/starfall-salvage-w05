import { launch } from './cdp.mjs';
const api = await launch({ width: 1280, height: 720 });
try {
  await api.goto('http://127.0.0.1:8123/index.html?debug=1', 2500);
  await api.waitFor("window.__mfp && window.__mfp.state === 'menu'", { timeout: 150000 });
  const res = await api.evaluate(() => {
    const g = window.__mfp, st = g.story;
    st.duration = 32; st.playing = true; st.elapsed = 0; st.startCamera();
    const dt = 1 / 60;
    const rows = [];
    let prevYaw = null, prevPos = null;
    for (let i = 0; i < 32 * 60; i++) {
      st.update(dt);
      const pos = g.camera.position;
      const yaw = g.camera.rotation.y;
      const p = Math.min(1, st.elapsed / st.duration);
      const sArc = p * st.railTotal;
      const travel = st.railDir(sArc);
      const shot = st.shotAt(p);
      const desired = travel + shot.yaw;
      if (prevYaw !== null) {
        let d = ((yaw - prevYaw + Math.PI) % (Math.PI*2) + Math.PI*2) % (Math.PI*2) - Math.PI;
        let dr = ((desired - (prevYaw2 ?? desired) + Math.PI) % (Math.PI*2) + Math.PI*2) % (Math.PI*2) - Math.PI;
        rows.push({
          t: +st.elapsed.toFixed(2),
          turn: +(Math.abs(d)/dt*180/Math.PI).toFixed(0),
          dTarget: +(Math.abs(dr)/dt*180/Math.PI).toFixed(0),
          spd: +(Math.hypot(pos.x-prevPos.x, pos.z-prevPos.z)/dt).toFixed(1),
          travel: +(travel*180/Math.PI).toFixed(0),
          off: +(shot.yaw*180/Math.PI).toFixed(0),
          s: +sArc.toFixed(1),
        });
      }
      prevYaw = yaw; prevYaw2 = desired; prevPos = { x: pos.x, z: pos.z };
    }
    return rows;
  });
  console.log('t\tturn\tdTarget\ttravel\toffset\tspeed\ts');
  for (const r of res.filter((x, i) => i % 6 === 0 && x.t > 5 && x.t < 11)) {
    console.log([r.t, r.turn, r.dTarget, r.travel, r.off, r.spd, r.s].join('\t'));
  }
} finally { await api.close(); }
