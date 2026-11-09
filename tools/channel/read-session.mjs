import { readFileSync, writeFileSync } from 'node:fs';
import zlib from 'node:zlib';
const p = 'C:/Users/蔡朝彬/.dsh/sessions/--D-debuging-starfall-salvage-w05--/fccae910-1cbb-4c4b-a2e3-368c46fa5d72/session.v4.jsonl.zstd';
const buf = readFileSync(p);
const MAGIC = Buffer.from([0x28, 0xb5, 0x2f, 0xfd]);
const starts = [];
for (let i = 0; i + 4 <= buf.length; i++) {
  if (buf[i] === 0x28 && buf[i+1] === 0xb5 && buf[i+2] === 0x2f && buf[i+3] === 0xfd) starts.push(i);
}
console.log('FRAMES', starts.length);
let out = '';
for (let i = 0; i < starts.length; i++) {
  const seg = buf.subarray(starts[i], i + 1 < starts.length ? starts[i + 1] : buf.length);
  try { out += zlib.zstdDecompressSync(seg).toString('utf8'); } catch (e) { /* 跳过损坏帧 */ }
}
const lines = out.split('\n').filter(Boolean);
console.log('LINES', lines.length);
writeFileSync('tools/channel/out/subagent.jsonl', out);
const kinds = {};
for (const l of lines) { try { const o = JSON.parse(l); kinds[o.type] = (kinds[o.type]||0)+1; } catch (e) {} }
console.log('KINDS', JSON.stringify(kinds));
