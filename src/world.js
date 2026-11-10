// 奶蛙乐园 — 世界构建：迷宫、装修、灯光、奶片、出口
import * as THREE from 'three';
import {
  GRID, ROOMS, CORRIDORS, DOORS, CANDY_CELLS, EXIT, DRAGON_MILK, SPAWN_CELL,
  buildGrid, cellCenter, worldToCell,
} from './config.js';

const C = GRID.cell;
const WH = GRID.wallH;
const DIRS4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const DIRS8 = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

function std(color, opts = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.88, metalness: 0, ...opts });
}

const MAT = {
  wood: std(0x8a5a33, { roughness: 0.82 }),
  woodDark: std(0x5b3a22),
  woodLight: std(0xc49a63),
  desk: std(0xb98a55, { roughness: 0.8 }),
  metal: std(0x8d938c, { roughness: 0.45, metalness: 0.55 }),
  metalDark: std(0x4a504c, { roughness: 0.5, metalness: 0.4 }),
  cream: std(0xe8dcc0),
  mint: std(0xa9d6c4),
  pink: std(0xf0aebe),
  blue: std(0x8fa9bd),
  fabric: std(0x6d7f8d, { roughness: 1 }),
  mattress: std(0xd9d3c2, { roughness: 1 }),
  black: std(0x151515),
  board: std(0x1f3328, { roughness: 0.95 }),
  red: std(0x9d2a2a),
  green: std(0x2f7a4c),
  white: std(0xf2ece0),
  paper: std(0xf5ecd6, { roughness: 1 }),
  cake: std(0xf3e0c4, { roughness: 0.9 }),
  frosting: std(0xf7b6c2),
  candle: std(0xffe9a8, { emissive: 0xffc257, emissiveIntensity: 0.5 }),
  door: std(0x6c4a2b, { roughness: 0.75 }),
  doorGreen: std(0x2c5f45, { roughness: 0.5, metalness: 0.25 }),
  exitGlow: std(0x8dffbd, { emissive: 0x57ff9b, emissiveIntensity: 2.2 }),
  glassGreen: new THREE.MeshStandardMaterial({ color: 0x1e3b2b, emissive: 0x6bffa1, emissiveIntensity: 0.6, roughness: 0.3 }),
  flame: new THREE.MeshBasicMaterial({ color: 0xffd28a }),
};

export class World {
  constructor(textures) {
    this.tex = textures;
    this.group = new THREE.Group();
    const { grid, zone } = buildGrid();
    this.grid = grid;
    this.zone = zone;
    this.W = GRID.W;
    this.H = GRID.H;
    this.obstacles = [];
    this.lights = [];
    this.flickers = [];
    this.candies = [];
    this.lampMeshes = [];
    this.exitOpenT = 0;
    this.exitUnlocked = false;
    this.flow = null;
    this.dust = null;
    this.cakeFlames = [];
    this.time = 0;
    this.posters = [];   // 贴墙物件的元数据，内部通道用来查"是不是挂在门洞或空气上"

    this.buildSurfaces();
    this.buildDoorFrames();
    this.buildProps();
    this.buildLights();
    this.buildCandies();
    this.buildDragonMilk();
    this.buildExit();
    this.buildDust();
  }

  // ---------------- 基础几何 ----------------
  isWalkable(cx, cz) {
    return cx >= 0 && cz >= 0 && cx < this.W && cz < this.H && this.grid[cz][cx] === 1;
  }
  floorZone(cx, cz) {
    return (this.zone[cz] && this.zone[cz][cx]) || 'corridor';
  }
  wallZone(cx, cz) {
    const zs = [];
    for (const [dx, dz] of DIRS4) {
      if (this.isWalkable(cx + dx, cz + dz)) zs.push(this.floorZone(cx + dx, cz + dz));
    }
    return zs.find((z) => z !== 'corridor') || zs[0] || 'corridor';
  }
  cellWorld(cx, cz, y = 0) {
    return new THREE.Vector3((cx + 0.5) * C, y, (cz + 0.5) * C);
  }
  buildSurfaces() {
    const byZoneFloor = new Map();
    const byZoneCeil = new Map();
    const floorCells = [];
    for (let z = 0; z < this.H; z++) {
      for (let x = 0; x < this.W; x++) {
        if (this.grid[z][x]) {
          const zz = this.floorZone(x, z);
          floorCells.push({ x, z, zz });
          if (!byZoneFloor.has(zz)) byZoneFloor.set(zz, []);
          byZoneFloor.get(zz).push({ x, z });
          if (!byZoneCeil.has(zz)) byZoneCeil.set(zz, []);
          byZoneCeil.get(zz).push({ x, z });
        }
      }
    }
    this.floorCells = floorCells;

    const dummy = new THREE.Object3D();
    const planeGeo = new THREE.PlaneGeometry(C, C);
    byZoneFloor.forEach((cells, zz) => {
      const mat = new THREE.MeshStandardMaterial({
        map: this.tex.floor(zz), roughness: 0.95, metalness: 0,
      });
      const im = new THREE.InstancedMesh(planeGeo, mat, cells.length);
      cells.forEach((c, i) => {
        dummy.position.set((c.x + 0.5) * C, 0.002, (c.z + 0.5) * C);
        dummy.rotation.set(-Math.PI / 2, 0, 0);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        im.setMatrixAt(i, dummy.matrix);
      });
      im.instanceMatrix.needsUpdate = true;
      im.receiveShadow = false;
      this.group.add(im);
    });
    byZoneCeil.forEach((cells, zz) => {
      const mat = new THREE.MeshStandardMaterial({
        map: this.tex.ceiling(zz), roughness: 1, color: 0x8f8577,
      });
      const im = new THREE.InstancedMesh(planeGeo, mat, cells.length);
      cells.forEach((c, i) => {
        dummy.position.set((c.x + 0.5) * C, WH - 0.01, (c.z + 0.5) * C);
        dummy.rotation.set(Math.PI / 2, 0, 0);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        im.setMatrixAt(i, dummy.matrix);
      });
      im.instanceMatrix.needsUpdate = true;
      this.group.add(im);
    });

    // 墙体：按“面向的房间”分组贴墙纸
    const wallByZone = new Map();
    const wallCells = [];
    for (let z = 0; z < this.H; z++) {
      for (let x = 0; x < this.W; x++) {
        if (this.grid[z][x]) continue;
        // 出口那一格墙由 buildExit 换成真正的洞口，这里跳过，否则开门后正对一堵墙。
        if (x === EXIT.wallCell[0] && z === EXIT.wallCell[1]) continue;
        let touches = false;
        for (const [dx, dz] of DIRS4) if (this.isWalkable(x + dx, z + dz)) { touches = true; break; }
        if (!touches) continue;
        const zz = this.wallZone(x, z);
        wallCells.push({ x, z, zz });
        if (!wallByZone.has(zz)) wallByZone.set(zz, []);
        wallByZone.get(zz).push({ x, z });
      }
    }
    this.wallCells = wallCells;
    this.wallMeshes = [];   // 贴墙吸附用：海报按法线找最近的墙
    const wallGeo = new THREE.BoxGeometry(C, WH, C);
    wallByZone.forEach((cells, zz) => {
      const mat = new THREE.MeshStandardMaterial({
        map: this.tex.wallpaper(zz), roughness: 0.94, metalness: 0,
      });
      const im = new THREE.InstancedMesh(wallGeo, mat, cells.length);
      cells.forEach((c, i) => {
        dummy.position.set((c.x + 0.5) * C, WH / 2, (c.z + 0.5) * C);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        im.setMatrixAt(i, dummy.matrix);
      });
      im.instanceMatrix.needsUpdate = true;
      this.wallMeshes.push(im);
      this.group.add(im);
    });
  }

  buildDoorFrames() {
    const frameMat = MAT.door;
    for (const [cx, cz] of DOORS) {
      const openings = [];
      if (this.isWalkable(cx + 1, cz)) openings.push([1, 0]);
      if (this.isWalkable(cx - 1, cz)) openings.push([-1, 0]);
      if (this.isWalkable(cx, cz + 1)) openings.push([0, 1]);
      if (this.isWalkable(cx, cz - 1)) openings.push([0, -1]);
      for (const [dx, dz] of openings) {
        const bx = (cx + 0.5) * C + dx * (C / 2);
        const bz = (cz + 0.5) * C + dz * (C / 2);
        const alongZ = dx !== 0; // 门洞沿 Z 展开
        const postW = 0.2;
        // 门框柱与门楣都要顶到天花板：原来柱高 2.82、门楣到 3.07，
        // 天花板在 3.45，顶上会留 0.38 m 的缝，一眼就能看见。
        const postH = WH;
        const doorTop = 2.73;                 // 门洞上沿
        const lintelH = WH - doorTop;         // 门楣一直补到天花板
        const lintelY = doorTop + lintelH / 2;
        if (alongZ) {
          for (const s of [-1, 1]) {
            const p = new THREE.Mesh(new THREE.BoxGeometry(0.3, postH, postW), frameMat);
            p.position.set(bx + dx * 0.05, postH / 2, bz + s * (C / 2 - postW / 2));
            p.userData.channelIgnore = true;   // 门框本来就嵌在墙里，内部通道别报穿墙
            this.group.add(p);
          }
          const lintel = new THREE.Mesh(new THREE.BoxGeometry(0.34, lintelH, C - 0.1), frameMat);
          lintel.position.set(bx + dx * 0.05, lintelY, bz);
          lintel.userData.channelIgnore = true;
          this.group.add(lintel);
        } else {
          for (const s of [-1, 1]) {
            const p = new THREE.Mesh(new THREE.BoxGeometry(postW, postH, 0.3), frameMat);
            p.position.set(bx + s * (C / 2 - postW / 2), postH / 2, bz + dz * 0.05);
            p.userData.channelIgnore = true;
            this.group.add(p);
          }
          const lintel = new THREE.Mesh(new THREE.BoxGeometry(C - 0.1, lintelH, 0.34), frameMat);
          lintel.position.set(bx, lintelY, bz + dz * 0.05);
          lintel.userData.channelIgnore = true;
          this.group.add(lintel);
        }
      }
    }
  }

