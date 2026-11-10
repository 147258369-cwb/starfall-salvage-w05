(() => {
  const g = window.__mfp;
  g.frame = () => {};
  g.state = 'menu'; g.resetStage(true); g.enterPlay(true);
  const dt = 1 / 60;
  const log = [];
  let prev = g.candiesCollected;
  for (let i = 0; i < 60 * 90; i++) {
    g.updatePlay(dt, i * dt);
    g.updateSan(dt);
    if (g.state !== 'demo') {
      const p = g.player.position;
      return {
        ended: g.state, t: +(i / 60).toFixed(1), candies: g.candiesCollected,
        deathPos: { x: +p.x.toFixed(2), z: +p.z.toFixed(2), cell: g.world.cellOf(p.x, p.z) },
        frogs: g.frogs.frogs.map((f) => ({
          i: f.index,
          d: +Math.hypot(f.pos.x - p.x, f.pos.z - p.z).toFixed(2),
          state: f.state, coil: +f.coilT.toFixed(2), lunge: +f.lungeT.toFixed(2),
          vel: +Math.hypot(f.vel.x, f.vel.z).toFixed(2),
        })).sort((a, b) => a.d - b.d),
        lastTargets: log.slice(-8),
      };
    }
    if (g.candiesCollected !== prev) { prev = g.candiesCollected; log.push([g.candiesCollected, +g.player.position.x.toFixed(1), +g.player.position.z.toFixed(1)]); }
  }
  return { survived: true, candies: g.candiesCollected };
})()