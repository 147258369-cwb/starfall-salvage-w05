import { launch } from './cdp.mjs';
const PI = Math.PI;
const api = await launch({ width: 1440, height: 810 });
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

  // 8 南墙三张海报（法线 -Z），站门厅里往南开
  await shot('08-poster-south', 17.28, 1.7, 19.0, PI, 0.05);
  // 6 盆栽（世界 9.28, 31.2），站北边往南看
  await shot('06-plant', 9.3, 1.6, 27.2, PI, -0.22);
  // 5 开门后的出口
  await api.evaluate('window.__mfp.world.exitUnlocked = true; window.__mfp.world.exitOpenT = 0;');
  await new Promise((r) => setTimeout(r, 2200));
  await shot('05-exit-open', 79.5, 1.7, 46.4, -PI / 2, 0.05);

  // 全图扫描 + 贴墙物件朝向
  const res = await api.evaluate(async () => {
    const ch = window.__mfp.channel;
    ch.showInfo = true;
    ch.scan();
    const cfg = await import('./src/config.js');
    const w = window.__mfp.world, C = 3.2;
    const doors = new Set(cfg.DOORS.map(([x, z]) => x + ',' + z));
    const cellOf = (x, z) => [Math.floor(x / C), Math.floor(z / C)];
    const bad = w.posters.map((p) => {
      const nx = Math.sin(p.ry), nz = Math.cos(p.ry);
      const key = cellOf(p.x - nx * 0.2, p.z - nz * 0.2).join(',');
      if (doors.has(key)) return p.kind + ' 压在门洞上 ' + key;
      if (w.isWalkable(...cellOf(p.x - nx * 0.2, p.z - nz * 0.2))) return p.kind + ' 朝向反了 ' + key;
      return null;
    }).filter(Boolean);
    return {
      scan: ch.scanInfo,
      bad,
    };
  });
  console.log('SCAN', JSON.stringify(res.scan));
  console.log('BAD_POSTERS', JSON.stringify(res.bad));
  console.log('ERRORS', JSON.stringify(api.errors.slice(0, 5)));
} finally { await api.close(); }
