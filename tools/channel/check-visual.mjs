import { launch } from './cdp.mjs';
const api = await launch({ width: 1440, height: 810 });
try {
  await api.goto('http://127.0.0.1:8123/index.html?debug=1&channel=internal', 2500);
  await api.waitFor("window.__mfp && window.__mfp.state === 'internal'", { timeout: 150000 });
  const shot = async (name, x, y, z, yaw, pitch) => {
    await api.evaluate('(() => { const g = window.__mfp; g.channel.bright = true; g.channel.applyLighting();'
      + 'g.player.position.set(' + x + ',' + y + ',' + z + '); g.player.yaw = ' + yaw + ';'
      + 'g.player.pitch = ' + pitch + '; g.player.updateCamera(0,0); return true; })()');
    await new Promise((r) => setTimeout(r, 450));
    await api.screenshot('tools/channel/out/check-' + name + '.png');
  };
  const PI = Math.PI;
  // 教室黑板（黑: 北墙 z=3.2，站在南侧往北看）
  await shot('blackboard', 43.2, 1.7, 14.0, 0, 0.05);
  // 主走廊看奶片分布
  await shot('corridor-candies', 20.0, 1.75, 28.6, -PI / 2, -0.05);
  console.log('ERRORS', JSON.stringify(api.errors.slice(0, 4)));
} finally { await api.close(); }
