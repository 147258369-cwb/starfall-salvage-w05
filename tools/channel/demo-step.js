(() => {
  const g = window.__mfp;
  g.frame = () => {};
  g.state = 'menu';
  g.resetStage(true);
  g.enterPlay(true);
  const dt = 1 / 60;
  let minFrog = 99, sanMin = 100, caught = false, ended = null;
  let prevX = g.player.position.x, prevZ = g.player.position.z, travelled = 0;
  let slowT = 0, maxSlow = 0;
  for (let i = 0; i < 60 * 400; i++) {
    g.updatePlay(dt, i * dt);
    g.updateSan(dt);
    travelled += Math.hypot(g.player.position.x - prevX, g.player.position.z - prevZ);
    prevX = g.player.position.x; prevZ = g.player.position.z;
    if (g.state === 'caught') { caught = true; ended = 'caught'; break; }
    if (g.state !== 'demo') { ended = g.state; break; }
    const spd = Math.hypot(g.player.velocity.x, g.player.velocity.z);
    if (spd < 1.0) { slowT += dt; if (slowT > maxSlow) maxSlow = slowT; } else slowT = 0;
    for (const f of g.frogs.frogs) {
      const d = Math.hypot(f.pos.x - g.player.position.x, f.pos.z - g.player.position.z);
      if (d < minFrog) minFrog = d;
    }
    if (g.san < sanMin) sanMin = g.san;
  }
  return {
    ended: ended, caught: caught,
    seconds: +(g.demo.elapsed || 0).toFixed(1),
    candies: g.candiesCollected,
    travelled: +travelled.toFixed(0),
    avgSpeed: +(travelled / Math.max(1, g.demo.elapsed)).toFixed(2),
    sanEnd: Math.round(g.san), sanMin: Math.round(sanMin),
    milkUsed: g.world.dragonMilk.filter((m) => m.collected).length,
    minFrogDist: +minFrog.toFixed(2),
    maxSlowSec: +maxSlow.toFixed(2),
  };
})()