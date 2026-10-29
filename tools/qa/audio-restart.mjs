import { chromium } from 'playwright-core';
const edge = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const b = await chromium.launch({ executablePath: edge, headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const p = await b.newPage({ viewport: { width: 1024, height: 640 } });
const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type()==='error') errs.push(m.text()); });
await p.goto('http://127.0.0.1:8010/', { waitUntil: 'networkidle' });
await p.waitForFunction(() => window.__game && window.__game.audio && window.__game.audio.ready && window.__game.state === 'menu', null, { timeout: 45000 });
await p.mouse.click(40, 40);
await p.waitForTimeout(500);
await p.evaluate(() => {
  const g = window.__game;
  g.resetStage(false);
  for (const id of ['menu','loading','story','ready','pause','win','lose','help']) document.getElementById(id)?.classList.add('hidden');
  g.ui.showHud(); g.state='playing'; g.mode='human'; g.grace=999; g.frogs.active=true;
  g.player.position.set(30,0,27.2); g.player.yaw=-Math.PI/2;
  g.frogs.frogs.forEach((f,i)=>{ if(i>0){ f.pos.set(300,0,300); f.group.position.copy(f.pos); f.state='idle'; }});
  const f=g.frogs.frogs[0]; f.pos.set(46,0,27.2); f.group.position.copy(f.pos); f.state='chase';
});
await p.waitForTimeout(900);
const far = await p.evaluate(() => {
  const a = window.__game.audio;
  return {
    gain: a.frogs[0] ? +a.frogs[0].gain.gain.value.toFixed(3) : 'null',
    heart: a.heartbeat ? +a.heartbeat.gain.gain.value.toFixed(3) : 'null',
    danger: +window.__game.frogs.danger.toFixed(2),
    nearest: +window.__game.frogs.nearest.toFixed(1),
  };
});
await p.evaluate(() => {
  const g = window.__game;
  const f = g.frogs.frogs[0];
  f.pos.set(33,0,27.2); f.group.position.copy(f.pos); f.state='chase';
  g.grace = 0;
  for (let i=0;i<40;i++) g.updatePlay(0.05, i*0.05);
});
await p.waitForTimeout(700);
const near = await p.evaluate(() => {
  const a = window.__game.audio;
  return {
    gain: a.frogs[0] ? +a.frogs[0].gain.gain.value.toFixed(3) : 'null',
    heart: a.heartbeat ? +a.heartbeat.gain.gain.value.toFixed(3) : 'null',
    danger: +window.__game.frogs.danger.toFixed(2),
    nearest: +window.__game.frogs.nearest.toFixed(1),
    subtitle: document.getElementById('sub-text').textContent,
    subtitleShown: document.getElementById('subtitles').classList.contains('show'),
  };
});

await p.evaluate(() => window.__game.pause());
await p.waitForTimeout(300);
await p.click('#btn-restart');
await p.waitForTimeout(800);
const restarted = await p.evaluate(() => ({ state: window.__game.state, candies: window.__game.candiesCollected, mapHidden: document.getElementById('minimap-wrap').classList.contains('hidden') }));

await p.evaluate(() => {
  const g=window.__game;
  g.state='playing'; g.grace=0;
  g.player.position.set(43.2,0,43.2);
  const f=g.frogs.frogs[0]; f.pos.set(44,0,43.2); f.group.position.copy(f.pos);
  g.onCaught(f);
});
await p.waitForTimeout(2800);
const lost = await p.evaluate(() => window.__game.state);
await p.click('#btn-lose-retry');
await p.waitForTimeout(800);
const retried = await p.evaluate(() => ({ state: window.__game.state, candies: window.__game.candiesCollected }));
console.log(JSON.stringify({ far, near, restarted, lost, retried, errs }, null, 2));
await b.close();
