// 内部通道冒烟：进入模式、跑一次扫描、截图、把前若干条问题打成 JSON。
import { launch } from './cdp.mjs';
import { mkdirSync } from 'node:fs';

mkdirSync('tools/channel/out', { recursive: true });
const URL = process.env.MFP_URL || 'http://127.0.0.1:8123/index.html?debug=1&channel=internal';
const api = await launch();
try {
  await api.goto(URL, 2500);
  await api.waitFor("window.__mfp && window.__mfp.state === 'internal'", { timeout: 120000 });
  console.log('STATE internal OK');
  await api.evaluate("window.__mfp.channel.scan()");
  const info = await api.evaluate(() => {
    const ch = window.__mfp.channel;
    const out = ch.issues.slice(0, 40).map((i) => ({
      sev: i.severity, type: i.type, room: i.room, label: i.label,
      pos: [Number(i.center.x.toFixed(2)), Number(i.center.y.toFixed(2)), Number(i.center.z.toFixed(2))],
      cell: [i.cx, i.cz], detail: i.detail,
    }));
    return { scanInfo: ch.scanInfo, total: ch.issues.length, top: out };
  });
  console.log(JSON.stringify(info, null, 1));
  await api.screenshot('tools/channel/out/channel-entry.png');
  // 透墙 + 标记，拍一张
  await api.evaluate("window.__mfp.channel.setWallsTransparent(true); window.__mfp.player.position.set(13.5*3.2, 12.5, 10.5*3.2); window.__mfp.player.pitch = -0.75;");
  await api.evaluate("window.__mfp.channel.render()");
  await new Promise((r) => setTimeout(r, 800));
  await api.screenshot('tools/channel/out/channel-topdown.png');
  console.log('ERRORS', JSON.stringify(api.errors.slice(0, 12), null, 1));
} finally {
  await api.close();
}
