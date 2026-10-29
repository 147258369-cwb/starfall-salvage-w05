/* =============================================================================
 * 奶蛙乐园：午夜奶片 —— 程序化贴图库
 * -----------------------------------------------------------------------------
 * 纯 Canvas 2D 生成，零外部图片、零网络、零 renderer 依赖。
 * 所有贴图均为 THREE.CanvasTexture（SRGB），平铺纹理带 RepeatWrapping。
 *
 * 视觉基调（见 docs/CONTRACT.md）：
 *   温馨 —— 奶油黄 #ffd9a0 / 粉 #f7b6c2 / 薄荷 #a9d6c4 / 木色 #b07a4a
 *   惊悚 —— 暗红棕 #1a0f12 / 冷绿应急灯 #7dffb0 / 脏紫 #3b2344
 *   统一质感：纸纤维、噪点、水渍、刮痕、轻微色差、边缘磨损。
 *
 * 本文件只被游戏代码 import，请勿在此读取文件或访问网络。
 * ========================================================================== */

import * as THREE from 'three';

export const ZONES = ['entry', 'classroom', 'nap', 'canteen', 'corridor', 'exit'];

const TAU = Math.PI * 2;
const TILE = 512;
const TRIM_H = 128;

const FONT = '"Microsoft YaHei","PingFang SC","Noto Sans CJK SC","SimHei","WenQuanYi Micro Hei",sans-serif';
const SERIF = '"Source Han Serif SC","Noto Serif SC","Songti SC","SimSun","STSong",serif';
const HAND = '"KaiTi","STKaiti","Comic Sans MS","Segoe Print",cursive';

/* 契约定色 */
const C = {
  cream: '#ffd9a0',
  pink: '#f7b6c2',
  mint: '#a9d6c4',
  wood: '#b07a4a',
  paper: '#f3e7cd',
  ink: '#3a2b25',
  darkRed: '#1a0f12',
  dirtyPurple: '#3b2344',
  exitGreen: '#7dffb0',
};

/* ============================ 基础工具 ============================ */

function hashSeed(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

function mulberry32(a) {
  a = a >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function clampByte(v) {
  return v < 0 ? 0 : v > 255 ? 255 : v;
}

function hexRgb(hex) {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgba(hex, a) {
  const [r, g, b] = hexRgb(hex);
  return 'rgba(' + r + ',' + g + ',' + b + ',' + a + ')';
}

function shade(hex, amt) {
  const [r, g, b] = hexRgb(hex);
  return 'rgb(' + clampByte(r + amt) + ',' + clampByte(g + amt) + ',' + clampByte(b + amt) + ')';
}

function mixHex(a, b, t) {
  const A = hexRgb(a);
  const B = hexRgb(b);
  return 'rgb(' + Math.round(A[0] + (B[0] - A[0]) * t) + ',' +
    Math.round(A[1] + (B[1] - A[1]) * t) + ',' +
    Math.round(A[2] + (B[2] - A[2]) * t) + ')';
}

function mkCanvas(w, h) {
  let canvas;
  if (typeof document !== 'undefined' && typeof document.createElement === 'function') {
    canvas = document.createElement('canvas');
  } else if (typeof OffscreenCanvas !== 'undefined') {
    canvas = new OffscreenCanvas(w, h);
  } else {
    throw new Error('textures.js: 当前环境没有 canvas 2D 能力');
  }
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('textures.js: 无法获得 2D context');
  return { canvas, ctx, w, h };
}

/* 可平铺的值噪声：lattice 环绕，纹理边缘自然连续 */
function tileNoise(w, h, cells, seed) {
  const n = Math.max(2, Math.round(cells));
  const rnd = mulberry32(seed >>> 0);
  const lat = new Float32Array(n * n);
  for (let i = 0; i < lat.length; i++) lat[i] = rnd();
  const out = new Float32Array(w * h);
  const smooth = (t) => t * t * (3 - 2 * t);
  for (let y = 0; y < h; y++) {
    const fy = (y / h) * n;
    const y0 = Math.floor(fy);
    const ty = smooth(fy - y0);
    const ya = ((y0 % n) + n) % n;
    const yb = (ya + 1) % n;
    for (let x = 0; x < w; x++) {
      const fx = (x / w) * n;
      const x0 = Math.floor(fx);
      const tx = smooth(fx - x0);
      const xa = ((x0 % n) + n) % n;
      const xb = (xa + 1) % n;
      const v00 = lat[ya * n + xa];
      const v10 = lat[ya * n + xb];
      const v01 = lat[yb * n + xa];
      const v11 = lat[yb * n + xb];
      out[y * w + x] =
        (v00 * (1 - tx) + v10 * tx) * (1 - ty) + (v01 * (1 - tx) + v11 * tx) * ty;
    }
  }
  return out;
}

/* 全图颗粒 / 大尺度色差（边缘天然无缝：噪声本身周期，颗粒逐像素随机） */
function applyGrain(ctx, w, h, opts) {
  const o = opts || {};
  const seed = o.seed || 1;
  const grain = o.grain == null ? 8 : o.grain;
  const mottle = o.mottle == null ? 0.055 : o.mottle;
  const cells = o.cells || 5;
  if (grain <= 0 && mottle <= 0) return;
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  const rnd = mulberry32(seed);
  const big = mottle > 0 ? tileNoise(w, h, cells, seed + 7) : null;
  const small = grain > 0 ? tileNoise(w, h, cells * 9, seed + 13) : null;
  for (let p = 0, i = 0; i < d.length; p++, i += 4) {
    let m = 1;
    if (big) m += (big[p] - 0.5) * mottle * 1.7;
    if (small) m += (small[p] - 0.5) * (grain / 255) * 2.1;
    m += (rnd() - 0.5) * (grain / 255) * 1.1;
    d[i] = clampByte(d[i] * m);
    d[i + 1] = clampByte(d[i + 1] * m);
    d[i + 2] = clampByte(d[i + 2] * m);
  }
  ctx.putImageData(img, 0, 0);
}

/* 环绕绘制：把同一图元画到相邻 tile 上，保证接缝连续 */
function eachWrap(w, h, cx, cy, r, fn) {
  for (let ox = -1; ox <= 1; ox++) {
    for (let oy = -1; oy <= 1; oy++) {
      const x = cx + ox * w;
      const y = cy + oy * h;
      if (x + r < 0 || x - r > w || y + r < 0 || y - r > h) continue;
      fn(x, y);
    }
  }
}

function stampEllipse(ctx, w, h, x, y, rx, ry, rot, color, alpha) {
  eachWrap(w, h, x, y, Math.max(rx, ry) + 2, (px, py) => {
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(rot);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.ellipse(0, 0, rx, ry, 0, 0, TAU);
    ctx.fill();
    ctx.restore();
  });
}

function stampRect(ctx, w, h, x, y, rw, rh, rot, color, alpha) {
  eachWrap(w, h, x, y, Math.max(rw, rh) + 2, (px, py) => {
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(rot);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    ctx.fillRect(-rw / 2, -rh / 2, rw, rh);
    ctx.restore();
  });
}

/* 不规则水渍（环绕绘制；lobes 预生成，保证相邻 tile 完全一致） */
function softStain(ctx, w, h, cx, cy, r, color, alpha, seed, tiled) {
  const isTiled = tiled !== false;
  const rnd = mulberry32(seed >>> 0);
  const lobes = [];
  for (let i = 0; i < 5; i++) {
    lobes.push({
      dx: (rnd() - 0.5) * r * 0.9,
      dy: (rnd() - 0.5) * r * 0.9,
      rr: r * (0.5 + rnd() * 0.55),
      a: 0.5 + rnd() * 0.5,
    });
  }
  const draw = (x, y) => {
    for (let i = 0; i < lobes.length; i++) {
      const l = lobes[i];
      const g = ctx.createRadialGradient(x + l.dx, y + l.dy, l.rr * 0.05, x + l.dx, y + l.dy, l.rr);
      g.addColorStop(0, rgba(color, alpha * l.a));
      g.addColorStop(0.62, rgba(color, alpha * l.a * 0.55));
      g.addColorStop(1, rgba(color, 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x + l.dx, y + l.dy, l.rr, 0, TAU);
      ctx.fill();
    }
  };
  if (isTiled) eachWrap(w, h, cx, cy, r * 1.7, draw);
  else draw(cx, cy);
}

/* 水渍的“潮痕”环 */
function waterRing(ctx, w, h, cx, cy, r, color, alpha, seed, tiled) {
  const isTiled = tiled !== false;
  const draw = (x, y) => {
    const g = ctx.createRadialGradient(x, y, r * 0.3, x, y, r);
    g.addColorStop(0, rgba(color, 0));
    g.addColorStop(0.66, rgba(color, alpha * 0.28));
    g.addColorStop(0.86, rgba(color, alpha));
    g.addColorStop(1, rgba(color, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.fill();
  };
  if (isTiled) eachWrap(w, h, cx, cy, r + 2, draw);
  else draw(cx, cy);
}

/* 细纤维 / 纸毛：短线段 */
function fiberLines(ctx, w, h, seed, count, lightCol, darkCol, aMin, aMax, lMin, lMax, tiled) {
  const isTiled = tiled !== false;
  const rnd = mulberry32(seed >>> 0);
  for (let i = 0; i < count; i++) {
    const x = rnd() * w;
    const y = rnd() * h;
    const len = lMin + rnd() * (lMax - lMin);
    const ang = rnd() * TAU;
    const col = rnd() > 0.5 ? lightCol : darkCol;
    const a = aMin + rnd() * (aMax - aMin);
    const x2 = x + Math.cos(ang) * len;
    const y2 = y + Math.sin(ang) * len;
    const draw = (ox, oy) => {
      ctx.save();
      ctx.globalAlpha = a;
      ctx.strokeStyle = col;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x + ox, y + oy);
      ctx.lineTo(x2 + ox, y2 + oy);
      ctx.stroke();
      ctx.restore();
    };
    if (isTiled) eachWrap(w, h, x, y, len + 2, draw);
    else draw(0, 0);
  }
}

/* 裂纹折线 */
function crack(ctx, w, h, pts, color, alpha, width, tiled) {
  const isTiled = tiled !== false;
  const draw = (ox, oy) => {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    for (let i = 0; i < pts.length; i++) {
      const px = pts[i][0] + ox;
      const py = pts[i][1] + oy;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();
    ctx.globalAlpha = alpha * 0.4;
    ctx.strokeStyle = '#fff7e4';
    ctx.lineWidth = width * 0.45;
    ctx.stroke();
    ctx.restore();
  };
  if (!isTiled) {
    draw(0, 0);
    return;
  }
  let minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9;
  for (let i = 0; i < pts.length; i++) {
    minX = Math.min(minX, pts[i][0]);
    minY = Math.min(minY, pts[i][1]);
    maxX = Math.max(maxX, pts[i][0]);
    maxY = Math.max(maxY, pts[i][1]);
  }
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  eachWrap(w, h, cx, cy, Math.max(maxX - minX, maxY - minY) / 2 + 4, draw);
}

function scuffArc(ctx, w, h, cx, cy, r, a0, a1, color, alpha, width) {
  eachWrap(w, h, cx, cy, r + 2, (x, y) => {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(x, y, r, a0, a1);
    ctx.stroke();
    ctx.restore();
  });
}

function addDust(ctx, w, h, seed, count) {
  const rnd = mulberry32(seed >>> 0);
  const n = count == null ? 90 : count;
  for (let i = 0; i < n; i++) {
    const x = rnd() * w;
    const y = rnd() * h;
    const r = 0.5 + rnd() * 1.5;
    const light = rnd() > 0.62;
    const col = light ? 'rgb(255,249,232)' : 'rgb(52,40,28)';
    stampEllipse(ctx, w, h, x, y, r, r * 0.8, rnd() * TAU, col, 0.1 + rnd() * 0.22);
  }
}

function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
  ctx.lineTo(x + w, y + h - rr);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
  ctx.lineTo(x + rr, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
  ctx.lineTo(x, y + rr);
  ctx.quadraticCurveTo(x, y, x + rr, y);
  ctx.closePath();
}

/* 文本（支持字距；中文标牌用） */
function drawText(ctx, str, x, y, o) {
  const opt = o || {};
  const font = opt.font || '40px ' + FONT;
  const color = opt.color || C.ink;
  const align = opt.align || 'center';
  const baseline = opt.baseline || 'middle';
  const spacing = opt.spacing || 0;
  const alpha = opt.alpha == null ? 1 : opt.alpha;
  const stroke = opt.stroke || null;
  const strokeWidth = opt.strokeWidth || 2;
  const shadow = opt.shadow || null;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.font = font;
  ctx.textBaseline = baseline;
  ctx.fillStyle = color;
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = strokeWidth;
    ctx.lineJoin = 'round';
  }
  if (shadow) {
    ctx.shadowColor = shadow.color || 'rgba(0,0,0,0.45)';
    ctx.shadowBlur = shadow.blur == null ? 10 : shadow.blur;
    ctx.shadowOffsetX = shadow.x || 0;
    ctx.shadowOffsetY = shadow.y || 0;
  }
  let px = x;
  if (opt.rotate) {
    ctx.translate(x, y);
    ctx.rotate(opt.rotate);
    px = 0;
    y = 0;
  }
  if (spacing === 0) {
    ctx.textAlign = align;
    if (stroke) ctx.strokeText(str, px, y);
    ctx.fillText(str, px, y);
  } else {
    const chars = Array.from(str);
    const widths = chars.map((ch) => ctx.measureText(ch).width);
    let total = 0;
    for (let i = 0; i < widths.length; i++) total += widths[i];
    total += spacing * Math.max(0, chars.length - 1);
    let cx = align === 'center' ? px - total / 2 : align === 'right' ? px - total : px;
    ctx.textAlign = 'left';
    for (let i = 0; i < chars.length; i++) {
      if (stroke) ctx.strokeText(chars[i], cx, y);
      ctx.fillText(chars[i], cx, y);
      cx += widths[i] + spacing;
    }
  }
  ctx.restore();
}

function fitFont(ctx, str, maxWidth, o) {
  const opt = o || {};
  const family = opt.family || FONT;
  const weight = opt.weight || 700;
  const max = opt.max || 80;
  const min = opt.min || 16;
  let size = max;
  for (; size > min; size -= 1) {
    ctx.font = weight + ' ' + size + 'px ' + family;
    if (ctx.measureText(str).width <= maxWidth) break;
  }
  return weight + ' ' + size + 'px ' + family;
}

/* 统一收尾：颗粒 + 浮尘 */
function finishTile(ctx, w, h, seedText, o) {
  const opt = o || {};
  applyGrain(ctx, w, h, {
    seed: hashSeed(seedText) + 3,
    grain: opt.grain == null ? 8 : opt.grain,
    mottle: opt.mottle == null ? 0.055 : opt.mottle,
    cells: opt.cells || 5,
  });
  if (opt.dust !== false) addDust(ctx, w, h, hashSeed(seedText + '|dust'), opt.dust == null ? 80 : opt.dust);
}

/* 粉笔/蜡笔笔触（非平铺图案用；由调用者保证不跨接缝） */
function crayonStroke(ctx, pts, color, width, seed, alpha) {
  const rnd = mulberry32(seed >>> 0);
  const a = alpha == null ? 0.72 : alpha;
  for (let pass = 0; pass < 3; pass++) {
    ctx.save();
    ctx.globalAlpha = Math.min(1, a * (0.55 + rnd() * 0.45) * 1.4);
    ctx.strokeStyle = color;
    ctx.lineWidth = width * (0.55 + rnd() * 0.6);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    for (let i = 0; i < pts.length; i++) {
      const jx = pts[i][0] + (rnd() - 0.5) * width * 1.4;
      const jy = pts[i][1] + (rnd() - 0.5) * width * 1.4;
      if (i === 0) ctx.moveTo(jx, jy);
      else ctx.lineTo(jx, jy);
    }
    ctx.stroke();
    ctx.restore();
  }
}

function crayonEllipsePts(cx, cy, rx, ry, n, seed) {
  const rnd = mulberry32(seed >>> 0);
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * TAU;
    const wob = 0.86 + rnd() * 0.24;
    pts.push([cx + Math.cos(a) * rx * wob, cy + Math.sin(a) * ry * wob]);
  }
  return pts;
}

/* ============================ 共享构件 ============================ */

/* 小蛙剪影（墙纸图案 / 图标） */
function frogIcon(ctx, x, y, s, color, lineColor) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(0, s * 0.12, s * 0.54, s * 0.38, 0, 0, TAU);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(-s * 0.34, -s * 0.4, s * 0.24, 0, TAU);
  ctx.arc(s * 0.34, -s * 0.4, s * 0.24, 0, TAU);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(-s * 0.46, s * 0.44, s * 0.22, s * 0.1, -0.4, 0, TAU);
  ctx.ellipse(s * 0.46, s * 0.44, s * 0.22, s * 0.1, 0.4, 0, TAU);
  ctx.fill();
  if (lineColor) {
    ctx.strokeStyle = lineColor;
    ctx.lineWidth = Math.max(1, s * 0.075);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-s * 0.3, s * 0.14);
    ctx.quadraticCurveTo(0, s * 0.32, s * 0.3, s * 0.14);
    ctx.stroke();
    ctx.fillStyle = lineColor;
    ctx.beginPath();
    ctx.arc(-s * 0.34, -s * 0.4, s * 0.05, 0, TAU);
    ctx.arc(s * 0.34, -s * 0.4, s * 0.05, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
}

/* 四角星 / 圆点 图案（平铺用） */
function star4Tiled(ctx, w, h, x, y, r, color, alpha) {
  eachWrap(w, h, x, y, r + 2, (px, py) => {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(px, py - r);
    ctx.quadraticCurveTo(px + r * 0.18, py - r * 0.18, px + r, py);
    ctx.quadraticCurveTo(px + r * 0.18, py + r * 0.18, px, py + r);
    ctx.quadraticCurveTo(px - r * 0.18, py + r * 0.18, px - r, py);
    ctx.quadraticCurveTo(px - r * 0.18, py - r * 0.18, px, py - r);
    ctx.fill();
    ctx.restore();
  });
}

/* 吊顶灯盘（局部光晕不会碰到纹理边缘，故不影响平铺） */
function lightPanel(ctx, x, y, pw, ph, warm) {
  ctx.save();
  const glow = ctx.createRadialGradient(x, y, 0, x, y, pw * 0.95);
  glow.addColorStop(0, rgba(warm, 0.3));
  glow.addColorStop(1, rgba(warm, 0));
  ctx.fillStyle = glow;
  ctx.fillRect(x - pw, y - pw, pw * 2, pw * 2);
  ctx.fillStyle = 'rgba(70,64,52,0.42)';
  roundRect(ctx, x - pw / 2 - 5, y - ph / 2 - 5, pw + 10, ph + 10, 7);
  ctx.fill();
  const panel = ctx.createLinearGradient(0, y - ph / 2, 0, y + ph / 2);
  panel.addColorStop(0, shade(warm, 16));
  panel.addColorStop(0.5, warm);
  panel.addColorStop(1, shade(warm, -26));
  ctx.fillStyle = panel;
  roundRect(ctx, x - pw / 2, y - ph / 2, pw, ph, 3);
  ctx.fill();
  ctx.strokeStyle = 'rgba(120,110,92,0.5)';
  ctx.lineWidth = 1;
  for (let i = 1; i < 4; i++) {
    const yy = y - ph / 2 + (ph / 4) * i;
    ctx.beginPath();
    ctx.moveTo(x - pw / 2 + 3, yy);
    ctx.lineTo(x + pw / 2 - 3, yy);
    ctx.stroke();
  }
  ctx.fillStyle = 'rgba(60,50,36,0.22)';
  ctx.beginPath();
  ctx.ellipse(x + pw * 0.18, y + ph * 0.15, pw * 0.22, ph * 0.16, 0.3, 0, TAU);
  ctx.fill();
  ctx.restore();
}

/* 统一吊顶：矿棉板 / 板缝 / 针孔 / 水渍 / 灯盘 / 星贴纸 */
function dropCeiling(ctx, w, h, o) {
  const opt = o || {};
  const seed = hashSeed(opt.seed || 'ceiling');
  const rnd = mulberry32(seed);
  const base = opt.base || '#efe3c9';
  const tile = opt.tile || 256;
  const variance = opt.variance == null ? 10 : opt.variance;
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, w, h);
  for (let ty = 0; ty < h; ty += tile) {
    for (let tx = 0; tx < w; tx += tile) {
      ctx.fillStyle = shade(base, (rnd() - 0.5) * variance);
      ctx.fillRect(tx, ty, tile, tile);
    }
  }
  /* 板缝：中心画在 0 / tile / ... 上，平铺后是完整的线 */
  for (let x = 0; x <= w; x += tile) {
    ctx.fillStyle = 'rgba(60,50,38,0.30)';
    ctx.fillRect(x - 1, 0, 2, h);
    ctx.fillStyle = 'rgba(255,250,235,0.22)';
    ctx.fillRect(x + 1, 0, 1, h);
  }
  for (let y = 0; y <= h; y += tile) {
    ctx.fillStyle = 'rgba(60,50,38,0.30)';
    ctx.fillRect(0, y - 1, w, 2);
    ctx.fillStyle = 'rgba(255,250,235,0.22)';
    ctx.fillRect(0, y + 1, w, 1);
  }
  /* 吸音针孔 */
  const holes = opt.pinholes == null ? 900 : opt.pinholes;
  for (let i = 0; i < holes; i++) {
    const x = rnd() * w;
    const y = rnd() * h;
    const r = 0.55 + rnd() * 0.9;
    stampEllipse(ctx, w, h, x, y, r, r, 0, shade(base, -42), 0.22 + rnd() * 0.16);
  }
  /* 水渍 */
  const stains = opt.stains == null ? 3 : opt.stains;
  const stainCol = opt.stainColor || '#a3793f';
  for (let i = 0; i < stains; i++) {
    softStain(ctx, w, h, rnd() * w, rnd() * h, 42 + rnd() * 86, stainCol, opt.stainAlpha == null ? 0.11 : opt.stainAlpha, seed + i * 71 + 5);
    if (rnd() > 0.45) {
      waterRing(ctx, w, h, rnd() * w, rnd() * h, 46 + rnd() * 60, stainCol, 0.12, seed + i * 23);
    }
  }
  if (opt.mold) {
    for (let i = 0; i < 26; i++) {
      stampEllipse(ctx, w, h, rnd() * w, rnd() * h, 2 + rnd() * 6, 1.5 + rnd() * 4, rnd() * TAU, '#4a5140', 0.10 + rnd() * 0.12);
    }
  }
  if (opt.stars) {
    for (let i = 0; i < 9; i++) {
      star4Tiled(ctx, w, h, rnd() * w, rnd() * h, 5 + rnd() * 6, '#f2e6a8', 0.18 + rnd() * 0.12);
    }
  }
  if (opt.light) lightPanel(ctx, w / 2, h / 2, opt.lightW || 148, opt.lightH || 62, opt.lightColor || '#ffe9b8');
  /* 裂缝 */
  const cc = opt.cracks == null ? 2 : opt.cracks;
  for (let i = 0; i < cc; i++) {
    let x = rnd() * w;
    let y = rnd() * h;
    const pts = [[x, y]];
    for (let k = 0; k < 5; k++) {
      x += (rnd() - 0.5) * 46;
      y += 8 + rnd() * 26;
      pts.push([x, y]);
    }
    crack(ctx, w, h, pts, 'rgba(66,54,40,0.5)', 0.5, 1.3, true);
  }
  finishTile(ctx, w, h, opt.seed || 'ceiling', { grain: opt.grain == null ? 8 : opt.grain, mottle: 0.06, dust: 70 });
}

/* 统一墙裙 / 踢脚线 */
function baseboard(ctx, w, h, o) {
  const opt = o || {};
  const seed = hashSeed(opt.seed || 'trim');
  const rnd = mulberry32(seed);
  const base = opt.base || '#f4e3c2';
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, w, h);
  /* 顶部压条 */
  ctx.fillStyle = rgba('#ffffff', 0.18);
  ctx.fillRect(0, 0, w, 3);
  ctx.fillStyle = 'rgba(50,40,28,0.30)';
  ctx.fillRect(0, 3, w, 4);
  ctx.fillStyle = rgba('#ffffff', 0.10);
  ctx.fillRect(0, 7, w, 2);
  /* 腰线 */
  if (opt.stripe) {
    const sy = opt.stripeY == null ? 14 : opt.stripeY;
    ctx.fillStyle = rgba(opt.stripe, 0.78);
    ctx.fillRect(0, sy, w, 9);
    ctx.fillStyle = rgba('#ffffff', 0.16);
    ctx.fillRect(0, sy + 1, w, 2);
  }
  /* 竖向分格凹槽 */
  const panel = opt.panel || 64;
  for (let x = 0; x < w; x += panel) {
    ctx.fillStyle = 'rgba(56,42,26,0.12)';
    ctx.fillRect(x, 24, 2, h - 40);
    ctx.fillStyle = rgba('#ffffff', 0.10);
    ctx.fillRect(x + 2, 24, 1, h - 40);
  }
  /* 小蛙贴纸 */
  if (opt.frogs) {
    for (let x = panel / 2; x < w; x += panel * 2) {
      frogIcon(ctx, x, h * 0.6, 13, rgba(opt.frogs, 0.55), rgba(opt.frogs, 0.65));
    }
  }
  /* 底部脏污（限制在窄带内，纵向平铺也不突兀） */
  for (let i = 0; i < 7; i++) {
    ctx.fillStyle = 'rgba(48,36,22,' + 0.03 + i * 0.012 + ')';
    ctx.fillRect(0, h - 16 + i * 1.6, w, 2);
  }
  /* 掉漆 / 磨损 */
  const chips = opt.chips == null ? 26 : opt.chips;
  for (let i = 0; i < chips; i++) {
    stampEllipse(ctx, w, h, rnd() * w, 30 + rnd() * (h - 46), 2 + rnd() * 8, 1 + rnd() * 3.2, rnd() * 0.5, opt.chipColor || '#d9cfb6', 0.28 + rnd() * 0.35);
  }
  /* 划痕 */
  for (let i = 0; i < (opt.scratches == null ? 12 : opt.scratches); i++) {
    const x = rnd() * w;
    const y = 24 + rnd() * (h - 40);
    const len = 8 + rnd() * 40;
    ctx.save();
    ctx.globalAlpha = 0.10 + rnd() * 0.14;
    ctx.strokeStyle = '#3a2a1c';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + len, y + (rnd() - 0.5) * 6);
    ctx.stroke();
    ctx.restore();
  }
  finishTile(ctx, w, h, opt.seed || 'trim', { grain: opt.grain == null ? 7 : opt.grain, mottle: 0.04, dust: 26 });
}

/* ============================ 1. entry 门厅 ============================ */

function wallEntry(ctx, w, h) {
  const rnd = mulberry32(hashSeed('entry-wall'));
  ctx.fillStyle = C.cream;
  ctx.fillRect(0, 0, w, h);
  /* 壁纸竖条纹 */
  for (let x = 0; x < w; x += 32) {
    ctx.fillStyle = (x / 32) % 2 === 0 ? 'rgba(255,246,222,0.22)' : 'rgba(219,166,110,0.09)';
    ctx.fillRect(x, 0, 32, h);
  }
  for (let x = 0; x < w; x += 128) {
    ctx.fillStyle = 'rgba(208,150,98,0.32)';
    ctx.fillRect(x + 64, 0, 2, h);
    ctx.fillStyle = 'rgba(255,247,226,0.35)';
    ctx.fillRect(x + 66, 0, 1, h);
  }
  /* 粉色腰线：每 256 一条 */
  for (let y = 0; y < h; y += 256) {
    ctx.fillStyle = 'rgba(247,182,194,0.9)';
    ctx.fillRect(0, y, w, 11);
    ctx.fillStyle = 'rgba(230,150,168,0.5)';
    ctx.fillRect(0, y + 13, w, 2);
    for (let x = 8; x < w; x += 16) {
      stampEllipse(ctx, w, h, x, y + 5.5, 1.3, 1.3, 0, '#fff3e2', 0.5);
    }
  }
  /* 小蛙图案（错位排列） */
  const rows = [50, 118, 186, 320, 388, 456];
  for (let ri = 0; ri < rows.length; ri++) {
    const off = (ri % 2) * 32;
    for (let x = 0; x < w; x += 64) {
      eachWrap(w, h, x + off, rows[ri], 30, (px, py) => {
        frogIcon(ctx, px, py, 19, 'rgba(219,120,146,0.8)', 'rgba(166,82,104,0.85)');
      });
    }
  }
  /* 旧色斑 / 水渍 */
  softStain(ctx, w, h, 70, 420, 96, '#9a7a48', 0.09, 31);
  softStain(ctx, w, h, 430, 120, 72, '#c9a26a', 0.10, 32);
  softStain(ctx, w, h, 300, 250, 55, '#8c6a3c', 0.06, 33);
  waterRing(ctx, w, h, 470, 470, 52, '#8a6738', 0.10, 34);
  /* 擦痕 */
  for (let i = 0; i < 26; i++) {
    const x = rnd() * w;
    const y = 20 + rnd() * (h - 40);
    const len = 6 + rnd() * 34;
    ctx.save();
    ctx.globalAlpha = 0.05 + rnd() * 0.1;
    ctx.strokeStyle = rnd() > 0.5 ? '#4a3520' : '#fff4dc';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + len, y + (rnd() - 0.5) * 8);
    ctx.stroke();
    ctx.restore();
  }
  fiberLines(ctx, w, h, hashSeed('entry-wall-fiber'), 520, '#fff6e0', '#7a5a34', 0.025, 0.06, 2, 9);
  finishTile(ctx, w, h, 'entry-wall', { grain: 9, mottle: 0.05 });
}

