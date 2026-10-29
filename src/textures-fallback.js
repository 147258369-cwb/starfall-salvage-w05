// 兜底贴图：当 src/textures.js 不可用时保证游戏可运行
import * as THREE from 'three';

const cache = new Map();
const PALETTE = {
  entry:     { wall: '#e8cf9f', wall2: '#f7b6c2', floor: '#d8c7ab', ceil: '#c9b48f' },
  classroom: { wall: '#b9d8c6', wall2: '#f7e2a8', floor: '#b98a55', ceil: '#d9cbb2' },
  nap:       { wall: '#9fb4c9', wall2: '#d9e2ea', floor: '#5d6f80', ceil: '#8d9aa5' },
  canteen:   { wall: '#efb9c2', wall2: '#ffe1b8', floor: '#ded6c8', ceil: '#d8b7ae' },
  corridor:  { wall: '#e5d7a7', wall2: '#5f7a5c', floor: '#9aa892', ceil: '#cabfa0' },
  exit:      { wall: '#8f9a91', wall2: '#2f6d4a', floor: '#7d837c', ceil: '#6c736d' },
};
export const ZONES = Object.keys(PALETTE);

function tex(w, h, draw, { repeat = true } = {}) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  draw(g, w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  return t;
}
function cached(key, make) { if (!cache.has(key)) cache.set(key, make()); return cache.get(key); }
function noise(g, w, h, alpha = 0.06) {
  for (let i = 0; i < 1600; i++) {
    g.fillStyle = `rgba(0,0,0,${Math.random() * alpha})`;
    g.fillRect(Math.random() * w, Math.random() * h, 1.5, 1.5);
  }
}

