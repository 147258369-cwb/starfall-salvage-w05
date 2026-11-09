// 自检：扫描器还能不能抓到问题（故意把几张椅子抬起来 / 塞进墙里）
import { launch } from './cdp.mjs';

const api = await launch();
try {
  await api.goto('http://127.0.0.1:8123/index.html?debug=1&channel=internal', 2500);
  await api.waitFor("window.__mfp && window.__mfp.state === 'internal'", { timeout: 120000 });

  const res = await api.evaluate(() => {
    const g = window.__mfp, ch = g.channel;
    ch.scan();
    const before = ch.issues.filter((i) => i.severity !== 'info').length;

    // 场景 1：把两张椅子抬到 0.8 m 高 -> 应报悬空
    const lifted = [];
    let n = 0;
    for (const c of g.world.group.children) {
      if (c.isMesh && c.geometry?.type === 'BoxGeometry' && Math.abs(c.geometry.parameters.height - 0.07) < 0.001
        && Math.abs(c.geometry.parameters.width - 0.55) < 0.001 && n < 2) {
        c.position.y += 0.8; lifted.push(c); n++;
      }
    }
    // 场景 2：把一个暖色小盒子塞进墙格 (0,0) 里 -> 应报穿墙
    const THREE = g.scene.constructor;
    let box;
    if (lifted[0]) {
      box = lifted[0].clone();
      box.position.set(0.6, 0.4, 0.6);   // 墙格
      g.world.group.add(box);
    }
    ch.scan();
    const after = ch.issues.filter((i) => i.severity !== 'info');
    const kinds = {};
    for (const i of after) kinds[i.type + '/' + i.severity] = (kinds[i.type + '/' + i.severity] || 0) + 1;

    // 还原
    for (const c of lifted) c.position.y -= 0.8;
    if (box) g.world.group.remove(box);
    ch.scan();
    const restored = ch.issues.filter((i) => i.severity !== 'info').length;

    return { before, after: after.length, kinds, restored };
  });
  console.log(JSON.stringify(res, null, 1));
} finally { await api.close(); }