  // ---------------- 小工具 ----------------
  addBox(w, h, d, material, x, y, z, ry = 0, collide = false) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    m.position.set(x, y, z);
    m.rotation.y = ry;
    this.group.add(m);
    if (collide) {
      const cw = Math.abs(Math.cos(ry)) * w + Math.abs(Math.sin(ry)) * d;
      const cd = Math.abs(Math.sin(ry)) * w + Math.abs(Math.cos(ry)) * d;
      this.obstacles.push({ x, z, hx: cw / 2, hz: cd / 2 });
    }
    return m;
  }
  addCyl(rt, rb, h, seg, material, x, y, z, rot = [0, 0, 0]) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), material);
    m.position.set(x, y, z);
    m.rotation.set(rot[0], rot[1], rot[2]);
    this.group.add(m);
    return m;
  }
  // 沿海报背面法线找最近的墙，返回需要往墙方向推的距离。
  // 调用点给的坐标常常离墙 0.17-0.24 m（例如 6.94 * C 想写"贴墙"），
  // 推过去之后画框背面正好贴住墙面。找不到墙就原地不动。
  wallSnap(x, z, ry, back = 0.0295) {
    if (!this.wallMeshes || !this.wallMeshes.length) return 0;
    const ray = new THREE.Raycaster();
    ray.set(new THREE.Vector3(x, 1.7, z), new THREE.Vector3(-Math.sin(ry), 0, -Math.cos(ry)));
    ray.far = 0.4;
    const hits = ray.intersectObjects(this.wallMeshes, false);
    if (!hits.length) return 0;
    const shift = hits[0].distance - back;
    return Math.max(0, Math.min(0.35, shift));
  }
  addPoster(kind, x, y, z, ry, w = 1.45, h = 2.1, textures = this.tex) {
    const mat = new THREE.MeshStandardMaterial({
      map: textures.poster(kind), roughness: 1, metalness: 0,
      emissive: 0xffffff, emissiveMap: textures.poster(kind), emissiveIntensity: 0.12,
      side: THREE.DoubleSide,
    });
    let px = x, pz = z;
    const snap = this.wallSnap(x, z, ry);
    if (snap > 0) {
      // 往墙方向（-法线）推：法线 = (sin(ry), 0, cos(ry))
      px = x - Math.sin(ry) * snap;
      pz = z - Math.cos(ry) * snap;
    }
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    m.position.set(px, y, pz);
    m.rotation.y = ry;
    m.translateZ(0.045);
    this.group.add(m);
    const frame = new THREE.Mesh(new THREE.BoxGeometry(w + 0.1, h + 0.1, 0.035), MAT.woodDark);
    frame.position.set(px, y, pz);
    frame.rotation.y = ry;
    frame.translateZ(-0.012);
    this.group.add(frame);
    this.posters.push({ kind: 'poster:' + kind, x: px, z: pz, ry, w, h, y, snapped: snap });
    return m;
  }
  addSign(text, opts, x, y, z, ry, w = 1.8, h = 0.56) {
    const tex = this.tex.sign(text, opts);
    const mat = new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide, fog: true, transparent: true });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    m.position.set(x, y, z);
    m.rotation.y = ry;
    this.group.add(m);
    this.posters.push({ kind: 'sign:' + text, x, z, ry, w, h, y, snapped: 0 });
    return m;
  }
  addGlowSprite(x, y, z, size = 1.6, color = 0xffcf9a, opacity = 0.5) {
    const mat = new THREE.SpriteMaterial({
      map: this.tex.glow(), color, transparent: true, opacity,
      blending: THREE.AdditiveBlending, depthWrite: false, fog: true,
    });
    const s = new THREE.Sprite(mat);
    s.position.set(x, y, z);
    s.scale.set(size, size, 1);
    this.group.add(s);
    return s;
  }
  addLightPool(x, z, size = 5.2, color = 0xffcf9a, opacity = 0.2) {
    const mat = new THREE.MeshBasicMaterial({
      map: this.tex.glow(), color, transparent: true, opacity,
      blending: THREE.AdditiveBlending, depthWrite: false, fog: true, side: THREE.DoubleSide,
    });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), mat);
    m.position.set(x, 0.02, z);
    m.rotation.x = -Math.PI / 2;
    this.group.add(m);
    return m;
  }
  addObstacle(x, z, hx, hz) { this.obstacles.push({ x, z, hx, hz }); }

  addTable(cx, cz, w = 1.8, d = 0.9, ry = 0, height = 0.66) {
    const [x, z] = [(cx + 0.5) * C, (cz + 0.5) * C];
    this.addBox(w, 0.09, d, MAT.desk, x, height, z, ry, true);
    const legH = height - 0.045; // 台面中心在 height，底面在 height-0.045；腿顶必须正好顶到它
    const off = [[-1, -1], [1, -1], [-1, 1], [1, 1]];
    for (const [sx, sz] of off) {
      const lx = x + Math.cos(ry) * (sx * (w / 2 - 0.12)) - Math.sin(ry) * (sz * (d / 2 - 0.12));
      const lz = z + Math.sin(ry) * (sx * (w / 2 - 0.12)) + Math.cos(ry) * (sz * (d / 2 - 0.12));
      this.addBox(0.08, legH, 0.08, MAT.woodDark, lx, legH / 2, lz);
    }
    return [x, z];
  }
  addChair(cx, cz, ry = 0, color = MAT.wood) {
    const [x, z] = [(cx + 0.5) * C, (cz + 0.5) * C];
    this.addBox(0.55, 0.07, 0.55, color, x, 0.46, z, ry);
    this.addBox(0.55, 0.5, 0.07, color, x - Math.sin(ry) * -0.24, 0.72, z - Math.cos(ry) * -0.24, ry);
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      this.addBox(0.06, 0.44, 0.06, MAT.woodDark,
        x + sx * 0.22, 0.22, z + sz * 0.22);
    }
    // 椅子也要挡人：0.55x0.55 的座面按旋转后的外接盒算
    const half = 0.3;
    this.addObstacle(x, z, half, half);
  }
  addBed(cx, cz) {
    const [x, z] = [(cx + 0.5) * C, (cz + 0.5) * C];
    // 床没有床腿，床架底面必须贴地（半高 0.09）；原来整张床悬空 0.15 m，其余部件跟着下移
    this.addBox(1.5, 0.18, 2.0, MAT.wood, x, 0.09, z, 0, true);
    this.addBox(1.38, 0.16, 1.86, MAT.mattress, x, 0.25, z);
    this.addBox(0.66, 0.13, 0.36, MAT.white, x, 0.37, z - 0.72);
    this.addBox(1.38, 0.06, 0.9, MAT.blue, x, 0.34, z + 0.42);
  }
  addPlant(cx, cz, scale = 1) {
    const [x, z] = [(cx + 0.5) * C, (cz + 0.5) * C];
    this.addCyl(0.24, 0.18, 0.38, 10, MAT.red, x, 0.19, z);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.14 * scale, 0.85 * scale, 5), MAT.green);
      leaf.position.set(x + Math.cos(a) * 0.18, 0.72 + (i % 2) * 0.16, z + Math.sin(a) * 0.18);
      leaf.rotation.set(Math.cos(a) * 0.5, a, Math.sin(a) * 0.5);
      this.group.add(leaf);
    }
    this.addObstacle(x, z, 0.32, 0.32);
  }
  addBalloon(cx, cz, y = 2.35, color = 0xf2a9b8) {
    const [x, z] = [(cx + 0.5) * C, (cz + 0.5) * C];
    const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.25, metalness: 0.05 });
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.26, 14, 12), mat);
    b.position.set(x, y, z);
    b.scale.set(1, 1.18, 1);
    this.group.add(b);
    b.userData.channelFloatOk = true;   // 气球本来就是吊着的，体检模式别报悬空
    const str = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 1.1, 4), MAT.white);
    str.position.set(x, y - 0.72, z);
    str.userData.channelFloatOk = true;
    this.group.add(str);
  }
  addRug(cx, cz, w, d, color = 0x7a3535, border = 0x3a2222) {
    const [x, z] = [(cx + 0.5) * C, (cz + 0.5) * C];
    const b = new THREE.Mesh(new THREE.PlaneGeometry(w + 0.22, d + 0.22),
      new THREE.MeshStandardMaterial({ color: border, roughness: 1 }));
    b.position.set(x, 0.011, z);
    b.rotation.x = -Math.PI / 2;
    this.group.add(b);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d),
      new THREE.MeshStandardMaterial({ color, roughness: 1 }));
    m.position.set(x, 0.014, z);
    m.rotation.x = -Math.PI / 2;
    this.group.add(m);
  }
  addBallPit(cx, cz) {
    const [x, z] = [(cx + 0.5) * C, (cz + 0.5) * C];
    const pit = new THREE.Mesh(new THREE.CylinderGeometry(1.38, 1.38, 0.36, 26),
      new THREE.MeshStandardMaterial({ color: 0xe3b6a0, roughness: 0.9 }));
    pit.position.set(x, 0.18, z);
    pit.userData.channelContainer = true;   // 池子是容器，里面的球不算穿模
    this.group.add(pit);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(1.38, 0.09, 8, 30),
      new THREE.MeshStandardMaterial({ color: 0xc97b86, roughness: 0.8 }));
    rim.position.set(x, 0.38, z);
    rim.rotation.x = Math.PI / 2;
    this.group.add(rim);
    const colors = [0xf29fb0, 0xa9d6c4, 0xffd9a0, 0x8fb7dd, 0xd9a7e0];
    for (let i = 0; i < 22; i++) {
      const a = Math.random() * Math.PI * 2;
      const rr = Math.sqrt(Math.random()) * 1.1;
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6),
        new THREE.MeshStandardMaterial({ color: colors[i % colors.length], roughness: 0.4 }));
      b.position.set(x + Math.cos(a) * rr, 0.43 + Math.random() * 0.14, z + Math.sin(a) * rr);
      b.userData.channelFloatOk = true;   // 海洋球本来就堆在池子里，别报悬空
      this.group.add(b);
    }
    this.addObstacle(x, z, 1.3, 1.3);
  }
  addTricycle(cx, cz) {
    const [x, z] = [(cx + 0.5) * C, (cz + 0.5) * C];
    const paint = new THREE.MeshStandardMaterial({ color: 0xd85b5b, roughness: 0.5, metalness: 0.3 });
    const tire = MAT.black;
    const parts = [];
    for (const [ox, oz, r] of [[-0.55, 0, 0.24], [0.55, 0, 0.24], [0.58, 0, 0.18]]) {
      const w = new THREE.Mesh(new THREE.TorusGeometry(r, 0.055, 6, 14), tire);
      w.position.set(x + ox, r + 0.02, z + oz);
      this.group.add(w);
      parts.push(w);
    }
    parts.push(this.addBox(0.9, 0.08, 0.08, paint, x, 0.42, z, 0));
    parts.push(this.addBox(0.08, 0.5, 0.08, paint, x - 0.42, 0.66, z, 0.12));
    parts.push(this.addBox(0.28, 0.06, 0.12, MAT.black, x - 0.42, 0.94, z));
    parts.push(this.addBox(0.4, 0.07, 0.12, paint, x + 0.1, 0.34, z));
    // 三轮车是复合道具：车架由轮子支撑，单看车架会误报悬空
    for (const m of parts) m.userData.channelFloatOk = true;
    this.addObstacle(x, z, 0.75, 0.4);
  }
  addWallClock(x, y, z, ry) {
    const face = new THREE.Mesh(new THREE.CircleGeometry(0.24, 20),
      new THREE.MeshStandardMaterial({ color: 0xf0e6cf, roughness: 0.8 }));
    face.position.set(x, y, z);
    face.rotation.y = ry;
    this.group.add(face);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.25, 0.025, 6, 20), MAT.woodDark);
    ring.position.set(x, y, z);
    ring.rotation.y = ry;
    this.group.add(ring);
    const handMat = new THREE.MeshBasicMaterial({ color: 0x2a1d17 });
    const h1 = new THREE.Mesh(new THREE.PlaneGeometry(0.012, 0.15), handMat);
    h1.position.set(x, y + 0.06, z);
    h1.rotation.y = ry;
    h1.translateZ(0.01);
    this.group.add(h1);
    const h2 = new THREE.Mesh(new THREE.PlaneGeometry(0.01, 0.2), handMat);
    h2.position.set(x, y + 0.07, z);
    h2.rotation.y = ry;
    h2.rotateZ(1.1);
    h2.translateZ(0.011);
    this.group.add(h2);
  }
  addPartyHat(cx, cz, y, color) {
    const [x, z] = [(cx + 0.5) * C, (cz + 0.5) * C];
    const hat = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.34, 12),
      new THREE.MeshStandardMaterial({ color, roughness: 0.7 }));
    hat.position.set(x, y + 0.17, z);
    hat.rotation.z = 0.08;
    this.group.add(hat);
  }
  addLockers(cx, cz, ry = 0, count = 3, h = 2.0) {
    const [x, z] = [(cx + 0.5) * C, (cz + 0.5) * C];
    const w = 0.55 * count;
    const body = this.addBox(0.5, h, w, MAT.metalDark, x, h / 2, z, ry, true);
    for (let i = 0; i < count; i++) {
      const off = (i - (count - 1) / 2) * 0.55;
      const lx = x + Math.cos(ry) * 0 + Math.sin(ry) * off;
      const lz = z + Math.cos(ry) * off;
      this.addBox(0.02, 0.05, 0.18, MAT.metal, x + Math.sin(ry) * off + Math.cos(ry) * 0.26, 0.95, z + Math.cos(ry) * off - Math.sin(ry) * 0.26, ry);
      this.addBox(0.02, 0.02, 0.3, MAT.metalDark, x + Math.sin(ry) * off + Math.cos(ry) * 0.26, 1.5, z + Math.cos(ry) * off - Math.sin(ry) * 0.26, ry);
    }
    return body;
  }

  // ---------------- 家具与装修 ----------------
  buildProps() {
    this.buildEntry();
    this.buildClassroom();
    this.buildOffice();
    this.buildNap();
    this.buildCanteen();
    this.buildExitHall();
    this.buildCorridorDecor();
  }

  buildEntry() {
    // 接待台
    const [rx, rz] = this.addTable(3.3, 1.95, 2.5, 1.0, 0, 0.92);
    this.addBox(2.5, 0.9, 0.1, MAT.desk, rx, 0.5, rz - 0.45);
    this.addChair(3.3, 1.70, Math.PI); // 贴接待台前沿，原来离桌 1.1m
    // 门头招牌
    this.addSign('奶蛙乐园', { sub: 'MILK FROG PARK · EST. 1987' }, 3.5 * C, 2.72, 3.24, 0, 2.6, 0.8);
    // 长椅
    // 长椅：腿按座面算，别写成座面外的常量（原来两腿离座面 1.56 m）
    {
      const bx = 1.75 * C, bz = 4.7 * C;
      this.addBox(0.6, 0.12, 2.0, MAT.wood, bx, 0.5, bz, 0);            // 座面 0.44-0.56
      this.addBox(0.08, 0.44, 0.08, MAT.woodDark, bx, 0.22, bz - 0.86); // 腿 0-0.44
      this.addBox(0.08, 0.44, 0.08, MAT.woodDark, bx, 0.22, bz + 0.86);
    }
    this.addObstacle(1.75 * C, 4.7 * C, 0.35, 1.05);
    // 鞋柜
    this.addBox(0.9, 1.15, 0.42, MAT.woodLight, 1.65 * C, 0.58, 2.03 * C, 0, true);
    // 地图与照片
    this.addPoster('map', 6.94 * C, 1.78, 4.35 * C, -Math.PI / 2, 1.8, 1.35);
    this.addPoster('birthday', 6.93 * C, 1.7, 2.2 * C, -Math.PI / 2, 1.4, 2.0);
    // 气球
    this.addBalloon(5.8, 2.1, 2.45, 0xf2a9b8);
    this.addBalloon(6.15, 2.35, 2.2, 0xffd9a0);
    this.addBalloon(5.55, 2.45, 2.15, 0xa9d6c4);
    // 散落玩具
    this.addBox(0.28, 0.28, 0.28, MAT.pink, 2.6 * C, 0.14, 5.4 * C, 0.4);
    this.addBox(0.24, 0.24, 0.24, MAT.mint, 2.9 * C, 0.12, 5.7 * C, -0.2);
    // 地毯 / 海洋球池 / 三轮车 / 挂钟
    this.addRug(3.7, 4.5, 3.4, 2.6, 0x7c3d38);
    this.addBallPit(5.25, 5.15);
    this.addTricycle(5.15, 2.0);
    this.addWallClock(7 * C - 0.05, 2.4, 5.55 * C, -Math.PI / 2);
    // 衣帽架
    this.addCyl(0.05, 0.05, 1.8, 8, MAT.metalDark, 1.55 * C, 0.9, 6.2 * C);
    this.addBox(0.5, 0.05, 0.05, MAT.woodDark, 1.55 * C, 1.7, 6.2 * C, 0.3);
    // 灯池
    this.addLightPool(3.5 * C, 3.6 * C, 7.5, 0xffcf9a, 0.18);
  }

  buildClassroom() {
    // 黑板要贴在教室北墙上（墙格 z=0，墙面在 z=3.2）。
    // 原来写 1.04 * C = 3.328，整块黑板悬在墙外 0.13 m，看过去就是一块没着落的黑方块。
    const wallZ = 1 * C;   // 墙格(12,0) 占 z 0..3.2，室内一侧墙面在 z = 3.2
    this.addBox(4.4, 1.75, 0.08, MAT.board, 13.5 * C, 1.76, wallZ + 0.04);
    // 粉笔槽挂在黑板下沿外侧（厚 0.16，从黑板面往外伸）
    this.addBox(4.5, 0.08, 0.16, MAT.woodDark, 13.5 * C, 0.875, wallZ + 0.08 + 0.08);
    this.addBox(0.16, 0.03, 0.03, MAT.white, 44.2, 0.93, wallZ + 0.08 + 0.07); // 粉笔：躺在粉笔槽里
    this.addPoster('drawing', 11.04 * C, 1.78, 4.6 * C, Math.PI / 2, 1.65, 2.2); // 原来挂在 3.2 格，正对教室西门(10,3)
    this.addPoster('rules', 13.2 * C, 1.72, 6.94 * C, Math.PI, 1.5, 2.1); // 原来和 11.6 格的奶蛙海报重叠 0.14 m
    // 讲台
    this.addTable(15.4, 1.85, 2.0, 0.85, 0, 0.8);
    // 课桌
    this.addTable(12.3, 3.7, 1.5, 0.8, 0.05);
    this.addTable(15.0, 3.8, 1.5, 0.8, -0.04);
    this.addTable(13.6, 5.35, 1.5, 0.8, 0.02);
    // 椅子要贴课桌前沿：桌深 0.8（半深 0.4），座面半宽 0.275，留 0.02 余量。
    // ry = PI 表示椅背朝 -Z（坐在桌北侧），ry = 0 表示朝 +Z（坐在桌南侧）。
    for (const [cx, cz, ry] of [
      [12.3, 3.48, Math.PI], [12.3, 3.92, 0],
      [15.0, 3.58, Math.PI], [15.0, 4.02, 0],
      [13.6, 5.13, Math.PI], [13.6, 5.57, 0],
      [13.92, 5.35, Math.PI / 2],
    ]) {
      this.addChair(cx, cz, ry);
    }
    // 玩具柜与书架
    this.addBox(0.5, 1.7, 2.2, MAT.woodLight, 16.64 * C, 0.85, 4.4 * C, 0, true);
    this.addBox(0.5, 2.2, 1.5, MAT.wood, 16.64 * C, 1.1, 2.4 * C, 0, true);
    for (let i = 0; i < 3; i++) {
      this.addBox(0.34, 0.32, 0.95, new THREE.MeshStandardMaterial({ color: [0xd9a7e0, 0x8fb7dd, 0xf29fb0][i], roughness: 0.9 }),
        16.55 * C, 0.55 + i * 0.55, 2.4 * C, 0);
    }
    // 地球仪放在讲台上（台面顶 0.845）；原来用 15.4 * C 是格线，离桌心 2.26 m 且悬空
    {
      const gx = (15.4 + 0.5) * C, gz = (1.85 + 0.5) * C;
      this.addCyl(0.1, 0.14, 0.08, 10, MAT.woodDark, gx, 0.885, gz);
      const globe = new THREE.Mesh(new THREE.SphereGeometry(0.18, 14, 10),
        new THREE.MeshStandardMaterial({ color: 0x6f93b8, roughness: 0.5 }));
      globe.position.set(gx, 1.1, gz);
      this.group.add(globe);
    }
    // 彩旗
    for (let i = 0; i < 12; i++) {
      const t = i / 11;
      const flag = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.18, 3),
        new THREE.MeshStandardMaterial({ color: [0xf29fb0, 0xffd9a0, 0xa9d6c4, 0x8fb7dd][i % 4], roughness: 0.9 }));
      flag.position.set((11.8 + t * 3.8) * C, 3.05 - Math.sin(t * Math.PI) * 0.18, 2.4 * C);
      flag.rotation.z = Math.PI;
      this.group.add(flag);
    }
    // 吊饰
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const star = new THREE.Mesh(new THREE.OctahedronGeometry(0.11), MAT.candle);
      star.position.set(13.5 * C + Math.cos(a) * 0.8, 2.9 + Math.sin(a * 2) * 0.1, 3.6 * C + Math.sin(a) * 0.8);
      this.group.add(star);
    }
    this.addLightPool(13.5 * C, 3.8 * C, 8.5, 0xffd9a0, 0.16);
    // 地上蜡笔画
    for (const [cx, cz, r] of [[12.1, 6.1, 0.3], [14.7, 6.0, -0.5], [15.8, 5.2, 0.9]]) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.45),
        new THREE.MeshStandardMaterial({ map: this.tex.poster('drawing'), roughness: 1, transparent: false }));
      m.position.set(cx * C, 0.012, cz * C);
      m.rotation.set(-Math.PI / 2, 0, r);
      this.group.add(m);
    }
  }

  buildOffice() {
    this.addTable(23.3, 2.1, 2.4, 1.0, 0, 0.78);
    this.addChair(23.3, 1.85, Math.PI); // 贴办公桌前沿，原来离桌 1.5m
    this.addBox(0.9, 1.75, 0.55, MAT.metalDark, 21.55 * C, 0.88, 1.9 * C, 0, true);
    this.addBox(0.72, 0.8, 0.72, MAT.metal, 24.8 * C, 0.4, 5.25 * C, 0.2, true);
    this.addPoster('missing', 21.06 * C, 1.72, 5.2 * C, Math.PI / 2, 1.3, 1.9); // 原来对着园长室西门(20,3)
    this.addBox(1.0, 0.55, 1.0, MAT.fabric, 24.6 * C, 0.28, 3.1 * C, 0, true);
    // 台灯：放在桌面上（桌高 0.78，台面顶 0.825）。原来整盏灯悬在离桌 5 m 的空中
    {
      const lampX = (23.0 + 0.5) * C, lampZ = (2.0 + 0.5) * C, deskTop = 0.78 + 0.045;
      this.addBox(0.05, 0.42, 0.05, MAT.metalDark, lampX, deskTop + 0.21, lampZ);
      this.addCyl(0.16, 0.2, 0.06, 12, MAT.metal, lampX, deskTop + 0.45, lampZ);
    }
    this.addLightPool(23.3 * C, 3.3 * C, 6, 0xffcf9a, 0.12);
  }

  buildNap() {
    for (const [cx, cz] of [[1.95, 12.7], [1.95, 14.9], [1.95, 17.1], [5.05, 12.7], [5.05, 14.9], [5.05, 17.1]]) {
      this.addBed(cx, cz);
    }
    this.addPoster('frog', 6.94 * C, 1.72, 13.4 * C, -Math.PI / 2, 1.5, 2.1);
    this.addPoster('drawing', 1.06 * C, 1.75, 16.0 * C, Math.PI / 2, 1.3, 1.8);
    // 夜灯
    const nl = this.addCyl(0.12, 0.16, 0.26, 10, MAT.cream, 1.55 * C, 0.13, 11.55 * C);
    this.addGlowSprite(1.55 * C, 0.42, 11.55 * C, 1.1, 0x9fc6ff, 0.4);
    // 摇椅
    // 摇椅（要给碰撞，否则玩家直接穿过去）
    // 摇椅：靠背贴着座面后端（沿局部 +Z 挪 0.49 = 座面半深 0.45 + 靠背半厚 0.04）
    {
      const rkx = 5.8 * C, rkz = 11.8 * C, rkry = 0.4;
      this.addBox(0.6, 0.1, 0.9, MAT.wood, rkx, 0.45, rkz, rkry, true);   // 座面 0.40-0.50
      this.addBox(0.6, 0.7, 0.08, MAT.wood,
        rkx + Math.sin(rkry) * 0.49, 0.85, rkz + Math.cos(rkry) * 0.49, rkry); // 靠背 0.50-1.20
      // 摇椅原来没有腿，整把椅子悬空 0.40 m；补四条腿顶住座面底
      const cs = Math.cos(rkry), sn = Math.sin(rkry);
      for (const [lx, lz] of [[-0.22, -0.34], [0.22, -0.34], [-0.22, 0.34], [0.22, 0.34]]) {
        this.addBox(0.06, 0.40, 0.06, MAT.woodDark,
          rkx + lx * cs + lz * sn, 0.20, rkz - lx * sn + lz * cs, rkry);
      }
    }
    // 玩具箱 / 地毯 / 窗帘 / 毛绒玩具
    this.addBox(1.0, 0.55, 0.6, MAT.pink, 3.6 * C, 0.28, 17.7 * C, 0, true);
    this.addRug(3.6, 15.4, 4.0, 3.0, 0x3e4f63, 0x25313f);
    for (const zz of [12.6, 14.8, 17.0]) {
      this.addBox(0.07, 2.15, 1.35, MAT.fabric, 3.235, 2.375, zz * C, 0); // 贴西墙(x=3.2)、顶接天花(3.45)
    }
    const plush = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), MAT.cream);
    plush.position.set((1.95 + 0.5) * C, 0.33 + 0.16, 12.9 * C); // 坐在床垫上（床垫顶 0.33），原来悬空 0.47 m 落在过道
    this.group.add(plush);
    this.addLightPool(3.5 * C, 14.8 * C, 8.5, 0x9fc6ff, 0.2);
  }

  buildCanteen() {
    const [tx, tz] = this.addTable(13.5, 14.3, 4.2, 1.5, 0, 0.94);
    // 长桌 4.2 x 1.5（半深 0.75），椅子贴桌沿；原来离桌 2.2-3.3 m，像立在房间中间。
    for (const [cx, cz, ry] of [
      [13.09, 13.97, Math.PI], [13.50, 13.97, Math.PI], [13.91, 13.97, Math.PI],
      [13.09, 14.63, 0], [13.50, 14.63, 0], [13.91, 14.63, 0],
    ]) {
      this.addChair(cx, cz, ry);
    }
    // 蛋糕
    const cake = new THREE.Group();
    cake.position.set(tx, 1.0, tz);
    this.group.add(cake);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.66, 0.3, 24), MAT.cake);
    base.position.y = 0.15; cake.add(base);
    const top = new THREE.Mesh(new THREE.CylinderGeometry(0.64, 0.64, 0.04, 24), MAT.frosting);
    top.position.y = 0.32; cake.add(top);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      const candle = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 0.26, 6), MAT.candle);
      candle.position.set(Math.cos(a) * 0.32, 0.46, Math.sin(a) * 0.32);
      cake.add(candle);
      const flame = new THREE.Sprite(new THREE.SpriteMaterial({
        map: this.tex.glow(), color: 0xffb35c, transparent: true, opacity: 0.95,
        blending: THREE.AdditiveBlending, depthWrite: false,
      }));
      flame.position.set(candle.position.x, 0.64, candle.position.z);
      flame.scale.set(0.16, 0.26, 1);
      cake.add(flame);
      this.cakeFlames.push(flame);
    }
    // 生日横幅
    // 横幅要避开北门洞(14,10)。可用墙面是 x 11-13（世界 35.2-44.8），
    // 中心放 12.5 格 = 40.0，跨度 37.4-42.6，完全落在墙上。
    this.addSign('生日快乐', { sub: 'HAPPY BIRTHDAY · 1999.06.01', bg: '#6d2530', fg: '#ffe6b8' }, 12.5 * C, 2.72, 11.06 * C, 0, 5.2, 0.86);
    // 取餐台
    this.addBox(0.95, 1.0, 4.0, MAT.metal, 16.25 * C, 0.5, 16.1 * C, 0, true);
    // 挡板贴在取餐台正面（台面宽 0.95，正面在中心 -0.475 处，板厚 0.06）
    this.addBox(0.06, 1.05, 4.0, MAT.cream, 16.25 * C - 0.475 - 0.03, 0.52, 16.1 * C);
    // 冰箱
    this.addBox(1.0, 1.9, 1.0, MAT.cream, 16.2 * C, 0.95, 12.2 * C, 0, true);
    this.addBox(0.05, 0.5, 0.1, MAT.metal, 16.2 * C - 0.5 - 0.025, 1.4, 12.2 * C); // 贴冰箱正面，原来悬在冰箱前 1.15 m
    // 气球与彩旗
    this.addBalloon(12.2, 12.1, 2.55, 0xf2a9b8);
    this.addBalloon(15.7, 17.5, 2.35, 0xa9d6c4);
    this.addBalloon(15.2, 12.3, 2.3, 0xffd9a0);
    this.addPoster('birthday', 11.06 * C, 1.75, 16.2 * C, Math.PI / 2, 1.6, 2.2);
    this.addLightPool(13.5 * C, 14.5 * C, 9, 0xffcf9a, 0.2);
    // 桌布 / 纸杯 / 派对帽
    const cloth = new THREE.Mesh(new THREE.PlaneGeometry(4.25, 1.55),
      new THREE.MeshStandardMaterial({ color: 0xf3e3cd, roughness: 0.95 }));
    cloth.position.set(tx, 0.995, tz);
    cloth.rotation.x = -Math.PI / 2;
    this.group.add(cloth);
    // 纸杯和派对帽都要摆在桌面上。原来纸杯写成 cx * C（格线，不是格心，整体偏 2.26 m），
    // 派对帽的格子也在桌外；这里改成相对桌心的偏移，并在蛋糕半径 0.66 之外。
    {
      const tableTop = 0.94 + 0.045;
      for (const [ox, oz] of [[-1.6, -0.28], [1.4, -0.24], [-1.2, 0.35], [1.15, 0.38]]) {
        this.addCyl(0.09, 0.07, 0.22, 8, MAT.pink, tx + ox, tableTop + 0.11, tz + oz);
      }
      for (let i = 0; i < 4; i++) {
        this.addPartyHat(13.05 + i * 0.34, 14.18 + (i % 2) * 0.3, tableTop,
          [0xf29fb0, 0xffd9a0, 0xa9d6c4, 0x8fb7dd][i]);
      }
    }
  }

  buildExitHall() {
    this.addLockers(21.06, 14.2, Math.PI / 2, 3, 2.0);
    // 长椅腿按座面两端算（原来两腿在座面外 2.0 m）
    {
      const bx = 23.0 * C, bz = 17.65 * C;
      this.addBox(2.4, 0.12, 0.5, MAT.wood, bx, 0.5, bz, 0, true);
      this.addBox(0.08, 0.44, 0.08, MAT.woodDark, bx - 1.05, 0.22, bz);
      this.addBox(0.08, 0.44, 0.08, MAT.woodDark, bx + 1.05, 0.22, bz);
    }
    // 灭火器
    this.addCyl(0.11, 0.11, 0.55, 10, MAT.red, 25.3 * C, 0.3, 11.6 * C);
    this.addBox(0.16, 0.1, 0.16, MAT.metalDark, 25.3 * C, 0.62, 11.6 * C);
    // 拖把桶
    this.addCyl(0.22, 0.18, 0.38, 10, MAT.metal, 21.6 * C, 0.19, 17.5 * C);
    // 小心地滑牌
    const signMat = new THREE.MeshStandardMaterial({ color: 0xd8b13a, roughness: 0.7, side: THREE.DoubleSide });
    const a = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.7, 0.04), signMat);
    a.position.set(24.4 * C, 0.36, 16.1 * C);
    a.rotation.x = -0.22;
    this.group.add(a);
    this.addBox(0.42, 0.04, 0.36, MAT.metalDark, 24.4 * C, 0.02, 16.1 * C);
    this.addLightPool(23.0 * C, 15.0 * C, 8, 0x7dffb0, 0.14);
  }

  buildCorridorDecor() {
    // 主走廊：长椅（靠北墙）、植物、饮水机、海报
    // 走廊长椅贴北墙：统一用格子写法，腿顶要接住座面底（原来外溢 0.48 m）
    {
      const bx = 7.0 * C, bz = 8.34 * C;
      this.addBox(0.55, 0.1, 1.9, MAT.wood, bx, 0.48, bz, 0);            // 座面 0.43-0.53
      this.addBox(0.06, 0.43, 0.06, MAT.woodDark, bx, 0.215, bz - 0.82);
      this.addBox(0.06, 0.43, 0.06, MAT.woodDark, bx, 0.215, bz + 0.82);
      this.addObstacle(bx, bz, 0.3, 1.0);
    }
    // 盆栽一律贴墙脚，别摆在走廊正中间挡路。
    // 主走廊 z 8-9（世界 25.6-32.0），中央走廊 x 8-9（25.6-32.0），右走廊 x 18-19（57.6-64.0）。
    this.addPlant(2.4, 9.25, 0.95);    // 主走廊南墙脚下
    this.addPlant(23.8, 9.25, 0.9);    // 主走廊南墙东段
    this.addPlant(7.75, 11.1, 0.85);   // 中央走廊西墙脚下
    this.addPlant(17.75, 6.3, 0.9);    // 右走廊西墙脚下
    // 饮水机
    this.addBox(0.5, 1.1, 0.5, MAT.cream, 10.3 * C, 0.55, 8.42 * C, 0, true);
    this.addCyl(0.19, 0.19, 0.5, 12, MAT.blue, 10.3 * C, 1.3, 8.42 * C);
    // 走廊海报
    // 这三张挂在南墙内侧，房间在 -Z 一侧，法线必须朝 -Z（ry = PI）。
    // 原来写 0，法线插进墙里，从走廊只能看到画框背面 —— 就是"墙上一块纯黑"。
    this.addPoster('rules', 5.4 * C, 1.7, 6.97 * C, Math.PI, 1.35, 1.9);
    this.addPoster('frog', 11.6 * C, 1.72, 6.96 * C, Math.PI, 1.35, 1.9);
    this.addPoster('birthday', 16.0 * C, 1.7, 6.96 * C, Math.PI, 1.3, 1.85);
    this.addPoster('drawing', 4.2 * C, 1.65, 9.96 * C, Math.PI, 1.2, 1.7);
    this.addPoster('missing', 12.3 * C, 1.7, 9.96 * C, Math.PI, 1.2, 1.75);
    this.addPoster('map', 21.4 * C, 1.7, 9.96 * C, Math.PI, 1.55, 1.2);
    // 中央走廊：储物柜、告示
    this.addLockers(7.58, 5.2, 0, 2, 1.9); // 贴中央走廊西墙（x=25.6），原来立在 6.4 m 宽走廊的正中间
    this.addPoster('rules', 8.06 * C, 1.7, 16.6 * C, Math.PI / 2, 1.3, 1.85); // 原来 15.7 格整张被门框/柜体吞掉
    this.addPoster('frog', 9.94 * C, 1.75, 5.4 * C, -Math.PI / 2, 1.3, 1.85); // 原来对着中央走廊东侧门洞(10,3)
    // 小椅子
    this.addChair(9.3, 10.6, Math.PI * 0.7);
    // 散落蜡笔/纸
    for (const [cx, cz, col] of [[4.6, 8.5, 0xd94a3a], [10.9, 9.5, 0xe2b84a], [14.2, 8.4, 0x4f8dd6], [20.2, 9.4, 0x5aa66b]]) {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.22, 6),
        new THREE.MeshStandardMaterial({ color: col, roughness: 0.8 }));
      m.position.set(cx * C, 0.03, cz * C);
      m.rotation.set(Math.PI / 2, 0, cx);
      this.group.add(m);
    }
    // 顶灯位置
    this.lampSpots = [
      [3.5, 3.6, 'entry', 17, 0],
      [13.5, 3.9, 'classroom', 14, 0],
      [23.3, 3.6, 'classroom', 10, 1],
      [3.5, 15.0, 'nap', 21, 1],
      [5.4, 17.4, 'nap', 9, 0],
      [13.5, 14.6, 'canteen', 16, 0],
      [23.0, 15.0, 'exit', 10, 0],
      [8.5, 3.0, 'corridor', 9, 0],
      [18.5, 4.5, 'corridor', 9, 1],
      [5.5, 8.5, 'corridor', 9, 0],
      [14.0, 8.5, 'corridor', 9, 1],
      [21.5, 8.5, 'corridor', 8, 0],
      [9.0, 16.5, 'corridor', 8, 1],
    ];
  }

  buildLights() {
    const hemi = new THREE.HemisphereLight(0x7a5c4e, 0x140d0c, 0.72);
    this.group.add(hemi);
    const amb = new THREE.AmbientLight(0x3a2c26, 0.85);
    this.group.add(amb);
    this.hemi = hemi;
    this.amb = amb;

    for (const [cx, cz, zone, intensity, flicker] of this.lampSpots) {
      const x = cx * C, z = cz * C;
      const isDim = zone === 'nap' || zone === 'exit';
      const color = zone === 'exit' ? 0x9dffc0 : zone === 'nap' ? 0x9fc6ff : 0xffcf9a;
      const light = new THREE.PointLight(color, intensity, 15, 2);
      light.position.set(x, WH - 0.5, z);
      this.group.add(light);
      this.lights.push(light);
      const lampMat = new THREE.MeshStandardMaterial({
        color: 0xfff2d0, emissive: color, emissiveIntensity: 1.4, roughness: 0.6,
      });
      const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.34, 0.09, 14), lampMat);
      disc.position.set(x, WH - 0.18, z);
      this.group.add(disc);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.03, 6, 18), MAT.metalDark);
      ring.position.set(x, WH - 0.22, z);
      ring.rotation.x = Math.PI / 2;
      this.group.add(ring);
      this.addLightPool(x, z, isDim ? 4.2 : 6.2, color, isDim ? 0.12 : 0.17);
      this.flickers.push({
        light, mesh: disc, base: intensity, phase: Math.random() * 10,
        speed: 2 + Math.random() * 4, drop: flicker === 1, isExit: zone === 'exit',
      });
    }
    // 蛋糕蜡烛的暖光
    const cakeLight = new THREE.PointLight(0xffb35c, 4.5, 6.5, 2);
    cakeLight.position.set(13.5 * C, 1.75, 14.3 * C);
    this.group.add(cakeLight);
    this.cakeLight = cakeLight;
    this.flickers.push({ light: cakeLight, base: 4.5, phase: 1.3, speed: 12, drop: false, mesh: null });
  }

  buildCandies() {
    const candyMat = new THREE.MeshStandardMaterial({
      color: 0xfff3d0, roughness: 0.28, metalness: 0.05,
      emissive: 0xffb84d, emissiveIntensity: 0.65,
    });
    const rimMat = new THREE.MeshStandardMaterial({ color: 0xe7b15c, roughness: 0.35, metalness: 0.4 });
    CANDY_CELLS.forEach(([cx, cz], i) => {
      const g = new THREE.Group();
      const [x, z] = [(cx + 0.5) * C, (cz + 0.5) * C];
      g.position.set(x, 1.0, z);
      const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.23, 0.23, 0.075, 22), candyMat);
      disc.rotation.x = Math.PI / 2;
      g.add(disc);
      const rim = new THREE.Mesh(new THREE.TorusGeometry(0.23, 0.025, 8, 22), rimMat);
      rim.rotation.x = 0;
      g.add(rim);
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({
        map: this.tex.glow(), color: 0xffcf9a, transparent: true, opacity: 0.55,
        blending: THREE.AdditiveBlending, depthWrite: false, fog: true,
      }));
      glow.scale.set(1.3, 1.3, 1);
      g.add(glow);
      this.group.add(g);
      this.candies.push({
        group: g, index: i, cx, cz, baseY: 1.02, phase: i * 1.7,
        collected: false, glow,
      });
    });
  }

  // ---------------- 龙奶：每局随机分布、SAN 解锁后可见 ----------------
  buildDragonMilk() {
    this.dragonMilk = [];
    this.dragonMilkUnlocked = false;
    // 龙奶要在暗场里一眼看见：玻璃带一点自发光，奶液提亮，瓶身外加雾气与地面光斑。
    const glass = new THREE.MeshStandardMaterial({
      color: 0xdff6ef, roughness: 0.16, metalness: 0.05,
      transparent: true, opacity: 0.44, depthWrite: false,
      emissive: 0x6fbfae, emissiveIntensity: 0.55,
    });
    const milk = new THREE.MeshStandardMaterial({
      color: 0xfffdf1, roughness: 0.5, emissive: 0xfff1c6, emissiveIntensity: 1.0,
    });
    const cap = new THREE.MeshStandardMaterial({
      color: 0x9fd6a8, roughness: 0.5, metalness: 0.15,
      emissive: 0x3f6f4a, emissiveIntensity: 0.7,
    });
    const bodyGeo = new THREE.CylinderGeometry(0.16, 0.18, 0.48, 16, 1, true);
    const milkGeo = new THREE.CylinderGeometry(0.135, 0.15, 0.32, 16);
    const shoulderGeo = new THREE.CylinderGeometry(0.075, 0.16, 0.12, 16, 1, true);
    const neckGeo = new THREE.CylinderGeometry(0.075, 0.075, 0.1, 16, 1, true);
    const capGeo = new THREE.CylinderGeometry(0.085, 0.085, 0.065, 16);
    for (let i = 0; i < DRAGON_MILK.count; i++) {
      const group = new THREE.Group();
      // 瓶子本体单独一层并放大，方便远处辨认；外层 group 仍按世界尺度放光效。
      const bottle = new THREE.Group();
      bottle.scale.setScalar(1.35);
      const body = new THREE.Mesh(bodyGeo, glass); body.position.y = 0.25; bottle.add(body);
      const liquid = new THREE.Mesh(milkGeo, milk); liquid.position.y = 0.19; bottle.add(liquid);
      const shoulder = new THREE.Mesh(shoulderGeo, glass); shoulder.position.y = 0.55; bottle.add(shoulder);
      const neck = new THREE.Mesh(neckGeo, glass); neck.position.y = 0.66; bottle.add(neck);
      const lid = new THREE.Mesh(capGeo, cap); lid.position.y = 0.735; bottle.add(lid);
      group.add(bottle);

      // 瓶口上方的暖白光团：暗场里靠它先被看见，再看清瓶子
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({
        map: this.tex.glow(), color: 0xfff2cf, transparent: true, opacity: 0.85,
        blending: THREE.AdditiveBlending, depthWrite: false, fog: true,
      }));
      glow.position.y = 0.62;
      glow.scale.set(1.75, 1.75, 1);
      group.add(glow);

      // 脚下的一圈地面光斑，标出可拾取位置
      const ring = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 1.3), new THREE.MeshBasicMaterial({
        map: this.tex.glow(), color: 0x8fe8c6, transparent: true, opacity: 0.3,
        blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: true,
      }));
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = -0.03;
      group.add(ring);

      group.visible = false;
      this.group.add(group);
      this.dragonMilk.push({
        index: i, group, bottle, glow, ring,
        collected: false, available: false, phase: i * 2.1,
      });
    }
    this.resetDragonMilk();
  }

  // 保守使用格子中心寻路，排除墙、家具和糖片；房间顺序及房内位置每局洗牌。
  resetDragonMilk() {
    this.dragonMilkUnlocked = false;
    const shuffle = (a) => {
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
      }
      return a;
    };
    const start = this.nearestBotWalkable(...SPAWN_CELL);
    const reachable = new Set();
    if (start) {
      const queue = [start];
      reachable.add(start.join(','));
      for (let i = 0; i < queue.length; i++) {
        const [cx, cz] = queue[i];
        for (const [dx, dz] of DIRS4) {
          const nx = cx + dx, nz = cz + dz, key = `${nx},${nz}`;
          if (!reachable.has(key) && this.isBotWalkable(nx, nz)) {
            reachable.add(key); queue.push([nx, nz]);
          }
        }
      }
    }
    const roomCandidates = shuffle(ROOMS.map((r) => {
      const cells = [];
      for (let z = r.z; z < r.z + r.h; z++) for (let x = r.x; x < r.x + r.w; x++) {
        if (!reachable.has(`${x},${z}`)) continue;
        const wx = (x + 0.5) * C, wz = (z + 0.5) * C;
        // 避免与奶片、出生点重叠，并留出玩家碰撞半径。
        if (CANDY_CELLS.some(([a, b]) => Math.hypot(x - a, z - b) < 1.4)) continue;
        if (Math.hypot(x - SPAWN_CELL[0], z - SPAWN_CELL[1]) < 2) continue;
        if (this.obstacles.some((o) => Math.abs(wx - o.x) < o.hx + 0.7 && Math.abs(wz - o.z) < o.hz + 0.7)) continue;
        cells.push({ x: wx, z: wz, cx: x, cz: z, room: r.id });
      }
      return shuffle(cells);
    }));
    const selected = [];
    for (const candidates of roomCandidates) {
      const site = candidates.find((p) => selected.every((q) => Math.hypot(p.x - q.x, p.z - q.z) >= DRAGON_MILK.minSeparation));
      if (site) selected.push(site);
      if (selected.length >= this.dragonMilk.length) break;
    }
    this.dragonMilk.forEach((item, i) => {
      const site = selected[i];
      item.collected = false;
      item.available = !!site;
      item.group.visible = false;
      if (site) {
        Object.assign(item, site);
        item.group.position.set(site.x, 0.04, site.z);
        item.group.rotation.set(0, 0, 0);
      }
    });
  }

  unlockDragonMilk() {
    if (this.dragonMilkUnlocked) return;
    this.dragonMilkUnlocked = true;
    for (const item of this.dragonMilk) item.group.visible = item.available && !item.collected;
  }

  getNearbyDragonMilk(position, radius = DRAGON_MILK.interactionRadius) {
    if (!this.dragonMilkUnlocked || !position) return null;
    let nearest = null, best = radius;
    for (const item of this.dragonMilk) {
      if (!item.available || item.collected) continue;
      const distance = Math.hypot(position.x - item.x, position.z - item.z);
      if (distance <= best) {
        // 不允许隔着墙或家具自动拾取。
        const steps = Math.max(1, Math.ceil(distance / 0.12));
        let blocked = false;
        for (let i = 1; i < steps; i++) {
          const t = i / steps;
          if (this.pointBlocked(position.x + (item.x - position.x) * t, position.z + (item.z - position.z) * t)) { blocked = true; break; }
        }
        if (!blocked) { nearest = item; best = distance; }
      }
    }
    return nearest;
  }

  collectDragonMilk(item) {
    if (!this.dragonMilkUnlocked || !this.dragonMilk.includes(item) || !item.available || item.collected) return false;
    item.collected = true;
    item.group.visible = false;
    return true;
  }

  buildExit() {
    const xFace = EXIT.wallCell[0] * C;
    const zc = (EXIT.wallCell[1] + 0.5) * C;
    const g = new THREE.Group();
    this.exitGroup = g;
    // 门框
    const frameMat = MAT.metalDark;
    for (const s of [-1, 1]) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.34, 2.9, 0.32), frameMat);
      p.position.set(xFace - 0.06, 1.45, zc + s * 1.62);
      g.add(p);
    }
    // 门楣下移到门洞上沿（2.60），给上面的「安全出口」灯牌让位。
    // 原来门楣在 2.77-3.13、灯牌在 2.85-3.45，两者重叠。
    const openTop = 2.60;
    const header = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.24, 3.55), frameMat);
    header.position.set(xFace - 0.06, openTop + 0.12, zc);
    g.add(header);
    // 门洞以上一直补到天花板，否则从门里能看见墙格的空腔
    const aboveH = WH - (openTop + 0.24);
    const above = new THREE.Mesh(new THREE.BoxGeometry(C, aboveH, C),
      new THREE.MeshStandardMaterial({ map: this.tex.wallpaper('exit'), roughness: 0.94, metalness: 0 }));
    above.position.set(xFace + C / 2, openTop + 0.24 + aboveH / 2, zc);
    above.userData.channelIgnore = true;
    g.add(above);
    // 双开门
    this.exitPanels = [];
    for (const s of [-1, 1]) {
      const hinge = new THREE.Group();
      hinge.position.set(xFace - 0.12, 0, zc + s * 1.5);
      const panelMat = new THREE.MeshStandardMaterial({
        color: 0x6f7f74, roughness: 0.5, metalness: 0.3,
        emissive: 0x1d5c39, emissiveIntensity: 0.35,
      });
      const panel = new THREE.Mesh(new THREE.BoxGeometry(0.09, 2.5, 1.46), panelMat);
      panel.position.set(0, 1.25, -s * 0.73);
      hinge.add(panel);
      const push = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.5, 0.16), MAT.metal);
      push.position.set(-0.08, 1.15, -s * 1.22);
      hinge.add(push);
      g.add(hinge);
      this.exitPanels.push({ hinge, s, panelMat });
    }
    // 安全出口灯牌
    const sign = this.addSign('安全出口', { bg: '#062b1b', fg: '#b6ffd2', glow: true, sub: 'EXIT · 出口' },
      xFace - 0.2, 3.15, zc, -Math.PI / 2, 1.9, 0.54);
    this.exitSignMat = sign.material;
    // 门内灯光
    const glowPlane = new THREE.Mesh(new THREE.PlaneGeometry(3.0, 2.4),
      new THREE.MeshBasicMaterial({
        map: this.tex.glow(), color: 0xd8ffe8, transparent: true, opacity: 0.0,
        blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
      }));
    glowPlane.position.set(xFace - 0.16, 1.35, zc);
    glowPlane.rotation.y = -Math.PI / 2;
    g.add(glowPlane);
    this.exitGlowPlane = glowPlane;
    const exitLight = new THREE.PointLight(0x7dffb0, 2.5, 8, 2);
    exitLight.position.set(xFace - 0.9, 2.2, zc);
    g.add(exitLight);
    this.exitLight = exitLight;
    // 绿色应急灯
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.12, 0.5),
      new THREE.MeshStandardMaterial({ color: 0x9dffc0, emissive: 0x57ff9b, emissiveIntensity: 2 }));
    lamp.position.set(xFace - 0.3, 2.9, zc + 1.35); // 原来在墙格里（zc+2.2 已经出格），根本看不见
    g.add(lamp);
    this.group.add(g);
    this.exitInfo = {
      x: xFace - 1.2, z: zc, open: false,
      radius: 2.4,
      doorCell: EXIT.wallCell,
    };
  }

  buildDust() {
    const N = 520;
    const pos = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      pos[i * 3] = Math.random() * this.W * C;
      pos[i * 3 + 1] = 0.3 + Math.random() * (WH - 0.5);
      pos[i * 3 + 2] = Math.random() * this.H * C;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({
      color: 0xffe0b0, size: 0.035, transparent: true, opacity: 0.35,
      depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true,
    });
    this.dust = new THREE.Points(geo, mat);
    this.group.add(this.dust);
  }

  // ---------------- 每帧更新 ----------------
  update(dt, t) {
    this.time = t;
    for (const f of this.flickers) {
      let v = f.base * (0.85 + 0.15 * Math.sin(t * f.speed + f.phase) + (f.drop && Math.sin(t * 13.7 + f.phase) > 0.96 ? -0.55 : 0));
      if (f.light === this.cakeLight) v = f.base * (0.8 + 0.2 * Math.sin(t * 9 + Math.sin(t * 7.1)));
      f.light.intensity = Math.max(0, v);
      if (f.mesh && f.mesh.material) f.mesh.material.emissiveIntensity = 0.9 + 0.7 * Math.sin(t * f.speed + f.phase);
    }
    for (const c of this.candies) {
      if (c.collected) continue;
      c.group.position.y = c.baseY + Math.sin(t * 1.8 + c.phase) * 0.12;
      c.group.rotation.y += dt * 1.4;
      if (c.glow) c.glow.material.opacity = 0.4 + 0.18 * Math.sin(t * 2.2 + c.phase);
    }
    for (const item of this.dragonMilk) {
      if (!item.group.visible) continue;
      item.group.position.y = 0.04 + 0.025 * Math.sin(t * 1.6 + item.phase);
      item.group.rotation.y += dt * 0.35;
      // 呼吸式明暗：静止时也有一点变化，避免被当成地面杂物
      const pulse = 0.5 + 0.5 * Math.sin(t * 1.9 + item.phase);
      if (item.glow) {
        item.glow.material.opacity = 0.55 + 0.26 * pulse;
        const s = 1.66 + 0.18 * pulse;
        item.glow.scale.set(s, s, 1);
      }
      if (item.ring) item.ring.material.opacity = 0.22 + 0.16 * pulse;
    }
    for (let i = 0; i < this.cakeFlames.length; i++) {
      const fl = this.cakeFlames[i];
      const s = 0.85 + 0.25 * Math.sin(t * 11 + i * 1.9) + 0.1 * Math.sin(t * 27 + i);
      fl.scale.set(0.14 * s, 0.26 * s, 1);
      fl.material.opacity = 0.65 + 0.3 * Math.sin(t * 13 + i);
    }
    if (this.dust) {
      const p = this.dust.geometry.attributes.position;
      for (let i = 0; i < p.count; i++) {
        let y = p.getY(i) + dt * 0.05;
        if (y > WH - 0.3) y = 0.25;
        p.setY(i, y);
      }
      p.needsUpdate = true;
    }
    // 出口开门动画
    if (this.exitUnlocked) {
      this.exitOpenT = Math.min(1, this.exitOpenT + dt * 0.8);
      const e = 1 - Math.pow(1 - this.exitOpenT, 3);
      for (const p of this.exitPanels) {
        p.hinge.rotation.y = p.s * e * 1.55;
        p.panelMat.emissiveIntensity = 0.3 + e * 0.8;
      }
      this.exitGlowPlane.material.opacity = 0.08 + e * 0.22 + Math.sin(t * 2) * 0.02;
      this.exitLight.intensity = 2.2 + e * 2.4;
      this.exitSignMat.color.setRGB(1, 1, 1);
    } else {
      this.exitGlowPlane.material.opacity = 0.04 + 0.02 * Math.sin(t * 2);
    }
  }

  // ---------------- 碰撞 ----------------
  resolveAgainst(boxes, pos, r) {
    for (const b of boxes) {
      const nx = clamp(pos.x, b.x - b.hx, b.x + b.hx);
      const nz = clamp(pos.z, b.z - b.hz, b.z + b.hz);
      let dx = pos.x - nx, dz = pos.z - nz;
      let d2 = dx * dx + dz * dz;
      if (d2 >= r * r) continue;
      if (d2 > 1e-9) {
        const d = Math.sqrt(d2);
        pos.x = nx + (dx / d) * r;
        pos.z = nz + (dz / d) * r;
      } else {
        // 圆心在盒内：沿最近边推出
        const left = Math.abs(pos.x - (b.x - b.hx));
        const right = Math.abs((b.x + b.hx) - pos.x);
        const top = Math.abs(pos.z - (b.z - b.hz));
        const bottom = Math.abs((b.z + b.hz) - pos.z);
        const m = Math.min(left, right, top, bottom);
        if (m === left) pos.x = b.x - b.hx - r;
        else if (m === right) pos.x = b.x + b.hx + r;
        else if (m === top) pos.z = b.z - b.hz - r;
        else pos.z = b.z + b.hz + r;
      }
    }
  }
  collectAround(pos) {
    const cx = Math.floor(pos.x / C);
    const cz = Math.floor(pos.z / C);
    const walls = [];
    const obs = [];
    for (let oz = -1; oz <= 1; oz++) {
      for (let ox = -1; ox <= 1; ox++) {
        const gx = cx + ox, gz = cz + oz;
        if (!this.isWalkable(gx, gz)) {
          walls.push({ x: (gx + 0.5) * C, z: (gz + 0.5) * C, hx: C / 2, hz: C / 2 });
        }
      }
    }
    for (const o of this.obstacles) {
      if (Math.abs(o.x - pos.x) < o.hx + C * 1.5 && Math.abs(o.z - pos.z) < o.hz + C * 1.5) obs.push(o);
    }
    return { walls, obs };
  }

  moveCircle(pos, dx, dz, r = 0.45) {
    const startX = pos.x, startZ = pos.z;
    pos.x += dx;
    pos.z += dz;
    for (let iter = 0; iter < 3; iter++) {
      const { walls, obs } = this.collectAround(pos);
      this.resolveAgainst(walls, pos, r);
      this.resolveAgainst(obs, pos, r);
    }
    // 收尾以墙体为准：家具靠近墙面时，把身体从家具里推出来有可能又顶进墙里，
    // 所以最后再单独做一次墙体收束，保证贴墙时永远留够 r 的余量（墙角不穿模）。
    const last = this.collectAround(pos);
    this.resolveAgainst(last.walls, pos, r);
    return { movedX: pos.x - startX, movedZ: pos.z - startZ };
  }
  isBotWalkable(cx, cz) {
    if (!this.isWalkable(cx, cz)) return false;
    const x = (cx + 0.5) * C, z = (cz + 0.5) * C;
    for (const o of this.obstacles) {
      if (Math.abs(x - o.x) < o.hx + 0.38 && Math.abs(z - o.z) < o.hz + 0.38) return false;
    }
    return true;
  }
  pointBlocked(x, z, pad = 0.02) {
    const cx = Math.floor(x / C), cz = Math.floor(z / C);
    if (!this.isWalkable(cx, cz)) return true;
    // 墙体按格划分，格内的可行走区域最多贴到格子边界；
    // 因此与格子边界的距离小于 pad 时也要算作被挡住，否则镜头会贴到墙面上。
    const localX = x - cx * C, localZ = z - cz * C;
    // 邻近格子边界时：只有当越过去的那一格本身可行走（开阔空间延续），才算安全。
    // 之前写成「左右任一侧可行走就算安全」，导致贴着墙的那一格被判为安全，镜头会贴到墙面上。
    if (localX < pad && !this.isWalkable(cx - 1, cz)) return true;
    if (localX > C - pad && !this.isWalkable(cx + 1, cz)) return true;
    if (localZ < pad && !this.isWalkable(cx, cz - 1)) return true;
    if (localZ > C - pad && !this.isWalkable(cx, cz + 1)) return true;
    for (const o of this.obstacles) {
      if (Math.abs(x - o.x) < o.hx + pad && Math.abs(z - o.z) < o.hz + pad) return true;
    }
    return false;
  }
  clipCamera(from, to, r = 0.28) {
    const steps = 24;
    const out = from.clone();
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const x = from.x + (to.x - from.x) * t;
      const z = from.z + (to.z - from.z) * t;
      // 用镜头半径做安全边距：近裁剪面 0.08，贴墙 0.02 会直接看穿墙体。
      if (this.pointBlocked(x, z, r)) break;
      out.set(x, to.y, z);
    }
    return out;
  }

  // ---------------- 流场寻路 ----------------
  computeFlow(px, pz) {
    const W = this.W, H = this.H;
    const dist = new Int16Array(W * H).fill(-1);
    let sx = Math.floor(px / C), sz = Math.floor(pz / C);
    if (!this.isBotWalkable(sx, sz)) {
      const near = this.nearestBotWalkable(sx, sz);
      if (!near) { this.flow = dist; return; }
      sx = near[0]; sz = near[1];
    }
    const start = sz * W + sx;
    dist[start] = 0;
    const q = [start];
    for (let head = 0; head < q.length; head++) {
      const idx = q[head];
      const x = idx % W, z = (idx / W) | 0;
      const d = dist[idx] + 1;
      for (const [dx, dz] of DIRS4) {
        const nx = x + dx, nz = z + dz;
        if (!this.isBotWalkable(nx, nz)) continue;
        const ni = nz * W + nx;
        if (dist[ni] === -1) { dist[ni] = d; q.push(ni); }
      }
    }
    this.flow = dist;
  }
  flowAt(cx, cz) {
    if (!this.flow) return -1;
    return this.flow[cz * this.W + cx];
  }
  nextStep(cx, cz) {
    if (!this.flow) return null;
    const cur = this.flow[cz * this.W + cx];
    let best = null, bestD = cur < 0 ? Infinity : cur;
    for (const [dx, dz] of DIRS8) {
      const nx = cx + dx, nz = cz + dz;
      if (!this.isBotWalkable(nx, nz)) continue;
      if (dx && dz) {
        if (!this.isBotWalkable(cx + dx, cz) || !this.isBotWalkable(cx, cz + dz)) continue;
      }
      const d = this.flowAt(nx, nz);
      if (d >= 0 && d < bestD) { bestD = d; best = [nx, nz]; }
    }
    return best;
  }
  cellOf(x, z) { return worldToCell(x, z); }
  nearestWalkable(cx, cz) {
    if (this.isWalkable(cx, cz)) return [cx, cz];
    for (let r = 1; r < 6; r++) {
      for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
        if (this.isWalkable(cx + dx, cz + dz)) return [cx + dx, cz + dz];
      }
    }
    return null;
  }
  nearestBotWalkable(cx, cz) {
    if (this.isBotWalkable(cx, cz)) return [cx, cz];
    for (let r = 1; r < 8; r++) {
      for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
        if (this.isBotWalkable(cx + dx, cz + dz)) return [cx + dx, cz + dz];
      }
    }
    return null;
  }
  getMinimapData() {
    return {
      grid: this.grid, W: this.W, H: this.H, rooms: ROOMS,
      exit: EXIT, candies: CANDY_CELLS,
    };
  }
}