function floorEntry(ctx, w, h) {
  const rnd = mulberry32(hashSeed('entry-floor'));
  const base = '#e7dac0';
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, w, h);
  const tile = 256;
  for (let ty = 0; ty < h; ty += tile) {
    for (let tx = 0; tx < w; tx += tile) {
      ctx.fillStyle = shade(base, (rnd() - 0.5) * 12);
      ctx.fillRect(tx, ty, tile, tile);
      const g = ctx.createLinearGradient(tx, ty, tx + tile, ty + tile);
      g.addColorStop(0, 'rgba(255,255,255,0.06)');
      g.addColorStop(1, 'rgba(40,30,18,0.07)');
      ctx.fillStyle = g;
      ctx.fillRect(tx, ty, tile, tile);
    }
  }
  /* 水磨石石粒 */
  const chips = ['#c9ae8a', '#f6efdc', '#b7c2ad', '#d9a79e', '#9aa094', '#e3c9a2', '#8d8676', '#cfc0a0'];
  for (let i = 0; i < 720; i++) {
    const x = rnd() * w;
    const y = rnd() * h;
    const r = 1.2 + rnd() * 4.2;
    const rx = r * (0.7 + rnd() * 0.6);
    const ry = r * (0.5 + rnd() * 0.5);
    stampEllipse(ctx, w, h, x, y, rx, ry, rnd() * TAU, chips[Math.floor(rnd() * chips.length)], 0.3 + rnd() * 0.55);
  }
  for (let i = 0; i < 110; i++) {
    const x = rnd() * w;
    const y = rnd() * h;
    const r = 4 + rnd() * 7;
    stampEllipse(ctx, w, h, x, y, r * (1 + rnd() * 0.5), r * 0.75, rnd() * TAU, chips[Math.floor(rnd() * chips.length)], 0.24 + rnd() * 0.35);
  }
  /* 勾缝 */
  for (let x = 0; x <= w; x += tile) {
    ctx.fillStyle = 'rgba(122,106,80,0.55)';
    ctx.fillRect(x - 1.5, 0, 3, h);
    ctx.fillStyle = 'rgba(255,250,235,0.22)';
    ctx.fillRect(x + 1.5, 0, 1, h);
  }
  for (let y = 0; y <= h; y += tile) {
    ctx.fillStyle = 'rgba(122,106,80,0.55)';
    ctx.fillRect(0, y - 1.5, w, 3);
    ctx.fillStyle = 'rgba(255,250,235,0.18)';
    ctx.fillRect(0, y + 1.5, w, 1);
  }
  /* 缝里的脏 */
  for (let i = 0; i < 70; i++) {
    const x = rnd() * w;
    const y = rnd() * h;
    stampEllipse(ctx, w, h, x, y, 1.5 + rnd() * 5, 1 + rnd() * 1.8, rnd() * TAU, '#66573e', 0.12 + rnd() * 0.2);
  }
  softStain(ctx, w, h, 360, 300, 90, '#8a7048', 0.08, 51);
  softStain(ctx, w, h, 120, 460, 60, '#f7f1de', 0.10, 52);
  for (let i = 0; i < 40; i++) {
    const x = rnd() * w;
    const y = rnd() * h;
    const len = 6 + rnd() * 26;
    ctx.save();
    ctx.globalAlpha = 0.06 + rnd() * 0.1;
    ctx.strokeStyle = '#4c3d28';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + len * 0.7, y + len * 0.3);
    ctx.stroke();
    ctx.restore();
  }
  finishTile(ctx, w, h, 'entry-floor', { grain: 10, mottle: 0.07 });
}

function ceilEntry(ctx, w, h) {
  dropCeiling(ctx, w, h, {
    seed: 'entry-ceil',
    base: '#efe3c9',
    stains: 3,
    stainColor: '#a3793f',
    stainAlpha: 0.11,
    light: true,
    lightColor: '#ffe9b8',
    cracks: 2,
    pinholes: 900,
    dust: 80,
  });
}

function trimEntry(ctx, w, h) {
  baseboard(ctx, w, h, {
    seed: 'entry-trim',
    base: '#f6e7c8',
    stripe: C.pink,
    stripeY: 16,
    frogs: '#e58fa4',
    chips: 26,
    chipColor: '#e6d6b4',
    grain: 7,
    dust: 26,
  });
}

/* ============================ 2. classroom 教室 ============================ */

function handprint(ctx, x, y, s, color, alpha, rot) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(0, 0, s * 0.5, s * 0.42, 0, 0, TAU);
  ctx.fill();
  const fs = [
    [-0.36, -0.5, 0.11, 0.34, -0.35],
    [-0.12, -0.62, 0.1, 0.4, -0.12],
    [0.12, -0.6, 0.1, 0.38, 0.1],
    [0.34, -0.46, 0.1, 0.3, 0.3],
    [-0.5, -0.05, 0.11, 0.26, -0.9],
  ];
  for (let i = 0; i < fs.length; i++) {
    const f = fs[i];
    ctx.beginPath();
    ctx.ellipse(f[0] * s, f[1] * s, f[2] * s, f[3] * s, f[4], 0, TAU);
    ctx.fill();
  }
  ctx.restore();
}

function wallClassroom(ctx, w, h) {
  const rnd = mulberry32(hashSeed('classroom-wall'));
  ctx.fillStyle = C.mint;
  ctx.fillRect(0, 0, w, h);
  /* 乳胶漆的滚筒色差 */
  for (let i = 0; i < 90; i++) {
    softStain(ctx, w, h, rnd() * w, rnd() * h, 30 + rnd() * 60, rnd() > 0.5 ? '#c7e6d6' : '#8ebaa6', 0.05, 100 + i);
  }
  /* 蜡笔涂鸦：太阳 */
  crayonStroke(ctx, crayonEllipsePts(112, 118, 34, 34, 20, 7), '#d9a13f', 5, 11, 0.55);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU;
    crayonStroke(ctx, [[112 + Math.cos(a) * 44, 118 + Math.sin(a) * 44], [112 + Math.cos(a) * 62, 118 + Math.sin(a) * 62]], '#d9a13f', 3.2, 20 + i, 0.45);
  }
  /* 彩虹 */
  const rainbow = ['#cf6b5f', '#d9a13f', '#7fa06a'];
  for (let i = 0; i < 3; i++) {
    const r = 84 - i * 17;
    const pts = [];
    for (let k = 0; k <= 16; k++) {
      const a = Math.PI + (k / 16) * Math.PI;
      pts.push([268 + Math.cos(a) * r, 262 + Math.sin(a) * r]);
    }
    crayonStroke(ctx, pts, rainbow[i], 4, 40 + i, 0.4);
  }
  /* 房子 */
  crayonStroke(ctx, [[126, 404], [126, 340], [196, 340], [196, 404], [126, 404]], '#b9564d', 3.4, 61, 0.5);
  crayonStroke(ctx, [[114, 344], [161, 300], [208, 344], [114, 344]], '#d9a13f', 3.4, 62, 0.55);
  crayonStroke(ctx, [[150, 372], [170, 372], [170, 400], [150, 400], [150, 372]], '#5b83a8', 2.6, 63, 0.42);
  /* 小人 */
  const stick = (cx, cy, col, sd) => {
    crayonStroke(ctx, crayonEllipsePts(cx, cy, 14, 14, 12, sd), col, 3, sd + 1, 0.55);
    crayonStroke(ctx, [[cx, cy + 14], [cx, cy + 48]], col, 3, sd + 2, 0.5);
    crayonStroke(ctx, [[cx - 18, cy + 27], [cx + 18, cy + 27]], col, 3, sd + 3, 0.5);
    crayonStroke(ctx, [[cx, cy + 48], [cx - 13, cy + 74]], col, 3, sd + 4, 0.5);
    crayonStroke(ctx, [[cx, cy + 48], [cx + 13, cy + 74]], col, 3, sd + 5, 0.5);
  };
  stick(292, 330, '#cf6b5f', 80);
  stick(352, 344, '#d9a13f', 90);
  stick(412, 352, '#b57fa6', 100);
  /* 花 */
  for (let i = 0; i < 5; i++) {
    const fx = 84 + i * 30;
    const fy = 462 + Math.sin(i * 2.1) * 10;
    crayonStroke(ctx, crayonEllipsePts(fx, fy, 6, 6, 8, 120 + i), '#cf7f9c', 2.4, 130 + i, 0.45);
    crayonStroke(ctx, [[fx, fy + 6], [fx + 2, fy + 24]], '#7fa06a', 2.2, 140 + i, 0.4);
  }
  /* 身高尺：贴在右侧 */
  const chartX = 450;
  ctx.save();
  ctx.globalAlpha = 0.82;
  ctx.strokeStyle = '#54735f';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(chartX, 286);
  ctx.lineTo(chartX, 512);
  ctx.stroke();
  for (let cm = 90; cm <= 150; cm += 10) {
    const yy = 512 - (cm - 90) * 3.7;
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(chartX - 16, yy);
    ctx.lineTo(chartX, yy);
    ctx.stroke();
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(chartX - 9, yy + 7);
    ctx.lineTo(chartX, yy + 7);
    ctx.stroke();
    drawText(ctx, String(cm), chartX + 7, yy, { font: '11px ' + FONT, color: '#456152', align: 'left', alpha: 0.95 });
  }
  drawText(ctx, '身高', chartX - 24, 274, { font: '11px ' + FONT, color: '#54735f', align: 'center', alpha: 0.9 });
  ctx.restore();
  /* 小椅子摩擦痕迹（低处） */
  for (let i = 0; i < 9; i++) {
    const cx = 90 + rnd() * 330;
    const cy = 336 + rnd() * 46;
    scuffArc(ctx, w, h, cx, cy, 16 + rnd() * 26, Math.PI * 0.06, Math.PI * 0.94, '#3a4d41', 0.13 + rnd() * 0.1, 2.4 + rnd() * 3);
  }
  for (let i = 0; i < 12; i++) {
    const x = 60 + rnd() * 380;
    const y = 320 + rnd() * 60;
    ctx.save();
    ctx.globalAlpha = 0.09 + rnd() * 0.1;
    ctx.strokeStyle = '#35473c';
    ctx.lineWidth = 1.8 + rnd() * 2.2;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + 14 + rnd() * 20, y + (rnd() - 0.5) * 8);
    ctx.stroke();
    ctx.restore();
  }
  handprint(ctx, 246, 470, 46, '#4a3a26', 0.13, -0.25);
  softStain(ctx, w, h, 380, 460, 80, '#6f8a76', 0.10, 61);
  softStain(ctx, w, h, 120, 220, 55, '#d3ecdd', 0.08, 62);
  fiberLines(ctx, w, h, hashSeed('classroom-wall-fiber'), 420, '#f2fff6', '#3c5548', 0.02, 0.05, 2, 8);
  finishTile(ctx, w, h, 'classroom-wall', { grain: 9, mottle: 0.045 });
}

