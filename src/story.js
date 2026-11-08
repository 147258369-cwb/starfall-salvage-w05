// 片头剧情：镜头巡游地图 + 语音字幕 + 可跳过
import * as THREE from 'three';
import { STORY, STORY_PATH, GRID } from './config.js';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// 镜头安全边距：墙面厚度按格计算，留出这个距离镜头才不会切进墙体或穿过墙角。
const CAM_PAD = 0.26;
const PATH_SAMPLES = 1400;

export class Story {
  constructor(camera, world, audio, ui) {
    this.camera = camera;
    this.world = world;
    this.audio = audio;
    this.ui = ui;
    this.eyeY = 2.02;
    this.points = STORY_PATH.map(([x, z]) => new THREE.Vector3(x * GRID.cell, this.eyeY, z * GRID.cell));
    // 原始样条在急转弯与回折处会外抛穿墙，这里先把曲线采样成密集点列再做安全化处理，
    // 之后只用折线插值，不再让样条自己外抛。
    this.curve = new THREE.CatmullRomCurve3(this.points, false, 'centripetal', 0.5);
    this.safePath = this.buildSafePath(this.curve);
    this.duration = 32;
    this.elapsed = 0;
    this.skipped = false;
    this.playing = false;
    this.lookTmp = new THREE.Vector3();
    this.lineCount = STORY.length;
    this.skipFns = [];
    this.lastSafe = this.safePath[0].clone();
  }

  // 把样条换成一条始终落在可行走空间内的折线。
  // 原始 Catmull-Rom 在急转弯与回折航点处会向外抛，实测 401 个采样点里 94 个落在墙里；
  // 航点直接相连又会切墙角。这里改成：航点 -> 网格寻路 -> 均匀重采样 -> 轻微圆角 -> 逐点验墙。
  buildSafePath(curve) {
    const cells = this.points.map((p) =>
      this.nearestWalkableCell(Math.floor(p.x / GRID.cell), Math.floor(p.z / GRID.cell)),
    );
    const route = [];
    for (let i = 0; i < cells.length - 1; i++) {
      const seg = this.bfsRoute(cells[i], cells[i + 1]);
      if (seg) route.push(...seg);
      else route.push(cells[i]);
    }
    route.push(cells[cells.length - 1]);
    const uniq = [];
    for (const c of route) {
      const last = uniq[uniq.length - 1];
      if (!last || last[0] !== c[0] || last[1] !== c[1]) uniq.push(c);
    }
    const pts = uniq.map(([cx, cz]) => new THREE.Vector3((cx + 0.5) * GRID.cell, this.eyeY, (cz + 0.5) * GRID.cell));
    // 走廊只有一格宽，圆角会把折线推到墙边造成停顿，所以这里不做圆角，
    // 直接沿格心折线重采样；转向的顺滑交给 sampleAt 的插值和 lookAt 平滑。
    const dense = this.linearSamples(pts, PATH_SAMPLES);
    const out = [];
    let lastSafePt = dense[0];
    for (const raw of dense) {
      // 摆件常压在走廊中线上：先向侧面轻推一下绕开，推不动再退回上一个安全点
      let p = raw;
      if (this.isBlocked(p)) p = this.nudgeFromObstacles(p);
      if (this.isBlocked(p)) out.push(lastSafePt.clone());
      else { out.push(p); lastSafePt = p; }
    }
    return out;
  }

  // 从摆件旁边推开一点点（沿最短轴），让镜头能贴着走过去而不是整段停住
  nudgeFromObstacles(p) {
    const out = p.clone();
    for (const o of this.world.obstacles) {
      const dx = out.x - o.x, dz = out.z - o.z;
      const ex = o.hx + CAM_PAD - Math.abs(dx);
      const ez = o.hz + CAM_PAD - Math.abs(dz);
      if (ex <= 0 || ez <= 0) continue;
      if (ex < ez) out.x += (dx === 0 ? 1 : Math.sign(dx)) * (ex + 0.02);
      else out.z += (dz === 0 ? 1 : Math.sign(dz)) * (ez + 0.02);
    }
    return out;
  }

