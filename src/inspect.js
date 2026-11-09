// 内部通道 · Internal Channel
// 无怪物体检模式：没有奶蛙、不扣意识值、可以穿墙飞行，
// 目的是一个人安静地把场景里悬空 / 穿模 / 位置异常的物件找出来。
import * as THREE from 'three';
import { GRID, ROOMS, ZONE_NAMES } from './config.js';

const C = GRID.cell;
const WH = GRID.wallH;
const SEV_ORDER = { error: 0, warn: 1, info: 2 };
const SEV_LABEL = { error: '问题', warn: '可疑', info: '参考' };
const TYPE_LABEL = {
  float: '悬空', wall: '穿墙', sunk: '下沉', ceiling: '顶穿',
  overlap: '互相穿模', outside: '出界', hanging: '吊挂',
};
const TYPE_COLOR = { float: 0xff5a5a, wall: 0xff8a3d, sunk: 0xff3d7f, ceiling: 0xff3d7f, overlap: 0x4ec3ff, outside: 0xc07bff, hanging: 0x8a8a8a };

const fmt = (v, n = 2) => (Number.isFinite(v) ? v.toFixed(n) : '—');
const cellOf = (x, z) => [Math.floor(x / C), Math.floor(z / C)];

export class InternalChannel {
  constructor(game) {
    this.game = game;
    this.world = game.world;
    this.player = game.player;
    this.active = false;
    this.scanning = false;
    this.issues = [];
    this.showInfo = false;
    this.showMarkers = true;
    this.bright = true;
    this.panelOpen = true;
    this.flySpeed = 6.5;
    this.markerGroup = new THREE.Group();
    this.markerGroup.name = 'channel:markers';
    this.markerGroup.visible = false;
    this.gridGroup = null;
    this.wallMats = [];
    this.wallsTransparent = false;
    this.saved = null;
    this.panelTimer = 0;
    this.hover = null;
    this.panel = document.getElementById('inspect');
    this.list = document.getElementById('inspect-list');
    this.stats = document.getElementById('inspect-stats');
    this.foot = document.getElementById('inspect-foot');
    this.hint = document.getElementById('inspect-hint');
    this._bindPanel();
  }

  // ---------------- 进出 ----------------
  enter() {
    if (this.active) return;
    const g = this.game;
    this.active = true;

    // 怪物：全部下线，这一模式里不存在
    for (const f of g.frogs?.frogs || []) { f.group.visible = false; f.state = 'idle'; }
    g.frogs.active = false;
    g.audio?.setHeartbeat(0);
    for (let i = 0; i < (g.frogs?.frogs.length || 0); i++) g.audio?.setFrogVoice(i, { gain: 0 });
    g.audio?.stopHallucination?.();
    for (const el of document.querySelectorAll('#hallucination')) el.classList.add('hidden');
    document.getElementById('jumpscare')?.classList.add('hidden');

    // 场景：奶片照常摆着，方便看位置；龙奶是随机的，先藏起来
    for (const c of this.world.candies) { c.collected = false; c.group.visible = true; c.group.position.y = c.baseY; }
    for (const m of this.world.dragonMilk) m.group.visible = false;

    // 玩家：飞行、免碰撞、无体力
    this.player.fly = true;
    this.player.frozen = false;
    this.player.firstPerson = true;
    this.player.model.visible = false;
    this.player.position.set(1.5 * C, 1.75, 1.5 * C);
    this.player.yaw = -Math.PI * 0.75;
    this.player.pitch = -0.06;
    this.player.stamina = 100;
    this.player.jumpY = 0;
    this.player.vy = 0;

    // 灯光与雾：体检模式要看得清
    this.saved = {
      exposure: g.renderer.toneMappingExposure,
      fogDensity: g.scene.fog?.density ?? 0,
      hemi: this.world.hemi?.intensity ?? 0.72,
      amb: this.world.amb?.intensity ?? 0.85,
      flash: this.player.flashOn,
      flashVisible: this.player.flashlight.visible,
    };
    this.applyLighting();

    // 覆盖层
    g.scene.add(this.markerGroup);
    this.buildGrid();
    this.gridGroup.visible = false;
    g.ui.el.menu.classList.add('hidden');
    g.ui.hideLoading();
    g.ui.hideHud();
    g.ui.hidePause();
    g.ui.hideResults();
    g.ui.hideHelp();
    this.panelOpen = true;
    this.panel?.classList.remove('hidden');
    this.hint?.classList.remove('hidden');

    g.state = 'internal';
    g.mode = 'internal';
    g.lastFrame = performance.now();
    g.audio?.stopMusic(0.3);
    g.audio?.stopVoice();
    g.audio?.resume?.();

    // 首次扫描放到下一拍，先让画面出来
    this.scan();
    this.render();
  }