function floorClassroom(ctx, w, h) {
  const rnd = mulberry32(hashSeed('classroom-floor'));
  const rows = 8;
  const ph = h / rows;
  for (let r = 0; r < rows; r++) {
    const y = r * ph;
    ctx.fillStyle = shade(C.wood, (rnd() - 0.5) * 22);
    ctx.fillRect(0, y, w, ph);
    for (let b = 0; b < 4; b++) {
      ctx.fillStyle = rgba(rnd() > 0.5 ? '#e0a86b' : '#8a5a33', 0.05 + rnd() * 0.06);
      ctx.fillRect(0, y + (ph / 4) * b, w, ph / 4);
    }
    /* 木纹：横向正弦，周期整除纹理宽度，接缝自然 */
    for (let k = 0; k < 5; k++) {
      const amp = 2 + rnd() * 5;
      const freq = 1 + Math.floor(rnd() * 3);
      const phase = rnd() * TAU;
      const yy = y + 6 + rnd() * (ph - 12);
      ctx.save();
      ctx.strokeStyle = rgba(rnd() > 0.4 ? '#6f4224' : '#e0ad76', 0.16 + rnd() * 0.22);
      ctx.lineWidth = 0.9 + rnd() * 1.9;
      ctx.beginPath();
      for (let x = 0; x <= w; x += 8) {
        const py = yy + Math.sin((x / w) * TAU * freq + phase) * amp;
        if (x === 0) ctx.moveTo(x, py);
        else ctx.lineTo(x, py);
      }
      ctx.stroke();
      ctx.restore();
    }
    /* 木节 */
    if (rnd() > 0.42) {
      const kx = rnd() * w;
      const ky = y + ph * (0.3 + rnd() * 0.4);
      const kr = 3 + rnd() * 5;
      stampEllipse(ctx, w, h, kx, ky, kr * 1.4, kr, 0, '#7b4c2b', 0.32);
      stampEllipse(ctx, w, h, kx, ky, kr * 0.8, kr * 0.55, 0, '#5f3a20', 0.3);
      stampEllipse(ctx, w, h, kx - 1, ky - 1, kr * 0.32, kr * 0.2, 0, '#c08a55', 0.28);
    }
    /* 板缝 */
    ctx.fillStyle = 'rgba(52,32,18,0.6)';
    ctx.fillRect(0, y, w, 1.6);
    ctx.fillStyle = 'rgba(240,205,160,0.22)';
    ctx.fillRect(0, y + 1.6, w, 1);
    /* 板端接缝 */
    const jx = rnd() * w;
    ctx.fillStyle = 'rgba(52,32,18,0.55)';
    ctx.fillRect(jx, y + 2, 1.6, ph - 4);
    ctx.fillStyle = 'rgba(255,230,190,0.16)';
    ctx.fillRect(jx + 1.6, y + 2, 1, ph - 4);
    /* 缝里的灰 */
    for (let i = 0; i < 5; i++) {
      stampEllipse(ctx, w, h, rnd() * w, y + (rnd() > 0.5 ? 1.5 : ph - 1.5), 4 + rnd() * 14, 0.8 + rnd() * 1.4, 0, '#4e3a24', 0.10 + rnd() * 0.14);
    }
  }
  /* 磨损：发白的踩踏区 */
  softStain(ctx, w, h, 170, 330, 120, '#dcb287', 0.10, 71);
  softStain(ctx, w, h, 410, 150, 90, '#c79a6a', 0.08, 72);
  softStain(ctx, w, h, 300, 460, 70, '#4c3018', 0.08, 73);
  /* 划痕 */
  for (let i = 0; i < 46; i++) {
    const x = rnd() * w;
    const y = rnd() * h;
    const len = 5 + rnd() * 34;
    const a = (rnd() - 0.5) * 0.9;
    ctx.save();
    ctx.globalAlpha = 0.1 + rnd() * 0.15;
    ctx.strokeStyle = rnd() > 0.5 ? '#3f2715' : '#f0d0a0';
    ctx.lineWidth = 0.8 + rnd() * 1.1;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
    ctx.stroke();
    ctx.restore();
  }
  finishTile(ctx, w, h, 'classroom-floor', { grain: 9, mottle: 0.07 });
}

function ceilClassroom(ctx, w, h) {
  dropCeiling(ctx, w, h, {
    seed: 'classroom-ceil',
    base: '#e9e4d2',
    stains: 5,
    stainColor: '#9a7a45',
    stainAlpha: 0.1,
    light: false,
    lightColor: '#f6f0d8',
    cracks: 2,
    pinholes: 1000,
    dust: 70,
  });
}

function trimClassroom(ctx, w, h) {
  baseboard(ctx, w, h, {
    seed: 'classroom-trim',
    base: C.mint,
    chips: 38,
    chipColor: '#e8e1cd',
    scratches: 22,
    grain: 7,
    dust: 26,
  });
  /* 蜡笔道子 */
  crayonStroke(ctx, [[40, 74], [180, 70]], '#cf6b5f', 2.6, 501, 0.35);
  crayonStroke(ctx, [[300, 92], [420, 86]], '#5b83a8', 2.2, 502, 0.3);
}

/* ============================ 3. nap 午睡室 ============================ */

function crescent(ctx, x, y, r, color, alpha, rot) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(0, 0, r, -Math.PI / 2, Math.PI / 2, false);
  ctx.arc(r * 0.38, 0, r * 0.92, Math.PI / 2, -Math.PI / 2, true);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function wallNap(ctx, w, h) {
  const rnd = mulberry32(hashSeed('nap-wall'));
  ctx.fillStyle = '#7d90a4';
  ctx.fillRect(0, 0, w, h);
  /* 大块褪色 / 潮湿 */
  for (let i = 0; i < 16; i++) {
    softStain(ctx, w, h, rnd() * w, rnd() * h, 50 + rnd() * 100, rnd() > 0.4 ? '#a6b6c3' : '#5c6e85', 0.10 + rnd() * 0.06, 200 + i);
  }
  /* 星星：错位网格 */
  for (let ry = 0; ry < 6; ry++) {
    for (let rx = 0; rx < 6; rx++) {
      const x = 42 + rx * 86 + (ry % 2) * 43;
      const y = 44 + ry * 84;
      star4Tiled(ctx, w, h, x % w, y % h, 6 + rnd() * 4, '#e6eeea', 0.20 + rnd() * 0.16);
    }
  }
  for (let i = 0; i < 26; i++) {
    stampEllipse(ctx, w, h, rnd() * w, rnd() * h, 1 + rnd() * 2, 1 + rnd() * 2, 0, '#dfe9e4', 0.16 + rnd() * 0.12);
  }
  /* 月亮 */
  crescent(ctx, 168, 176, 25, '#dfe8e2', 0.28, -0.35);
  crescent(ctx, 376, 404, 19, '#dfe8e2', 0.22, 0.5);
  /* 顶部潮痕 */
  for (let i = 0; i < 18; i++) {
    const x = rnd() * w;
    const len = 40 + rnd() * 150;
    const grad = ctx.createLinearGradient(0, 0, 0, len);
    grad.addColorStop(0, 'rgba(66,80,94,0)');
    grad.addColorStop(0.15, 'rgba(66,80,94,0.16)');
    grad.addColorStop(1, 'rgba(66,80,94,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(x, 0, 2 + rnd() * 9, len);
  }
  /* 撕开的壁纸，露出灰泥：形状预生成，2×2 复制后完全一致 */
  const holeCx = 382;
  const holeCy = 402;
  const holeRnd = mulberry32(hashSeed('nap-hole'));
  const holeShape = [];
  for (let k = 0; k < 30; k++) {
    const a = (k / 30) * TAU;
    const rr = 1 + Math.sin(a * 4 + 0.6) * 0.05 + (holeRnd() - 0.5) * 0.24;
    holeShape.push([Math.cos(a) * 82 * rr, Math.sin(a) * 84 * rr]);
  }
  const holeMottle = [];
  for (let i = 0; i < 22; i++) {
    holeMottle.push([(holeRnd() - 0.5) * 132, (holeRnd() - 0.5) * 150, 4 + holeRnd() * 16, holeRnd() > 0.5 ? '#9e9787' : '#c1baa9', 0.14 + holeRnd() * 0.16]);
  }
  const holePath = (px, py, ox, oy, grow) => {
    ctx.beginPath();
    holeShape.forEach((p, k) => {
      const gx = 1 + (grow || 0);
      if (k === 0) ctx.moveTo(px + p[0] * gx + (ox || 0), py + p[1] * gx + (oy || 0));
      else ctx.lineTo(px + p[0] * gx + (ox || 0), py + p[1] * gx + (oy || 0));
    });
    ctx.closePath();
  };
  eachWrap(w, h, holeCx, holeCy, 110, (px, py) => {
    ctx.save();
    /* 纸的厚度：外扩一圈的暗边 */
    holePath(px, py, 4, 6, 0.05);
    ctx.fillStyle = 'rgba(26,32,40,0.4)';
    ctx.fill();
    /* 灰泥面 */
    holePath(px, py, 0, 0, 0);
    ctx.fillStyle = '#aca595';
    ctx.fill();
    /* 灰泥斑驳 */
    ctx.save();
    holePath(px, py, 0, 0, 0);
    ctx.clip();
    for (let i = 0; i < holeMottle.length; i++) {
      const m = holeMottle[i];
      dot(ctx, px + m[0], py + m[1], m[2], m[3], m[4]);
    }
    for (let i = 0; i < 26; i++) {
      const sx = (holeRnd() - 0.5) * 150;
      const sy = (holeRnd() - 0.5) * 170;
      dot(ctx, px + sx, py + sy, 1 + holeRnd() * 2, '#8a8272', 0.3);
    }
    ctx.strokeStyle = 'rgba(78,72,62,0.5)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(px - 26, py - 34);
    ctx.lineTo(px + 10, py + 4);
    ctx.lineTo(px - 12, py + 40);
    ctx.moveTo(px + 26, py - 50);
    ctx.lineTo(px + 40, py - 14);
    ctx.stroke();
    ctx.restore();
    /* 撕口内缘：多层线，像纸的厚度 */
    holePath(px, py, 0, 0, 0);
    ctx.strokeStyle = 'rgba(28,32,38,0.16)';
    ctx.lineWidth = 8;
    ctx.stroke();
    ctx.strokeStyle = 'rgba(38,38,32,0.34)';
    ctx.lineWidth = 4;
    ctx.stroke();
    ctx.strokeStyle = 'rgba(44,42,36,0.6)';
    ctx.lineWidth = 1.6;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(px - 74, py - 18);
    ctx.quadraticCurveTo(px - 66, py + 46, px - 12, py + 84);
    ctx.strokeStyle = 'rgba(172,188,202,0.85)';
    ctx.lineWidth = 5;
    ctx.stroke();
    ctx.strokeStyle = 'rgba(60,72,86,0.35)';
    ctx.lineWidth = 1.4;
    ctx.stroke();
    /* 右下角卷起的一小块墙纸 */
    ctx.beginPath();
    ctx.moveTo(px + 38, py + 48);
    ctx.quadraticCurveTo(px + 82, py + 58, px + 60, py + 100);
    ctx.quadraticCurveTo(px + 48, py + 74, px + 38, py + 48);
    ctx.fillStyle = 'rgba(150,166,182,0.95)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(56,70,86,0.5)';
    ctx.lineWidth = 1.4;
    ctx.stroke();
    ctx.restore();
  });
  softStain(ctx, w, h, 60, 470, 70, '#333d4c', 0.12, 301);
  fiberLines(ctx, w, h, hashSeed('nap-wall-fiber'), 380, '#d6e0e4', '#4a5a6c', 0.02, 0.05, 2, 8);
  finishTile(ctx, w, h, 'nap-wall', { grain: 10, mottle: 0.085 });
}

function floorNap(ctx, w, h) {
  const rnd = mulberry32(hashSeed('nap-floor'));
  ctx.fillStyle = '#2b3a53';
  ctx.fillRect(0, 0, w, h);
  /* 地毯织纹 */
  ctx.save();
  ctx.globalAlpha = 0.05;
  ctx.strokeStyle = '#0f1828';
  ctx.lineWidth = 1;
  for (let x = 0; x < w; x += 8) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();
  }
  for (let y = 0; y < h; y += 8) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }
  ctx.restore();
  /* 地毯绒：短斜向纤维 */
  for (let i = 0; i < 2600; i++) {
    const x = rnd() * w;
    const y = rnd() * h;
    const len = 2 + rnd() * 5.5;
    const a = -0.9 + (rnd() - 0.5) * 0.5;
    const light = rnd() > 0.55;
    const col = light ? '#4a5f82' : '#182339';
    eachWrap(w, h, x, y, len + 2, (px, py) => {
      ctx.save();
      ctx.globalAlpha = 0.14 + rnd() * 0.22;
      ctx.strokeStyle = col;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(px + Math.cos(a) * len, py + Math.sin(a) * len);
      ctx.stroke();
      ctx.restore();
    });
  }
  /* 踩踏的暗块与褪色 */
  softStain(ctx, w, h, 150, 220, 110, '#141f33', 0.18, 401);
  softStain(ctx, w, h, 390, 120, 80, '#445a80', 0.12, 402);
  softStain(ctx, w, h, 300, 430, 90, '#0e1727', 0.16, 403);
  softStain(ctx, w, h, 80, 420, 120, '#3d5074', 0.08, 404);
  /* 细毛屑 */
  for (let i = 0; i < 90; i++) {
    const x = rnd() * w;
    const y = rnd() * h;
    stampEllipse(ctx, w, h, x, y, 1 + rnd() * 2, 0.6 + rnd() * 1.2, rnd() * TAU, '#71829c', 0.12 + rnd() * 0.2);
  }
  finishTile(ctx, w, h, 'nap-floor', { grain: 14, mottle: 0.11, dust: 40 });
}

function ceilNap(ctx, w, h) {
  dropCeiling(ctx, w, h, {
    seed: 'nap-ceil',
    base: '#5f6a76',
    stains: 6,
    stainColor: '#3a2f28',
    stainAlpha: 0.14,
    stars: true,
    light: false,
    cracks: 3,
    pinholes: 700,
    mold: true,
    dust: 70,
    grain: 10,
  });
}

function trimNap(ctx, w, h) {
  baseboard(ctx, w, h, {
    seed: 'nap-trim',
    base: '#33405a',
    chips: 34,
    chipColor: '#7b8aa0',
    scratches: 18,
    grain: 7,
    dust: 22,
  });
}

/* ============================ 4. canteen 食堂 ============================ */

function bunting(ctx, w, baseY, seed, alpha) {
  const rnd = mulberry32(seed >>> 0);
  const cols = ['#ffce85', '#8fcbb5', '#fff1d2', '#e0ae4a', '#e8798f'];
  const curve = (x) => baseY + Math.sin((x / w) * TAU + Math.PI / 2) * 9;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = 'rgba(108,72,54,0.7)';
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  for (let x = 0; x <= w; x += 4) {
    if (x === 0) ctx.moveTo(x, curve(x));
    else ctx.lineTo(x, curve(x));
  }
  ctx.stroke();
  /* 间距 32 整除 512，保证左右接缝处旗子连续 */
  const tris = [];
  for (let x = 16; x < w; x += 32) {
    tris.push({ x: x, c: cols[Math.floor(rnd() * cols.length)], rot: (rnd() - 0.5) * 0.14 });
  }
  for (let i = 0; i < tris.length; i++) {
    const t = tris[i];
    const y = curve(t.x);
    for (let ox = -w; ox <= w; ox += w) {
      const x = t.x + ox;
      if (x + 20 < 0 || x - 20 > w) continue;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(t.rot);
      ctx.shadowColor = 'rgba(96,56,44,0.22)';
      ctx.shadowBlur = 4;
      ctx.shadowOffsetY = 2;
      ctx.fillStyle = rgba(t.c, 0.95);
      ctx.beginPath();
      ctx.moveTo(-12, 0);
      ctx.lineTo(12, 0);
      ctx.lineTo(0, 27);
      ctx.closePath();
      ctx.fill();
      ctx.shadowColor = 'transparent';
      ctx.strokeStyle = 'rgba(96,62,48,0.42)';
      ctx.lineWidth = 1.2;
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.3)';
      ctx.beginPath();
      ctx.moveTo(-8, 4);
      ctx.lineTo(-2, 4);
      ctx.lineTo(-5, 13);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }
  ctx.restore();
}

function candyWrapper(ctx, x, y, r, rot, color, alpha) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.globalAlpha = alpha;
  /* 影子 */
  ctx.fillStyle = 'rgba(92,52,38,0.16)';
  roundRect(ctx, -r * 0.9 + 2, -r * 0.4 + 3, r * 1.8, r * 0.9, r * 0.3);
  ctx.fill();
  /* 两端扭结 */
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(-r * 0.86, -r * 0.24);
  ctx.lineTo(-r * 1.46, -r * 0.52);
  ctx.lineTo(-r * 1.3, 0);
  ctx.lineTo(-r * 1.46, r * 0.52);
  ctx.lineTo(-r * 0.86, r * 0.24);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(r * 0.86, -r * 0.24);
  ctx.lineTo(r * 1.46, -r * 0.52);
  ctx.lineTo(r * 1.3, 0);
  ctx.lineTo(r * 1.46, r * 0.52);
  ctx.lineTo(r * 0.86, r * 0.24);
  ctx.closePath();
  ctx.fill();
  /* 糖体 + 白纸腰封 */
  roundRect(ctx, -r * 0.92, -r * 0.46, r * 1.84, r * 0.92, r * 0.26);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.62)';
  roundRect(ctx, -r * 0.42, -r * 0.46, r * 0.84, r * 0.92, r * 0.1);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.28)';
  roundRect(ctx, -r * 0.62, -r * 0.36, r * 0.24, r * 0.72, r * 0.08);
  ctx.fill();
  ctx.strokeStyle = 'rgba(96,54,42,0.3)';
  ctx.lineWidth = 1.2;
  roundRect(ctx, -r * 0.92, -r * 0.46, r * 1.84, r * 0.92, r * 0.26);
  ctx.stroke();
  ctx.restore();
}

function wallCanteen(ctx, w, h) {
  const rnd = mulberry32(hashSeed('canteen-wall'));
  ctx.fillStyle = C.pink;
  ctx.fillRect(0, 0, w, h);
  /* 糖纸条纹（步长整除 512，接缝处不断裂） */
  for (let x = 0; x < w; x += 64) {
    ctx.fillStyle = 'rgba(255,240,228,0.15)';
    ctx.fillRect(x, 0, 32, h);
  }
  bunting(ctx, w, 58, 701, 0.98);
  bunting(ctx, w, 302, 702, 0.9);
  /* 糖纸图案 */
  const wrapCols = ['#ffe9bd', '#cfe8dd', '#fff6e4', '#efd48f', '#f8d2dc', '#e9b6c4'];
  for (let i = 0; i < 20; i++) {
    candyWrapper(
      ctx,
      34 + rnd() * 444,
      112 + rnd() * 292,
      10 + rnd() * 8,
      (rnd() - 0.5) * 0.9,
      wrapCols[Math.floor(rnd() * wrapCols.length)],
      0.62 + rnd() * 0.3
    );
  }
  /* 地上飘起来的彩纸屑 */
  for (let i = 0; i < 46; i++) {
    stampEllipse(ctx, w, h, rnd() * w, rnd() * h, 1.5 + rnd() * 3, 1 + rnd() * 2, rnd() * TAU, wrapCols[Math.floor(rnd() * wrapCols.length)], 0.18 + rnd() * 0.3);
  }
  /* 油渍 / 奶油手印：食堂最脏 */
  softStain(ctx, w, h, 120, 430, 100, '#8a5a2a', 0.15, 711);
  softStain(ctx, w, h, 380, 470, 90, '#7a4c22', 0.14, 712);
  softStain(ctx, w, h, 450, 200, 50, '#a9743a', 0.12, 713);
  softStain(ctx, w, h, 210, 240, 60, '#9a6a3a', 0.09, 714);
  handprint(ctx, 330, 430, 54, '#6b4326', 0.14, 0.4);
  /* 椅子高度的一圈磨痕 */
  for (let i = 0; i < 10; i++) {
    scuffArc(ctx, w, h, 40 + rnd() * 430, 350 + rnd() * 40, 14 + rnd() * 24, Math.PI * 0.08, Math.PI * 0.92, '#6b3d28', 0.07 + rnd() * 0.08, 2 + rnd() * 2.4);
  }
  for (let i = 0; i < 34; i++) {
    stampEllipse(ctx, w, h, rnd() * w, 330 + rnd() * 180, 1 + rnd() * 4, 1 + rnd() * 3, rnd() * TAU, rnd() > 0.5 ? '#7a4a26' : '#b06a3a', 0.10 + rnd() * 0.18);
  }
  /* 底部磨脏 */
  for (let i = 0; i < 26; i++) {
    stampEllipse(ctx, w, h, rnd() * w, h - 10 - rnd() * 40, 6 + rnd() * 16, 3 + rnd() * 8, rnd() * TAU, '#5f3a26', 0.05 + rnd() * 0.06);
  }
  fiberLines(ctx, w, h, hashSeed('canteen-wall-fiber'), 380, '#fff4e8', '#7a4636', 0.02, 0.05, 2, 8);
  finishTile(ctx, w, h, 'canteen-wall', { grain: 10, mottle: 0.06 });
}

