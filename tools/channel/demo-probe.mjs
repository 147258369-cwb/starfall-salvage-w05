import { launch } from './cdp.mjs';
import { readFileSync } from 'node:fs';
const code = readFileSync(new URL('./demo-step.js', import.meta.url), 'utf8');
const api = await launch({ width: 1024, height: 640 });
try {
  await api.goto('http://127.0.0.1:8123/?debug=1', 2500);
  await api.waitFor("window.__mfp && window.__mfp.state === 'menu'", { timeout: 150000 });
  await api.evaluate("window.__mfp.frame=()=>{}; window.__mfp.state='menu'; window.__mfp.resetStage(true); window.__mfp.enterPlay(true);");
  console.log(JSON.stringify(await api.evaluate(code), null, 1));
} finally { await api.close(); }
