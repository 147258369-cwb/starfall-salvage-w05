import { readFileSync, writeFileSync } from 'node:fs';
const lines = readFileSync('tools/channel/out/subagent.jsonl', 'utf8').split('\n').filter(Boolean);
const ev = lines.map((l) => { try { return JSON.parse(l); } catch (e) { return null; } }).filter(Boolean);

const out = [];
for (const e of ev) {
  if (e.type === 'assistant/message') {
    const c = e.data?.message?.content || [];
    let txt = '';
    for (const part of c) {
      if (part.type === 'text') txt += part.text;
      if (part.type === 'tool-call') {
        let a = part.arguments;
        try { a = JSON.parse(a); } catch (_) {}
        txt += '\n[TOOL ' + part.name + ']\n' + (a.code || JSON.stringify(a)).slice(0, 4000);
      }
    }
    out.push('\n===== STEP ' + e.data.step + ' ASSISTANT =====\n' + txt.trim());
  }
  if (e.type === 'tool/result') {
    const c = e.data?.message?.content || [];
    const txt = c.map((p) => p.text || '').join('');
    out.push('\n----- RESULT (step ' + e.data.step + ') -----\n' + txt.slice(0, 6000));
  }
}
writeFileSync('tools/channel/out/subagent-readable.txt', out.join('\n'));
console.log('BYTES', out.join('\n').length);