function floorCanteen(ctx, w, h) {
  const rnd = mulberry32(hashSeed('canteen-floor'));
  const n = 8;
  const s = w / n;
  for (let gy = 0; gy < n; gy++) {
    for (let gx = 0; gx < n; gx++) {
      const dark = (gx + gy) % 2 === 0;
      const base = dark ? '#2e2b29' : '#e8e0cb';
      ctx.fillStyle = shade(base, (rnd() - 0.5) * 16);
      ctx.fillRect(gx * s, gy * s, s, s);
      /* 每块砖的脏污倾向 */
      ctx.fillStyle = rgba(dark ? '#5c5446' : '#8a7854', 0.03 + rnd() * 0.09);
      ctx.fillRect(gx * s, gy * s, s, s);
      /* 边缘磨损 */
      if (rnd() > 0.55) {
        stampEllipse(ctx, w, h, gx * s + s * (0.15 + rnd() * 0.7), gy * s + s * (0.15 + rnd() * 0.7), 4 + rnd() * 12, 3 + rnd() * 7, rnd() * TAU, dark ? '#b8ad94' : '#6a6152', 0.07 + rnd() * 0.12);
      }
    }
  }
  /* 勾缝 */
  for (let i = 0; i <= n; i++) {
    ctx.fillStyle = 'rgba(122,112,94,0.6)';
    ctx.fillRect(i * s - 1, 0, 2, h);
    ctx.fillRect(0, i * s - 1, w, 2);
  }
  for (let i = 0; i < 90; i++) {
    stampEllipse(ctx, w, h, rnd() * w, rnd() * h, 1.5 + rnd() * 4, 1 + rnd() * 2, rnd() * TAU, '#5f5544', 0.08 + rnd() * 0.14);
  }
  /* 鞋印 / 拖把痕 */
  for (let i = 0; i < 14; i++) {
    const x = rnd() * w;
    const y = rnd() * h;
    const rot = rnd() * TAU;
    stampEllipse(ctx, w, h, x, y, 5 + rnd() * 4, 11 + rnd() * 6, rot, '#4a4236', 0.06 + rnd() * 0.08);
    stampEllipse(ctx, w, h, x + Math.cos(rot) * 10, y + Math.sin(rot) * 10, 4 + rnd() * 3, 8 + rnd() * 5, rot, '#4a4236', 0.05 + rnd() * 0.07);
  }
  /* 食物污渍 */
  softStain(ctx, w, h, 210, 300, 60, '#5a2b22', 0.12, 801);
  softStain(ctx, w, h, 430, 120, 45, '#8a6a24', 0.12, 802);
  softStain(ctx, w, h, 90, 460, 50, '#4a2a1e', 0.10, 803);
  /* 裂缝 */
  crack(ctx, w, h, [[300, 0], [306, 60], [298, 128], [312, 200], [304, 262]], 'rgba(40,34,28,0.55)', 0.5, 1.2, true);
  crack(ctx, w, h, [[120, 330], [150, 352], [142, 396], [170, 430]], 'rgba(40,34,28,0.4)', 0.4, 1, true);
  finishTile(ctx, w, h, 'canteen-floor', { grain: 11, mottle: 0.08 });
}

function ceilCanteen(ctx, w, h) {
  dropCeiling(ctx, w, h, {
    seed: 'canteen-ceil',
    base: '#f2dfc4',
    stains: 5,
    stainColor: '#966a34',
    stainAlpha: 0.12,
    light: true,
    lightColor: '#ffdfae',
    cracks: 2,
    pinholes: 800,
    dust: 90,
  });
  /* 天花板上的彩纸屑残留 */
  const rnd = mulberry32(hashSeed('canteen-ceil-confetti'));
  const cols = ['#f7b6c2', '#a9d6c4', '#ffd9a0', '#e9c46a'];
  for (let i = 0; i < 22; i++) {
    const x = rnd() * w;
    const y = rnd() * h;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rnd() * TAU);
    ctx.globalAlpha = 0.35 + rnd() * 0.3;
    ctx.fillStyle = cols[Math.floor(rnd() * cols.length)];
    ctx.fillRect(-2, -1, 4, 2);
    ctx.restore();
  }
}

function trimCanteen(ctx, w, h) {
  baseboard(ctx, w, h, {
    seed: 'canteen-trim',
    base: '#f2e6d2',
    stripe: C.pink,
    stripeY: 18,
    chips: 40,
    chipColor: '#d9c9ad',
    scratches: 22,
    grain: 8,
    dust: 30,
  });
  softStain(ctx, w, h, 120, 110, 38, '#7a4a26', 0.16, 810);
  softStain(ctx, w, h, 380, 104, 30, '#5a3a22', 0.14, 811);
}

/* ============================ 5. corridor 走廊 ============================ */

function wallCorridor(ctx, w, h) {
  const rnd = mulberry32(hashSeed('corridor-wall'));
  /* 上部：奶黄小瓷砖 */
  const dado = 334;
  const ts = 32;
  ctx.fillStyle = '#e8d6b0';
  ctx.fillRect(0, 0, w, dado);
  for (let y = 0; y < dado; y += ts) {
    for (let x = 0; x < w; x += ts) {
      const v = (rnd() - 0.5) * 16;
      const g = ctx.createLinearGradient(x, y, x + ts, y + ts);
      g.addColorStop(0, shade('#f4e6c6', v + 7));
      g.addColorStop(1, shade('#e6d2a8', v - 6));
      ctx.fillStyle = g;
      ctx.fillRect(x + 1, y + 1, ts - 2, ts - 2);
      ctx.fillStyle = 'rgba(255,255,255,0.20)';
      ctx.fillRect(x + 2, y + 2, ts - 4, 2);
      ctx.fillStyle = 'rgba(255,255,255,0.10)';
      ctx.fillRect(x + 2, y + 2, 2, ts - 4);
      if (rnd() > 0.965) {
        ctx.strokeStyle = 'rgba(90,74,52,0.5)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x + 5, y + 6);
        ctx.lineTo(x + ts - 7, y + ts - 9);
        ctx.stroke();
      }
    }
  }
  /* 瓷缝 */
  ctx.strokeStyle = 'rgba(132,110,78,0.72)';
  ctx.lineWidth = 2;
  for (let x = 0; x <= w; x += ts) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, dado);
    ctx.stroke();
  }
  for (let y = 0; y <= dado; y += ts) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }
  /* 缺瓷砖 / 裂瓷砖 */
  for (let i = 0; i < 3; i++) {
    const mx = 64 + Math.floor(rnd() * 12) * ts;
    const my = 96 + Math.floor(rnd() * 6) * ts;
    ctx.fillStyle = '#b7ab94';
    ctx.fillRect(mx + 2, my + 2, ts - 4, ts - 4);
    ctx.strokeStyle = 'rgba(70,58,42,0.5)';
    ctx.lineWidth = 2;
    ctx.strokeRect(mx + 2, my + 2, ts - 4, ts - 4);
    stampEllipse(ctx, w, h, mx + ts / 2, my + ts / 2, ts * 0.32, ts * 0.2, 0.4, '#8c8271', 0.4);
  }
  for (let i = 0; i < 5; i++) {
    const cx2 = 40 + rnd() * 430;
    const cy2 = 30 + rnd() * 270;
    crack(ctx, w, h, [[cx2, cy2], [cx2 + 10 + rnd() * 14, cy2 + 8], [cx2 + 6, cy2 + 22 + rnd() * 8]], 'rgba(88,74,52,0.55)', 0.5, 1.1, true);
  }
  /* 深绿墙裙 */
  ctx.fillStyle = '#2f4a3d';
  ctx.fillRect(0, dado, w, h - dado);
  for (let i = 0; i < 240; i++) {
    stampEllipse(ctx, w, h, rnd() * w, dado + rnd() * (h - dado), 6 + rnd() * 22, 3 + rnd() * 10, rnd() * TAU, rnd() > 0.5 ? '#3d5c4b' : '#243a2f', 0.05 + rnd() * 0.08);
  }
  /* 压条 */
  ctx.fillStyle = '#e6d3ac';
  ctx.fillRect(0, dado - 9, w, 9);
  ctx.fillStyle = 'rgba(255,250,235,0.35)';
  ctx.fillRect(0, dado - 9, w, 2);
  ctx.fillStyle = 'rgba(22,34,26,0.4)';
  ctx.fillRect(0, dado, w, 3);
  /* 顺墙流下的污痕 */
  for (let i = 0; i < 40; i++) {
    const x = rnd() * w;
    const len = 50 + rnd() * 170;
    const g = ctx.createLinearGradient(0, 0, 0, len);
    g.addColorStop(0, 'rgba(52,40,26,0)');
    g.addColorStop(0.14, 'rgba(52,40,26,0.14)');
    g.addColorStop(1, 'rgba(52,40,26,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x, 0, 1.5 + rnd() * 7, len);
  }
  /* 墙裙下缘磨脏 / 擦痕 */
  for (let i = 0; i < 34; i++) {
    stampEllipse(ctx, w, h, rnd() * w, h - rnd() * 46, 8 + rnd() * 22, 3 + rnd() * 8, rnd() * 0.5, '#17231c', 0.1 + rnd() * 0.12);
  }
  /* 墙裙上的水渍与烟熏 */
  softStain(ctx, w, h, 80, 420, 55, '#1a261f', 0.14, 902);
  softStain(ctx, w, h, 360, 460, 70, '#22332a', 0.12, 903);
  for (let i = 0; i < 16; i++) {
    const x = rnd() * w;
    const y = 350 + rnd() * 120;
    ctx.save();
    ctx.globalAlpha = 0.06 + rnd() * 0.09;
    ctx.strokeStyle = '#141f19';
    ctx.lineWidth = 1 + rnd() * 2;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + 10 + rnd() * 28, y + (rnd() - 0.5) * 10);
    ctx.stroke();
    ctx.restore();
  }
  softStain(ctx, w, h, 90, 470, 60, '#1c2a22', 0.12, 901);
  finishTile(ctx, w, h, 'corridor-wall', { grain: 9, mottle: 0.05 });
}

function floorCorridor(ctx, w, h) {
  const rnd = mulberry32(hashSeed('corridor-floor'));
  ctx.fillStyle = '#7c8a7d';
  ctx.fillRect(0, 0, w, h);
  const tile = 128;
  for (let ty = 0; ty < h; ty += tile) {
    for (let tx = 0; tx < w; tx += tile) {
      ctx.fillStyle = shade('#7c8a7d', (rnd() - 0.5) * 12);
      ctx.fillRect(tx, ty, tile, tile);
      const g = ctx.createLinearGradient(tx, ty, tx + tile, ty + tile);
      g.addColorStop(0, 'rgba(255,255,255,0.05)');
      g.addColorStop(1, 'rgba(30,34,26,0.06)');
      ctx.fillStyle = g;
      ctx.fillRect(tx, ty, tile, tile);
    }
  }
  /* 亚麻地胶的碎屑斑点 */
  for (let i = 0; i < 1500; i++) {
    const x = rnd() * w;
    const y = rnd() * h;
    const r = 0.5 + rnd() * 1.8;
    stampEllipse(ctx, w, h, x, y, r, r * 0.8, rnd() * TAU, rnd() > 0.45 ? '#9cab99' : '#526056', 0.2 + rnd() * 0.34);
  }
  /* 缝 + 缝里的黑垢 */
  for (let x = 0; x <= w; x += tile) {
    ctx.fillStyle = 'rgba(60,68,58,0.55)';
    ctx.fillRect(x - 1.5, 0, 3, h);
    ctx.fillStyle = 'rgba(235,242,230,0.16)';
    ctx.fillRect(x + 1.5, 0, 1, h);
  }
  for (let y = 0; y <= h; y += tile) {
    ctx.fillStyle = 'rgba(60,68,58,0.55)';
    ctx.fillRect(0, y - 1.5, w, 3);
    ctx.fillStyle = 'rgba(235,242,230,0.12)';
    ctx.fillRect(0, y + 1.5, w, 1);
  }
  for (let i = 0; i < 130; i++) {
    stampEllipse(ctx, w, h, rnd() * w, rnd() * h, 2 + rnd() * 7, 1 + rnd() * 3, rnd() * TAU, '#39463a', 0.12 + rnd() * 0.2);
  }
  /* 鞋底黑印 / 拖擦 */
  for (let i = 0; i < 40; i++) {
    const x = rnd() * w;
    const y = rnd() * h;
    const rot = rnd() * TAU;
    stampEllipse(ctx, w, h, x, y, 6 + rnd() * 9, 2 + rnd() * 4, rot, '#2e3830', 0.08 + rnd() * 0.12);
  }
  for (let i = 0; i < 26; i++) {
    scuffArc(ctx, w, h, rnd() * w, rnd() * h, 8 + rnd() * 34, Math.PI * (0.1 + rnd() * 0.4), Math.PI * (1.1 + rnd() * 0.5), '#36453a', 0.06 + rnd() * 0.1, 1 + rnd() * 2);
  }
  /* 水渍 / 霉 / 暗红拖痕 */
  softStain(ctx, w, h, 130, 180, 80, '#43503f', 0.14, 911);
  softStain(ctx, w, h, 400, 420, 70, '#2f3a2e', 0.17, 912);
  softStain(ctx, w, h, 320, 90, 45, '#4a2a26', 0.13, 913);
  softStain(ctx, w, h, 60, 300, 60, '#26302a', 0.12, 914);
  softStain(ctx, w, h, 210, 500, 40, '#5a2e26', 0.12, 915);
  /* 裂缝 */
  crack(ctx, w, h, [[256, 300], [262, 340], [254, 382], [266, 420]], 'rgba(48,52,40,0.45)', 0.4, 1, true);
  finishTile(ctx, w, h, 'corridor-floor', { grain: 10, mottle: 0.07 });
}

function ceilCorridor(ctx, w, h) {
  dropCeiling(ctx, w, h, {
    seed: 'corridor-ceil',
    base: '#c9c4b4',
    stains: 6,
    stainColor: '#7a5f36',
    stainAlpha: 0.14,
    light: true,
    lightColor: '#e6f0d8',
    cracks: 3,
    pinholes: 900,
    mold: true,
    dust: 80,
    grain: 9,
  });
}

function trimCorridor(ctx, w, h) {
  baseboard(ctx, w, h, {
    seed: 'corridor-trim',
    base: '#2e4a3d',
    chips: 44,
    chipColor: '#d9cfb4',
    scratches: 24,
    grain: 8,
    dust: 24,
  });
}

/* ============================ 6. exit 出口区 ============================ */

function wallExit(ctx, w, h) {
  const rnd = mulberry32(hashSeed('exit-wall'));
  const base = '#8c8b85';
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, w, h);
  /* 混凝土色差 / 骨料 */
  for (let i = 0; i < 26; i++) {
    softStain(ctx, w, h, rnd() * w, rnd() * h, 40 + rnd() * 90, rnd() > 0.5 ? '#a3a29b' : '#6e6d68', 0.08 + rnd() * 0.06, 1000 + i);
  }
  for (let i = 0; i < 1100; i++) {
    const x = rnd() * w;
    const y = rnd() * h;
    const r = 0.5 + rnd() * 2.2;
    stampEllipse(ctx, w, h, x, y, r, r * 0.8, rnd() * TAU, rnd() > 0.5 ? '#a6a59e' : '#6a6964', 0.2 + rnd() * 0.3);
  }
  /* 模板缝 */
  for (let x = 0; x <= w; x += 256) {
    ctx.fillStyle = 'rgba(58,57,53,0.5)';
    ctx.fillRect(x - 1.5, 0, 3, h);
    ctx.fillStyle = 'rgba(190,188,180,0.3)';
    ctx.fillRect(x + 1.5, 0, 1, h);
  }
  /* 对拉螺栓孔 + 锈迹 */
  for (let x = 64; x < w; x += 128) {
    for (let y = 128; y < h; y += 256) {
      stampEllipse(ctx, w, h, x, y, 7, 7, 0, '#57564f', 0.55);
      stampEllipse(ctx, w, h, x, y, 4.5, 4.5, 0, '#3f3e39', 0.55);
      ctx.save();
      ctx.globalAlpha = 0.3;
      ctx.fillStyle = '#6a4428';
      ctx.fillRect(x - 2.5, y + 5, 5, 16 + rnd() * 34);
      ctx.restore();
      stampEllipse(ctx, w, h, x + 6 + rnd() * 10, y + 30 + rnd() * 30, 4 + rnd() * 10, 3 + rnd() * 6, rnd() * TAU, '#5f4426', 0.12);
    }
  }
  /* 绿色应急漆（下部） */
  const paintY = 298;
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(0, paintY);
  for (let x = 0; x <= w; x += 4) {
    const yy = paintY + Math.sin((x / w) * TAU * 2) * 3 + Math.sin((x / w) * TAU * 5 + 1.2) * 1.8;
    ctx.lineTo(x, yy);
  }
  ctx.lineTo(w, h);
  ctx.lineTo(0, h);
  ctx.closePath();
  ctx.fillStyle = '#3f6b4c';
  ctx.fill();
  ctx.restore();
  for (let i = 0; i < 220; i++) {
    stampEllipse(ctx, w, h, rnd() * w, paintY + rnd() * (h - paintY), 8 + rnd() * 26, 4 + rnd() * 12, rnd() * TAU, rnd() > 0.5 ? '#4d7d5a' : '#325840', 0.05 + rnd() * 0.07);
  }
  /* 漆边起皮、剥落 */
  for (let i = 0; i < 30; i++) {
    const x = rnd() * w;
    const y = paintY + Math.sin((x / w) * TAU * 2) * 3 + Math.sin((x / w) * TAU * 5 + 1.2) * 1.8;
    stampEllipse(ctx, w, h, x, y, 3 + rnd() * 12, 1.5 + rnd() * 3.5, 0, '#8c8b85', 0.35 + rnd() * 0.35);
  }
  /* 顺墙流下的水痕 */
  for (let i = 0; i < 18; i++) {
    const x = rnd() * w;
    const len = 30 + rnd() * 130;
    const g = ctx.createLinearGradient(0, 0, 0, len);
    g.addColorStop(0, 'rgba(56,56,52,0)');
    g.addColorStop(0.15, 'rgba(56,56,52,0.18)');
    g.addColorStop(1, 'rgba(56,56,52,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x, 0, 2 + rnd() * 7, len);
  }
  /* 掉漆：露出混凝土 */
  const rnd2 = mulberry32(hashSeed('exit-peel'));
  for (let i = 0; i < 10; i++) {
    const cx = 40 + rnd2() * 430;
    const cy = paintY + 24 + rnd2() * (h - paintY - 50);
    const rr = 8 + rnd2() * 22;
    const n = 9;
    const shape = [];
    for (let k = 0; k < n; k++) {
      const a = (k / n) * TAU;
      const rad = rr * (0.6 + rnd2() * 0.7);
      shape.push([cx + Math.cos(a) * rad, cy + Math.sin(a) * rad]);
    }
    eachWrap(w, h, cx, cy, rr + 3, (ox, oy) => {
      ctx.save();
      ctx.beginPath();
      shape.forEach((p, k) => {
        if (k === 0) ctx.moveTo(p[0] + ox, p[1] + oy);
        else ctx.lineTo(p[0] + ox, p[1] + oy);
      });
      ctx.closePath();
      ctx.fillStyle = '#8c8b85';
      ctx.fill();
      ctx.strokeStyle = 'rgba(40,46,38,0.5)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.restore();
    });
  }
  /* 漆边滴流 */
  for (let i = 0; i < 22; i++) {
    const x = rnd() * w;
    ctx.save();
    ctx.globalAlpha = 0.25;
    ctx.fillStyle = '#35563f';
    ctx.fillRect(x, paintY - 3 + rnd() * 4, 1.5 + rnd() * 2.5, 12 + rnd() * 44);
    ctx.restore();
  }
  /* “出口”箭头模板喷涂 */
  ctx.save();
  ctx.globalAlpha = 0.4;
  ctx.fillStyle = '#a8c9a4';
  ctx.fillRect(196, 246, 88, 12);
  ctx.beginPath();
  ctx.moveTo(284, 236);
  ctx.lineTo(320, 252);
  ctx.lineTo(284, 268);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  for (let i = 0; i < 18; i++) {
    stampEllipse(ctx, w, h, 196 + rnd() * 124, 236 + rnd() * 32, 1 + rnd() * 4, 1 + rnd() * 2, 0, '#8c8b85', 0.8);
  }
  /* 裂缝 / 锈水 / 底部脏 */
  crack(ctx, w, h, [[390, 40], [398, 120], [386, 180], [402, 250], [396, 296]], 'rgba(48,47,43,0.5)', 0.5, 1.3, true);
  softStain(ctx, w, h, 430, 350, 50, '#5f4426', 0.17, 1001);
  softStain(ctx, w, h, 60, 480, 70, '#4a4a44', 0.18, 1002);
  softStain(ctx, w, h, 150, 250, 60, '#66655f', 0.12, 1003);
  softStain(ctx, w, h, 330, 470, 50, '#3f3f39', 0.15, 1004);
  finishTile(ctx, w, h, 'exit-wall', { grain: 10, mottle: 0.07 });
}

