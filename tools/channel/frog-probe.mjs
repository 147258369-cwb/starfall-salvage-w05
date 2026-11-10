import { launch } from './cdp.mjs';
import { readFileSync } from 'node:fs';
const code = readFileSync(new URL('./frog-step.js', import.meta.url), 'utf8');
const api = await launch({ width: 1024, height: 640 });
try {
  await api.goto('http://127.0.0.1:8123/?debug=1', 2500);
  await api.waitFor("window.__mfp && window.__mfp.state === 'menu'", { timeout: 150000 });
  console.log(JSON.stringify(await api.evaluate(code), null, 1));
  console.log('ERRORS', JSON.stringify(api.errors.slice(0, 4)));
} finally { await api.close(); }