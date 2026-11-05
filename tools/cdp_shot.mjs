// 无依赖 CDP 驱动：启动 headless Chrome，导航到 URL，执行可选 JS，等待，截图 + 收集 console/pageerror
// 用法: node tools/cdp_shot.mjs <url> <outfile> [waitMs] [jsBefore]
// jsBefore 通过环境变量 CDP_JS 传入（避免转义问题），在导航完成后执行
import { spawn } from 'node:child_process';
import { writeFileSync, existsSync } from 'node:fs';

const url = process.argv[2];
const outfile = process.argv[3];
const waitMs = Number(process.argv[4] || 4000);
const jsBefore = process.env.CDP_JS || '';

const chrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const port = 9333 + Math.floor(Math.random() * 500);
const errors = [];

const chromeProc = spawn(chrome, [
  '--headless=new', `--remote-debugging-port=${port}`,
  '--disable-gpu', '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader',
  '--no-first-run', '--no-default-browser-check', '--disable-extensions',
  '--window-size=1280,720', 'about:blank',
], { stdio: 'ignore' });

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function waitPort() {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (r.ok) return true;
    } catch (e) { /* retry */ }
    await sleep(250);
  }
  throw new Error('Chrome CDP 端口未就绪');
}

let msgId = 0;
function makeClient(ws) {
  const pending = new Map();
  ws.addEventListener('message', (ev) => {
    const data = JSON.parse(ev.data);
    if (data.id && pending.has(data.id)) {
      const { resolve, reject } = pending.get(data.id);
      pending.delete(data.id);
      if (data.error) reject(new Error(data.error.message));
      else resolve(data.result);
    }
    if (data.method === 'Runtime.consoleAPICalled' && ['error','warning'].includes(data.params.type)) {
      const txt = data.params.args.map(a => a.value ?? a.description ?? '').join(' ');
      errors.push(`[console.${data.params.type}] ${txt}`);
    }
    if (data.method === 'Runtime.exceptionThrown') {
      errors.push(`[pageerror] ${data.params.exceptionDetails.text} ${data.params.exceptionDetails.exception?.description || ''}`);
    }
  });
  return (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++msgId;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
}

async function main() {
  await waitPort();
  const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  const target = list.find(t => t.type === 'page');
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  const send = makeClient(ws);

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Page.navigate', { url });
  // 等页面 load
  await sleep(2500);

  if (jsBefore) {
    const r = await send('Runtime.evaluate', { expression: jsBefore, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) errors.push(`[jsBefore] ${r.exceptionDetails.text}`);
    if (r.result && r.result.value !== undefined) console.log('JS_RESULT', JSON.stringify(r.result.value));
  }
  await sleep(waitMs);

  const shot = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(outfile, Buffer.from(shot.data, 'base64'));
  console.log('SCREENSHOT_OK', outfile);
  console.log('ERRORS', JSON.stringify(errors, null, 2));
  ws.close();
}

try {
  await main();
} finally {
  chromeProc.kill();
}