function floorExit(ctx, w, h) {
  const rnd = mulberry32(hashSeed('exit-floor'));
  ctx.fillStyle = '#6f6f6a';
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 24; i++) {
    softStain(ctx, w, h, rnd() * w, rnd() * h, 50 + rnd() * 100, rnd() > 0.5 ? '#82827c' : '#5a5a55', 0.09 + rnd() * 0.06, 1100 + i);
  }
  for (let i = 0; i < 1300; i++) {
    const x = rnd() * w;
    const y = rnd() * h;
    const r = 0.5 + rnd() * 2.4;
    stampEllipse(ctx, w, h, x, y, r, r * 0.8, rnd() * TAU, rnd() > 0.5 ? '#8b8b84' : '#4f4f4a', 0.18 + rnd() * 0.3);
  }
  /* 切缝 */
  for (let x = 0; x <= w; x += 256) {
    ctx.fillStyle = 'rgba(45,45,41,0.55)';
    ctx.fillRect(x - 1.5, 0, 3, h);
    ctx.fillStyle = 'rgba(200,198,190,0.18)';
    ctx.fillRect(x + 1.5, 0, 1, h);
  }
  for (let y = 0; y <= h; y += 256) {
    ctx.fillStyle = 'rgba(45,45,41,0.55)';
    ctx.fillRect(0, y - 1.5, w, 3);
  }
  /* 磨损的黄色安全线（贴纹理上缘，平铺成连续车道线） */
  ctx.save();
  ctx.globalAlpha = 0.58;
  ctx.fillStyle = '#c8a844';
  ctx.fillRect(0, 2, w, 12);
  ctx.restore();
  const rnd2 = mulberry32(hashSeed('exit-line-wear'));
  for (let i = 0; i < 30; i++) {
    stampEllipse(ctx, w, h, rnd2() * w, 7, 3 + rnd2() * 14, 2 + rnd2() * 5, 0, '#6f6f6a', 0.55 + rnd2() * 0.4);
  }
  /* 油渍 */
  softStain(ctx, w, h, 150, 330, 70, '#26241f', 0.22, 1101);
  softStain(ctx, w, h, 380, 180, 60, '#2b2924', 0.18, 1102);
  softStain(ctx, w, h, 250, 440, 52, '#3a2a22', 0.14, 1103);
  softStain(ctx, w, h, 460, 500, 60, '#23211d', 0.16, 1104);
  softStain(ctx, w, h, 70, 90, 45, '#4a4842', 0.12, 1105);
  /* 轮胎/拖拽痕 */
  for (let i = 0; i < 6; i++) {
    const x = 60 + rnd() * 400;
    ctx.save();
    ctx.globalAlpha = 0.08;
    ctx.strokeStyle = '#25241f';
    ctx.lineWidth = 4 + rnd() * 8;
    ctx.beginPath();
    ctx.moveTo(x, 300);
    ctx.quadraticCurveTo(x + 40, 380, x + 10, 500);
    ctx.stroke();
    ctx.restore();
  }
  crack(ctx, w, h, [[80, 120], [120, 150], [112, 210], [150, 240]], 'rgba(40,40,36,0.5)', 0.4, 1.2, true);
  finishTile(ctx, w, h, 'exit-floor', { grain: 10, mottle: 0.06 });
}

function ceilExit(ctx, w, h) {
  const rnd = mulberry32(hashSeed('exit-ceil'));
  ctx.fillStyle = '#4b4b48';
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 22; i++) {
    softStain(ctx, w, h, rnd() * w, rnd() * h, 50 + rnd() * 100, rnd() > 0.5 ? '#5a5a55' : '#3a3a37', 0.1 + rnd() * 0.07, 1200 + i);
  }
  for (let i = 0; i < 900; i++) {
    const x = rnd() * w;
    const y = rnd() * h;
    const r = 0.5 + rnd() * 2;
    stampEllipse(ctx, w, h, x, y, r, r * 0.8, rnd() * TAU, rnd() > 0.5 ? '#66665f' : '#35352f', 0.2 + rnd() * 0.28);
  }
  for (let y = 0; y <= h; y += 256) {
    ctx.fillStyle = 'rgba(30,30,27,0.5)';
    ctx.fillRect(0, y - 1.5, w, 3);
    ctx.fillStyle = 'rgba(150,148,140,0.12)';
    ctx.fillRect(0, y + 1.5, w, 1);
  }
  /* 锈水 / 水渍 */
  softStain(ctx, w, h, 420, 80, 70, '#5f4426', 0.2, 1201);
  waterRing(ctx, w, h, 120, 380, 75, '#3a2e24', 0.18, 1202);
  /* 工业吊灯：铁罩 + 护笼 */
  const lx = 256;
  const ly = 256;
  ctx.save();
  const glow = ctx.createRadialGradient(lx, ly, 0, lx, ly, 150);
  glow.addColorStop(0, 'rgba(255,238,190,0.30)');
  glow.addColorStop(1, 'rgba(255,238,190,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(lx - 160, ly - 160, 320, 320);
  ctx.strokeStyle = '#262620';
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.arc(lx, ly, 52, 0, TAU);
  ctx.stroke();
  const bulb = ctx.createRadialGradient(lx, ly, 2, lx, ly, 40);
  bulb.addColorStop(0, '#fff4cc');
  bulb.addColorStop(0.5, '#e8c274');
  bulb.addColorStop(1, '#6a5732');
  ctx.fillStyle = bulb;
  ctx.beginPath();
  ctx.arc(lx, ly, 40, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = 'rgba(30,30,26,0.85)';
  ctx.lineWidth = 2.4;
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU;
    ctx.beginPath();
    ctx.moveTo(lx, ly);
    ctx.lineTo(lx + Math.cos(a) * 54, ly + Math.sin(a) * 54);
    ctx.stroke();
  }
  for (let rr = 16; rr <= 46; rr += 15) {
    ctx.beginPath();
    ctx.arc(lx, ly, rr, 0, TAU);
    ctx.stroke();
  }
  ctx.fillStyle = 'rgba(20,20,17,0.55)';
  ctx.beginPath();
  ctx.arc(lx, ly, 8, 0, TAU);
  ctx.fill();
  ctx.restore();
  crack(ctx, w, h, [[60, 60], [76, 120], [66, 200]], 'rgba(30,30,27,0.5)', 0.5, 1.2, true);
  finishTile(ctx, w, h, 'exit-ceil', { grain: 10, mottle: 0.06, dust: 55 });
}

function trimExit(ctx, w, h) {
  const rnd = mulberry32(hashSeed('exit-trim'));
  ctx.fillStyle = '#35533f';
  ctx.fillRect(0, 0, w, h);
  /* 拉丝金属 */
  for (let i = 0; i < 340; i++) {
    const y = rnd() * h;
    ctx.fillStyle = rgba(rnd() > 0.5 ? '#7f9c86' : '#1f3327', 0.05 + rnd() * 0.09);
    ctx.fillRect(0, y, w, 0.8 + rnd() * 1.8);
  }
  ctx.fillStyle = 'rgba(255,255,240,0.22)';
  ctx.fillRect(0, 2, w, 3);
  ctx.fillStyle = 'rgba(12,20,14,0.5)';
  ctx.fillRect(0, h - 8, w, 4);
  /* 铆钉 */
  for (let x = 32; x < w; x += 64) {
    const y = h * 0.55;
    ctx.fillStyle = '#22382b';
    ctx.beginPath();
    ctx.arc(x, y, 5, 0, TAU);
    ctx.fill();
    ctx.fillStyle = 'rgba(190,210,190,0.5)';
    ctx.beginPath();
    ctx.arc(x - 1.4, y - 1.4, 2.2, 0, TAU);
    ctx.fill();
  }
  /* 锈 / 划痕 / 凹痕 */
  for (let i = 0; i < 22; i++) {
    stampEllipse(ctx, w, h, rnd() * w, rnd() * h, 2 + rnd() * 9, 1 + rnd() * 4, rnd() * TAU, '#6a4428', 0.12 + rnd() * 0.2);
  }
  for (let i = 0; i < 30; i++) {
    const x = rnd() * w;
    const y = rnd() * h;
    ctx.save();
    ctx.globalAlpha = 0.1 + rnd() * 0.18;
    ctx.strokeStyle = rnd() > 0.5 ? '#b9cdb9' : '#101d14';
    ctx.lineWidth = 0.8 + rnd() * 1.2;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + 12 + rnd() * 40, y + (rnd() - 0.5) * 4);
    ctx.stroke();
    ctx.restore();
  }
  finishTile(ctx, w, h, 'exit-trim', { grain: 8, mottle: 0.05, dust: 24 });
}

/* ============================ 奶蛙脸 ============================ */

function frogHeadPath(ctx, r) {
  ctx.beginPath();
  ctx.moveTo(0, -0.78 * r);
  ctx.bezierCurveTo(0.52 * r, -0.88 * r, 1.04 * r, -0.44 * r, 1.0 * r, 0.04 * r);
  ctx.bezierCurveTo(0.98 * r, 0.48 * r, 0.6 * r, 0.7 * r, 0, 0.73 * r);
  ctx.bezierCurveTo(-0.6 * r, 0.7 * r, -0.98 * r, 0.48 * r, -1.0 * r, 0.04 * r);
  ctx.bezierCurveTo(-1.04 * r, -0.44 * r, -0.52 * r, -0.88 * r, 0, -0.78 * r);
  ctx.closePath();
}

function dot(ctx, x, y, r, color, alpha) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fill();
  ctx.restore();
}

/* 奶蛙正脸：可爱又不对劲。headFill=false 时光画五官（用于整张皮肤贴图） */
function drawFrogHead(ctx, cx, cy, r, o) {
  const opt = o || {};
  const rnd = mulberry32(hashSeed(opt.seed || 'frog-head'));
  const top = opt.top || '#dceb92';
  const bottom = opt.bottom || '#a7c257';
  const headFill = opt.headFill !== false;
  const lineW = Math.max(1, r * 0.02);
  const outline = opt.outline || 'rgba(56,68,28,0.45)';
  ctx.save();
  ctx.translate(cx, cy);
  if (opt.rot) ctx.rotate(opt.rot);

  if (headFill) {
    const g = ctx.createLinearGradient(0, -r, 0, 0.8 * r);
    g.addColorStop(0, top);
    g.addColorStop(1, bottom);
    frogHeadPath(ctx, r);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = outline;
    ctx.lineWidth = lineW;
    ctx.stroke();
  }

  /* 皮肤斑点 / 高光 / 腮红（裁剪进脸部） */
  ctx.save();
  if (headFill) frogHeadPath(ctx, r);
  else {
    ctx.beginPath();
    ctx.arc(0, 0, r * 1.02, 0, TAU);
  }
  ctx.clip();
  for (let i = 0; i < 52; i++) {
    const a = rnd() * TAU;
    const d = Math.sqrt(rnd()) * r * 0.98;
    const x = Math.cos(a) * d;
    const y = Math.sin(a) * d * 0.78;
    dot(ctx, x, y, r * (0.012 + rnd() * 0.032), rnd() > 0.35 ? '#8fae45' : '#c9dd80', 0.3 + rnd() * 0.3);
  }
  for (let i = 0; i < 7; i++) {
    const a = rnd() * TAU;
    const d = (0.3 + rnd() * 0.6) * r;
    const x = Math.cos(a) * d;
    const y = Math.sin(a) * d * 0.7 + r * 0.1;
    dot(ctx, x, y, r * (0.03 + rnd() * 0.03), '#7d9a38', 0.35);
    dot(ctx, x - r * 0.008, y - r * 0.008, r * 0.012, '#d7e79c', 0.4);
  }
  const hl = ctx.createRadialGradient(-r * 0.28, -r * 0.5, 0, -r * 0.28, -r * 0.5, r * 0.8);
  hl.addColorStop(0, 'rgba(255,255,225,0.28)');
  hl.addColorStop(1, 'rgba(255,255,225,0)');
  ctx.fillStyle = hl;
  ctx.fillRect(-r, -r, 2 * r, 2 * r);
  const blush = opt.blush == null ? 0.44 : opt.blush;
  if (blush > 0) {
    for (let s = -1; s <= 1; s += 2) {
      const bg = ctx.createRadialGradient(s * r * 0.58, r * 0.2, 0, s * r * 0.58, r * 0.2, r * 0.26);
      bg.addColorStop(0, 'rgba(244,150,160,' + blush + ')');
      bg.addColorStop(1, 'rgba(244,150,160,0)');
      ctx.fillStyle = bg;
      ctx.beginPath();
      ctx.arc(s * r * 0.58, r * 0.2, r * 0.26, 0, TAU);
      ctx.fill();
    }
  }
  ctx.restore();

  /* 眼睛：巨大眼白 + 极小瞳孔 */
  const eyeR = r * (opt.eyeScale || 0.37);
  for (let s = -1; s <= 1; s += 2) {
    const ex = s * r * 0.45;
    const ey = -r * 0.3;
    const eg = ctx.createRadialGradient(ex, ey - eyeR * 0.3, eyeR * 0.15, ex, ey, eyeR);
    eg.addColorStop(0, mixHex(top, '#ffffff', 0.3));
    eg.addColorStop(1, shade(bottom, -8));
    ctx.beginPath();
    ctx.arc(ex, ey, eyeR, 0, TAU);
    ctx.fillStyle = eg;
    ctx.fill();
    ctx.strokeStyle = outline;
    ctx.lineWidth = lineW;
    ctx.stroke();
    const sr = eyeR * 0.78;
    ctx.beginPath();
    ctx.arc(ex, ey - eyeR * 0.03, sr, 0, TAU);
    ctx.fillStyle = '#f8f7ec';
    ctx.fill();
    ctx.save();
    ctx.globalAlpha = 0.16;
    ctx.strokeStyle = '#bd6b63';
    ctx.lineWidth = Math.max(0.6, r * 0.006);
    for (let k = 0; k < 4; k++) {
      const a0 = -0.7 + rnd() * 1.4;
      const rr = eyeR * (0.4 + rnd() * 0.3);
      ctx.beginPath();
      ctx.moveTo(ex + Math.cos(a0) * sr, ey + Math.sin(a0) * sr);
      ctx.quadraticCurveTo(
        ex + Math.cos(a0 + 0.18) * rr,
        ey + Math.sin(a0 + 0.18) * rr,
        ex + Math.cos(a0 + 0.4) * rr * 0.5,
        ey + Math.sin(a0 + 0.4) * rr * 0.5
      );
      ctx.stroke();
    }
    ctx.restore();
    /* 极小瞳孔 */
    const px = ex - s * r * 0.022 + (opt.pupilX || 0) * r;
    const py = ey + sr * 0.07 + (opt.pupilY || 0) * r;
    const pr = sr * (opt.pupilScale || 0.16);
    ctx.beginPath();
    ctx.arc(px, py, pr, 0, TAU);
    ctx.fillStyle = '#15200f';
    ctx.fill();
    dot(ctx, px - pr * 0.3, py - pr * 0.35, Math.max(0.6, pr * 0.32), '#ffffff', 0.85);
    /* 上眼睑阴影 */
    ctx.save();
    ctx.beginPath();
    ctx.arc(ex, ey, sr + 1, Math.PI * 1.05, Math.PI * 1.95);
    ctx.strokeStyle = 'rgba(60,72,30,0.35)';
    ctx.lineWidth = Math.max(1.2, r * 0.02);
    ctx.stroke();
    ctx.restore();
  }

  /* 鼻孔 */
  for (let s = -1; s <= 1; s += 2) {
    dot(ctx, s * r * 0.115, -r * 0.015, Math.max(1, r * 0.028), 'rgba(60,66,26,0.7)', 1);
  }

  /* 诡异宽笑 */
  const mw = r * 0.7 * (opt.mouthWide || 1);
  const my = r * 0.2;
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(-mw, my);
  ctx.bezierCurveTo(-mw * 0.62, my + r * 0.27, mw * 0.62, my + r * 0.29, mw, my - r * 0.02);
  ctx.bezierCurveTo(mw * 0.58, my + r * 0.09, -mw * 0.58, my + r * 0.08, -mw, my);
  ctx.closePath();
  ctx.fillStyle = 'rgba(92,36,42,0.5)';
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(-mw, my);
  ctx.bezierCurveTo(-mw * 0.62, my + r * 0.27, mw * 0.62, my + r * 0.29, mw, my - r * 0.02);
  ctx.strokeStyle = 'rgba(52,38,20,0.88)';
  ctx.lineWidth = Math.max(1.4, r * 0.034);
  ctx.lineCap = 'round';
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-mw * 0.92, my + r * 0.025);
  ctx.bezierCurveTo(-mw * 0.5, my + r * 0.22, mw * 0.5, my + r * 0.23, mw * 0.92, my + r * 0.005);
  ctx.strokeStyle = 'rgba(215,170,120,0.22)';
  ctx.lineWidth = Math.max(1, r * 0.014);
  ctx.stroke();
  ctx.restore();

  /* 嘴角的奶渍（可选项）：一滴挂在唇边 */
  if (opt.milk) {
    ctx.save();
    ctx.globalAlpha = 0.62;
    ctx.fillStyle = '#fff6dd';
    const dx = mw * 1.01;
    const dy = my + r * 0.015;
    ctx.beginPath();
    ctx.moveTo(dx, dy);
    ctx.bezierCurveTo(dx + r * 0.03, dy + r * 0.03, dx + r * 0.022, dy + r * 0.08, dx, dy + r * 0.095);
    ctx.bezierCurveTo(dx - r * 0.022, dy + r * 0.08, dx - r * 0.03, dy + r * 0.03, dx, dy);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(dx - r * 0.04, dy + r * 0.02, r * 0.018, 0, TAU);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(-mw * 1.0, my + r * 0.02, r * 0.012, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  ctx.restore();
}

/* ============================ 海报 ============================ */

function paperBase(ctx, w, h, o) {
  const opt = o || {};
  const seed = hashSeed(opt.seed || 'paper');
  const rnd = mulberry32(seed);
  const base = opt.base || '#f3e7cd';
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 6; i++) {
    softStain(ctx, w, h, rnd() * w, rnd() * h, 60 + rnd() * 120, rnd() > 0.5 ? '#c9b184' : '#fffaf0', 0.06, seed + i, false);
  }
  fiberLines(ctx, w, h, seed + 40, 620, '#fffdf4', '#8a6a40', 0.02, 0.05, 2, 9, false);
  /* 边缘压暗 */
  const edge = opt.edge == null ? 26 : opt.edge;
  const sides = [
    [0, 0, edge, 0],
    [w, 0, w - edge, 0],
    [0, 0, 0, edge],
    [0, h, 0, h - edge],
  ];
  for (let i = 0; i < sides.length; i++) {
    const s = sides[i];
    const g = ctx.createLinearGradient(s[0], s[1], s[2], s[3]);
    g.addColorStop(0, 'rgba(84,58,30,0.13)');
    g.addColorStop(1, 'rgba(84,58,30,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }
  /* 霉斑 / 水渍 */
  const stains = opt.stains == null ? 3 : opt.stains;
  for (let i = 0; i < stains; i++) {
    softStain(ctx, w, h, rnd() * w, rnd() * h, 34 + rnd() * 74, opt.stainColor || '#a5803f', 0.09 + rnd() * 0.05, seed + 80 + i * 17, false);
    if (rnd() > 0.5) waterRing(ctx, w, h, rnd() * w, rnd() * h, 30 + rnd() * 46, opt.stainColor || '#a5803f', 0.1, seed + 120 + i, false);
  }
  /* 霉点 */
  const fox = opt.fox == null ? 34 : opt.fox;
  for (let i = 0; i < fox; i++) {
    dot(ctx, rnd() * w, rnd() * h, 0.8 + rnd() * 2.4, rnd() > 0.4 ? '#8a6a35' : '#6b4c26', 0.12 + rnd() * 0.2);
  }
}

function crease(ctx, x1, y1, x2, y2, alpha) {
  const a = alpha == null ? 0.16 : alpha;
  ctx.save();
  ctx.globalAlpha = a;
  ctx.strokeStyle = '#6a4e2c';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  ctx.globalAlpha = a * 1.5;
  ctx.strokeStyle = '#fffaf0';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x1 + 1.4, y1 + 1.4);
  ctx.lineTo(x2 + 1.4, y2 + 1.4);
  ctx.stroke();
  ctx.restore();
}

function tape(ctx, x, y, tw, th, rot) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot || 0);
  ctx.globalAlpha = 0.5;
  ctx.fillStyle = '#e9dcb4';
  ctx.fillRect(-tw / 2, -th / 2, tw, th);
  ctx.globalAlpha = 0.3;
  ctx.fillStyle = '#fffdf2';
  ctx.fillRect(-tw / 2, -th / 2, tw, 2.5);
  ctx.globalAlpha = 0.4;
  ctx.strokeStyle = '#a08c5e';
  ctx.lineWidth = 1;
  ctx.strokeRect(-tw / 2, -th / 2, tw, th);
  ctx.restore();
}

