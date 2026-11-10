import { launch } from './cdp.mjs';
import { readFileSync } from 'node:fs';
const trials = Number(process.argv[2] || 3);
const code = readFileSync(new URL('./demo-step.js', import.meta.url), 'utf8');
const api = await launch({ width: 1024, height: 640 });
const results = [];
try {
  await api.goto('http://127.0.0.1:8123/?debug=1', 2500);
  await api.waitFor("window.__mfp && window.__mfp.state === 'menu'", { timeout: 150000 });
  for (let k = 0; k < trials; k++) {
    const r = await api.evaluate(code);
    results.push(r);
    console.log('TRIAL', k + 1, JSON.stringify(r));
  }
  console.log('SUMMARY', JSON.stringify({
    finished: results.filter((r) => r.ended === 'exit').length,
    caught: results.filter((r) => r.caught).length,
    avgSeconds: +(results.reduce((a, r) => a + r.seconds, 0) / results.length).toFixed(1),
    maxStuckSec: Math.max(...results.map((r) => r.stuckSec)),
    maxStill: Math.max(...results.map((r) => r.maxStillSec)),
    milk: results.map((r) => r.milkUsed),
  }));
  console.log('ERRORS', JSON.stringify(api.errors.slice(0, 5)));
} finally { await api.close(); }
