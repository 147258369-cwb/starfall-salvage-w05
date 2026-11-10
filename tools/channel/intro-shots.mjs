// 真实流程：进片头，按时间截几张，确认镜头平滑不翻转、不穿墙
import { launch } from './cdp.mjs';
const api = await launch({ width: 1280, height: 720 });
try {
  await api.goto('http://127.0.0.1:8123/index.html?debug=1', 2500);
  await api.waitFor("window.__mfp && window.__mfp.state === 'menu'", { timeout: 150000 });
  // 用真实按钮开始（会走 resetStage -> story）
  await api.evaluate("document.getElementById('btn-start').click()");
  await api.waitFor("window.__mfp.state === 'story'", { timeout: 60000 });
  const shots = [[1.2, 'a'], [7.6, 'b'], [19.6, 'c'], [30.0, 'd']];
  let last = 0;
  for (const [t, tag] of shots) {
    await api.waitFor('window.__mfp.story.elapsed >= ' + t, { timeout: 90000, interval: 120 });
    const info = await api.evaluate(() => ({
      t: +window.__mfp.story.elapsed.toFixed(2),
      yaw: +(window.__mfp.camera.rotation.y * 57.3).toFixed(1),
      pitch: +(window.__mfp.camera.rotation.x * 57.3).toFixed(1),
    }));
    await api.screenshot('tools/channel/out/intro-' + tag + '.png');
    console.log(tag, JSON.stringify(info));
    last = t;
  }
  // 一整段连续性检查：采样 yaw 相邻帧变化
  const cont = await api.evaluate(() => {
    const g = window.__mfp, st = g.story;
    const samples = [];
    st.playing = true;
    let prev = null, maxJump = 0, at = 0;
    for (let t = 0.1; t < 31.9; t += 1 / 60) {
      st.elapsed = t; st.update(1 / 60);
      const y = g.camera.rotation.y * 180 / Math.PI;
      if (prev !== null) {
        let d = Math.abs(((y - prev + 540) % 360) - 180);
        if (d > maxJump) { maxJump = d; at = +t.toFixed(2); }
      }
      prev = y;
    }
    return { maxYawJumpPerFrame: +maxJump.toFixed(2), at };
  });
  console.log('CONTINUITY', JSON.stringify(cont));
  console.log('ERRORS', JSON.stringify(api.errors.slice(0, 5)));
} finally { await api.close(); }
