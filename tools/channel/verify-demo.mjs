import { launch } from './cdp.mjs';
const api = await launch({ width: 1280, height: 720 });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PAGE_CATCH = "(function () {\n  var g = window.__mfp;\n  g.grace = 0; g.frogs.grace = 0;\n  g.onCaught(g.frogs.frogs[0], 'caught');\n  return { state: g.state };\n})()";
try {
  await api.goto('http://127.0.0.1:8123/?debug=1', 2500);
  await api.waitFor("window.__mfp && window.__mfp.state === 'menu'", { timeout: 150000 });
  await api.evaluate("document.getElementById('btn-demo').click()");
  await api.waitFor("window.__mfp.state === 'demo'", { timeout: 60000 });
  const t0 = Date.now();
  await sleep(6000);
  const early = await api.evaluate("({ state: window.__mfp.state, san: Math.round(window.__mfp.san), candies: window.__mfp.candiesCollected, bot: !!window.__mfp.player.bot, banner: !document.getElementById('demo-banner').classList.contains('hidden') })");
  const secs = (Date.now() - t0) / 1000;
  await api.evaluate("window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))");
  await sleep(1200);
  const afterEsc = await api.evaluate('window.__mfp.state');
  await api.evaluate("document.getElementById('btn-demo').click()");
  await api.waitFor("window.__mfp.state === 'demo'", { timeout: 60000 });
  const caughtInfo = await api.evaluate(PAGE_CATCH);
  await sleep(400);
  const caughtState = await api.evaluate('window.__mfp.state');
  await sleep(5500);
  const afterLose = await api.evaluate('({ state: window.__mfp.state, deaths: window.__mfp.demoDeaths })');
  await sleep(2500);
  const afterRestart = await api.evaluate('window.__mfp.state');
  console.log(JSON.stringify({ demoAfter6s: early, ranFor: +secs.toFixed(1), sanDroppedWhileDemo: early.san < 100, afterEsc: afterEsc, caughtInfo: caughtInfo, caughtState: caughtState, afterLose: afterLose, afterRestart: afterRestart }, null, 1));
  console.log('ERRORS', JSON.stringify(api.errors.slice(0, 5)));
} finally { await api.close(); }