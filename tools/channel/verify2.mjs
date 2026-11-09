import { launch } from './cdp.mjs';
import { mkdirSync } from 'node:fs';
mkdirSync('tools/channel/out/verify', { recursive: true });
const api = await launch({ width: 1440, height: 810 });
const PI = Math.PI;
try {
  await api.goto('http://127.0.0.1:8123/index.html?debug=1&channel=internal', 2500);
  await api.waitFor("window.__mfp && window.__mfp.state === 'internal'", { timeout: 120000 });

  const shot = async (name, x, y, z, yaw, pitch) => {
    await api.evaluate('(() => { const g = window.__mfp; g.channel.bright = true; g.channel.applyLighting();'
      + 'g.player.position.set(' + x + ',' + y + ',' + z + '); g.player.yaw = ' + yaw + ';'
      + 'g.player.pitch = ' + pitch + '; g.player.updateCamera(0,0); return true; })()');
    await new Promise((r) => setTimeout(r, 450));
    await api.screenshot('tools/channel/out/verify/' + name + '.png');
  };

  // 教室西门内侧的西墙海报（墙 x=35.2，法线 +X），站在教室里往西看
  await shot('02-poster-classroom', 38.5, 1.75, 14.72, PI / 2, 0.02);
  // 园长室西门内侧（墙 x=67.2，法线 +X），站在园长室里往西看
  await shot('07-poster-office', 70.5, 1.75, 16.64, PI / 2, 0.02);
  // 生日横幅（食堂北墙内侧 z=35.2，法线 +Z），站在食堂里往北看
  await shot('03-banner', 40.0, 1.9, 44.0, 0, 0.1);
  // 盆栽
  await shot('06-plant', 9.6, 1.6, 26.8, 0.35, -0.3);
  // 南墙海报（法线 -Z），站在门厅里往南看
  await shot('08-poster-south', 17.28, 1.7, 19.5, 0, 0.05);
  console.log('SHOTS_OK', JSON.stringify(api.errors.slice(0, 4)));
} finally { await api.close(); }
