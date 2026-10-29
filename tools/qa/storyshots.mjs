import { chromium } from 'playwright-core';
import fs from 'node:fs';
fs.mkdirSync('tools/qa/out', { recursive: true });
const edge = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const b = await chromium.launch({ executablePath: edge, headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
await p.goto('http://127.0.0.1:8010/', { waitUntil: 'networkidle' });
await p.waitForSelector('#loading.hidden', { timeout: 30000 }).catch(()=>{});
await p.waitForTimeout(500);
await p.evaluate(() => {
  const g = window.__game;
  g.resetStage(false);
  for (const id of ['menu','loading','ready','pause','win','lose','help']) document.getElementById(id)?.classList.add('hidden');
  document.getElementById('fade').classList.remove('on');
  g.state = 'story';
  g.story.playing = true;
  g.story.elapsed = 0;
  g.ui.resetStory(); g.ui.showStory(); g.ui.storyActive();
  const lines = [
    ['1999 · 奶蛙乐园','1999年，奶蛙乐园举办最后一场生日会。'],
    ['生日会 · 19:30','老师说：吃了奶片，就能变成奶龙。'],
    ['最后一个孩子','所有孩子都吃了。只有你，把八片奶片藏了起来。'],
    ['第二天 · 06:00','第二天，乐园空了。只剩那首歌——我是奶龙，我才是奶龙。'],
    ['现在 · 22:07','推土机明天就来。你回来取走奶片。'],
  ];
  window.__setStory = (t, i) => {
    g.story.elapsed = t;
    g.story.update(0.0001);
    const [ch, tx] = lines[i];
    g.ui.setStoryLine(tx, ch, '旁白 · 奶蛙乐园');
    g.ui.setStoryProgress(t / g.story.duration);
  };
});
for (const [i, t] of [[0, 2], [1, 7], [2, 12], [3, 18], [4, 24]]) {
  await p.evaluate(({ i, t }) => { window.__setStory(t, i); }, { i, t });
  await p.waitForTimeout(600);
  await p.screenshot({ path: `tools/qa/out/story-${i}.png` });
  console.log('story shot', i, t);
}
await b.close();