  exit() {
    if (!this.active) return;
    const g = this.game;
    this.active = false;
    this.player.fly = false;
    this.player.position.y = 0;
    this.player.jumpY = 0;
    this.player.frozen = false;
    this.player.lookEnabled = false;
    if (document.pointerLockElement) document.exitPointerLock();
    for (const f of g.frogs?.frogs || []) f.group.visible = true;

    if (this.saved) {
      g.renderer.toneMappingExposure = this.saved.exposure;
      if (g.scene.fog) g.scene.fog.density = this.saved.fogDensity;
      if (this.world.hemi) this.world.hemi.intensity = this.saved.hemi;
      if (this.world.amb) this.world.amb.intensity = this.saved.amb;
      this.player.flashOn = this.saved.flash;
      this.player.flashlight.visible = this.saved.flashVisible;
    }
    this.setWallsTransparent(false);
    this.clearMarkers();
    if (this.gridGroup) this.gridGroup.visible = false;
    if (this.markerGroup.parent) this.markerGroup.parent.remove(this.markerGroup);
    this.panel?.classList.add('hidden');
    this.hint?.classList.add('hidden');
    this.issues = [];
    this.hover = null;
    this.list && (this.list.innerHTML = '');
  }

  applyLighting() {
    const g = this.game;
    const on = this.bright;
    g.renderer.toneMappingExposure = on ? 1.18 : 1.04;
    if (g.scene.fog) g.scene.fog.density = on ? 0.0035 : 0.026;
    if (this.world.hemi) this.world.hemi.intensity = on ? 1.35 : 0.72;
    if (this.world.amb) this.world.amb.intensity = on ? 1.5 : 0.85;
    this.player.flashOn = !on;
    this.player.flashlight.visible = !on;
  }

  // ---------------- 每帧 ----------------
  update(dt, t) {
    this.player.update(dt, t);
    this.markerGroup.visible = this.showMarkers && this.active;
    if (this.gridGroup) this.gridGroup.visible = this.showGrid === true;
    this.panelTimer += dt;
    if (this.panelTimer >= 0.15) {
      this.panelTimer = 0;
      this.updateHover();
      this.render();
    }
  }

  // ---------------- 输入 ----------------
  onKey(e) {
    const k = e.key.toLowerCase();
    if (k === 'escape') {
      if (document.pointerLockElement) return; // 浏览器先解指针锁
      this.game.leaveInternal();
      return true;
    }
    if (k === 'r') { this.scan(); return true; }
    if (k === 'b') { this.showMarkers = !this.showMarkers; this.render(); return true; }
    if (k === 'l') { this.bright = !this.bright; this.applyLighting(); return true; }
    if (k === 'g') { this.showGrid = !this.showGrid; return true; }
    if (k === 'n') { this.setWallsTransparent(!this.wallsTransparent); return true; }
    if (k === 'h') { this.panelOpen = !this.panelOpen; this.panel?.classList.toggle('hidden', !this.panelOpen); return true; }
    if (k === 'i') { this.showInfo = !this.showInfo; this.render(); return true; }
    if (/^[1-6]$/.test(k)) { this.jumpToRoom(Number(k) - 1); return true; }
    if (k === '[' || k === ']') {
      this.flySpeed = Math.max(1, Math.min(30, this.flySpeed + (k === ']' ? 1.5 : -1.5)));
      this.player.flySpeed = this.flySpeed;
      this.render();
      return true;
    }
    return false;
  }

