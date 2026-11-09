// 冒烟：Edge headless 能不能跑起来这个游戏，并读到 World 场景统计。
import { launch } from './cdp.mjs';

const URL = process.env.MFP_URL || 'http://127.0.0.1:8123/index.html?debug=1';
const api = await launch();
try {
  await api.goto(URL, 3000);
  const ready = await api.waitFor('!!(window.__mfp && window.__mfp.world)', { timeout: 120000 });
  console.log('READY', ready);
  const stats = await api.evaluate(() => {
    const g = window.__mfp;
    const w = g.world;
    let meshes = 0, instanced = 0, sprites = 0, points = 0, groups = 0;
    w.group.traverse((o) => {
      if (o.isInstancedMesh) instanced++;
      else if (o.isMesh) meshes++;
      else if (o.isSprite) sprites++;
      else if (o.isPoints) points++;
      else if (o.isGroup) groups++;
    });
    return { state: g.state, children: w.group.children.length, meshes, instanced, sprites, points, groups, obstacles: w.obstacles.length };
  });
  console.log('STATS', JSON.stringify(stats));
  console.log('ERRORS', JSON.stringify(api.errors.slice(0, 10), null, 1));
  await api.screenshot('tools/channel/out/probe-menu.png');
  console.log('SHOT_OK');
} finally {
  await api.close();
}
