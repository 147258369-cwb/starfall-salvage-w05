// 1) 剧情镜头在原来 3 个翻转点的实际画面 2) Demo 用 24 片奶片还能不能自动通关
import { launch } from './cdp.mjs';
const api = await launch({ width: 1280, height: 720 });
try {
  await api.goto('http://127.0.0.1:8123/index.html?debug=1', 2500);
  await api.waitFor("window.__mfp && window.__mfp.state === 'menu'", { timeout: 150000 });

  // 剧情：跑到原来翻转的时刻各拍一张
  for (const [t, tag] of [[7.35, 'a'], [7.7, 'b'], [19.5, 'c']]) {
    await api.evaluate('(() => { const g = window.__mfp; const st = g.story;'
      + 'st.playing = true; st.duration = 32; st.elapsed = ' + (t - 0.6) + '; st.startCamera();'
      + 'for (let i = 0; i < 18; i++) { st.elapsed += 1/30; st.update(1/30); }'
      + 'return { yaw: +(g.camera.rotation.y*57.3).toFixed(1), pitch: +(g.camera.rotation.x*57.3).toFixed(1) }; })()');
    await new Promise((r) => setTimeout(r, 350));
    await api.screenshot('tools/channel/out/story-' + tag + '.png');
  }

  // Demo 通关模拟（不渲染，纯逻辑步进）
  const demoRes = await api.evaluate(() => {
    const g = window.__mfp;
    g.resetStage(true);
    g.enterPlay(true);
    const dt = 1 / 30;
    let t = 0;
    const marks = [];
    let last = -1;
    for (let i = 0; i < 15000; i++) {
      t += dt;
      g.updatePlay(dt, t);
      if (g.candiesCollected !== last) {
        last = g.candiesCollected;
        marks.push({ n: last, t: +t.toFixed(1) });
      }
      if (g.state === 'winFade' || g.state === 'win') break;
    }
    return {
      state: g.state,
      candies: g.candiesCollected,
      seconds: +t.toFixed(1),
      firstFive: marks.slice(0, 5),
      reachedExit: g.demo.reachedExit,
    };
  });
  console.log('DEMO', JSON.stringify(demoRes, null, 1));
  console.log('ERRORS', JSON.stringify(api.errors.slice(0, 6)));
} finally { await api.close(); }
