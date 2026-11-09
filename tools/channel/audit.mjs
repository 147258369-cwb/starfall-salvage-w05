// 内部通道体检报告：进入无怪物模式 → 全场景扫描 → 输出 JSON + Markdown + 每类截图。
// 用法: node tools/channel/audit.mjs [--url=...] [--shots=1]
import { launch } from './cdp.mjs';
import { mkdirSync, writeFileSync } from 'node:fs';

const args = Object.fromEntries(process.argv.slice(2).map((a) => {
  const [k, v] = a.replace(/^--/, '').split('=');
  return [k, v === undefined ? '1' : v];
}));
const URL = args.url || 'http://127.0.0.1:8123/index.html?debug=1&channel=internal';
const OUT = 'tools/channel/out';
mkdirSync(OUT, { recursive: true });

const api = await launch({ width: 1440, height: 810 });
try {
  await api.goto(URL, 2500);
  await api.waitFor("window.__mfp && window.__mfp.state === 'internal'", { timeout: 120000 });
  const data = await api.evaluate(() => {
    const ch = window.__mfp.channel;
    ch.showInfo = true;
    ch.scan();
    return {
      scan: ch.scanInfo,
      issues: ch.issues.map((i) => ({
        severity: i.severity, type: i.type, room: i.room, label: i.label,
        pos: [i.center.x, i.center.y, i.center.z],
        cell: [i.cx, i.cz], detail: i.detail,
        box: [i.box.min.toArray(), i.box.max.toArray()],
      })),
    };
  });
  writeFileSync(OUT + '/audit.json', JSON.stringify(data, null, 1));

  const order = ['error', 'warn', 'info'];
  const byType = {};
  for (const it of data.issues) byType[it.type] = (byType[it.type] || 0) + 1;
  console.log('SCAN', JSON.stringify(data.scan));
  console.log('BYTYPE', JSON.stringify(byType));
  console.log('---- 逐条 ----');
  const sorted = [...data.issues].sort((a, b) => order.indexOf(a.severity) - order.indexOf(b.severity));
  for (const it of sorted) {
    const p = it.pos.map((v) => v.toFixed(2)).join(',');
    console.log([it.severity.padEnd(5), it.type.padEnd(8), it.room, '(' + p + ')', it.label, '|', it.detail].join(' '));
  }

  if (args.shots === '1') {
    const picks = [
      { name: 'entry', x: 11.2, y: 2.4, z: 14.5, pitch: -0.25, yaw: 0.4 },
      { name: 'classroom', x: 46, y: 2.6, z: 14, pitch: -0.35, yaw: 0.2 },
      { name: 'canteen', x: 46, y: 3.2, z: 58, pitch: -0.5, yaw: 0.2 },
      { name: 'office', x: 76, y: 2.2, z: 18, pitch: -0.3, yaw: 2.2 },
      { name: 'top', x: 43, y: 16, z: 34, pitch: -0.95, yaw: 0.0 },
    ];
    await api.evaluate("window.__mfp.channel.setWallsTransparent(true)");
    for (const p of picks) {
      const expr = '(() => { const g = window.__mfp; g.player.position.set(' + p.x + ', ' + p.y + ', ' + p.z +
        '); g.player.yaw = ' + p.yaw + '; g.player.pitch = ' + p.pitch + '; })()';
      await api.evaluate(expr);
      await new Promise((r) => setTimeout(r, 700));
      await api.screenshot(OUT + '/audit-' + p.name + '.png');
    }
    console.log('SHOTS_OK');
  }
  console.log('ERRORS', JSON.stringify(api.errors.slice(0, 8)));
} finally {
  await api.close();
}
