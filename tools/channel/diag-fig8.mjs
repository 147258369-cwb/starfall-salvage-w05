// 诊断：复现用户图 8 的机位，对一片屏幕网格做射线拾取，认出"纯黑色物件"。
import { launch } from './cdp.mjs';
import { mkdirSync } from 'node:fs';
mkdirSync('tools/channel/out', { recursive: true });

const api = await launch({ width: 1677, height: 793 });
try {
  await api.goto('http://127.0.0.1:8123/index.html?debug=1&channel=internal', 2500);
  await api.waitFor("window.__mfp && window.__mfp.state === 'internal'", { timeout: 120000 });

  const out = await api.evaluate(() => {
    const g = window.__mfp, ch = g.channel;
    g.player.position.set(20.88, 2.34, 19.52);
    g.player.yaw = 120 * Math.PI / 180;
    g.player.pitch = -6 * Math.PI / 180;
    g.player.updateCamera(0, 0);
    g.renderer.render(g.scene, g.camera);

    const pts = [
      [945, 470, '左侧大黑块'], [1205, 400, '门框里的黑块'],
      [1300, 420, '右侧门口'], [1000, 300, '墙面上方'],
      [700, 500, '地面'], [1150, 620, '地面'],
    ];
    return pts.map(([x, y, tag]) => ({ tag, ...(ch.pickAt(x, y) || { none: true }) }));
  });
  console.log(JSON.stringify(out, null, 1));
  await api.screenshot('tools/channel/out/user-fig8.png');
} finally { await api.close(); }