function posterFrog(ctx, w, h) {
  const rnd = mulberry32(hashSeed('poster-frog'));
  const bg = ctx.createLinearGradient(0, 0, 0, h);
  bg.addColorStop(0, '#f7f0d6');
  bg.addColorStop(1, '#d5ead8');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);
  /* 放射光芒 */
  ctx.save();
  ctx.translate(w / 2, 262);
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * TAU;
    ctx.fillStyle = i % 2 === 0 ? 'rgba(247,182,194,0.20)' : 'rgba(169,214,196,0.14)';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, 330, a, a + TAU / 48);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
  /* 半调点 */
  for (let y = 14; y < h; y += 18) {
    for (let x = 14; x < w; x += 18) {
      dot(ctx, x, y, 1.3, '#8a7a4a', 0.09);
    }
  }
  /* 模切贴纸底 */
  ctx.save();
  ctx.translate(256, 258);
  ctx.rotate(-0.05);
  ctx.shadowColor = 'rgba(60,40,20,0.35)';
  ctx.shadowBlur = 16;
  ctx.shadowOffsetY = 8;
  ctx.fillStyle = '#fffdf0';
  roundRect(ctx, -190, -152, 380, 304, 26);
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.fillStyle = 'rgba(169,214,196,0.35)';
  roundRect(ctx, -178, -140, 356, 280, 20);
  ctx.fill();
  ctx.restore();
  /* 奶蛙 */
  drawFrogHead(ctx, 256, 244, 138, {
    seed: 'poster-frog-face',
    top: '#e2ef9c',
    bottom: '#a9c258',
    pupilX: 0.012,
    pupilY: 0.02,
    blush: 0.45,
    milk: true,
    mouthWide: 1.04,
  });
  /* 标题字 */
  drawText(ctx, '奶蛙乐园', 256, 50, { font: '700 38px ' + FONT, color: '#41603a', spacing: 7, alpha: 0.92 });
  ctx.save();
  ctx.globalAlpha = 0.55;
  ctx.strokeStyle = '#41603a';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(146, 72);
  ctx.lineTo(366, 72);
  ctx.stroke();
  ctx.restore();
  drawText(ctx, '奶 蛙', 256, 450, { font: '800 56px ' + SERIF, color: '#46632e', stroke: 'rgba(255,253,240,0.9)', strokeWidth: 3, spacing: 8 });
  drawText(ctx, 'MILK FROG', 256, 490, { font: '700 16px ' + FONT, color: '#6b7a45', spacing: 6, alpha: 0.9 });
  /* 星星 / 闪光 */
  for (let i = 0; i < 8; i++) {
    const x = 40 + rnd() * 432;
    const y = 70 + rnd() * 380;
    drawText(ctx, '✦', x, y, { font: '16px ' + FONT, color: '#e8b45a', alpha: 0.3 + rnd() * 0.4 });
  }
  /* 磨损 */
  softStain(ctx, w, h, 470, 470, 70, '#a5803f', 0.1, 1301, false);
  crease(ctx, 40, 250, 470, 258, 0.08);
  ctx.save();
  ctx.globalAlpha = 0.3;
  ctx.strokeStyle = '#8a7a55';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(30, 500);
  ctx.lineTo(120, 498);
  ctx.stroke();
  ctx.restore();
  tape(ctx, 60, 30, 46, 18, -0.5);
  tape(ctx, 452, 30, 46, 18, 0.5);
  applyGrain(ctx, w, h, { seed: hashSeed('poster-frog-grain'), grain: 7, mottle: 0.045, cells: 4 });
}

/* 蛋糕（生日海报 / 主菜单共用） */
function drawCake(ctx, cx, baseY, s, seed) {
  const rnd = mulberry32(seed >>> 0);
  ctx.save();
  /* 投影 */
  ctx.fillStyle = 'rgba(52,32,16,0.22)';
  ctx.beginPath();
  ctx.ellipse(cx, baseY + 7 * s, 168 * s, 20 * s, 0, 0, TAU);
  ctx.fill();
  /* 盘子 */
  ctx.fillStyle = '#efe6d2';
  ctx.beginPath();
  ctx.ellipse(cx, baseY, 168 * s, 20 * s, 0, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = 'rgba(120,100,70,0.35)';
  ctx.lineWidth = Math.max(1, 2 * s);
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,252,240,0.5)';
  ctx.beginPath();
  ctx.ellipse(cx, baseY - 3 * s, 140 * s, 13 * s, 0, 0, TAU);
  ctx.fill();
  /* 三层 */
  const tiers = [
    { y: baseY - 4 * s, h: 74 * s, w: 262 * s, c: '#f7b6c2', f: '#fff1dd' },
    { y: baseY - 78 * s, h: 64 * s, w: 198 * s, c: '#ffd9a0', f: '#fffaee' },
    { y: baseY - 142 * s, h: 54 * s, w: 136 * s, c: '#a9d6c4', f: '#f6ffed' },
  ];
  for (let i = 0; i < tiers.length; i++) {
    const t = tiers[i];
    const grad = ctx.createLinearGradient(cx - t.w / 2, 0, cx + t.w / 2, 0);
    grad.addColorStop(0, shade(t.c, -14));
    grad.addColorStop(0.3, t.c);
    grad.addColorStop(0.75, shade(t.c, 8));
    grad.addColorStop(1, shade(t.c, -20));
    ctx.fillStyle = grad;
    roundRect(ctx, cx - t.w / 2, t.y - t.h, t.w, t.h, 6 * s);
    ctx.fill();
    /* 奶油边：厚带 + 圆角下垂 */
    const ft = 13 * s;
    ctx.fillStyle = t.f;
    ctx.beginPath();
    ctx.moveTo(cx - t.w / 2, t.y - t.h - 2 * s);
    ctx.lineTo(cx + t.w / 2, t.y - t.h - 2 * s);
    ctx.lineTo(cx + t.w / 2, t.y - t.h + ft);
    for (let x = t.w / 2; x > -t.w / 2; x -= 20 * s) {
      ctx.quadraticCurveTo(cx + x - 10 * s, t.y - t.h + ft + 13 * s, cx + x - 20 * s, t.y - t.h + ft);
    }
    ctx.closePath();
    ctx.fill();
    /* 糖霜滴落 */
    for (let k = 0; k < 5; k++) {
      const dx = -t.w / 2 + (t.w / 5) * (k + 0.5) + (rnd() - 0.5) * 10 * s;
      const dh = (14 + rnd() * 16) * s;
      ctx.fillStyle = t.f;
      ctx.beginPath();
      ctx.moveTo(cx + dx - 6 * s, t.y - t.h + ft - 2 * s);
      ctx.bezierCurveTo(
        cx + dx - 7 * s, t.y - t.h + ft + dh * 0.55,
        cx + dx - 4 * s, t.y - t.h + ft + dh,
        cx + dx, t.y - t.h + ft + dh + 4 * s
      );
      ctx.bezierCurveTo(
        cx + dx + 4 * s, t.y - t.h + ft + dh,
        cx + dx + 7 * s, t.y - t.h + ft + dh * 0.55,
        cx + dx + 6 * s, t.y - t.h + ft - 2 * s
      );
      ctx.closePath();
      ctx.fill();
    }
    /* 小蛙装饰 */
    if (i < 2) {
      drawFrogHead(ctx, cx - t.w * 0.22, t.y - t.h * 0.5, 15 * s, { seed: 'cake-frog' + i, blush: 0.3, milk: false });
      drawFrogHead(ctx, cx + t.w * 0.24, t.y - t.h * 0.55, 12 * s, { seed: 'cake-frog' + i + 9, blush: 0.3 });
    }
  }
  /* 蜡烛：八片奶片的隐喻，八根蜡烛 */
  const topY = baseY - 196 * s;
  const spread = 110 * s;
  for (let i = 0; i < 8; i++) {
    const x = cx - spread / 2 + (spread / 7) * i;
    const ch = (30 + (i % 2) * 6) * s;
    ctx.fillStyle = i % 2 === 0 ? '#f4e3c4' : '#f7b6c2';
    ctx.fillRect(x - 3.2 * s, topY - ch, 6.4 * s, ch);
    ctx.fillStyle = 'rgba(160,60,60,0.35)';
    for (let k = 0; k < 3; k++) ctx.fillRect(x - 3.2 * s, topY - ch + (ch / 3) * (k + 0.6), 6.4 * s, 1.6 * s);
    /* 火焰 */
    const fx = x;
    const fy = topY - ch - 5 * s;
    const glow = ctx.createRadialGradient(fx, fy, 0, fx, fy, 19 * s);
    glow.addColorStop(0, 'rgba(255,220,130,0.9)');
    glow.addColorStop(1, 'rgba(255,180,80,0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(fx, fy, 19 * s, 0, TAU);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(fx, fy - 12 * s);
    ctx.quadraticCurveTo(fx + 6 * s, fy - 1 * s, fx, fy + 4 * s);
    ctx.quadraticCurveTo(fx - 6 * s, fy - 1 * s, fx, fy - 12 * s);
    ctx.fillStyle = '#ffd36a';
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(fx, fy - 5 * s);
    ctx.quadraticCurveTo(fx + 2.4 * s, fy, fx, fy + 1.5 * s);
    ctx.quadraticCurveTo(fx - 2.4 * s, fy, fx, fy - 5 * s);
    ctx.fillStyle = '#fff3c0';
    ctx.fill();
  }
  ctx.restore();
}

function posterBirthday(ctx, w, h) {
  const rnd = mulberry32(hashSeed('poster-birthday'));
  paperBase(ctx, w, h, { seed: 'birthday-paper', base: '#f0e0bd', stains: 4, fox: 40 });
  /* 边框 */
  ctx.save();
  ctx.strokeStyle = 'rgba(185,96,79,0.45)';
  ctx.lineWidth = 3;
  ctx.strokeRect(22, 22, w - 44, h - 44);
  ctx.lineWidth = 1;
  ctx.strokeRect(30, 30, w - 60, h - 60);
  ctx.restore();
  bunting(ctx, w, 64, 1401, 0.8);
  drawText(ctx, 'MILK FROG PARK', 256, 116, { font: '700 15px ' + FONT, color: '#8a6a4a', spacing: 6, alpha: 0.85 });
  /* 标题（轻微套印错位，像旧印刷） */
  drawText(ctx, '奶蛙乐园', 258, 182, { font: '800 64px ' + SERIF, color: 'rgba(169,214,196,0.45)', spacing: 8 });
  drawText(ctx, '奶蛙乐园', 256, 178, { font: '800 64px ' + SERIF, color: '#c05a4a', spacing: 8, alpha: 0.92 });
  drawText(ctx, '生 日 会', 256, 258, { font: '800 82px ' + SERIF, color: '#cf6b55', spacing: 12, alpha: 0.9 });
  drawText(ctx, '1999 · 最后一场', 256, 312, { font: '700 22px ' + FONT, color: '#7d5a36', spacing: 3, alpha: 0.85 });
  ctx.save();
  ctx.globalAlpha = 0.4;
  ctx.strokeStyle = '#b07a4a';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(130, 338);
  ctx.lineTo(382, 338);
  ctx.stroke();
  ctx.restore();
  /* 蛋糕 */
  drawCake(ctx, 256, 636, 1, 1501);
  /* 桌上小蛙 */
  for (let i = 0; i < 2; i++) {
    drawFrogHead(ctx, i === 0 ? 96 : 420, 660, 26, { seed: 'birthday-frog' + i, blush: 0.35 });
  }
  drawText(ctx, '六月一日 · 下午三点', 256, 692, { font: '700 22px ' + FONT, color: '#7d4a3a', spacing: 2, alpha: 0.82 });
  drawText(ctx, '每位小朋友都能领到一片奶片', 256, 724, { font: '400 16px ' + FONT, color: '#8a6a4a', spacing: 1, alpha: 0.75 });
  /* 旧化 */
  softStain(ctx, w, h, 430, 100, 90, '#fffaf0', 0.28, 1502, false);
  softStain(ctx, w, h, 90, 620, 80, '#a5803f', 0.13, 1503, false);
  waterRing(ctx, w, h, 430, 560, 60, '#8a6a35', 0.12, 1504, false);
  crease(ctx, 40, 380, 472, 372, 0.1);
  crease(ctx, 256, 40, 250, 730, 0.07);
  /* 破损的边角 */
  ctx.save();
  ctx.globalAlpha = 0.55;
  ctx.fillStyle = '#d8c49b';
  ctx.beginPath();
  ctx.moveTo(w - 22, h - 90);
  ctx.lineTo(w - 22, h - 22);
  ctx.lineTo(w - 96, h - 22);
  ctx.quadraticCurveTo(w - 40, h - 44, w - 22, h - 90);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  tape(ctx, 44, 40, 50, 20, -0.55);
  tape(ctx, 468, 40, 50, 20, 0.55);
  applyGrain(ctx, w, h, { seed: hashSeed('poster-birthday-grain'), grain: 7, mottle: 0.05, cells: 4 });
}

function posterRules(ctx, w, h) {
  paperBase(ctx, w, h, { seed: 'rules-paper', base: '#f4ead2', stains: 3, fox: 42 });
  ctx.save();
  ctx.strokeStyle = 'rgba(126,160,142,0.55)';
  ctx.lineWidth = 3;
  ctx.strokeRect(24, 24, w - 48, h - 48);
  ctx.lineWidth = 1;
  ctx.strokeRect(32, 32, w - 64, h - 64);
  ctx.restore();
  drawText(ctx, '奶蛙乐园', 256, 68, { font: '700 24px ' + FONT, color: '#5c7a6a', spacing: 9, alpha: 0.85 });
  drawText(ctx, '游 园 规 则', 256, 128, { font: '800 54px ' + SERIF, color: '#3f4b3c', spacing: 8 });
  ctx.save();
  ctx.strokeStyle = 'rgba(92,122,106,0.5)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(92, 168);
  ctx.lineTo(210, 168);
  ctx.moveTo(302, 168);
  ctx.lineTo(420, 168);
  ctx.stroke();
  ctx.restore();
  frogIcon(ctx, 256, 168, 17, 'rgba(92,122,106,0.7)', 'rgba(63,75,60,0.8)');
  drawText(ctx, 'PARK RULES · 请小朋友遵守', 256, 196, { font: '400 13px ' + FONT, color: '#7d8a76', spacing: 2 });

  const rules = [
    ['不要给奶蛙喂奶片。', 'NEVER FEED THE MILK FROG'],
    ['22:00 以后请勿在园内停留。', 'NO STAYING AFTER 10 PM'],
    ['听到歌声时，请闭上眼睛。', 'CLOSE YOUR EYES IF YOU HEAR SINGING'],
    ['不要回应自称「我是奶龙」的人。', 'DO NOT ANSWER "I AM MILK DRAGON"'],
  ];
  for (let i = 0; i < rules.length; i++) {
    const y = 262 + i * 108;
    ctx.save();
    ctx.fillStyle = 'rgba(169,214,196,0.75)';
    ctx.beginPath();
    ctx.arc(80, y, 24, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = 'rgba(92,122,106,0.6)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();
    drawText(ctx, String(i + 1), 80, y + 1, { font: '800 26px ' + SERIF, color: '#3f4b3c' });
    const ruleFont = fitFont(ctx, rules[i][0], 360, { family: FONT, weight: 700, max: 25, min: 19 });
    drawText(ctx, rules[i][0], 120, y - 6, { font: ruleFont, color: '#3a2b25', align: 'left' });
    drawText(ctx, rules[i][1], 121, y + 24, { font: '400 11px ' + FONT, color: '#8a8f7c', align: 'left', spacing: 1.5 });
    ctx.save();
    ctx.globalAlpha = 0.25;
    ctx.strokeStyle = '#b0a888';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(120, y + 48);
    ctx.lineTo(430, y + 48);
    ctx.stroke();
    ctx.restore();
  }
  drawText(ctx, '奶蛙乐园 · 一九九九年', 256, 690, { font: '400 16px ' + FONT, color: '#6b7a62', spacing: 2, alpha: 0.8 });
  /* 手印 + 印章 */
  handprint(ctx, 120, 700, 46, '#5a4328', 0.1, 0.3);
  ctx.save();
  ctx.translate(410, 688);
  ctx.rotate(-0.2);
  ctx.globalAlpha = 0.55;
  ctx.strokeStyle = '#a83a32';
  ctx.lineWidth = 3.5;
  ctx.beginPath();
  ctx.arc(0, 0, 42, 0, TAU);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, 0, 34, 0, TAU);
  ctx.lineWidth = 1;
  ctx.stroke();
  drawText(ctx, '已作废', 0, -6, { font: '700 20px ' + FONT, color: '#a83a32', spacing: 2 });
  drawText(ctx, '1999.6.2', 0, 20, { font: '400 11px ' + FONT, color: '#a83a32' });
  ctx.restore();
  /* 旧化 */
  softStain(ctx, w, h, 420, 240, 70, '#a5803f', 0.12, 1601, false);
  waterRing(ctx, w, h, 80, 360, 55, '#8a6a35', 0.1, 1602, false);
  crease(ctx, 30, 470, 482, 462, 0.09);
  crease(ctx, 256, 30, 260, 738, 0.06);
  tape(ctx, 460, 700, 46, 18, 0.4);
  applyGrain(ctx, w, h, { seed: hashSeed('poster-rules-grain'), grain: 7, mottle: 0.045, cells: 4 });
}

function crayonFill(ctx, x0, y0, x1, y1, color, seed, step, alpha) {
  const rnd = mulberry32(seed >>> 0);
  const st = step || 9;
  for (let y = y0; y < y1; y += st) {
    const pts = [];
    const n = 5;
    for (let k = 0; k <= n; k++) {
      pts.push([x0 + ((x1 - x0) / n) * k + (rnd() - 0.5) * 10, y + (rnd() - 0.5) * st * 0.6]);
    }
    crayonStroke(ctx, pts, color, 5 + rnd() * 4, seed + y, alpha == null ? 0.42 : alpha);
  }
}

function posterDrawing(ctx, w, h) {
  paperBase(ctx, w, h, { seed: 'drawing-paper', base: '#f6f1df', stains: 2, fox: 26, edge: 22 });
  /* 天空 */
  crayonFill(ctx, 18, 26, 494, 388, '#6f93c4', 1701, 13, 0.3);
  /* 太阳 */
  crayonStroke(ctx, crayonEllipsePts(96, 96, 38, 38, 22, 1702), '#e3a83c', 6, 1703, 0.65);
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * TAU;
    crayonStroke(ctx, [[96 + Math.cos(a) * 50, 96 + Math.sin(a) * 50], [96 + Math.cos(a) * 74, 96 + Math.sin(a) * 74]], '#e3a83c', 4, 1710 + i, 0.55);
  }
  /* 云 */
  for (let c = 0; c < 3; c++) {
    const cx = 280 + c * 26;
    const cy = 74 + c * 6;
    crayonStroke(ctx, crayonEllipsePts(cx, cy, 34, 15, 16, 1720 + c), '#faf6ea', 8, 1730 + c, 0.55);
  }
  /* 草地 */
  crayonFill(ctx, 16, 388, 496, 596, '#7fa05e', 1740, 14, 0.4);
  /* 房子 */
  crayonFill(ctx, 330, 282, 458, 420, '#e6c063', 1750, 12, 0.45);
  crayonStroke(ctx, [[318, 286], [394, 222], [470, 286], [318, 286]], '#c05a48', 7, 1751, 0.65);
  crayonStroke(ctx, [[350, 330], [392, 330], [392, 384], [350, 384], [350, 330]], '#6f93c4', 4, 1752, 0.55);
  crayonStroke(ctx, [[386, 382], [386, 420]], '#8a5a30', 5, 1753, 0.5);
  crayonStroke(ctx, [[406, 300], [452, 300], [452, 344], [406, 344], [406, 300]], '#e8b45a', 4, 1754, 0.55);
  /* 小人：黄色 → 变奶蛙 */
  const kid = (cx, cy, s, frogHead, seed) => {
    if (frogHead) {
      drawFrogHead(ctx, cx, cy - 46 * s, 26 * s, { seed: 'draw-frog' + seed, blush: 0.3 });
      crayonStroke(ctx, crayonEllipsePts(cx, cy - 46 * s, 26 * s, 24 * s, 18, seed + 1), '#7c9a3e', 3, seed + 2, 0.35);
    } else {
      crayonStroke(ctx, crayonEllipsePts(cx, cy - 52 * s, 18 * s, 18 * s, 16, seed + 3), '#e3a83c', 4.5, seed + 4, 0.7);
    }
    crayonStroke(ctx, [[cx, cy - 34 * s], [cx, cy + 10 * s]], frogHead ? '#7c9a3e' : '#e3a83c', 5, seed + 5, 0.7);
    crayonStroke(ctx, [[cx - 22 * s, cy - 14 * s], [cx + 22 * s, cy - 14 * s]], frogHead ? '#7c9a3e' : '#e3a83c', 4.5, seed + 6, 0.65);
    crayonStroke(ctx, [[cx, cy + 10 * s], [cx - 16 * s, cy + 38 * s]], frogHead ? '#7c9a3e' : '#e3a83c', 4.5, seed + 7, 0.65);
    crayonStroke(ctx, [[cx, cy + 10 * s], [cx + 16 * s, cy + 38 * s]], frogHead ? '#7c9a3e' : '#e3a83c', 4.5, seed + 8, 0.65);
    /* 衣服 */
    crayonStroke(ctx, [[cx - 12 * s, cy - 26 * s], [cx + 12 * s, cy - 26 * s], [cx + 15 * s, cy + 8 * s], [cx - 15 * s, cy + 8 * s], [cx - 12 * s, cy - 26 * s]], '#cf6b5f', 5, seed + 9, 0.5);
  };
  kid(112, 520, 1.1, false, 1801);
  kid(190, 528, 1.0, false, 1821);
  kid(276, 522, 1.05, true, 1841);
  kid(356, 530, 0.95, true, 1861);
  /* 最后一个孩子被黑笔涂掉 */
  crayonStroke(ctx, [[330, 456], [392, 512], [350, 470], [386, 520]], '#2c2a26', 7, 1881, 0.55);
  crayonStroke(ctx, [[386, 458], [334, 516], [382, 478], [340, 508]], '#2c2a26', 6, 1882, 0.45);
  /* 太阳下的奶片 */
  ctx.save();
  ctx.globalAlpha = 0.5;
  for (let i = 0; i < 4; i++) {
    ctx.fillStyle = '#fff3c8';
    ctx.strokeStyle = '#c9a25a';
    ctx.lineWidth = 2;
    const x = 250 + i * 34;
    const y = 154 + (i % 2) * 22;
    roundRect(ctx, x - 10, y - 7, 20, 14, 5);
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
  /* 底部孩子的字 */
  ctx.save();
  ctx.translate(250, 660);
  ctx.rotate(-0.03);
  drawText(ctx, '我和奶蛙一起玩', 0, 0, { font: '400 38px ' + HAND, color: '#4a6fa5', spacing: 4 });
  ctx.restore();
  drawText(ctx, '大班 · 乐乐', 388, 712, { font: '400 22px ' + HAND, color: '#5a7a4a', alpha: 0.85 });
  drawText(ctx, '1999.5', 96, 716, { font: '400 18px ' + HAND, color: '#7a6040', alpha: 0.7 });
  /* 蜡笔的光泽 / 折痕 */
  softStain(ctx, w, h, 300, 460, 120, '#fffaf0', 0.18, 1901, false);
  crease(ctx, 256, 20, 252, 730, 0.07);
  crease(ctx, 26, 620, 486, 628, 0.06);
  tape(ctx, 60, 26, 54, 20, -0.4);
  tape(ctx, 452, 26, 54, 20, 0.4);
  applyGrain(ctx, w, h, { seed: hashSeed('poster-drawing-grain'), grain: 7, mottle: 0.04, cells: 4 });
}

function missingPhoto(ctx, x, y, pw, ph, seed, tint) {
  const rnd = mulberry32(seed >>> 0);
  ctx.save();
  /* 相纸白框 */
  ctx.fillStyle = '#f9f3e3';
  ctx.fillRect(x - 7, y - 7, pw + 14, ph + 14);
  ctx.strokeStyle = 'rgba(96,78,52,0.3)';
  ctx.lineWidth = 1;
  ctx.strokeRect(x - 7, y - 7, pw + 14, ph + 14);
  /* 照片底色 */
  const g = ctx.createLinearGradient(0, y, 0, y + ph);
  g.addColorStop(0, tint ? '#8f8a86' : '#8e9aa2');
  g.addColorStop(1, tint ? '#5a5651' : '#5f6b74');
  ctx.fillStyle = g;
  ctx.fillRect(x, y, pw, ph);
  /* 模糊的人形剪影（不画五官） */
  const cx = x + pw / 2;
  const base = y + ph;
  ctx.globalAlpha = 0.5;
  for (let i = 0; i < 7; i++) {
    ctx.fillStyle = '#3e464c';
    ctx.beginPath();
    ctx.ellipse(cx + (rnd() - 0.5) * 9, base - ph * 0.24 + (rnd() - 0.5) * 8, pw * 0.19, ph * 0.2, 0, 0, TAU);
    ctx.fill();
  }
  for (let i = 0; i < 7; i++) {
    ctx.fillStyle = '#444c52';
    ctx.beginPath();
    ctx.ellipse(cx + (rnd() - 0.5) * 6, base - ph * 0.58 + (rnd() - 0.5) * 5, pw * 0.13, ph * 0.15, 0, 0, TAU);
    ctx.fill();
  }
  ctx.fillStyle = '#3e464c';
  ctx.beginPath();
  ctx.moveTo(cx - pw * 0.36, base);
  ctx.quadraticCurveTo(cx - pw * 0.32, base - ph * 0.36, cx, base - ph * 0.37);
  ctx.quadraticCurveTo(cx + pw * 0.32, base - ph * 0.36, cx + pw * 0.36, base);
  ctx.closePath();
  ctx.fill();
  /* 洗印的模糊横纹 */
  ctx.globalAlpha = 0.12;
  ctx.fillStyle = '#1f2428';
  for (let i = 0; i < 40; i++) {
    ctx.fillRect(x, y + rnd() * ph, pw, 1);
  }
  ctx.globalAlpha = 0.16;
  ctx.fillStyle = '#fffaf0';
  ctx.fillRect(x, y, pw, ph * 0.16);
  ctx.restore();
}

function posterMissing(ctx, w, h) {
  const rnd = mulberry32(hashSeed('poster-missing'));
  paperBase(ctx, w, h, { seed: 'missing-paper', base: '#eee5d0', stains: 5, fox: 55, stainColor: '#8a6a35' });
  drawText(ctx, '寻 人 启 事', 250, 82, { font: '800 56px ' + SERIF, color: '#241d18', spacing: 12 });
  ctx.save();
  ctx.globalAlpha = 0.6;
  ctx.strokeStyle = '#a83a32';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(120, 114);
  ctx.lineTo(392, 114);
  ctx.stroke();
  ctx.restore();
  drawText(ctx, 'MISSING CHILDREN', 256, 132, { font: '400 12px ' + FONT, color: '#6a5a44', spacing: 5, alpha: 0.8 });
  drawText(ctx, '1999年6月1日下午，以下四名儿童', 256, 166, { font: '400 18px ' + FONT, color: '#3a2f26' });
  drawText(ctx, '在奶蛙乐园内走失，至今未归。', 256, 192, { font: '400 18px ' + FONT, color: '#3a2f26' });
  /* 四张照片 */
  const kids = [
    ['小满 · 6岁', 0],
    ['阿伟 · 5岁', 1],
    ['妞妞 · 6岁', 0],
    ['乐乐 · 7岁', 1],
  ];
  const pw = 168;
  const ph = 168;
  for (let i = 0; i < 4; i++) {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const x = 68 + col * 208;
    const y = 220 + row * 218;
    missingPhoto(ctx, x, y, pw, ph, 2001 + i, kids[i][1]);
    drawText(ctx, kids[i][0], x + pw / 2, y + ph + 22, { font: '700 17px ' + FONT, color: '#33291f' });
    if (i === 2) {
      /* 红笔圈出 */
      ctx.save();
      ctx.globalAlpha = 0.55;
      ctx.strokeStyle = '#b03a32';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.ellipse(x + pw / 2, y + ph / 2, pw * 0.6, ph * 0.6, 0.08, 0, TAU);
      ctx.stroke();
      ctx.restore();
    }
  }
  /* 最后见到 */
  drawText(ctx, '最后见到：1999.6.1', 256, 668, { font: '800 32px ' + FONT, color: '#8a2f28', spacing: 1 });
  drawText(ctx, '地点：奶蛙乐园 · 午睡室门口', 256, 704, { font: '400 17px ' + FONT, color: '#4a3a2c' });
  drawText(ctx, '如有线索，请联系奶蛙乐园值班室　1999-0601', 256, 734, { font: '400 16px ' + FONT, color: '#3a2f26', spacing: 0.5 });
  /* 旧化：胶带、折痕、撕裂 */
  tape(ctx, 56, 44, 60, 22, -0.45);
  tape(ctx, 456, 44, 60, 22, 0.45);
  tape(ctx, 250, 700, 64, 20, 0.06);
  crease(ctx, 30, 420, 482, 412, 0.1);
  crease(ctx, 260, 26, 254, 742, 0.06);
  softStain(ctx, w, h, 430, 560, 80, '#7a5a2a', 0.16, 2101, false);
  waterRing(ctx, w, h, 100, 640, 60, '#8a6a35', 0.14, 2102, false);
  softStain(ctx, w, h, 256, 120, 60, '#fffaf0', 0.2, 2103, false);
  /* 右下角撕裂 */
  ctx.save();
  ctx.globalAlpha = 0.5;
  ctx.fillStyle = '#d8c9a8';
  ctx.beginPath();
  ctx.moveTo(w - 22, h - 44);
  ctx.lineTo(w - 22, h - 22);
  ctx.lineTo(w - 60, h - 22);
  ctx.quadraticCurveTo(w - 34, h - 40, w - 22, h - 44);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  applyGrain(ctx, w, h, { seed: hashSeed('poster-missing-grain'), grain: 8, mottle: 0.055, cells: 4 });
}

function redX(ctx, x, y, s, seed) {
  const rnd = mulberry32(seed >>> 0);
  for (let pass = 0; pass < 2; pass++) {
    ctx.save();
    ctx.globalAlpha = pass === 0 ? 0.55 : 0.8;
    ctx.strokeStyle = '#a8382f';
    ctx.lineWidth = pass === 0 ? 10 : 7;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x - s + (rnd() - 0.5) * 6, y - s + (rnd() - 0.5) * 6);
    ctx.lineTo(x + s + (rnd() - 0.5) * 6, y + s + (rnd() - 0.5) * 6);
    ctx.moveTo(x + s + (rnd() - 0.5) * 6, y - s + (rnd() - 0.5) * 6);
    ctx.lineTo(x - s + (rnd() - 0.5) * 6, y + s + (rnd() - 0.5) * 6);
    ctx.stroke();
    ctx.restore();
  }
}

