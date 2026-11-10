// 片头剧情：镜头巡游地图 + 语音字幕 + 可跳过
import * as THREE from 'three';
import { STORY, STORY_PATH, STORY_SHOTS, GRID } from './config.js';

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
    // 机位朝向改成自己算 yaw/pitch，不再用 lookAt。
    // lookAt 在「看点几乎在正下方」时会退化：实测片头 3 个回折点上俯仰瞬跳到 -77°/-88°、
    // 方位角单帧跳 170-178°，看起来就是镜头猛地上下翻转。改成限速转向后是平滑的转身。
    this.pitchBias = -0.09;   // 轻微俯视；姿态全部由预计算的轨迹决定，不再逐帧追目标
    this.skipped = false;
    this.playing = false;
    this.lookTmp = new THREE.Vector3();
    this.lineCount = STORY.length;
    this.skipFns = [];
    this.lastSafe = this.safePath[0].clone();
    this.buildCamPath();
    this.buildRail();
    this.shotIndex = 0;
    this.shotT = 0;
    this.transT = 0;
    this.transFromYaw = 0;
    this.transToYaw = 0;
    this.yaw = 0;
  }

  // 导轨：把安全路径重采样成"等弧长"的密集点，按弧长取值。
  // 它只负责让机位在可行走空间里匀速前进；转身由段落表控制，导轨上没有任何掉头。
  buildRail() {
    const C = GRID.cell;
    const src = this.safePath;
    // 逐点累加弧长
    const cum = [0];
    for (let i = 1; i < src.length; i++) {
      cum.push(cum[i - 1] + Math.hypot(src[i].x - src[i - 1].x, src[i].z - src[i - 1].z));
    }
    this.railTotal = cum[cum.length - 1] || 1;
    this.railSrc = src;
    this.railCum = cum;

    // 段落表换算成弧长
    const total = this.railTotal;
    this.shots = STORY_SHOTS.map((s) => ({
      name: s.name,
      yaw: (s.yaw || 0) * Math.PI / 180,
      s0: s.from * total,
      s1: s.to * total,
    }));
    // 每段的时长按弧长占比分配，但给每段一个下限，避免一闪而过
    const seg = this.shots.map((s) => Math.max(0.15, (s.s1 - s.s0) / total));
    const sum = seg.reduce((a, b) => a + b, 0);
    this.shots.forEach((s, i) => { s.weight = seg[i] / sum; });
  }

  // 导轨在做平滑时是"按弧长的等距点列"，用它生成一张可以反复卷积的数组。
  // 网格寻路出来的路径在门洞处会有一个 0.5 格的横向小折角，人走过去感觉不到，
  // 但摄像机按它转就会甩一下。这里对导轨本身做两次轻度拉平（只削角，不改走法）。
  buildCamPath() {
    const C = GRID.cell;
    const src = this.safePath;
    const n = src.length;
    if (n < 3) { this.cx = null; return; }
    // 逐点累加弧长，做等距重采样
    const cum = [0];
    for (let i = 1; i < n; i++) cum.push(cum[i - 1] + Math.hypot(src[i].x - src[i - 1].x, src[i].z - src[i - 1].z));
    const total = cum[cum.length - 1] || 1;
    const STEP = 0.25;
    const m = Math.max(4, Math.round(total / STEP));
    const pts = [];
    for (let i = 0; i <= m; i++) {
      const s = (i / m) * total;
      let lo = 0, hi = n - 1;
      while (lo < hi - 1) { const mid = (lo + hi) >> 1; if (cum[mid] <= s) lo = mid; else hi = mid; }
      const segLen = cum[lo + 1] - cum[lo];
      const k = segLen > 1e-6 ? (s - cum[lo]) / segLen : 0;
      pts.push({ x: src[lo].x + (src[lo + 1].x - src[lo].x) * k, z: src[lo].z + (src[lo + 1].z - src[lo].z) * k });
    }
    // 两遍轻度平滑；边界固定。半径 6 点 ≈ 1.5 m，只削掉进门洞时的小折角
    const R = 6;
    let cur = pts;
    for (let pass = 0; pass < 2; pass++) {
      const nx = new Array(cur.length);
      for (let i = 0; i < cur.length; i++) {
        if (i === 0 || i === cur.length - 1) { nx[i] = cur[i]; continue; }
        let sx = 0, sz = 0, wsum = 0;
        for (let k = -R; k <= R; k++) {
          const j = i + k;
          if (j < 0 || j >= cur.length) continue;
          const w = 1 - Math.abs(k) / (R + 1);
          sx += cur[j].x * w; sz += cur[j].z * w; wsum += w;
        }
        nx[i] = { x: sx / wsum, z: sz / wsum };
      }
      cur = nx;
    }
    this.cx = { pts: cur, step: total / m, total };
    // 保证平滑后仍在可行走空间（削角后更靠内，一般没问题；有问题就回退到原点）
    for (let i = 0; i < cur.length; i++) {
      if (this.world.pointBlocked(cur[i].x, cur[i].z, 0.14)) {
        cur[i] = { x: pts[i].x, z: pts[i].z };
      }
    }
  }

  // 弧长 -> 世界坐标（在平滑后的导轨上插值）
  railAt(s) {
    const pts = this.cx.pts;
    const total = this.cx.total;
    const x = Math.max(0, Math.min(total, s));
    const f = x / this.cx.step;
    const i = Math.max(0, Math.min(pts.length - 2, Math.floor(f)));
    const k = f - i;
    const a = pts[i], b = pts[i + 1];
    return { x: a.x + (b.x - a.x) * k, y: this.eyeY, z: a.z + (b.z - a.z) * k };
  }

  // 导轨上某点处的行进方向
  railDir(s) {
    const eps = 1.8;      // 基线取样：太短会把导轨上的微小抖动放大成"甩头"
    const a = this.railAt(Math.max(0, s - eps));
    const b = this.railAt(Math.min(this.railTotal, s + eps));
    const dx = b.x - a.x, dz = b.z - a.z;
    if (Math.hypot(dx, dz) < 1e-6) return this.yaw;
    return Math.atan2(-dx, -dz);
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
    const pos = this.railAt(0);
    this.camera.position.set(pos.x, this.eyeY, pos.z);
    // 首帧朝向必须和 update 的第一帧用同一个公式，否则开播瞬间会为了"追上"而甩一次
    this.yawCont = this.railDir(0) + this.shotAt(0).yaw;
    this.yawInit = true;
    this.yaw = ((this.yawCont + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
    this.camera.rotation.order = 'YXZ';
    this.camera.rotation.set(this.pitchBias, this.yaw, 0);
    this.camera.fov = 62;
    this.camera.updateProjectionMatrix();
  }

  // 删掉方向反折的点（前后两点连线方向与进入方向相差很大，且三点几乎共线）
  dropReversals(pts) {
    const out = pts.slice();
    for (let i = out.length - 2; i >= 1; i--) {
      const a = out[i - 1], b = out[i], c = out[i + 1];
      const v1x = b.x - a.x, v1z = b.z - a.z;
      const v2x = c.x - b.x, v2z = c.z - b.z;
      const l1 = Math.hypot(v1x, v1z), l2 = Math.hypot(v2x, v2z);
      if (l1 < 1e-6 || l2 < 1e-6) { out.splice(i, 1); continue; }
      const cos = (v1x * v2x + v1z * v2z) / (l1 * l2);
      // 夹角大于 150 度（cos < -0.87）说明是"倒回去"，这个点是多余的
      if (cos < -0.87) out.splice(i, 1);
    }
    return out;
  }

  // 道格拉斯-普克折线简化
  simplify(pts, eps) {
    if (pts.length < 3) return pts.slice();
    const keep = new Uint8Array(pts.length);
    keep[0] = 1; keep[pts.length - 1] = 1;
    const seg = (i, j) => {
      const a = pts[i], b = pts[j];
      const dx = b.x - a.x, dz = b.z - a.z;
      const len = Math.hypot(dx, dz) || 1e-6;
      let best = -1, bestD = -1;
      for (let k = i + 1; k < j; k++) {
        const p = pts[k];
        const d = Math.abs((p.x - a.x) * dz - (p.z - a.z) * dx) / len;
        if (d > bestD) { bestD = d; best = k; }
      }
      return { best, bestD };
    };
    const stack = [[0, pts.length - 1]];
    while (stack.length) {
      const [i, j] = stack.pop();
      if (j - i < 2) continue;
      const { best, bestD } = seg(i, j);
      if (best > 0 && bestD > eps) {
        keep[best] = 1;
        stack.push([i, best], [best, j]);
      }
    }
    return pts.filter((_, i) => keep[i]);
  }

   



  pitchAt() {
    return this.pitchBias;
  }


  async play() {
    this.skipped = false;
    this.elapsed = 0;
    this.playing = true;
    let total = 1.5;
    for (let i = 0; i < STORY.length; i++) total += this.audio.duration('vo_0' + (i + 1)) + 0.8;
    this.duration = Math.max(28, total, this.railTotal / 5.5);
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

  // 逐帧运镜：位置只沿导轨前进（单调，绝不回退/跳位），朝向只用低速跟随。
  // 之前的错误是把"段落"当成整体跳变 —— 换段时位置直接跳到新的 s，于是一帧内位移几十米、
  // 转角上千度每秒，看起来就是抽搐。现在位置和朝向都是连续量，天然不会有这种事。
  update(dt) {
    if (!this.playing) return;
    // 第一帧 dt 可能是 0 或很大（切场景、卡帧），不要让位置从它推导
    if (dt > 0 && dt < 0.2) this.elapsed = Math.min(this.duration, this.elapsed + dt);
    const p = Math.min(1, Math.max(0, this.elapsed / this.duration));
    this.ui.setStoryProgress(p);

    // 1) 位置：弧长随时间线性推进（匀速），只增不减
    const s = p * this.railTotal;
    const pos = this.railAt(s);

    // 2) 朝向：基础是行进方向，叠加本时刻所在段落给的偏移；再用一阶滞后跟随。
    //    atan2 在 ±180 处会跳 2*PI，如果直接拿差值跟随，每经过一次就会产生一次"假转身"。
    //    所以这里先把 yaw 自身展开成连续累加值，再限制每帧的转动量，最后只在写回相机时才归一化。
    const travel = this.railDir(s);
    const shot = this.shotAt(p);
    const desired = travel + shot.yaw;
    if (!this.yawInit) {
      this.yawCont = desired;
      this.yawInit = true;
    }
    // 展开差值：取离当前连续值最近的那个等价角度
    let d = ((desired - this.yawCont + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
    const tau = 0.9;
    const a = 1 - Math.exp(-dt / tau);
    let step = d * a;
    // 硬上限：无论目标怎么跳，单帧最多转 maxRate*dt。速度 11.8 m/s 时约 45 度/秒
    const maxRate = 0.8;                               // rad/s
    const cap = maxRate * dt;
    if (Math.abs(step) > cap) step = Math.sign(step) * cap;
    this.yawCont += step;
    this.yaw = ((this.yawCont + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
    this.lastDesired = desired;

    const sway = Math.sin(this.elapsed * 0.7) * 0.03;
    this.camera.position.set(pos.x + sway * 0.4, this.eyeY + Math.sin(this.elapsed * 1.1) * 0.012, pos.z);
    this.camera.rotation.set(this.pitchBias, this.yaw, Math.sin(this.elapsed * 0.5) * 0.002);
    this.camPos = pos;

    this.currentShot = shot.name;
    this.currentT = p;
  }

  // 某进度处的镜头偏移（各段之间做对称的平滑过渡）。
  // 关键：过渡要跨在段边界上"一半在前、一半在后"，否则段切换瞬间偏移会从 sh.yaw 跳回 prev.yaw，
  // 造成 180 度级的突转。这里直接按"进度落在哪两个段之间"做插值。
  shotAt(p) {
    const shots = this.shots;
    if (!shots.length) return { name: '', yaw: 0 };
    // 每段的起始进度
    const starts = this._shotStarts || (this._shotStarts = shots.map((_, i) =>
      shots.slice(0, i).reduce((a, s) => a + s.weight, 0)));
    let i = shots.length - 1;
    for (let k = 0; k < shots.length; k++) {
      if (p < starts[k] + shots[k].weight) { i = k; break; }
    }
    const cur = shots[i];
    const prev = shots[Math.max(0, i - 1)];
    const HALF = 0.12;                       // 过渡带宽（占全片比例的一半）
    const boundary = starts[i];
    // 边界前 HALF 到边界后 HALF 之间，从 prev.yaw 平滑过渡到 cur.yaw
    let yaw = cur.yaw;
    if (i > 0 && p < boundary + HALF) {
      const t = Math.max(0, Math.min(1, (p - (boundary - HALF)) / (2 * HALF)));
      const k = t * t * (3 - 2 * t);
      yaw = prev.yaw + (cur.yaw - prev.yaw) * k;
    }
    return { name: cur.name, yaw };
  }
}