  _bindPanel() {
    if (!this.panel) return;
    this.panel.addEventListener('click', (e) => {
      const row = e.target.closest?.('[data-issue]');
      if (row) { this.focus(Number(row.dataset.issue)); return; }
      const btn = e.target.closest?.('[data-act]');
      if (btn) {
        const a = btn.dataset.act;
        if (a === 'exit') this.game.leaveInternal();
        if (a === 'scan') this.scan();
        if (a === 'info') { this.showInfo = !this.showInfo; this.render(); }
        if (a === 'walls') this.setWallsTransparent(!this.wallsTransparent);
      }
    });
    window.addEventListener('wheel', (e) => {
      if (!this.active) return;
      this.flySpeed = Math.max(1, Math.min(30, this.flySpeed - Math.sign(e.deltaY) * 0.8));
      this.player.flySpeed = this.flySpeed;
      this.render();
    }, { passive: true });
  }

  // ---------------- 扫描：找出悬空 / 穿墙 / 下沉 / 穿模 ----------------
  scan() {
    if (this.scanning) return;
    this.scanning = true;
    const t0 = performance.now();
    try {
      const ctx = this.buildContext();
      const clusters = this.cluster(ctx);
      const issues = [];
      for (const cl of clusters) {
        this.testCluster(cl, ctx, issues);
      }
      this.testOverlap(clusters, ctx, issues);
      issues.sort((a, b) => (SEV_ORDER[a.severity] - SEV_ORDER[b.severity]) || (b.value - a.value));
      this.issues = issues;
      this.scanInfo = {
        ms: Math.round(performance.now() - t0),
        props: ctx.props.length,
        clusters: clusters.length,
        errors: issues.filter((i) => i.severity === 'error').length,
        warns: issues.filter((i) => i.severity === 'warn').length,
        infos: issues.filter((i) => i.severity === 'info').length,
        walls: ctx.wallBoxes.length,
      };
      this.buildMarkers();
    } catch (err) {
      console.error('[channel] 扫描失败', err);
      this.scanInfo = { error: String(err && err.message || err) };
    } finally {
      this.scanning = false;
      this.render();
    }
  }

  buildContext() {
    const w = this.world;
    const skip = new Set();
    for (const c of w.candies) skip.add(c.group);
    for (const m of w.dragonMilk) skip.add(m.group);
    for (const f of this.game.frogs?.frogs || []) skip.add(f.group);
    if (w.exitGroup) skip.add(w.exitGroup);
    if (w.dust) skip.add(w.dust);

    const statics = [];   // 地面/墙/顶/门框/地毯/光斑：只当支撑面
    const props = [];     // 要审的物件
    for (const child of w.group.children) {
      if (!child || skip.has(child) || !child.visible) continue;
      if (child.isLight || child.isPoints || child.isSprite) continue;
      if (child.userData?.channelIgnore) { statics.push(child); continue; }  // 门框一类：本来就嵌在墙里
      if (child.isInstancedMesh) { statics.push(child); continue; }
      if (child.isMesh) {
        const additive = child.material && child.material.blending === THREE.AdditiveBlending;
        if (additive || child.geometry?.type === 'CircleGeometry' || child.geometry?.type === 'TorusGeometry') {
          statics.push(child); continue;
        }
        props.push(child);
        continue;
      }
      if (child.isGroup) props.push(child);
    }

    // 墙格（有墙体的格子，和 World.buildSurfaces 一致）
    const wallBoxes = [];
    const { grid, W, H } = w;
    for (let z = 0; z < H; z++) {
      for (let x = 0; x < W; x++) {
        if (grid[z][x]) continue;
        let touches = false;
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          if (w.isWalkable(x + dx, z + dz)) { touches = true; break; }
        }
        if (!touches) continue;
        wallBoxes.push({
          cx: x, cz: z,
          box: new THREE.Box3(new THREE.Vector3(x * C, 0, z * C), new THREE.Vector3((x + 1) * C, WH, (z + 1) * C)),
        });
      }
    }

