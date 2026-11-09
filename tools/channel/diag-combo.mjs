import { launch } from './cdp.mjs';
const api = await launch({ width: 1280, height: 720 });
try {
  await api.goto('http://127.0.0.1:8123/index.html?debug=1&channel=internal', 2500);
  await api.waitFor("window.__mfp && window.__mfp.state === 'internal'", { timeout: 120000 });

  const res = await api.evaluate(async () => {
    const cfg = await import('./src/config.js');
    const w = window.__mfp.world;
    const C = 3.2;
    const doors = new Set(cfg.DOORS.map(([x, z]) => x + ',' + z));
    const cellOf = (x, z) => [Math.floor(x / C), Math.floor(z / C)];
    const verdicts = w.posters.map((p) => {
      const nx = Math.sin(p.ry), nz = Math.cos(p.ry);
      const [bx, bz] = cellOf(p.x - nx * 0.2, p.z - nz * 0.2);
      const key = bx + ',' + bz;
      const walk = w.isWalkable(bx, bz);
      const isDoor = doors.has(key);
      let v = 'ok';
      if (isDoor) v = 'OVER_DOOR';
      else if (walk) v = 'FLIPPED';
      return { kind: p.kind, x: +p.x.toFixed(2), z: +p.z.toFixed(2), ry: +p.ry.toFixed(2), behind: key, v };
    });

    // 食堂/出口厅的物件清单：找出"又大又黑"和"又薄又高"的
    const ctx = window.__mfp.channel.buildContext();
    const cls = window.__mfp.channel.cluster(ctx);
    const inv = cls.filter((c) => c.room === '食堂' || c.room === '出口厅').map((c) => ({
      room: c.room, label: c.label, geo: c.geo,
      center: c.box.getCenter(new c.box.min.constructor()).toArray().map((v) => +v.toFixed(2)),
      size: c.size.toArray().map((v) => +v.toFixed(2)),
      roots: c.roots.length,
    }));
    return { verdicts, inv };
  });

  console.log('=== 贴墙物件朝向 ===');
  for (const v of res.verdicts) {
    if (v.v !== 'ok') console.log('  !! ' + [v.kind.padEnd(18), ('(' + v.x + ',' + v.z + ')').padEnd(18), 'ry=' + v.ry, '背后格=' + v.behind, v.v].join(' '));
    else console.log('     ' + [v.kind.padEnd(18), ('(' + v.x + ',' + v.z + ')').padEnd(18), 'ok'].join(' '));
  }
  console.log('\n=== 食堂 + 出口厅 物件（高 > 0.7 或 有一边 < 0.12）===');
  for (const it of res.inv) {
    const thin = Math.min(...it.size) < 0.12;
    const tall = it.size[1] > 0.7;
    if (!thin && !tall) continue;
    console.log('  ' + [it.room.padEnd(4), it.geo.padEnd(18), ('@' + it.center.join(',')).padEnd(22), '尺寸 ' + it.size.join(' x ')].join(' '));
  }
} finally { await api.close(); }
