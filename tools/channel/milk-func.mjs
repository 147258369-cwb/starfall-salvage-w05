// 龙奶改动后的功能回归：拾取仍然生效、整组隐藏、扫描器不再误报
import { launch } from './cdp.mjs';
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

  const out = await api.evaluate(() => {
    const g = window.__mfp;
    g.world.resetDragonMilk();
    g.world.unlockDragonMilk();
    g.milkUnlocked = true;
    g.san = 40; g.milkCooldown = 0;
    const m = g.world.dragonMilk.find((x) => x.available);
    const beforeSan = g.san;
    // 站到瓶子旁边（自动拾取是 updatePlay 里按距离触发）
    g.player.position.set(m.x + 0.4, 0, m.z + 0.4);
    const nearby = !!g.world.getNearbyDragonMilk(g.player.position);
    // 龙奶拾取在 updateSan 里（每帧由 Game.frame 调用），不是 updatePlay
    for (let i = 0; i < 12; i++) g.updateSan(1 / 60);
    const after = {
      collected: m.collected,
      groupVisible: m.group.visible,
      sanRaised: g.san > beforeSan,
      sanBefore: +beforeSan.toFixed(1), sanAfter: +g.san.toFixed(1),
      cooldown: +g.milkCooldown.toFixed(1),
    };
    // 其余瓶子仍在原位且可见
    const others = g.world.dragonMilk.filter((x) => x !== m).map((x) => ({
      i: x.index, visible: x.group.visible, available: x.available,
    }));
    return { nearbyDetected: nearby, after, others };
  });
  console.log('FUNC', JSON.stringify(out, null, 1));
  console.log('ERRORS', JSON.stringify(api.errors.slice(0, 6)));
} finally { await api.close(); }
