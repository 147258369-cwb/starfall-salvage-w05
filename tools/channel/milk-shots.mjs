// 龙奶可见性对照：真实游玩光照下，从固定距离拍摄奶瓶
import { launch } from './cdp.mjs';
import { mkdirSync } from 'node:fs';

const tag = process.argv[2] || 'before';
const OUT = 'tools/channel/out/milk';
mkdirSync(OUT, { recursive: true });

const api = await launch({ width: 1280, height: 720 });
try {
  await api.goto('http://127.0.0.1:8123/?debug=1', 2500);
  await api.waitFor("window.__mfp && window.__mfp.state === 'menu'", { timeout: 150000 });
  await api.evaluate("document.getElementById('btn-start').click()");
  await api.waitFor("window.__mfp.state === 'story'", { timeout: 60000 });
  await api.evaluate("window.__mfp.story.skip()");
  await api.waitFor("window.__mfp.state === 'ready'", { timeout: 60000 });
  await api.evaluate("document.getElementById('btn-enter').click()");
  await api.waitFor("window.__mfp.state === 'playing'", { timeout: 60000 });

  const info = await api.evaluate(() => {
    const g = window.__mfp;
    g.world.resetDragonMilk();
    g.world.unlockDragonMilk();
    g.milkUnlocked = true;
    return g.world.dragonMilk.map((m) => ({
      i: m.index, visible: m.group.visible, available: m.available,
      pos: [ +m.group.position.x.toFixed(2), +m.group.position.y.toFixed(2), +m.group.position.z.toFixed(2) ],
      cell: [m.cx, m.cz], room: m.room,
    }));
  });
  console.log('MILK', JSON.stringify(info));

  const place = async (idx, dist, name) => {
    const shot = await api.evaluate('(() => { const g = window.__mfp; const m = g.world.dragonMilk[' + idx + '];'
      + 'const bx = m.group.position.x, bz = m.group.position.z, by = 0.45;'
      // 必须同时满足：脚下可站 + 到奶瓶之间的视线没有被墙/家具挡住，否则拍出来只是对面一堵墙
      + 'const clear = (tx, tz) => {'
      + '  const steps = Math.ceil(' + dist + ' / 0.25);'
      + '  for (let i = 1; i < steps; i++) { const t = i / steps;'
      + '    if (g.world.pointBlocked(tx + (bx - tx) * t, tz + (bz - tz) * t)) return false; }'
      + '  return true; };'
      + 'let px = null, pz = null;'
      + 'for (const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1],[0.7,0.7],[-0.7,0.7],[0.7,-0.7],[-0.7,-0.7]]) {'
      + '  const tx = bx + dx * ' + dist + ', tz = bz + dz * ' + dist + ';'
      + '  if (!g.world.isWalkable(Math.floor(tx/3.2), Math.floor(tz/3.2))) continue;'
      + '  if (g.world.pointBlocked(tx, tz, 0.2)) continue;'
      + '  if (!clear(tx, tz)) continue;'
      + '  px = tx; pz = tz; break; }'
      + 'if (px === null) return { blocked: true };'
      + 'g.player.position.set(px, 0, pz);'
      + 'const dx = bx - px, dz = bz - pz;'
      + 'g.player.yaw = Math.atan2(-dx, -dz);'
      + 'g.player.pitch = Math.atan2(by - 1.62, Math.hypot(dx, dz));'
      + 'g.player.updateCamera(0, 0);'
      + 'return { from: [+px.toFixed(2), +pz.toFixed(2)], dist: +Math.hypot(dx,dz).toFixed(2) }; })()');
    await new Promise((r) => setTimeout(r, 700));
    await api.screenshot(OUT + '/' + tag + '-' + name + '.png');
    console.log(name, JSON.stringify(shot));
  };

  await place(0, 3, 'near3');
  await place(0, 8, 'mid8');
  await place(0, 12, 'far12');
  console.log('ERRORS', JSON.stringify(api.errors.slice(0, 5)));
} finally { await api.close(); }
