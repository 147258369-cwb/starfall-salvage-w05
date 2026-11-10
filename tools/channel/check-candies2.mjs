// 验证：24 片奶片全部生成、可拾取、HUD/小地图正常、Demo 路线覆盖全部
import { launch } from './cdp.mjs';
const api = await launch({ width: 1440, height: 810 });
try {
  await api.goto('http://127.0.0.1:8123/index.html?debug=1&channel=internal', 2500);
  await api.waitFor("window.__mfp && window.__mfp.state === 'internal'", { timeout: 150000 });
  const res = await api.evaluate(() => {
    const g = window.__mfp, w = g.world;
    const route = g.demo.buildRoute();
    const routeSet = new Set(route);
    return {
      candiesInWorld: w.candies.length,
      visible: w.candies.filter((c) => c.group.visible).length,
      uniqueCells: new Set(w.candies.map((c) => c.cx + ',' + c.cz)).size,
      routeLen: route.length,
      routeCoversAll: routeSet.size === w.candies.length,
      routeHead: route.slice(0, 6),
      hudDiamonds: document.querySelectorAll('#candy-progress i').length,
      objective: document.getElementById('objective-text').textContent,
    };
  });
  console.log(JSON.stringify(res, null, 1));

  // 俯瞰全图看奶片分布
  await api.evaluate("(() => { const g = window.__mfp; g.channel.bright = true; g.channel.applyLighting(); g.channel.setWallsTransparent(true); g.player.position.set(43, 44, 34); g.player.pitch = -1.5; g.player.yaw = 0; g.player.updateCamera(0,0); })()");
  await new Promise((r) => setTimeout(r, 700));
  await api.screenshot('tools/channel/out/candies-top.png');
  console.log('ERRORS', JSON.stringify(api.errors.slice(0, 5)));
} finally { await api.close(); }