function posterMap(ctx, w, h) {
  const rnd = mulberry32(hashSeed('poster-map'));
  paperBase(ctx, w, h, { seed: 'map-paper', base: '#e9e4cf', stains: 3, fox: 45, stainColor: '#8a7a45' });
  /* 蓝图网格 */
  ctx.save();
  ctx.strokeStyle = 'rgba(96,132,150,0.16)';
  ctx.lineWidth = 1;
  for (let x = 20; x < w; x += 24) {
    ctx.beginPath();
    ctx.moveTo(x, 20);
    ctx.lineTo(x, h - 20);
    ctx.stroke();
  }
  for (let y = 20; y < h; y += 24) {
    ctx.beginPath();
    ctx.moveTo(20, y);
    ctx.lineTo(w - 20, y);
    ctx.stroke();
  }
  ctx.restore();
  ctx.save();
  ctx.strokeStyle = 'rgba(70,86,84,0.55)';
  ctx.lineWidth = 2;
  ctx.strokeRect(22, 22, w - 44, h - 44);
  ctx.lineWidth = 1;
  ctx.strokeRect(30, 30, w - 60, h - 60);
  ctx.restore();
  drawText(ctx, '奶蛙乐园 平面图', 256, 66, { font: '800 36px ' + SERIF, color: '#3f5a55', spacing: 3 });
  drawText(ctx, 'FLOOR PLAN · BUILDING A · 1999', 256, 96, { font: '400 11px ' + FONT, color: '#5c7a74', spacing: 3, alpha: 0.85 });

  /* 墙体 */
  const wall = '#3f5a55';
  ctx.save();
  ctx.strokeStyle = wall;
  ctx.lineWidth = 6;
  ctx.lineJoin = 'miter';
  /* 外框与内墙 */
  ctx.strokeRect(56, 140, 400, 456);
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(56, 330);
  ctx.lineTo(456, 330);
  ctx.moveTo(56, 398);
  ctx.lineTo(456, 398);
  ctx.moveTo(166, 140);
  ctx.lineTo(166, 330);
  ctx.moveTo(166, 398);
  ctx.lineTo(166, 596);
  ctx.moveTo(300, 140);
  ctx.lineTo(300, 330);
  ctx.moveTo(300, 398);
  ctx.lineTo(300, 596);
  ctx.stroke();
  ctx.restore();
  /* 门洞（用纸色擦掉墙） */
  const door = (x, y, dw, dh) => {
    ctx.fillStyle = '#e9e4cf';
    ctx.fillRect(x - dw / 2, y - dh / 2, dw, dh);
  };
  door(166, 250, 22, 44);
  door(300, 250, 22, 44);
  door(110, 330, 44, 22);
  door(380, 330, 44, 22);
  door(166, 470, 22, 44);
  door(300, 470, 22, 44);
  door(256, 596, 46, 26);
  door(256, 398, 40, 22);
  /* 房间名 */
  drawText(ctx, '教 室', 111, 202, { font: '700 24px ' + FONT, color: '#3f5a55', spacing: 3 });
  drawText(ctx, '午睡室', 233, 202, { font: '700 24px ' + FONT, color: '#3f5a55', spacing: 3 });
  drawText(ctx, '食 堂', 378, 202, { font: '700 24px ' + FONT, color: '#3f5a55', spacing: 3 });
  drawText(ctx, '门 厅', 111, 500, { font: '700 24px ' + FONT, color: '#3f5a55', spacing: 3 });
  drawText(ctx, '活动室', 233, 500, { font: '700 24px ' + FONT, color: '#3f5a55', spacing: 3 });
  drawText(ctx, '安全出口', 378, 468, { font: '700 22px ' + FONT, color: '#2f6a4a', spacing: 2 });
  drawText(ctx, '走 廊', 256, 366, { font: '700 18px ' + FONT, color: '#5c7a74', spacing: 8, alpha: 0.9 });
  /* 红叉：封锁区域 */
  redX(ctx, 378, 272, 30, 3001);
  redX(ctx, 233, 272, 27, 3002);
  redX(ctx, 378, 542, 27, 3003);
  drawText(ctx, '已封锁', 378, 582, { font: '700 15px ' + FONT, color: '#a8382f', spacing: 2, alpha: 0.9, rotate: 0 });
  /* 奶片藏点 */
  for (let i = 0; i < 8; i++) {
    const spots = [
      [96, 190], [140, 288], [214, 178], [272, 300],
      [336, 196], [430, 288], [214, 440], [430, 440],
    ];
    const p = spots[i];
    ctx.save();
    ctx.translate(p[0], p[1]);
    ctx.fillStyle = 'rgba(201,160,74,0.9)';
    ctx.beginPath();
    for (let k = 0; k < 10; k++) {
      const a = -Math.PI / 2 + (k / 10) * TAU;
      const rr = k % 2 === 0 ? 9 : 4;
      if (k === 0) ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
      else ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
  /* 图例 */
  ctx.save();
  ctx.fillStyle = 'rgba(60,74,70,0.08)';
  ctx.fillRect(56, 618, 400, 90);
  ctx.restore();
  drawText(ctx, '图例', 76, 642, { font: '700 16px ' + FONT, color: '#3f5a55', align: 'left' });
  ctx.save();
  ctx.strokeStyle = '#a8382f';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(150, 636);
  ctx.lineTo(170, 654);
  ctx.moveTo(170, 636);
  ctx.lineTo(150, 654);
  ctx.stroke();
  ctx.restore();
  drawText(ctx, '已封锁', 180, 646, { font: '400 15px ' + FONT, color: '#4a5a54', align: 'left' });
  ctx.save();
  ctx.translate(292, 645);
  ctx.fillStyle = 'rgba(201,160,74,0.9)';
  ctx.beginPath();
  for (let k = 0; k < 10; k++) {
    const a = -Math.PI / 2 + (k / 10) * TAU;
    const rr = k % 2 === 0 ? 9 : 4;
    if (k === 0) ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
    else ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  drawText(ctx, '奶片可能的位置', 310, 646, { font: '400 15px ' + FONT, color: '#4a5a54', align: 'left' });
  drawText(ctx, '你在这里', 256, 574, { font: '700 14px ' + FONT, color: '#8a3a30', spacing: 2, rotate: -0.04 });
  /* 手写备注 */
  drawText(ctx, '（出口在维修）', 400, 700, { font: '400 20px ' + HAND, color: '#8a3a30', alpha: 0.8, rotate: -0.06 });
  /* 旧化 */
  waterRing(ctx, w, h, 430, 120, 64, '#6a4a26', 0.16, 3101, false);
  softStain(ctx, w, h, 90, 660, 70, '#8a6a35', 0.12, 3102, false);
  crease(ctx, 26, 300, 486, 294, 0.1);
  crease(ctx, 26, 520, 486, 528, 0.08);
  crease(ctx, 390, 26, 386, 742, 0.07);
  tape(ctx, 50, 40, 56, 20, -0.4);
  applyGrain(ctx, w, h, { seed: hashSeed('poster-map-grain'), grain: 7, mottle: 0.05, cells: 4 });
}

/* 奶蛙全身（主菜单插画） */
function drawFrogBody(ctx, cx, groundY, hgt, seed) {
  const rnd = mulberry32(seed >>> 0);
  const skin = '#b9d264';
  const skinDark = '#8aa83f';
  const skinLight = '#dbe98f';
  ctx.save();
  /* 影子 */
  const sh = ctx.createRadialGradient(cx, groundY, 0, cx, groundY, hgt * 0.34);
  sh.addColorStop(0, 'rgba(40,24,12,0.5)');
  sh.addColorStop(1, 'rgba(40,24,12,0)');
  ctx.fillStyle = sh;
  ctx.beginPath();
  ctx.ellipse(cx, groundY, hgt * 0.34, hgt * 0.08, 0, 0, TAU);
  ctx.fill();
  /* 腿 */
  ctx.strokeStyle = skinDark;
  ctx.lineWidth = hgt * 0.07;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(cx - hgt * 0.12, groundY - hgt * 0.2);
  ctx.quadraticCurveTo(cx - hgt * 0.26, groundY - hgt * 0.14, cx - hgt * 0.3, groundY - hgt * 0.02);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx + hgt * 0.12, groundY - hgt * 0.2);
  ctx.quadraticCurveTo(cx + hgt * 0.26, groundY - hgt * 0.14, cx + hgt * 0.3, groundY - hgt * 0.02);
  ctx.stroke();
  /* 脚 */
  ctx.fillStyle = skin;
  ctx.beginPath();
  ctx.ellipse(cx - hgt * 0.31, groundY - hgt * 0.015, hgt * 0.13, hgt * 0.035, -0.1, 0, TAU);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(cx + hgt * 0.31, groundY - hgt * 0.015, hgt * 0.13, hgt * 0.035, 0.1, 0, TAU);
  ctx.fill();
  /* 身体 */
  const body = ctx.createLinearGradient(cx, groundY - hgt * 0.62, cx, groundY - hgt * 0.12);
  body.addColorStop(0, skinLight);
  body.addColorStop(1, skinDark);
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.ellipse(cx, groundY - hgt * 0.37, hgt * 0.2, hgt * 0.27, 0, 0, TAU);
  ctx.fill();
  /* 肚子 */
  ctx.fillStyle = 'rgba(248,247,214,0.7)';
  ctx.beginPath();
  ctx.ellipse(cx, groundY - hgt * 0.33, hgt * 0.12, hgt * 0.18, 0, 0, TAU);
  ctx.fill();
  /* 手臂 */
  ctx.strokeStyle = skin;
  ctx.lineWidth = hgt * 0.055;
  ctx.beginPath();
  ctx.moveTo(cx - hgt * 0.16, groundY - hgt * 0.46);
  ctx.quadraticCurveTo(cx - hgt * 0.28, groundY - hgt * 0.4, cx - hgt * 0.24, groundY - hgt * 0.3);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx + hgt * 0.16, groundY - hgt * 0.46);
  ctx.quadraticCurveTo(cx + hgt * 0.28, groundY - hgt * 0.4, cx + hgt * 0.24, groundY - hgt * 0.3);
  ctx.stroke();
  /* 手里的奶片 */
  ctx.save();
  ctx.translate(cx + hgt * 0.245, groundY - hgt * 0.3);
  ctx.rotate(0.12);
  ctx.fillStyle = '#fff6d8';
  ctx.strokeStyle = '#c9a25a';
  ctx.lineWidth = 2;
  roundRect(ctx, -hgt * 0.045, -hgt * 0.03, hgt * 0.09, hgt * 0.06, hgt * 0.015);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
  /* 头 */
  drawFrogHead(ctx, cx, groundY - hgt * 0.74, hgt * 0.2, {
    seed: 'menu-frog-face',
    pupilX: 0.02,
    pupilY: 0.03,
    blush: 0.42,
    milk: true,
  });
  /* 颈部的阴影 */
  const neck = ctx.createLinearGradient(0, groundY - hgt * 0.6, 0, groundY - hgt * 0.5);
  neck.addColorStop(0, 'rgba(60,80,30,0.35)');
  neck.addColorStop(1, 'rgba(60,80,30,0)');
  ctx.fillStyle = neck;
  ctx.fillRect(cx - hgt * 0.16, groundY - hgt * 0.6, hgt * 0.32, hgt * 0.1);
  ctx.restore();
}

function posterMenu(ctx, w, h) {
  const rnd = mulberry32(hashSeed('poster-menu'));
  /* 暗色舞台底 */
  const bg = ctx.createLinearGradient(0, 0, 0, h);
  bg.addColorStop(0, '#180d10');
  bg.addColorStop(0.55, '#2c1716');
  bg.addColorStop(1, '#3a2018');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);
  /* 中央暖光 */
  const glow = ctx.createRadialGradient(310, 500, 20, 310, 500, 430);
  glow.addColorStop(0, 'rgba(255,196,120,0.55)');
  glow.addColorStop(0.45, 'rgba(214,130,70,0.18)');
  glow.addColorStop(1, 'rgba(120,50,30,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, w, h);
  /* 幕布 */
  for (let s = 0; s < 2; s++) {
    const x0 = s === 0 ? 0 : w;
    const dir = s === 0 ? 1 : -1;
    const cg = ctx.createLinearGradient(x0, 0, x0 + dir * 120, 0);
    cg.addColorStop(0, 'rgba(24,10,14,0.95)');
    cg.addColorStop(1, 'rgba(24,10,14,0)');
    ctx.fillStyle = cg;
    ctx.fillRect(s === 0 ? 0 : w - 120, 0, 120, h);
    ctx.save();
    ctx.globalAlpha = 0.3;
    ctx.strokeStyle = '#5a2f2c';
    ctx.lineWidth = 8;
    for (let i = 0; i < 4; i++) {
      const x = s === 0 ? 22 + i * 24 : w - 22 - i * 24;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.quadraticCurveTo(x + (s === 0 ? 14 : -14), h * 0.5, x, h);
      ctx.stroke();
    }
    ctx.restore();
  }
  /* 舞台地板 */
  const floor = ctx.createLinearGradient(0, h * 0.72, 0, h);
  floor.addColorStop(0, 'rgba(90,52,32,0.55)');
  floor.addColorStop(1, 'rgba(30,16,12,0.9)');
  ctx.fillStyle = floor;
  ctx.fillRect(0, h * 0.72, w, h * 0.28);
  ctx.save();
  ctx.globalAlpha = 0.16;
  ctx.strokeStyle = '#c9925c';
  ctx.lineWidth = 1;
  for (let i = 0; i < 6; i++) {
    ctx.beginPath();
    ctx.moveTo(0, h * 0.74 + i * 8);
    ctx.lineTo(w, h * 0.73 + i * 9);
    ctx.stroke();
  }
  ctx.restore();
  /* 顶部小旗 */
  ctx.save();
  ctx.globalAlpha = 0.38;
  bunting(ctx, w, 176, 4001, 0.8);
  ctx.restore();
  /* 标题 */
  drawText(ctx, '奶蛙乐园', 256, 88, { font: '800 62px ' + SERIF, color: '#f3cd8b', spacing: 10, shadow: { color: 'rgba(255,190,90,0.45)', blur: 24 } });
  ctx.save();
  ctx.globalAlpha = 0.5;
  ctx.strokeStyle = '#c9925c';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(70, 126);
  ctx.lineTo(200, 126);
  ctx.moveTo(312, 126);
  ctx.lineTo(442, 126);
  ctx.stroke();
  ctx.restore();
  drawText(ctx, 'MIDNIGHT MILK CANDY', 256, 148, { font: '400 14px ' + FONT, color: '#c9a06a', spacing: 6, alpha: 0.9 });
  /* 蛋糕 */
  drawCake(ctx, 330, 596, 0.78, 4101);
  /* 奶蛙站在蛋糕旁 */
  drawFrogBody(ctx, 160, 606, 250, 4201);
  /* 漂浮的奶片与尘埃 */
  for (let i = 0; i < 10; i++) {
    const x = 60 + rnd() * 400;
    const y = 210 + rnd() * 300;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate((rnd() - 0.5) * 1.2);
    ctx.globalAlpha = 0.55 + rnd() * 0.3;
    ctx.fillStyle = '#fff1cd';
    ctx.strokeStyle = 'rgba(201,162,90,0.6)';
    ctx.lineWidth = 1;
    const s = 5 + rnd() * 6;
    roundRect(ctx, -s, -s * 0.7, s * 2, s * 1.4, s * 0.35);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
  for (let i = 0; i < 40; i++) {
    dot(ctx, rnd() * w, 180 + rnd() * 420, 0.8 + rnd() * 2, '#ffd9a0', 0.1 + rnd() * 0.3);
  }
  /* 烛光的暖雾 */
  const warm = ctx.createRadialGradient(330, 430, 10, 330, 430, 170);
  warm.addColorStop(0, 'rgba(255,205,130,0.22)');
  warm.addColorStop(1, 'rgba(255,205,130,0)');
  ctx.fillStyle = warm;
  ctx.fillRect(120, 250, 420, 380);
  /* 底部菜单字样 */
  ctx.save();
  ctx.globalAlpha = 0.55;
  ctx.strokeStyle = '#c9925c';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(110, 698);
  ctx.lineTo(200, 698);
  ctx.moveTo(312, 698);
  ctx.lineTo(402, 698);
  ctx.stroke();
  ctx.restore();
  drawText(ctx, '主 菜 单', 256, 698, { font: '700 24px ' + SERIF, color: '#e8c288', spacing: 8 });
  drawText(ctx, '1999.6.1 · 最后一场生日会', 256, 736, { font: '400 13px ' + FONT, color: '#a97a52', spacing: 2, alpha: 0.85 });
  /* 暗角 */
  const vig = ctx.createRadialGradient(256, 384, 170, 256, 384, 470);
  vig.addColorStop(0, 'rgba(0,0,0,0)');
  vig.addColorStop(1, 'rgba(8,4,4,0.72)');
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, w, h);
  /* 主菜单是“画”，少量颗粒 */
  applyGrain(ctx, w, h, { seed: hashSeed('poster-menu-grain'), grain: 8, mottle: 0.05, cells: 4 });
}

/* ============================ 标牌 ============================ */

function buildSign(text, opts) {
  const o = opts || {};
  const isExit = /安全出口|EXIT/i.test(text);
  const w = isExit ? 640 : 512;
  const h = isExit ? 200 : 160;
  const canvas = mkCanvas(w, h);
  const ctx = canvas.ctx;
  const rnd = mulberry32(hashSeed('sign|' + text + '|' + w));
  const bg = o.bg || (isExit ? '#1d6b41' : '#a9763f');
  const fg = o.fg || (isExit ? '#eaffef' : '#fff2d2');
  const glow = o.glow == null ? (isExit ? '#7dffb0' : null) : o.glow;

  /* 底色 */
  if (isExit) {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, shade(bg, 10));
    g.addColorStop(1, shade(bg, -14));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 160; i++) {
      ctx.fillStyle = rgba(rnd() > 0.5 ? '#8fc9a2' : '#0c3a22', 0.04 + rnd() * 0.06);
      ctx.fillRect(0, rnd() * h, w, 0.8 + rnd() * 1.4);
    }
    /* 白边 */
    ctx.strokeStyle = 'rgba(238,255,240,0.85)';
    ctx.lineWidth = 4;
    ctx.strokeRect(10, 10, w - 20, h - 20);
    ctx.strokeStyle = 'rgba(10,40,24,0.5)';
    ctx.lineWidth = 2;
    ctx.strokeRect(16, 16, w - 32, h - 32);
  } else {
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);
    /* 木纹（跟随 bg 明暗，自定义底色也不会脏） */
    const bgIsHex = typeof bg === 'string' && bg.charAt(0) === '#';
    const grainLight = bgIsHex ? shade(bg, 30) : 'rgb(255,235,200)';
    const grainDark = bgIsHex ? shade(bg, -42) : 'rgb(40,20,10)';
    for (let i = 0; i < 30; i++) {
      const y = rnd() * h;
      const amp = 1 + rnd() * 3;
      const freq = 1 + Math.floor(rnd() * 3);
      const phase = rnd() * TAU;
      ctx.save();
      ctx.globalAlpha = 0.1 + rnd() * 0.16;
      ctx.strokeStyle = rnd() > 0.5 ? grainLight : grainDark;
      ctx.lineWidth = 0.8 + rnd() * 2;
      ctx.beginPath();
      for (let x = 0; x <= w; x += 8) {
        const yy = y + Math.sin((x / w) * TAU * freq + phase) * amp;
        if (x === 0) ctx.moveTo(x, yy);
        else ctx.lineTo(x, yy);
      }
      ctx.stroke();
      ctx.restore();
    }
    /* 木牌倒角 */
    ctx.strokeStyle = 'rgba(50,28,12,0.55)';
    ctx.lineWidth = 6;
    ctx.strokeRect(3, 3, w - 6, h - 6);
    ctx.strokeStyle = 'rgba(255,230,190,0.3)';
    ctx.lineWidth = 2;
    ctx.strokeRect(9, 9, w - 18, h - 18);
    /* 螺丝 */
    const screws = [[22, 22], [w - 22, 22], [22, h - 22], [w - 22, h - 22]];
    for (let i = 0; i < screws.length; i++) {
      const s = screws[i];
      ctx.fillStyle = '#4a4a44';
      ctx.beginPath();
      ctx.arc(s[0], s[1], 6, 0, TAU);
      ctx.fill();
      ctx.fillStyle = 'rgba(230,230,220,0.6)';
      ctx.beginPath();
      ctx.arc(s[0] - 1.6, s[1] - 1.6, 2.2, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = 'rgba(30,26,22,0.6)';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(s[0] - 3, s[1] + 2);
      ctx.lineTo(s[0] + 3, s[1] - 2);
      ctx.stroke();
    }
  }

  /* 发光 */
  if (glow) {
    const gc = typeof glow === 'string' ? glow : '#7dffb0';
    const halo = ctx.createRadialGradient(w / 2, h / 2, 10, w / 2, h / 2, w * 0.5);
    halo.addColorStop(0, rgba(gc, 0.28));
    halo.addColorStop(1, rgba(gc, 0));
    ctx.fillStyle = halo;
    ctx.fillRect(0, 0, w, h);
  }

  /* 主文字 */
  const maxTextW = isExit ? w - 230 : w - 80;
  const font = fitFont(ctx, text, maxTextW, { family: FONT, weight: 800, max: isExit ? 86 : 74, min: 26 });
  const ty = o.sub ? h * 0.42 : h * 0.52;
  ctx.save();
  if (glow) {
    ctx.shadowColor = typeof glow === 'string' ? glow : '#7dffb0';
    ctx.shadowBlur = 26;
  }
  drawText(ctx, text, isExit ? w * 0.58 : w / 2, ty, { font: font, color: fg, spacing: isExit ? 8 : 4, align: 'center', shadow: null });
  ctx.restore();
  /* 再画一遍，让发光更实 */
  if (glow) {
    ctx.save();
    ctx.shadowColor = typeof glow === 'string' ? glow : '#7dffb0';
    ctx.shadowBlur = 10;
    drawText(ctx, text, isExit ? w * 0.58 : w / 2, ty, { font: font, color: fg, spacing: isExit ? 8 : 4 });
    ctx.restore();
  }

  /* 安全出口：奔跑小人 */
  if (isExit) {
    ctx.save();
    ctx.strokeStyle = 'rgba(247,255,248,0.92)';
    ctx.fillStyle = 'rgba(247,255,248,0.92)';
    ctx.lineCap = 'round';
    const px = 92;
    const py = h * 0.52;
    /* 头 */
    ctx.beginPath();
    ctx.arc(px, py - 34, 13, 0, TAU);
    ctx.fill();
    /* 身体（前倾） */
    ctx.lineWidth = 12;
    ctx.beginPath();
    ctx.moveTo(px + 4, py - 20);
    ctx.lineTo(px - 8, py + 16);
    ctx.stroke();
    /* 手臂 */
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.moveTo(px + 2, py - 12);
    ctx.lineTo(px + 26, py + 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(px, py - 4);
    ctx.lineTo(px - 24, py + 6);
    ctx.stroke();
    /* 腿 */
    ctx.lineWidth = 9;
    ctx.beginPath();
    ctx.moveTo(px - 8, py + 14);
    ctx.lineTo(px + 16, py + 34);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(px - 8, py + 14);
    ctx.lineTo(px - 26, py + 34);
    ctx.stroke();
    ctx.restore();
  }

  /* 副标题 */
  if (o.sub) {
    drawText(ctx, String(o.sub), isExit ? w * 0.58 : w / 2, ty + (isExit ? 46 : 40), {
      font: '400 ' + (isExit ? 22 : 19) + 'px ' + FONT,
      color: fg,
      spacing: isExit ? 5 : 3,
      alpha: 0.9,
    });
  }

  /* 做旧 */
  if (!isExit) {
    for (let i = 0; i < 16; i++) {
      stampRect(ctx, w, h, rnd() * w, rnd() * h, 2 + rnd() * 14, 1 + rnd() * 3, (rnd() - 0.5) * 0.5, '#3f2410', 0.06 + rnd() * 0.1);
    }
    softStain(ctx, w, h, 40, h - 20, 32, '#3a2412', 0.14, 5101);
    softStain(ctx, w, h, w - 40, 20, 26, '#ffd9a0', 0.12, 5102);
  } else {
    for (let i = 0; i < 24; i++) {
      dot(ctx, rnd() * w, rnd() * h, 0.6 + rnd() * 2.4, rnd() > 0.5 ? '#b8d6b0' : '#08200f', 0.08 + rnd() * 0.14);
    }
  }
  applyGrain(ctx, w, h, { seed: hashSeed('sign-grain|' + text), grain: 6, mottle: 0.035, cells: 4 });
  return canvas;
}

