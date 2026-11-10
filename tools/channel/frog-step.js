(() => {
  const g = window.__mfp;
  g.frame = () => {};
  g.state = 'menu'; g.resetStage(true); g.enterPlay(true);
  const dt = 1 / 60;
  let lastC = 0, sinceC = 0, captured = null;
  for (let i = 0; i < 60 * 150; i++) {
    g.updatePlay(dt, i * dt);
    g.updateSan(dt);
    if (g.state !== 'demo') { captured = captured || { ended: g.state, t: +(i / 60).toFixed(1), candies: g.candiesCollected }; break; }
    if (g.candiesCollected !== lastC) { lastC = g.candiesCollected; sinceC = 0; } else sinceC += dt;
    if (sinceC > 9 && !captured) {
      const d = g.demo, p = g.player;
      const path = d.path, next = path[d.pathIndex] || null;
      captured = {
        t: +(i / 60).toFixed(1), candies: g.candiesCollected, san: Math.round(g.san),
        pos: { x: +p.position.x.toFixed(2), z: +p.position.z.toFixed(2) },
        cell: g.world.cellOf(p.position.x, p.position.z),
        target: d.currentTargetCell(), targetCandy: d.targetCandy,
        bot: { fwd: p.bot && p.bot.forward, strafe: p.bot && p.bot.strafe, sprint: p.bot && p.bot.sprint, yaw: p.bot && +p.bot.yaw.toFixed(2) },
        speed: +Math.hypot(p.velocity.x, p.velocity.z).toFixed(2),
        pathLen: path.length, pathIdx: d.pathIndex, next: next,
        milk: !!d.milkTarget, fleeing: d.fleeing,
        frogs: g.frogs.frogs.map((f) => ({ i: f.index, d: +Math.hypot(f.pos.x - p.position.x, f.pos.z - p.position.z).toFixed(2), stillT: +f.stillT.toFixed(1), vel: +Math.hypot(f.vel.x, f.vel.z).toFixed(2) })),
      };
      break;
    }
  }
  return captured || { noStall: true, candies: g.candiesCollected, san: Math.round(g.san) };
})()