    // 支撑面索引：按格子分桶，避免每条射线都遍历全场
    const supportTargets = [];
    for (const root of statics.concat(props)) {
      root.traverse((o) => { if (o.isMesh && o.visible) supportTargets.push(o); });
    }
    const buckets = new Map();
    for (const m of supportTargets) {
      const bb = new THREE.Box3().setFromObject(m);
      if (bb.isEmpty()) continue;
      const x0 = Math.floor(bb.min.x / C), x1 = Math.floor(bb.max.x / C);
      const z0 = Math.floor(bb.min.z / C), z1 = Math.floor(bb.max.z / C);
      for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
        const key = x + ',' + z;
        if (!buckets.has(key)) buckets.set(key, []);
        buckets.get(key).push(m);
      }
    }
    return { props, statics, wallBoxes, buckets, supportTargets };
  }

  cluster(ctx) {
    const items = ctx.props.map((root) => {
      const box = new THREE.Box3().setFromObject(root);
      const members = new Set();
      root.traverse((o) => { if (o.isMesh) members.add(o); });
      members.add(root);
      return { root, box, members, children: [] };
    });
    const parent = items.map((_, i) => i);
    const find = (i) => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
    const union = (a, b) => { a = find(a); b = find(b); if (a !== b) parent[b] = a; };
    const pad = 0.035;   // 合并容差：小于 3.5 cm 的缝算同一件家具，避免把桌子拆成 5 个零件分别报
    for (let i = 0; i < items.length; i++) {
      const a = items[i].box;
      if (a.isEmpty()) continue;
      for (let j = i + 1; j < items.length; j++) {
        const b = items[j].box;
        if (b.isEmpty()) continue;
        // 先做廉价的距离剔除
        if (a.min.x - pad > b.max.x || b.min.x - pad > a.max.x) continue;
        if (a.min.z - pad > b.max.z || b.min.z - pad > a.max.z) continue;
        if (a.min.y - pad > b.max.y || b.min.y - pad > a.max.y) continue;
        if (a.intersectsBox(b.clone().expandByScalar(pad))) union(i, j);
      }
    }
    const map = new Map();
    items.forEach((it, i) => {
      const r = find(i);
      if (!map.has(r)) map.set(r, { box: new THREE.Box3(), members: new Set(), roots: [], boxes: [] });
      const cl = map.get(r);
      cl.box.union(it.box);
      cl.roots.push(it.root);
      cl.boxes.push(it.box);
      it.members.forEach((m) => cl.members.add(m));
    });
    return [...map.values()].map((cl) => {
      const size = cl.box.getSize(new THREE.Vector3());
      const center = cl.box.getCenter(new THREE.Vector3());
      const [cx, cz] = cellOf(center.x, center.z);
      const rooted = cl.roots[0];
      const geo = rooted?.isMesh ? rooted.geometry?.type : 'Group';
      const dims = fmt(size.x, 2) + ' x ' + fmt(size.y, 2) + ' x ' + fmt(size.z, 2);
      const flatDecor = cl.roots.every((r) => r.isMesh && ['PlaneGeometry', 'CircleGeometry', 'TorusGeometry'].includes(r.geometry?.type));
      const floatOk = cl.roots.some((r) => r.userData?.channelFloatOk);
      return {
        ...cl, size, center, cx, cz, geo, flatDecor, floatOk,
        room: this.roomName(cx, cz),
        label: geo + ' ' + dims,
      };
    });
  }

  roomName(cx, cz) {
    for (const r of ROOMS) {
      if (cx >= r.x && cx < r.x + r.w && cz >= r.z && cz < r.z + r.h) return r.name;
    }
    return '走廊';
  }

  // 支撑判定：
  // 1) 从物件内部往下打，量底面到最近支撑面的缝隙（贴地/贴桌面）
  // 2) 六面朝外各打一根短探针，判断是不是挂在墙上/吊在别的东西上
  supportGap(cl, ctx) {
    const b = cl.box;
    const ray = new THREE.Raycaster();
    const out = { gap: Infinity, supportY: null, attach: Infinity };

    // 1) 向下
    const fracs = [0.03, 0.5, 0.97];
    const origin = new THREE.Vector3();
    const down = new THREE.Vector3(0, -1, 0);
    const startY = b.min.y + Math.min(0.03, Math.max(0.005, (b.max.y - b.min.y) * 0.02));
    for (const fx of fracs) {
      for (const fz of fracs) {
        origin.set(b.min.x + (b.max.x - b.min.x) * fx, startY, b.min.z + (b.max.z - b.min.z) * fz);
        const [cx, cz] = cellOf(origin.x, origin.z);
        const bucket = ctx.buckets.get(cx + ',' + cz);
        if (!bucket || !bucket.length) continue;
        ray.set(origin, down);
        ray.far = 60;
        const hits = ray.intersectObjects(bucket, false);
        for (const hit of hits) {
          if (cl.members.has(hit.object)) continue;
          if (hit.point.y > startY + 0.001) continue;
          const gap = b.min.y - hit.point.y;
          if (gap < out.gap) { out.gap = gap; out.supportY = hit.point.y; }
          break;
        }
      }
    }

    // 2) 六面贴附探针（0.13 m 以内算“挂在东西上”）
    const c = cl.center;
    const sz = b.getSize(new THREE.Vector3());
    const probes = [
      [new THREE.Vector3(c.x, c.y, b.max.z + 0.01), new THREE.Vector3(0, 0, 1)],
      [new THREE.Vector3(c.x, c.y, b.min.z - 0.01), new THREE.Vector3(0, 0, -1)],
      [new THREE.Vector3(b.max.x + 0.01, c.y, c.z), new THREE.Vector3(1, 0, 0)],
      [new THREE.Vector3(b.min.x - 0.01, c.y, c.z), new THREE.Vector3(-1, 0, 0)],
      [new THREE.Vector3(c.x, b.max.y + 0.01, c.z), new THREE.Vector3(0, 1, 0)],
    ];
    // 侧面再补两个高度，避免窄条物件漏判
    if (sz.y > 0.4) {
      for (const dy of [-0.28, 0.28]) {
        probes.push([new THREE.Vector3(b.max.x + 0.01, c.y + sz.y * dy, c.z), new THREE.Vector3(1, 0, 0)]);
        probes.push([new THREE.Vector3(b.min.x - 0.01, c.y + sz.y * dy, c.z), new THREE.Vector3(-1, 0, 0)]);
        probes.push([new THREE.Vector3(c.x, c.y + sz.y * dy, b.max.z + 0.01), new THREE.Vector3(0, 0, 1)]);
        probes.push([new THREE.Vector3(c.x, c.y + sz.y * dy, b.min.z - 0.01), new THREE.Vector3(0, 0, -1)]);
      }
    }
    for (const [o, d] of probes) {
      const [cx, cz] = cellOf(o.x, o.z);
      const bucket = ctx.buckets.get(cx + ',' + cz);
      if (!bucket || !bucket.length) continue;
      ray.set(o, d);
      ray.far = 0.13;
      const hits = ray.intersectObjects(bucket, false);
      for (const hit of hits) {
        if (cl.members.has(hit.object)) continue;
        if (hit.distance < out.attach) out.attach = hit.distance;
        break;
      }
    }
    return out;
  }

  testCluster(cl, ctx, issues) {
    const b = cl.box;
    if (b.isEmpty()) return;
    const base = { room: cl.room, label: cl.label, center: cl.center.clone(), box: b.clone(), cx: cl.cx, cz: cl.cz };
    const prop = (o) => issues.push(o);

    // 1) 下沉 / 顶穿
    if (b.min.y < -0.03) {
      prop({ ...base, type: 'sunk', severity: 'error', value: -b.min.y, detail: '底面向下陷进地面 ' + fmt(-b.min.y) + ' m' });
    }
    if (b.max.y > WH + 0.02) {
      prop({ ...base, type: 'ceiling', severity: 'error', value: b.max.y - WH, detail: '顶部超过天花板 ' + fmt(b.max.y - WH) + ' m' });
    }

    // 2) 穿墙：水平范围侵入了有墙的格子
    const x0 = Math.floor(b.min.x / C), x1 = Math.floor((b.max.x - 1e-4) / C);
    const z0 = Math.floor(b.min.z / C), z1 = Math.floor((b.max.z - 1e-4) / C);
    let worst = null;
    for (let z = z0; z <= z1; z++) {
      for (let x = x0; x <= x1; x++) {
        if (this.world.isWalkable(x, z)) continue;
        const wx0 = x * C, wx1 = (x + 1) * C, wz0 = z * C, wz1 = (z + 1) * C;
        const ox = Math.min(b.max.x, wx1) - Math.max(b.min.x, wx0);
        const oz = Math.min(b.max.z, wz1) - Math.max(b.min.z, wz0);
        if (ox <= 0 || oz <= 0) continue;
        const depth = Math.min(ox, oz);
        const area = ox * oz;
        if (area < 0.01) continue;
        if (!worst || depth > worst.depth) worst = { cx: x, cz: z, depth, area };
      }
    }
    if (worst) {
      const isErr = worst.depth > 0.08;
      prop({
        ...base, type: 'wall', severity: isErr ? 'error' : 'warn', value: worst.depth,
        detail: '侵入墙格 (' + worst.cx + ',' + worst.cz + ') ' + fmt(worst.depth) + ' m（面积 ' + fmt(worst.area) + ' m2）',
      });
    }

    // 3) 悬空：底部离最近支撑的缝；挂在墙上 / 吊在别处的物件不算
    if (!cl.flatDecor && !cl.floatOk) {
      const { gap, supportY, attach } = this.supportGap(cl, ctx);
      // 贴墙判定：包围盒任一侧紧挨着不可行走的格子（窗帘、挂件这类）
      const eps = 0.02;
      const wallTouch = !this.world.isWalkable(...cellOf(b.min.x - eps, cl.center.z))
        || !this.world.isWalkable(...cellOf(b.max.x + eps, cl.center.z))
        || !this.world.isWalkable(...cellOf(cl.center.x, b.min.z - eps))
        || !this.world.isWalkable(...cellOf(cl.center.x, b.max.z + eps));
      const attached = attach <= 0.13 || wallTouch;
      if (Number.isFinite(gap) && gap > 0.05 && !attached) {
        const hanging = b.min.y > 2.35 && gap > 0.5;
        if (hanging) {
          prop({ ...base, type: 'hanging', severity: 'info', value: gap, detail: '高位吊挂，下方空 ' + fmt(gap) + ' m（灯具/彩旗一类，一般正常）' });
        } else {
          prop({
            ...base, type: 'float', severity: gap > 0.12 ? 'error' : 'warn', value: gap,
            detail: '底面 y=' + fmt(b.min.y) + '，最近支撑 y=' + fmt(supportY) + '，缺口 ' + fmt(gap) + ' m',
          });
        }
      } else if (!Number.isFinite(gap) && !attached && b.min.y > 0.05 && b.min.y < 2.35) {
        prop({
          ...base, type: 'float', severity: 'error', value: b.min.y,
          detail: '正下方没有任何支撑物，悬空 ' + fmt(b.min.y) + ' m',
        });
      }
    }

    // 4) 出界（房间外又没有墙可以挂）
    const outside = b.min.x < -0.05 || b.min.z < -0.05 || b.max.x > this.world.W * C + 0.05 || b.max.z > this.world.H * C + 0.05;
    if (outside) {
      prop({ ...base, type: 'outside', severity: 'error', value: 1, detail: '物件跑到地图边界之外' });
    }
  }

  testOverlap(clusters, ctx, issues) {
    const list = clusters.filter((c) => c.size.y > 0.06); // 忽略地毯/光斑这种纯平面
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i], b = list[j];
        if (!a.box.intersectsBox(b.box)) continue;
        const inter = a.box.clone().intersect(b.box);
        if (inter.isEmpty()) continue;
        const s = inter.getSize(new THREE.Vector3());
        const vol = s.x * s.y * s.z;
        if (vol < 0.004) continue;
        const va = a.size.x * a.size.y * a.size.z;
        const vb = b.size.x * b.size.y * b.size.z;
        const ratio = vol / Math.max(1e-6, Math.min(va, vb));
        if (ratio < 0.12) continue;
        // 小件几乎完全被大件包住 → 多半是收纳/容纳（球池里的球、柜台里的桌腿），不是穿模
        if (ratio >= 0.95 && vol < 0.06) continue;
        issues.push({
          type: 'overlap', severity: ratio > 0.3 ? 'error' : 'warn', value: ratio,
          room: a.room, label: a.label + ' 与 ' + b.label,
          center: inter.getCenter(new THREE.Vector3()), box: inter.clone(),
          cx: a.cx, cz: a.cz,
          detail: '重叠体积 ' + fmt(vol, 3) + ' m3，占小件 ' + Math.round(ratio * 100) + '%',
        });
      }
    }
  }

  // ---------------- 可视化 ----------------
  buildMarkers() {
    this.clearMarkers();
    if (!this.showMarkers) return;
    for (const it of this.issues) {
      if (it.severity === 'info') continue;
      const color = TYPE_COLOR[it.type] || 0xffffff;
      const helper = new THREE.Box3Helper(it.box.clone().expandByScalar(0.012), new THREE.Color(color));
      helper.material.depthTest = false;
      helper.material.transparent = true;
      helper.material.opacity = it.severity === 'error' ? 0.95 : 0.5;
      helper.renderOrder = 999;
      this.markerGroup.add(helper);
    }
    this.markerGroup.visible = this.showMarkers;
  }

  clearMarkers() {
    for (const c of [...this.markerGroup.children]) {
      this.markerGroup.remove(c);
      c.geometry?.dispose?.();
      c.material?.dispose?.();
    }
  }

  buildGrid() {
    if (this.gridGroup) { if (!this.gridGroup.parent) this.game.scene.add(this.gridGroup); return; }
    const g = new THREE.Group();
    g.name = 'channel:grid';
    const pts = [];
    const W = this.world.W * C, H = this.world.H * C;
    for (let x = 0; x <= this.world.W; x++) { pts.push(x * C, 0.015, 0, x * C, 0.015, H); }
    for (let z = 0; z <= this.world.H; z++) { pts.push(0, 0.015, z * C, W, 0.015, z * C); }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    const mat = new THREE.LineBasicMaterial({ color: 0x4ec3ff, transparent: true, opacity: 0.35, depthWrite: false });
    const lines = new THREE.LineSegments(geo, mat);
    lines.frustumCulled = false;
    g.add(lines);
    g.visible = false;
    this.game.scene.add(g);
    this.gridGroup = g;
    this.showGrid = false;
  }

  setWallsTransparent(on) {
    this.wallsTransparent = on;
    if (!this.wallMats.length) {
      this.world.group.traverse((o) => {
        if (o.isInstancedMesh && o.geometry?.type === 'BoxGeometry' && Math.abs(o.geometry.parameters.height - WH) < 1e-3) {
          this.wallMats.push(o.material);
        }
      });
    }
    for (const m of this.wallMats) {
      m.transparent = on;
      m.opacity = on ? 0.16 : 1;
      m.depthWrite = !on;
      m.needsUpdate = true;
    }
    // 墙一透明，房间内就看得见了；吊顶也一起让开
    this.render();
  }

  // ---------------- 选中与跳转 ----------------
  updateHover() {
    const g = this.game;
    const ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2(0, 0), g.camera);
    const targets = [];
    for (const root of this.world.group.children) {
      if (!root.visible) continue;
      if (root.isLight || root.isPoints || root.isSprite) continue;
      if (root.userData.channelSkip) continue;
      targets.push(root);
    }
    const hits = ray.intersectObjects(targets, true);
    const hit = hits.find((h) => h.object && h.object.visible);
    if (!hit) { this.hover = null; return; }
    let node = hit.object;
    while (node.parent && node.parent !== this.world.group) node = node.parent;
    const box = new THREE.Box3().setFromObject(node);
    const center = box.getCenter(new THREE.Vector3());
    const [cx, cz] = cellOf(center.x, center.z);
    this.hover = {
      dist: hit.distance,
      label: (node.isMesh ? node.geometry?.type : 'Group') + ' ' +
        fmt(box.getSize(new THREE.Vector3()).x) + ' x ' + fmt(box.getSize(new THREE.Vector3()).y) + ' x ' + fmt(box.getSize(new THREE.Vector3()).z),
      room: this.roomName(cx, cz),
      center, cell: [cx, cz], minY: box.min.y, maxY: box.max.y,
    };
  }

  focus(index) {
    const it = this.issues[index];
    if (!it) return;
    const c = it.center;
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    let placed = null;
    for (const [dx, dz] of dirs) {
      const px = c.x + dx * 3.4, pz = c.z + dz * 3.4;
      if (this.world.pointBlocked(px, pz, 0.2)) continue;
      placed = [px, pz];
      break;
    }
    if (!placed) placed = [c.x + 3.4, c.z + 3.4];
    const py = Math.min(2.3, Math.max(1.2, c.y + 0.4));
    this.player.position.set(placed[0], py, placed[1]);
    const dx = c.x - placed[0], dy = c.y - py, dz = c.z - placed[1];
    this.player.yaw = Math.atan2(-dx, -dz);
    this.player.pitch = Math.atan2(dy, Math.hypot(dx, dz));
    this.player.velocity.set(0, 0, 0);
  }

  jumpToRoom(i) {
    const r = ROOMS[i];
    if (!r) return;
    const x = (r.x + r.w / 2) * C, z = (r.z + r.h / 2) * C;
    this.player.position.set(x, 2.0, z);
    this.player.yaw = 0.6;
    this.player.pitch = -0.35;
  }

  // ---------------- 面板 ----------------
  render() {
    if (!this.active || !this.panel) return;
    const p = this.player.position;
    const [cx, cz] = cellOf(p.x, p.z);
    const cam = this.game.camera;
    const yawDeg = ((this.player.yaw * 180 / Math.PI) % 360 + 360) % 360;
    const info = this.scanInfo || {};
    if (this.stats) {
      this.stats.textContent =
        '位置 ' + fmt(p.x) + ', ' + fmt(p.y) + ', ' + fmt(p.z) + '  格 (' + cx + ',' + cz + ')  ' + this.roomName(cx, cz) + '\n' +
        '朝向 ' + fmt(yawDeg, 0) + '°  俯仰 ' + fmt(this.player.pitch * 180 / Math.PI, 0) + '°  速度 ' + fmt(this.flySpeed, 1) + ' m/s\n' +
        '物件 ' + (info.props ?? '—') + ' 组 ' + (info.clusters ?? '—') + ' ｜ 问题 ' + (info.errors ?? '—') +
        ' · 可疑 ' + (info.warns ?? '—') + ' · 参考 ' + (info.infos ?? '—') + (info.ms != null ? '  (' + info.ms + 'ms)' : '') +
        (info.error ? '  ' + info.error : '');
    }
    if (this.list) {
      const shown = this.issues.filter((it) => it.severity !== 'info' || this.showInfo);
      const rows = shown.slice(0, 80).map((it, i) => {
        const cls = 'issue ' + it.severity + ' t-' + it.type;
        const head = '[' + SEV_LABEL[it.severity] + '] ' + (TYPE_LABEL[it.type] || it.type) + ' · ' + it.room + ' · ' + it.label;
        return '<li class="' + cls + '" data-issue="' + this.issues.indexOf(it) + '" title="点击飞过去看">' +
          '<b>' + escapeHtml(head) + '</b>' +
          '<span>' + escapeHtml(it.detail) + '</span>' +
          '<em>(' + fmt(it.center.x) + ', ' + fmt(it.center.y) + ', ' + fmt(it.center.z) + ')</em></li>';
      }).join('');
      this.list.innerHTML = rows || '<li class="issue empty">没有扫到问题。按 R 重新扫描。</li>';
    }
    if (this.foot) {
      const h = this.hover;
      this.foot.textContent = h
        ? '准星: ' + h.room + ' · ' + h.label + '\n  底 y=' + fmt(h.minY) + ' 顶 y=' + fmt(h.maxY) + ' 距离 ' + fmt(h.dist) + ' m'
        : '准星没指着物件';
    }
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
