// 内部通道用的无依赖 CDP 驱动（Edge headless + SwiftShader）。
// 本机没有 Chrome，也没有 node_modules/playwright，所以直接走 DevTools 协议。
import { spawn } from 'node:child_process';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const EDGE = process.env.EDGE_PATH || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function launch({ width = 1280, height = 720 } = {}) {
  const port = 9400 + Math.floor(Math.random() * 400);
  const profile = mkdtempSync(join(tmpdir(), 'mfp-cdp-'));
  const errors = [];
  const proc = spawn(EDGE, [
    '--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
    '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--no-sandbox',
    '--disable-gpu', '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader',
    '--autoplay-policy=no-user-gesture-required', '--mute-audio',
    `--window-size=${width},${height}`, 'about:blank',
  ], { stdio: 'ignore' });

  const base = `http://127.0.0.1:${port}`;
  let ok = false;
  for (let i = 0; i < 80; i++) {
    try { if ((await fetch(base + '/json/version')).ok) { ok = true; break; } } catch (e) { /* retry */ }
    await sleep(250);
  }
  if (!ok) { proc.kill(); throw new Error('Edge CDP 端口未就绪'); }

  const list = await (await fetch(base + '/json/list')).json();
  const page = list.find((t) => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });

  let id = 0;
  const pending = new Map();
  ws.addEventListener('message', (ev) => {
    const data = JSON.parse(ev.data);
    if (data.id && pending.has(data.id)) {
      const { resolve, reject } = pending.get(data.id);
      pending.delete(data.id);
      if (data.error) reject(new Error(data.error.message));
      else resolve(data.result);
      return;
    }
    if (data.method === 'Runtime.consoleAPICalled' && data.params.type === 'error') {
      errors.push('[console.error] ' + data.params.args.map((a) => a.value ?? a.description ?? '').join(' '));
    }
    if (data.method === 'Runtime.exceptionThrown') {
      errors.push('[pageerror] ' + (data.params.exceptionDetails.exception?.description || data.params.exceptionDetails.text));
    }
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const mid = ++id;
    pending.set(mid, { resolve, reject });
    ws.send(JSON.stringify({ id: mid, method, params }));
  });

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });

  const api = {
    send,
    errors,
    async goto(url, waitMs = 1200) {
      await send('Page.navigate', { url });
      await sleep(waitMs);
    },
    async evaluate(expression, timeoutMs = 60000) {
      const src = typeof expression === 'function' ? '(' + expression.toString() + ')()' : String(expression);
      const r = await send('Runtime.evaluate', {
        expression: src, awaitPromise: true, returnByValue: true, timeout: timeoutMs,
      });
      if (r.exceptionDetails) {
        throw new Error('evaluate: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
      }
      return r.result?.value;
    },
    // 轮询直到表达式为真，返回最后一次结果
    async waitFor(expression, { timeout = 90000, interval = 500 } = {}) {
      const t0 = Date.now();
      let last;
      while (Date.now() - t0 < timeout) {
        try { last = await api.evaluate(expression); } catch (e) { last = undefined; }
        if (last) return last;
        await sleep(interval);
      }
      throw new Error('waitFor 超时: ' + expression + ' last=' + JSON.stringify(last));
    },
    async screenshot(path) {
      const shot = await send('Page.captureScreenshot', { format: 'png' });
      writeFileSync(path, Buffer.from(shot.data, 'base64'));
    },
    async key(key, { code, keyCode, modifiers = 0, text } = {}) {
      const base = { key, code: code || key, windowsVirtualKeyCode: keyCode || key.charCodeAt?.(0) || 0, nativeVirtualKeyCode: keyCode || 0, modifiers };
      await send('Input.dispatchKeyEvent', { type: text ? 'keyDown' : 'rawKeyDown', ...base, text });
      await send('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
    },
    async click(x, y) {
      for (const type of ['mousePressed', 'mouseReleased']) {
        await send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1 });
      }
    },
    async close() {
      ws.close();
      proc.kill();
    },
  };
  return api;
}
