// 最终展示截图（不参与 QA 代理的写范围）
import { chromium } from 'playwright-core';
import fs from 'node:fs';
fs.mkdirSync('tools/shots', { recursive: true });
const edge = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const b = await chromium.launch({ executablePath: edge, headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type()==='error') errs.push(m.text()); });
await p.goto('http://127.0.0.1:8010/', { waitUntil: 'networkidle' });
await p.waitForSelector('#loading.hidden', { timeout: 30000 }).catch(()=>{});
await p.waitForTimeout(1200);
await p.screenshot({ path: 'tools/shots/promo-menu.png' });

const hideAll = async (src) => {
  await p.evaluate((src) => {
    const g = window.__game;
    g.resetStage(false);
    for (const id of ['menu','loading','story','ready','pause','win','lose','help']) document.getElementById(id)?.classList.add('hidden');
    document.getElementById('fade')?.classList.remove('on');
    g.ui.showHud(); g.state='playing'; g.player.lookEnabled=false; g.frogs.active=false; g.grace=999;
    new Function('g', src)(g);
    g.player.updateCamera(0,0);
  }, src);
  await p.waitForTimeout(600);
};

await hideAll(`g.player.position.set(8,0,8); g.player.yaw=-Math.PI*0.75; g.player.pitch=-0.03;`);
await p.screenshot({ path: 'tools/shots/promo-play.png' });

await hideAll(`
  g.player.position.set(44.6,0,42.4);
  const f=g.frogs.frogs[0]; f.pos.set(47.4,0,43.2); f.group.position.copy(f.pos); f.state='idle';
  f.group.rotation.y=Math.atan2(44.6-47.4,42.4-43.2);
  const dx=f.pos.x-g.player.position.x, dz=f.pos.z-g.player.position.z;
  g.player.yaw=Math.atan2(-dx,-dz); g.player.pitch=-0.12;
  g.frogs.frogs.forEach((ff,i)=>{if(i>0){ff.pos.set(200,0,200);ff.group.position.copy(ff.pos);}});
`);
await p.screenshot({ path: 'tools/shots/promo-frog.png' });

// 剧情帧
await p.evaluate(() => {
  const g=window.__game;
  g.resetStage(false);
  for (const id of ['menu','loading','ready','pause','win','lose','help']) document.getElementById(id)?.classList.add('hidden');
  document.getElementById('fade').classList.remove('on');
  g.state='story'; g.story.playing=true; g.story.elapsed=12;
  g.ui.resetStory(); g.ui.showStory(); g.ui.storyActive();
  g.ui.setStoryLine('所有孩子都吃了。只有你，把八片奶片藏了起来。','最后一个孩子','旁白 · 奶蛙乐园');
  g.ui.setStoryProgress(12/g.story.duration);
  g.story.update(0.0001);
});
await p.waitForTimeout(800);
await p.screenshot({ path: 'tools/shots/promo-story.png' });

// Demo 帧
await p.evaluate(() => {
  const g=window.__game;
  for (const id of ['story','win','lose','pause','help','ready']) document.getElementById(id)?.classList.add('hidden');
  g.goMenu();
});
await p.waitForTimeout(1200);
await p.click('#btn-demo');
await p.waitForTimeout(7000);
await p.screenshot({ path: 'tools/shots/promo-demo.png' });

// 胜利
await p.evaluate(() => {
  const g=window.__game;
  for (const id of ['menu','loading','story','ready','pause','win','lose','help','demo-banner']) document.getElementById(id)?.classList.add('hidden');
  document.getElementById('fade').classList.remove('on');
  g.state='playing'; g.candiesCollected=8; g.playTime=312; g.scares=3;
  g.ui.showWin([{value:'5:12',label:'存活时间'},{value:'8 / 8',label:'奶片'},{value:'3',label:'惊险时刻'}]);
  g.state='win';
});
await p.waitForTimeout(600);
await p.screenshot({ path: 'tools/shots/promo-win.png' });

// 惊吓
await p.evaluate(() => {
  const g=window.__game;
  for (const id of ['win','lose','menu','loading','story','ready','pause','help']) document.getElementById(id)?.classList.add('hidden');
  g.resetStage(false);
  g.ui.showHud(); g.state='playing'; g.grace=0; g.frogs.active=true;
  g.player.position.set(43.2,0,43.2);
  const f=g.frogs.frogs[0]; f.pos.set(44.0,0,43.2); f.group.position.copy(f.pos);
  g.onCaught(f);
});
await p.waitForTimeout(500);
await p.screenshot({ path: 'tools/shots/promo-jumpscare.png' });
await p.waitForTimeout(2400);
await p.screenshot({ path: 'tools/shots/promo-lose.png' });
console.log('errors', JSON.stringify(errs));
await b.close();