  // 航点可能落在墙格里，先吸附到最近的「可行走且离墙足够远」的格心
  nearestWalkableCell(cx, cz) {
    const okCell = (x, z) => {
      if (!this.world.isWalkable(x, z)) return false;
      return !this.world.pointBlocked((x + 0.5) * GRID.cell, (z + 0.5) * GRID.cell, CAM_PAD);
    };
    if (okCell(cx, cz)) return [cx, cz];
    for (let r = 1; r <= 6; r++) {
      let best = null, bestD = Infinity;
      for (let dz = -r; dz <= r; dz++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
          const x = cx + dx, z = cz + dz;
          if (!okCell(x, z)) continue;
          const d = dx * dx + dz * dz;
          if (d < bestD) { bestD = d; best = [x, z]; }
        }
      }
      if (best) return best;
    }
    return [cx, cz];
  }

  // 网格 BFS：只在可行走、且离墙与家具保持 CAM_PAD 的格子里走，天然避开墙体与墙角
  bfsRoute(a, b) {
    const W = this.world.W, H = this.world.H;
    const idx = (x, z) => z * W + x;
    if (!this.world.isWalkable(a[0], a[1]) || !this.world.isWalkable(b[0], b[1])) return null;
    const prev = new Int32Array(W * H).fill(-1);
    const start = idx(a[0], a[1]);
    const goal = idx(b[0], b[1]);
    const q = [start];
    prev[start] = start;
    for (let h = 0; h < q.length; h++) {
      const cur = q[h];
      if (cur === goal) break;
      const cx = cur % W, cz = (cur / W) | 0;
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = cx + dx, nz = cz + dz;
        if (nx < 0 || nz < 0 || nx >= W || nz >= H) continue;
        const ni = idx(nx, nz);
        if (prev[ni] !== -1 || !this.world.isWalkable(nx, nz)) continue;
        const wx = (nx + 0.5) * GRID.cell, wz = (nz + 0.5) * GRID.cell;
        if (this.world.pointBlocked(wx, wz, CAM_PAD)) continue;
        // 家具常压在格子交界上，两个格心都安全时连线中点仍可能被挡，这里一并检查
        const mx = ((cx + nx + 1) * GRID.cell) / 2, mz = ((cz + nz + 1) * GRID.cell) / 2;
        if (this.world.pointBlocked(mx, mz, CAM_PAD)) continue;
        prev[ni] = cur;
        q.push(ni);
      }
    }
    if (prev[goal] === -1) return null;
    const path = [];
    let cur = goal;
    while (cur !== start) {
      path.push([cur % W, (cur / W) | 0]);
      cur = prev[cur];
      if (path.length > W * H) return null;
    }
    path.push([a[0], a[1]]);
    path.reverse();
    return path;
  }

  // 按总长度均匀取点，把航点连成折线（直线段不会像样条那样外抛）
  linearSamples(points, n) {
    const seg = [];
    let total = 0;
    for (let i = 0; i < points.length - 1; i++) {
      const d = points[i].distanceTo(points[i + 1]);
      seg.push(d); total += d;
    }
    const out = [];
    for (let i = 0; i <= n; i++) {
      const target = (total * i) / n;
      let acc = 0, s = 0;
      while (s < seg.length - 1 && acc + seg[s] < target) { acc += seg[s]; s++; }
      const k = seg[s] > 1e-6 ? Math.min(1, (target - acc) / seg[s]) : 0;
      out.push(points[s].clone().lerp(points[s + 1], k));
    }
    return out;
  }

  isBlocked(p) {
    return this.world.pointBlocked(p.x, p.z, CAM_PAD);
  }

  snapToWalkable(p) {
    const C = GRID.cell;
    const cx = Math.floor(p.x / C), cz = Math.floor(p.z / C);
    for (let r = 1; r <= 4; r++) {
      let best = null, bestD = Infinity;
      for (let dz = -r; dz <= r; dz++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
          const gx = cx + dx, gz = cz + dz;
          if (!this.world.isWalkable(gx, gz)) continue;
          const wx = (gx + 0.5) * C, wz = (gz + 0.5) * C;
          if (this.world.pointBlocked(wx, wz, CAM_PAD)) continue;
          const d = (wx - p.x) ** 2 + (wz - p.z) ** 2;
          if (d < bestD) { bestD = d; best = new THREE.Vector3(wx, this.eyeY, wz); }
        }
      }
      if (best) return best;
    }
    return p.clone();
  }

  smooth(points, iterations = 2, half = 6) {
    let arr = points;
    for (let k = 0; k < iterations; k++) {
      const out = new Array(arr.length);
      for (let i = 0; i < arr.length; i++) {
        let sx = 0, sz = 0, n = 0;
        for (let j = -half; j <= half; j++) {
          const idx = i + j;
          if (idx < 0 || idx >= arr.length) continue;
          sx += arr[idx].x; sz += arr[idx].z; n++;
        }
        const p = new THREE.Vector3(sx / n, this.eyeY, sz / n);
        out[i] = this.isBlocked(p) ? arr[i] : p;
      }
      arr = out;
    }
    return arr;
  }

  // 按弧长近似参数取点（safePath 是等距采样，索引线性插值即可）
  sampleAt(t) {
    const n = this.safePath.length - 1;
    const f = Math.max(0, Math.min(1, t)) * n;
    const i = Math.floor(f), j = Math.min(n, i + 1), k = f - i;
    const a = this.safePath[i], b = this.safePath[j];
    return new THREE.Vector3(a.x + (b.x - a.x) * k, this.eyeY, a.z + (b.z - a.z) * k);
  }

  startCamera() {
    const p = this.sampleAt(0);
    this.lastSafe.copy(p);
    this.camera.position.copy(p);
    const ahead = this.sampleAt(0.03);
    this.camera.lookAt(ahead.x, ahead.y - 0.5, ahead.z);
    this.camera.fov = 62;
    this.camera.updateProjectionMatrix();
  }

  async play() {
    this.skipped = false;
    this.elapsed = 0;
    this.playing = true;
    let total = 1.5;
    for (let i = 0; i < STORY.length; i++) total += this.audio.duration('vo_0' + (i + 1)) + 0.8;
    this.duration = Math.max(28, total);
    this.startCamera();
    this.ui.resetStory();
    this.ui.showStory();
    requestAnimationFrame(() => this.ui.storyActive());
    this.audio.playMusic('music_story', { fade: 1.2 });
    this.update(0);

    for (let i = 0; i < STORY.length; i++) {
      if (this.skipped) break;
      const line = STORY[i];
      this.ui.setStoryLine(line.text, line.chapter, '旁白 · 奶蛙乐园');
      await this.audio.playVoice('vo_0' + (i + 1));
      if (this.skipped) break;
      await wait(680);
    }
    if (!this.skipped) await wait(500);
    this.playing = false;
    this.ui.storyInactive();
    this.audio.stopVoice();
    return !this.skipped;
  }

  skip() {
    if (!this.playing) return;
    this.skipped = true;
    this.audio.stopVoice();
  }

  update(dt) {
    if (!this.playing) return;
    this.elapsed = Math.min(this.duration, this.elapsed + dt);
    const p = Math.min(1, this.elapsed / this.duration);
    this.ui.setStoryProgress(p);
    const pos = this.sampleAt(p);
    const ahead = this.sampleAt(Math.min(1, p + 0.032));
    const sway = Math.sin(this.elapsed * 0.8) * 0.08;
    // 兜底：万一插值仍落在墙里，就停在最后一个安全位置，绝不穿墙
    if (this.isBlocked(pos)) {
      this.camera.position.copy(this.lastSafe);
    } else {
      this.lastSafe.copy(pos);
      this.camera.position.set(pos.x + sway * 0.6, pos.y + Math.sin(this.elapsed * 1.3) * 0.03, pos.z);
    }
    this.camera.lookAt(ahead.x, ahead.y - 0.68 + sway, ahead.z);
    this.camera.rotation.z += Math.sin(this.elapsed * 0.6) * 0.004;
  }
}