// 回归：正常流程（菜单 -> 开始 -> 进入游玩）没被内部通道改坏；通道能进能出。
import { launch } from './cdp.mjs';

const api = await launch({ width: 1280, height: 720 });
const log = (...a) => console.log(...a);
try {
  await api.goto('http://127.0.0.1:8123/index.html?debug=1', 2500);
  await api.waitFor("window.__mfp && window.__mfp.state === 'menu'", { timeout: 150000 });
  log('STATE menu OK');

  // 奶蛙在菜单里可见
  const menuInfo = await api.evaluate(() => {
    const g = window.__mfp;
    return { frogs: g.frogs.frogs.length, visible: g.frogs.frogs.filter((f) => f.group.visible).length, internal: !!g.channel };
  });
  log('MENU', JSON.stringify(menuInfo));

  // 点「开始游戏」
  await api.evaluate("document.getElementById('btn-start').click()");
  await api.waitFor("window.__mfp.state === 'ready' || window.__mfp.state === 'story'", { timeout: 60000 });
  log('STATE', await api.evaluate("window.__mfp.state"));
  // 进入游玩
  await api.evaluate("(() => { const g = window.__mfp; if (g.state === 'story') g.story.skip(); })()");
  await api.waitFor("window.__mfp.state === 'ready'", { timeout: 60000 });
  await api.evaluate("document.getElementById('btn-enter').click()");
  await api.waitFor("window.__mfp.state === 'playing'", { timeout: 60000 });
  await new Promise((r) => setTimeout(r, 1500));
  const play = await api.evaluate(() => {
    const g = window.__mfp;
    return {
      state: g.state, san: Math.round(g.san), pos: g.player.position.toArray().map((v) => +v.toFixed(2)),
      fly: g.player.fly, frogsVisible: g.frogs.frogs.filter((f) => f.group.visible).length,
      fps: Math.round(1 / (g.fpsAccum / Math.max(1, g.fpsFrames) || 1)),
    };
  });
  log('PLAY', JSON.stringify(play));

  // 走两步，确认碰撞还在（不是飞行）
  await api.evaluate("window.__mfp.player.keys.add('w')");
  await new Promise((r) => setTimeout(r, 900));
  await api.evaluate("window.__mfp.player.keys.delete('w')");
  const moved = await api.evaluate(() => window.__mfp.player.position.toArray().map((v) => +v.toFixed(2)));
  log('MOVED_TO', JSON.stringify(moved));

  // 从游玩态退回菜单，再进内部通道，再退出
  await api.evaluate("window.__mfp.goMenu()");
  await api.waitFor("window.__mfp.state === 'menu'", { timeout: 30000 });
  await api.evaluate("document.getElementById('btn-internal').click()");
  await api.waitFor("window.__mfp.state === 'internal'", { timeout: 60000 });
  const inside = await api.evaluate(() => {
    const g = window.__mfp;
    return { state: g.state, fly: g.player.fly, frogsVisible: g.frogs.frogs.filter((f) => f.group.visible).length,
      frogsActive: g.frogs.active, san: Math.round(g.san), markers: g.channel.markerGroup.children.length };
  });
  log('INTERNAL', JSON.stringify(inside));
  await api.screenshot('tools/channel/out/reg-internal.png');

  await api.evaluate("window.__mfp.leaveInternal()");
  await api.waitFor("window.__mfp.state === 'menu'", { timeout: 30000 });
  const back = await api.evaluate(() => {
    const g = window.__mfp;
    return { state: g.state, fly: g.player.fly, frogsVisible: g.frogs.frogs.filter((f) => f.group.visible).length,
      markers: g.channel.markerGroup.parent ? 'still-attached' : 'detached',
      wallOpacity: g.channel.wallMats[0]?.opacity ?? 'n/a', exposure: g.renderer.toneMappingExposure,
      fog: g.scene.fog.density };
  });
  log('BACK', JSON.stringify(back));
  await api.screenshot('tools/channel/out/reg-menu.png');
  log('ERRORS', JSON.stringify(api.errors.slice(0, 10), null, 1));
} finally { await api.close(); }
