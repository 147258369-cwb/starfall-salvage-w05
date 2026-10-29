// 奶蛙乐园 — 世界构建：迷宫、装修、灯光、奶片、出口
import * as THREE from 'three';
import {
  GRID, ROOMS, CORRIDORS, DOORS, CANDY_CELLS, EXIT,
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

    this.buildSurfaces();
    this.buildDoorFrames();
    this.buildProps();
    this.buildLights();
    this.buildCandies();
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
        const postH = 2.82;
        if (alongZ) {
          for (const s of [-1, 1]) {
            const p = new THREE.Mesh(new THREE.BoxGeometry(0.3, postH, postW), frameMat);
            p.position.set(bx + dx * 0.05, postH / 2, bz + s * (C / 2 - postW / 2));
            this.group.add(p);
          }
          const lintel = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.34, C - 0.1), frameMat);
          lintel.position.set(bx + dx * 0.05, 2.9, bz);
          this.group.add(lintel);
        } else {
          for (const s of [-1, 1]) {
            const p = new THREE.Mesh(new THREE.BoxGeometry(postW, postH, 0.3), frameMat);
            p.position.set(bx + s * (C / 2 - postW / 2), postH / 2, bz + dz * 0.05);
            this.group.add(p);
          }
          const lintel = new THREE.Mesh(new THREE.BoxGeometry(C - 0.1, 0.34, 0.34), frameMat);
          lintel.position.set(bx, 2.9, bz + dz * 0.05);
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
  addPoster(kind, x, y, z, ry, w = 1.45, h = 2.1, textures = this.tex) {
    const mat = new THREE.MeshStandardMaterial({
      map: textures.poster(kind), roughness: 1, metalness: 0,
      emissive: 0xffffff, emissiveMap: textures.poster(kind), emissiveIntensity: 0.12,
      side: THREE.DoubleSide,
    });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    m.position.set(x, y, z);
    m.rotation.y = ry;
    m.translateZ(0.045);
    this.group.add(m);
    const frame = new THREE.Mesh(new THREE.BoxGeometry(w + 0.1, h + 0.1, 0.035), MAT.woodDark);
    frame.position.set(x, y, z);
    frame.rotation.y = ry;
    frame.translateZ(-0.012);
    this.group.add(frame);
    return m;
  }
  addSign(text, opts, x, y, z, ry, w = 1.8, h = 0.56) {
    const tex = this.tex.sign(text, opts);
    const mat = new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide, fog: true, transparent: true });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    m.position.set(x, y, z);
    m.rotation.y = ry;
    this.group.add(m);
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
    const legH = height - 0.09;
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
  }
  addBed(cx, cz) {
    const [x, z] = [(cx + 0.5) * C, (cz + 0.5) * C];
    this.addBox(1.5, 0.18, 2.0, MAT.wood, x, 0.24, z, 0, true);
    this.addBox(1.38, 0.16, 1.86, MAT.mattress, x, 0.4, z);
    this.addBox(0.66, 0.13, 0.36, MAT.white, x, 0.52, z - 0.72);
    this.addBox(1.38, 0.06, 0.9, MAT.blue, x, 0.49, z + 0.42);
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
    const str = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 1.1, 4), MAT.white);
    str.position.set(x, y - 0.72, z);
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
      this.group.add(b);
    }
    this.addObstacle(x, z, 1.3, 1.3);
  }
  addTricycle(cx, cz) {
    const [x, z] = [(cx + 0.5) * C, (cz + 0.5) * C];
    const paint = new THREE.MeshStandardMaterial({ color: 0xd85b5b, roughness: 0.5, metalness: 0.3 });
    const tire = MAT.black;
    for (const [ox, oz, r] of [[-0.55, 0, 0.24], [0.55, 0, 0.24], [0.58, 0, 0.18]]) {
      const w = new THREE.Mesh(new THREE.TorusGeometry(r, 0.055, 6, 14), tire);
      w.position.set(x + ox, r + 0.02, z + oz);
      this.group.add(w);
    }
    this.addBox(0.9, 0.08, 0.08, paint, x, 0.42, z, 0);
    this.addBox(0.08, 0.5, 0.08, paint, x - 0.42, 0.66, z, 0.12);
    this.addBox(0.28, 0.06, 0.12, MAT.black, x - 0.42, 0.94, z);
    this.addBox(0.4, 0.07, 0.12, paint, x + 0.1, 0.34, z);
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
    this.addChair(3.3, 1.35, Math.PI);
    // 门头招牌
    this.addSign('奶蛙乐园', { sub: 'MILK FROG PARK · EST. 1987' }, 3.5 * C, 2.72, 3.24, 0, 2.6, 0.8);
    // 长椅
    this.addBox(0.6, 0.12, 2.0, MAT.wood, 1.75 * C, 0.5, 4.7 * C, 0);
    this.addBox(0.08, 0.5, 0.08, MAT.woodDark, 1.75 * C, 0.25, 3.9 * C);
    this.addBox(0.08, 0.5, 0.08, MAT.woodDark, 1.75 * C, 0.25, 5.5 * C);
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
    // 黑板
    this.addBox(4.4, 1.75, 0.08, MAT.board, 13.5 * C, 1.76, 1.04 * C);
    this.addBox(4.5, 0.08, 0.16, MAT.woodDark, 13.5 * C, 0.9, 1.08 * C);
    this.addBox(0.16, 0.9, 0.06, MAT.white, 15.6 * C, 1.65, 1.08 * C); // 粉笔槽粉笔
    this.addPoster('drawing', 11.04 * C, 1.78, 3.2 * C, Math.PI / 2, 1.65, 2.2);
    this.addPoster('rules', 12.0 * C, 1.72, 6.94 * C, Math.PI, 1.5, 2.1);
    // 讲台
    this.addTable(15.4, 1.85, 2.0, 0.85, 0, 0.8);
    // 课桌
    this.addTable(12.3, 3.7, 1.5, 0.8, 0.05);
    this.addTable(15.0, 3.8, 1.5, 0.8, -0.04);
    this.addTable(13.6, 5.35, 1.5, 0.8, 0.02);
    for (const [cx, cz] of [[12.3, 3.0], [12.3, 4.45], [15.0, 3.1], [15.0, 4.55], [13.6, 4.65], [13.6, 6.05], [14.4, 5.35]]) {
      this.addChair(cx, cz, Math.PI);
    }
    // 玩具柜与书架
    this.addBox(0.5, 1.7, 2.2, MAT.woodLight, 16.64 * C, 0.85, 4.4 * C, 0, true);
    this.addBox(0.5, 2.2, 1.5, MAT.wood, 16.64 * C, 1.1, 2.4 * C, 0, true);
    for (let i = 0; i < 3; i++) {
      this.addBox(0.34, 0.32, 0.95, new THREE.MeshStandardMaterial({ color: [0xd9a7e0, 0x8fb7dd, 0xf29fb0][i], roughness: 0.9 }),
        16.55 * C, 0.55 + i * 0.55, 2.4 * C, 0);
    }
    // 地球仪
    this.addCyl(0.1, 0.14, 0.08, 10, MAT.woodDark, 15.4 * C, 1.02, 1.85 * C);
    const globe = new THREE.Mesh(new THREE.SphereGeometry(0.18, 14, 10),
      new THREE.MeshStandardMaterial({ color: 0x6f93b8, roughness: 0.5 }));
    globe.position.set(15.4 * C, 1.24, 1.85 * C);
    this.group.add(globe);
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
    this.addChair(23.3, 1.4, Math.PI);
    this.addBox(0.9, 1.75, 0.55, MAT.metalDark, 21.55 * C, 0.88, 1.9 * C, 0, true);
    this.addBox(0.72, 0.8, 0.72, MAT.metal, 24.8 * C, 0.4, 5.25 * C, 0.2, true);
    this.addPoster('missing', 21.06 * C, 1.72, 3.7 * C, Math.PI / 2, 1.3, 1.9);
    this.addBox(1.0, 0.55, 1.0, MAT.fabric, 24.6 * C, 0.28, 3.1 * C, 0, true);
    // 台灯
    this.addCyl(0.16, 0.2, 0.06, 12, MAT.metal, 22.35 * C, 1.55, 2.0 * C);
    this.addBox(0.05, 0.5, 0.05, MAT.metalDark, 22.35 * C, 1.3, 2.0 * C);
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
    this.addBox(0.6, 0.1, 0.9, MAT.wood, 5.8 * C, 0.45, 11.8 * C, 0.4);
    this.addBox(0.6, 0.7, 0.08, MAT.wood, 5.8 * C, 0.85, 12.15 * C, 0.4);
    // 玩具箱 / 地毯 / 窗帘 / 毛绒玩具
    this.addBox(1.0, 0.55, 0.6, MAT.pink, 3.6 * C, 0.28, 17.7 * C, 0, true);
    this.addRug(3.6, 15.4, 4.0, 3.0, 0x3e4f63, 0x25313f);
    for (const zz of [12.6, 14.8, 17.0]) {
      this.addBox(0.07, 2.15, 1.35, MAT.fabric, 1.12 * C, 1.42, zz * C, 0);
    }
    const plush = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), MAT.cream);
    plush.position.set(2.1 * C, 0.62, 14.3 * C);
    this.group.add(plush);
    this.addLightPool(3.5 * C, 14.8 * C, 8.5, 0x9fc6ff, 0.2);
  }

  buildCanteen() {
    const [tx, tz] = this.addTable(13.5, 14.3, 4.2, 1.5, 0, 0.94);
    for (const [cx, cz] of [[12.0, 13.3], [13.5, 13.3], [15.0, 13.3], [12.0, 15.3], [13.5, 15.3], [15.0, 15.3]]) {
      this.addChair(cx, cz, 0);
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
    this.addSign('生日快乐', { sub: 'HAPPY BIRTHDAY · 1999.06.01', bg: '#6d2530', fg: '#ffe6b8' }, 13.5 * C, 2.86, 11.06 * C, 0, 5.2, 0.9);
    // 取餐台
    this.addBox(0.95, 1.0, 4.0, MAT.metal, 16.25 * C, 0.5, 16.1 * C, 0, true);
    this.addBox(0.06, 1.05, 4.0, MAT.cream, 15.77 * C, 0.52, 16.1 * C);
    // 冰箱
    this.addBox(1.0, 1.9, 1.0, MAT.cream, 16.2 * C, 0.95, 12.2 * C, 0, true);
    this.addBox(0.05, 0.5, 0.1, MAT.metal, 15.68 * C, 1.4, 12.2 * C);
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
    for (const [cx, cz] of [[12.3, 14.2], [14.7, 14.4], [13.0, 13.5], [15.1, 14.9]]) {
      this.addCyl(0.09, 0.07, 0.22, 8, MAT.pink, cx * C, 1.08, cz * C);
    }
    for (let i = 0; i < 4; i++) {
      this.addPartyHat(11.8 + i * 1.1, 13.2 + (i % 2) * 1.9, 1.0, [0xf29fb0, 0xffd9a0, 0xa9d6c4, 0x8fb7dd][i]);
    }
  }

  buildExitHall() {
    this.addLockers(21.06, 14.2, Math.PI / 2, 3, 2.0);
    this.addBox(2.4, 0.12, 0.5, MAT.wood, 23.0 * C, 0.5, 17.65 * C, 0, true);
    this.addBox(0.08, 0.5, 0.08, MAT.woodDark, 22.0 * C, 0.25, 17.65 * C);
    this.addBox(0.08, 0.5, 0.08, MAT.woodDark, 24.0 * C, 0.25, 17.65 * C);
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
    this.addBox(0.55, 0.1, 1.9, MAT.wood, 22.4, 0.48, 26.7, 0);
    this.addBox(0.06, 0.48, 0.06, MAT.woodDark, 21.65, 0.24, 26.7);
    this.addBox(0.06, 0.48, 0.06, MAT.woodDark, 23.15, 0.24, 26.7);
    this.addObstacle(22.4, 26.7, 0.3, 1.0);
    this.addPlant(2.4, 8.35, 0.95);
    this.addPlant(23.8, 8.35, 0.9);
    this.addPlant(8.35, 11.1, 0.85);
    this.addPlant(18.4, 6.3, 0.9);
    // 饮水机
    this.addBox(0.5, 1.1, 0.5, MAT.cream, 10.3 * C, 0.55, 8.42 * C, 0, true);
    this.addCyl(0.19, 0.19, 0.5, 12, MAT.blue, 10.3 * C, 1.3, 8.42 * C);
    // 走廊海报
    this.addPoster('rules', 5.4 * C, 1.7, 6.97 * C, 0, 1.35, 1.9);
    this.addPoster('frog', 11.6 * C, 1.72, 6.96 * C, 0, 1.35, 1.9);
    this.addPoster('birthday', 16.0 * C, 1.7, 6.96 * C, 0, 1.3, 1.85);
    this.addPoster('drawing', 4.2 * C, 1.65, 9.96 * C, Math.PI, 1.2, 1.7);
    this.addPoster('missing', 12.3 * C, 1.7, 9.96 * C, Math.PI, 1.2, 1.75);
    this.addPoster('map', 21.4 * C, 1.7, 9.96 * C, Math.PI, 1.55, 1.2);
    // 中央走廊：储物柜、告示
    this.addLockers(8.12, 5.2, 0, 2, 1.9);
    this.addPoster('rules', 8.06 * C, 1.7, 15.7 * C, Math.PI / 2, 1.3, 1.85);
    this.addPoster('frog', 9.94 * C, 1.75, 3.2 * C, -Math.PI / 2, 1.3, 1.85);
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
    const header = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.36, 3.55), frameMat);
    header.position.set(xFace - 0.06, 2.95, zc);
    g.add(header);
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
      xFace - 0.2, 3.15, zc, -Math.PI / 2, 1.9, 0.6);
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
    lamp.position.set(xFace - 0.3, 3.05, zc + 2.2);
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
  moveCircle(pos, dx, dz, r = 0.45) {
    const startX = pos.x, startZ = pos.z;
    pos.x += dx;
    pos.z += dz;
    for (let iter = 0; iter < 3; iter++) {
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
      this.resolveAgainst(walls, pos, r);
      this.resolveAgainst(obs, pos, r);
    }
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
  pointBlocked(x, z) {
    const cx = Math.floor(x / C), cz = Math.floor(z / C);
    if (!this.isWalkable(cx, cz)) return true;
    for (const o of this.obstacles) {
      if (Math.abs(x - o.x) < o.hx + 0.02 && Math.abs(z - o.z) < o.hz + 0.02) return true;
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
      if (this.pointBlocked(x, z)) break;
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
