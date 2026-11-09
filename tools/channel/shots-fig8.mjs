import { launch } from './cdp.mjs';
const api = await launch({ width: 1677, height: 793 });
try {
  await api.goto('http://127.0.0.1:8123/index.html?debug=1&channel=internal', 2500);
  await api.waitFor("window.__mfp && window.__mfp.state === 'internal'", { timeout: 120000 });
  const set = "(() => { const g = window.__mfp; g.player.position.set(20.88, 2.34, 19.52); g.player.yaw = 120*Math.PI/180; g.player.pitch = -6*Math.PI/180; g.player.updateCamera(0,0); })()";
  await api.evaluate(set);
  await new Promise((r) => setTimeout(r, 600));
  await api.screenshot('tools/channel/out/fig8-dark.png');
  // 提亮 + 透墙看结构
  await api.evaluate("window.__mfp.channel.bright = true; window.__mfp.channel.applyLighting()");
  await new Promise((r) => setTimeout(r, 600));
  await api.screenshot('tools/channel/out/fig8-bright.png');
  // 从上方俯视这一片
  await api.evaluate("(() => { const g = window.__mfp; g.player.position.set(14, 9, 14); g.player.pitch = -1.45; g.player.yaw = 2.6; g.player.updateCamera(0,0); })()");
  await new Promise((r) => setTimeout(r, 600));
  await api.screenshot('tools/channel/out/fig8-top.png');
} finally { await api.close(); }
