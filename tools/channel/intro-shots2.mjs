import { launch } from './cdp.mjs';
const api = await launch({ width: 1280, height: 720 });
try {
  await api.goto('http://127.0.0.1:8123/index.html?debug=1', 2500);
  await api.waitFor("window.__mfp && window.__mfp.state === 'menu'", { timeout: 150000 });
  await api.evaluate("document.getElementById('btn-start').click()");
  await api.waitFor("window.__mfp.state === 'story'", { timeout: 60000 });

  for (const [t, tag] of [[1.2, 'a'], [7.6, 'b'], [19.6, 'c'], [30.0, 'd']]) {
    // 直接把 story 推到这个时刻（保留真实 startCamera + update 逻辑）
    const info = await api.evaluate('(() => { const g = window.__mfp, st = g.story;'
      + 'st.playing = true; st.duration = 32; st.skipped = false; st.elapsed = 0;'
      + 'st.startCamera();'
      + 'while (st.elapsed < ' + t + ') { st.elapsed = Math.min(32, st.elapsed + 1/60); st.update(1/60); }'
      + 'g.ui.showStory(); g.ui.storyActive();'
      + 'return { t: +st.elapsed.toFixed(2), yaw: +(g.camera.rotation.y*57.3).toFixed(1), pitch: +(g.camera.rotation.x*57.3).toFixed(1) }; })()');
    await new Promise((r) => setTimeout(r, 400));
    await api.screenshot('tools/channel/out/intro-' + tag + '.png');
    console.log(tag, JSON.stringify(info));
  }
  console.log('ERRORS', JSON.stringify(api.errors.slice(0, 5)));
} finally { await api.close(); }