export function createTextures() {
  return {
    wallpaper(zone) {
      const p = PALETTE[zone] || PALETTE.corridor;
      return cached('w-' + zone, () => tex(512, 512, (g, w, h) => {
        g.fillStyle = p.wall; g.fillRect(0, 0, w, h);
        g.fillStyle = p.wall2;
        for (let y = 24; y < h; y += 72) for (let x = 24; x < w; x += 72) {
          g.beginPath(); g.arc(x, y, 5, 0, Math.PI * 2); g.fill();
        }
        g.fillStyle = 'rgba(80,50,30,.22)'; g.fillRect(0, h - 92, w, 92);
        g.fillStyle = 'rgba(255,255,255,.08)'; g.fillRect(0, h - 100, w, 8);
        noise(g, w, h, 0.05);
      }));
    },
    floor(zone) {
      const p = PALETTE[zone] || PALETTE.corridor;
      return cached('f-' + zone, () => tex(512, 512, (g, w, h) => {
        g.fillStyle = p.floor; g.fillRect(0, 0, w, h);
        g.strokeStyle = 'rgba(0,0,0,.18)'; g.lineWidth = 3;
        for (let i = 0; i <= 4; i++) {
          g.beginPath(); g.moveTo(i * 128, 0); g.lineTo(i * 128, h); g.stroke();
          g.beginPath(); g.moveTo(0, i * 128); g.lineTo(w, i * 128); g.stroke();
        }
        noise(g, w, h, 0.08);
      }));
    },
    ceiling(zone) {
      const p = PALETTE[zone] || PALETTE.corridor;
      return cached('c-' + zone, () => tex(256, 256, (g, w, h) => {
        g.fillStyle = p.ceil; g.fillRect(0, 0, w, h);
        g.strokeStyle = 'rgba(0,0,0,.12)'; g.lineWidth = 2;
        for (let i = 0; i <= 2; i++) { g.beginPath(); g.moveTo(i * 128, 0); g.lineTo(i * 128, h); g.stroke(); }
        noise(g, w, h, 0.07);
      }));
    },
    trim(zone) {
      const p = PALETTE[zone] || PALETTE.corridor;
      return cached('t-' + zone, () => tex(128, 128, (g, w, h) => {
        g.fillStyle = p.wall2; g.fillRect(0, 0, w, h);
        g.fillStyle = 'rgba(0,0,0,.2)'; g.fillRect(0, h * .75, w, h * .25);
      }));
    },
    poster(kind) {
      return cached('p-' + kind, () => tex(512, 768, (g, w, h) => {
        g.fillStyle = '#f3e6c8'; g.fillRect(0, 0, w, h);
        g.fillStyle = '#e2c98f'; g.fillRect(16, 16, w - 32, h - 32);
        g.fillStyle = '#3a2b20';
        g.font = 'bold 64px "Microsoft YaHei", sans-serif';
        g.textAlign = 'center';
        g.fillText(kind, w / 2, 180);
        g.beginPath(); g.arc(w / 2, h / 2 + 40, 110, 0, Math.PI * 2);
        g.fillStyle = '#d6c25e'; g.fill();
        g.fillStyle = '#111';
        g.beginPath(); g.arc(w / 2 - 42, h / 2, 26, 0, Math.PI * 2); g.fill();
        g.beginPath(); g.arc(w / 2 + 42, h / 2, 26, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#f3e6c8';
        g.beginPath(); g.arc(w / 2 - 42, h / 2, 7, 0, Math.PI * 2); g.fill();
        g.beginPath(); g.arc(w / 2 + 42, h / 2, 7, 0, Math.PI * 2); g.fill();
        g.strokeStyle = '#111'; g.lineWidth = 10;
        g.beginPath(); g.arc(w / 2, h / 2 + 40, 120, .15, Math.PI - .15); g.stroke();
        noise(g, w, h, 0.05);
      }, { repeat: false }));
    },
    sign(text, opts = {}) {
      const key = 's-' + text + JSON.stringify(opts);
      return cached(key, () => tex(512, 160, (g, w, h) => {
        g.fillStyle = opts.bg || '#2a1d17'; g.fillRect(0, 0, w, h);
        g.strokeStyle = opts.glow ? '#9dffc4' : '#d8a85a'; g.lineWidth = 5; g.strokeRect(6, 6, w - 12, h - 12);
        g.fillStyle = opts.fg || '#ffe6b8';
        g.font = 'bold 72px "Microsoft YaHei", sans-serif';
        g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText(text, w / 2, h / 2 - (opts.sub ? 16 : 0));
        if (opts.sub) {
          g.font = '24px "Microsoft YaHei", sans-serif';
          g.fillStyle = 'rgba(255,230,184,.65)';
          g.fillText(opts.sub, w / 2, h - 34);
        }
      }, { repeat: false }));
    },
    frogFace() {
      return cached('frogface', () => tex(512, 512, (g, w, h) => {
        g.fillStyle = '#4a4a3a'; g.fillRect(0, 0, w, h);
        g.fillStyle = '#d8d36a';
        g.beginPath(); g.ellipse(w / 2, h / 2 + 20, 200, 180, 0, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#fff';
        g.beginPath(); g.arc(w / 2 - 70, h / 2 - 40, 58, 0, Math.PI * 2); g.fill();
        g.beginPath(); g.arc(w / 2 + 70, h / 2 - 40, 58, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#111';
        g.beginPath(); g.arc(w / 2 - 62, h / 2 - 34, 14, 0, Math.PI * 2); g.fill();
        g.beginPath(); g.arc(w / 2 + 78, h / 2 - 34, 14, 0, Math.PI * 2); g.fill();
        g.strokeStyle = '#3a1a1a'; g.lineWidth = 14;
        g.beginPath(); g.arc(w / 2, h / 2 + 60, 110, .12, Math.PI - .12); g.stroke();
      }, { repeat: false }));
    },
    glow() {
      return cached('glow', () => tex(256, 256, (g, w, h) => {
        const grd = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
        grd.addColorStop(0, 'rgba(255,255,255,1)');
        grd.addColorStop(.35, 'rgba(255,230,180,.55)');
        grd.addColorStop(1, 'rgba(255,230,180,0)');
        g.fillStyle = grd; g.fillRect(0, 0, w, h);
      }, { repeat: false }));
    },
    dispose() { for (const t of cache.values()) t.dispose(); cache.clear(); },
  };
}
