import { readFileSync } from 'node:fs';
const lines = readFileSync('tools/channel/out/subagent.jsonl', 'utf8').split('\n').filter(Boolean);
const ev = lines.map((l) => { try { return JSON.parse(l); } catch (e) { return null; } }).filter(Boolean);
const seen = new Set();
for (const e of ev) {
  const t = e.type;
  if (seen.has(t)) continue;
  seen.add(t);
  console.log('=== ' + t + ' ===');
  console.log(JSON.stringify(e).slice(0, 900));
}