/* ============================ PUBLIC API ============================ */

const WALLPAPER_DRAW = {
  entry: wallEntry,
  classroom: wallClassroom,
  nap: wallNap,
  canteen: wallCanteen,
  corridor: wallCorridor,
  exit: wallExit,
};

const FLOOR_DRAW = {
  entry: floorEntry,
  classroom: floorClassroom,
  nap: floorNap,
  canteen: floorCanteen,
  corridor: floorCorridor,
  exit: floorExit,
};

const CEILING_DRAW = {
  entry: ceilEntry,
  classroom: ceilClassroom,
  nap: ceilNap,
  canteen: ceilCanteen,
  corridor: ceilCorridor,
  exit: ceilExit,
};

const TRIM_DRAW = {
  entry: trimEntry,
  classroom: trimClassroom,
  nap: trimNap,
  canteen: trimCanteen,
  corridor: trimCorridor,
  exit: trimExit,
};

const POSTER_DRAW = {
  frog: { draw: posterFrog, w: 512, h: 512 },
  birthday: { draw: posterBirthday, w: 512, h: 768 },
  rules: { draw: posterRules, w: 512, h: 768 },
  drawing: { draw: posterDrawing, w: 512, h: 768 },
  missing: { draw: posterMissing, w: 512, h: 768 },
  map: { draw: posterMap, w: 512, h: 768 },
  menu: { draw: posterMenu, w: 512, h: 768 },
};

function assertZone(zone) {
  if (ZONES.indexOf(zone) === -1) {
    throw new Error('textures.js: 未知区域 "' + zone + '"，可用区域：' + ZONES.join(', '));
  }
}

function stableOptsKey(o) {
  if (!o) return '';
  const keys = Object.keys(o).sort();
  return keys.map((k) => k + '=' + String(o[k])).join('&');
}

function makeTexture(canvas, tiled, key, info) {
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.wrapS = tiled ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  t.wrapT = tiled ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  t.needsUpdate = true;
  t.name = key;
  t.userData = info || {};
  return t;
}

export function createTextures() {
  const cache = new Map();

  function memo(key, builder) {
    let t = cache.get(key);
    if (!t) {
      t = builder();
      cache.set(key, t);
    }
    return t;
  }

  function build(key, w, h, drawFn, tiled, info) {
    return memo(key, () => {
      const surface = mkCanvas(w, h);
      drawFn(surface.ctx, w, h);
      return makeTexture(surface.canvas, tiled, key, info);
    });
  }

  const api = {
    wallpaper(zone) {
      assertZone(zone);
      return build('wallpaper:' + zone, TILE, TILE, WALLPAPER_DRAW[zone], true, { zone: zone, kind: 'wallpaper' });
    },
    floor(zone) {
      assertZone(zone);
      return build('floor:' + zone, TILE, TILE, FLOOR_DRAW[zone], true, { zone: zone, kind: 'floor' });
    },
    ceiling(zone) {
      assertZone(zone);
      return build('ceiling:' + zone, TILE, TILE, CEILING_DRAW[zone], true, { zone: zone, kind: 'ceiling' });
    },
    trim(zone) {
      assertZone(zone);
      return build('trim:' + zone, TILE, TRIM_H, TRIM_DRAW[zone], true, { zone: zone, kind: 'trim' });
    },
    poster(kind) {
      const p = POSTER_DRAW[kind];
      if (!p) {
        throw new Error('textures.js: 未知海报 "' + kind + '"，可用：' + Object.keys(POSTER_DRAW).join(', '));
      }
      return build('poster:' + kind, p.w, p.h, p.draw, false, { kind: 'poster', name: kind });
    },
    sign(text, opts) {
      const t = String(text == null ? '' : text);
      const o = opts || {};
      const key = 'sign:' + t + '|' + stableOptsKey(o);
      return memo(key, () => {
        const surface = buildSign(t, o);
        return makeTexture(surface.canvas, false, key, { kind: 'sign', text: t });
      });
    },
    frogFace() {
      return memo('frogFace', () => {
        const surface = mkCanvas(TILE, TILE);
        const ctx = surface.ctx;
        /* 整张皮肤 */
        const g = ctx.createLinearGradient(0, 0, 0, TILE);
        g.addColorStop(0, '#dceb92');
        g.addColorStop(0.55, '#bed668');
        g.addColorStop(1, '#9db94e');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, TILE, TILE);
        /* 皮肤颗粒 */
        applyGrain(ctx, TILE, TILE, { seed: hashSeed('frog-skin'), grain: 12, mottle: 0.08, cells: 6 });
        const rnd = mulberry32(hashSeed('frog-skin-speckle'));
        for (let i = 0; i < 70; i++) {
          const x = rnd() * TILE;
          const y = rnd() * TILE;
          const r = 1 + rnd() * 4;
          dot(ctx, x, y, r, rnd() > 0.4 ? '#8fae45' : '#d7e79c', 0.18 + rnd() * 0.25);
        }
        /* 五官 */
        drawFrogHead(ctx, 256, 248, 198, {
          seed: 'frog-face',
          headFill: false,
          pupilX: 0.015,
          pupilY: 0.025,
          pupilScale: 0.15,
          blush: 0.4,
          milk: true,
          mouthWide: 1.05,
        });
        /* 四周压暗，球体感 */
        const vig = ctx.createRadialGradient(256, 256, 150, 256, 256, 365);
        vig.addColorStop(0, 'rgba(20,30,8,0)');
        vig.addColorStop(1, 'rgba(20,30,8,0.55)');
        ctx.fillStyle = vig;
        ctx.fillRect(0, 0, TILE, TILE);
        addDust(ctx, TILE, TILE, hashSeed('frog-face-dust'), 40);
        return makeTexture(surface.canvas, false, 'frogFace', { kind: 'frogFace' });
      });
    },
    glow() {
      return memo('glow', () => {
        const surface = mkCanvas(TILE, TILE);
        const ctx = surface.ctx;
        ctx.clearRect(0, 0, TILE, TILE);
        const g = ctx.createRadialGradient(256, 256, 0, 256, 256, 256);
        g.addColorStop(0, 'rgba(255,255,255,1)');
        g.addColorStop(0.22, 'rgba(255,255,255,0.92)');
        g.addColorStop(0.48, 'rgba(255,255,255,0.5)');
        g.addColorStop(0.74, 'rgba(255,255,255,0.16)');
        g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, TILE, TILE);
        return makeTexture(surface.canvas, false, 'glow', { kind: 'glow' });
      });
    },
    dispose() {
      cache.forEach((t) => t.dispose());
      cache.clear();
    },
  };

  return api;
}



