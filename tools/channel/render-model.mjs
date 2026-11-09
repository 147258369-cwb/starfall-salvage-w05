import { launch } from './cdp.mjs';
const api = await launch({ width: 900, height: 900 });
try {
  await api.goto('http://127.0.0.1:8123/tools/model-preview.html', 3000);
  await new Promise((r) => setTimeout(r, 4000));
  await api.screenshot('tools/channel/out/model-real.png');
  console.log('ERRORS', JSON.stringify(api.errors.slice(0, 5)));
} finally { await api.close(); }
