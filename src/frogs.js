// 奶蛙：低多边形模型、流场追逐、贴近失败、加速甩脱、距离音效
import * as THREE from 'three';
import { FROG_DEFS, FROG_LINES, cellCenter, GRID } from './config.js';

const C = GRID.cell;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const damp = (a, b, l, dt) => b + (a - b) * Math.exp(-l * dt);

const VARIANTS = {
  small: { bodyColor: 0xd6d46c, scale: 0.8, bodyScale: [1, 1.05, 0.95], eyeR: 0.25, legLen: 0.34, speed: 4.45, radius: 0.48 },
  fat:   { bodyColor: 0xcec05a, scale: 1.28, bodyScale: [1.25, 1.0, 1.15], eyeR: 0.2, legLen: 0.26, speed: 4.15, radius: 0.66 },
  tall:  { bodyColor: 0xc4c97d, scale: 1.02, bodyScale: [0.92, 1.2, 0.9], eyeR: 0.22, legLen: 0.85, speed: 4.35, radius: 0.5 },
};

function buildFrogModel(variant) {
  const v = VARIANTS[variant];
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: v.bodyColor, roughness: 0.55, metalness: 0.02 });
  const belly = new THREE.MeshStandardMaterial({ color: 0xe8e3a8, roughness: 0.7 });
  const white = new THREE.MeshStandardMaterial({ color: 0xf7f4e6, roughness: 0.25, emissive: 0xfff6dd, emissiveIntensity: 0.35 });
  const black = new THREE.MeshStandardMaterial({ color: 0x0b0a08, roughness: 0.2 });
  const mouthMat = new THREE.MeshStandardMaterial({ color: 0x40151b, roughness: 0.6 });
  const pink = new THREE.MeshStandardMaterial({ color: 0xe8a0a8, roughness: 0.8 });

  const body = new THREE.Mesh(new THREE.SphereGeometry(0.52, 22, 18), mat);
  body.scale.set(...v.bodyScale);
  body.position.y = 0.58 + v.legLen;
  g.add(body);

  const bellyMesh = new THREE.Mesh(new THREE.SphereGeometry(0.4, 18, 14), belly);
  bellyMesh.scale.set(0.85, 0.9, 0.5);
  bellyMesh.position.set(0, 0.52 + v.legLen, 0.28);
  g.add(bellyMesh);

  // 眼睛（前脸 +Z）
  const eyes = [];
  for (const s of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(v.eyeR, 16, 12), white);
    eye.position.set(s * 0.22, 0.78 + v.legLen, 0.36);
    g.add(eye);
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(v.eyeR * 0.26, 10, 8), black);
    pupil.position.set(s * 0.2, 0.78 + v.legLen, 0.36 + v.eyeR * 0.92);
    g.add(pupil);
    eyes.push({ eye, pupil });
  }
  // 微笑
  const mouth = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.028, 6, 22, Math.PI), mouthMat);
  mouth.position.set(0, 0.46 + v.legLen, 0.47);
  mouth.rotation.z = Math.PI;
  g.add(mouth);
  // 腮红
  for (const s of [-1, 1]) {
    const cheek = new THREE.Mesh(new THREE.CircleGeometry(0.085, 12), pink);
    cheek.position.set(s * 0.34, 0.58 + v.legLen, 0.42);
    cheek.rotation.y = s * 0.35;
    g.add(cheek);
  }
  // 手
  const arms = [];
  for (const s of [-1, 1]) {
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.05, 0.34, 7), mat);
    arm.position.set(s * 0.44, 0.55 + v.legLen, 0.08);
    arm.rotation.z = s * 0.5;
    g.add(arm);
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), mat);
    hand.position.y = -0.18;
    arm.add(hand);
    arms.push(arm);
  }
  // 腿
  const legs = [];
  for (const s of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.06, v.legLen + 0.1, 7), mat);
    leg.position.set(s * 0.2, v.legLen / 2 + 0.03, 0);
    g.add(leg);
    const foot = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 6), mat);
    foot.scale.set(1, 0.45, 1.7);
    foot.position.set(0, -v.legLen / 2 + 0.02, 0.08);
    leg.add(foot);
    legs.push(leg);
  }
  // 胸牌
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.12), new THREE.MeshStandardMaterial({ color: 0xf3e6c8, roughness: 1 }));
  sign.position.set(0, 0.42 + v.legLen, 0.46);
  g.add(sign);
  const name = new THREE.Mesh(new THREE.PlaneGeometry(0.24, 0.05), new THREE.MeshBasicMaterial({ color: 0x9d2a2a }));
  name.position.set(0, 0.42 + v.legLen, 0.466);
  g.add(name);

  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(0.55, 16),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.32, depthWrite: false }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.012;
  g.add(shadow);

  g.scale.setScalar(v.scale);
  return { group: g, body, belly: bellyMesh, eyes, arms, legs, mouth, shadow, variant: v };
}

class Frog {
  constructor(def, index, world, player, audio) {
    this.def = def;
    this.index = index;
    this.world = world;
    this.player = player;
    this.audio = audio;
    this.variant = VARIANTS[def.variant];
    this.model = buildFrogModel(def.variant);
    this.group = this.model.group;
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.facing = 0;
    this.waypoint = null;
    this.repathTimer = Math.random() * 0.2;
    this.state = 'idle';
    this.dazedT = 0;
    this.stillT = 0;
    this.farT = 0;
    this.voiceT = 0;
    this.gain = 0;
    this.yawNoise = Math.random() * Math.PI * 2;
    this.spawn();
    world.group.add(this.group);
  }

  spawn() {
    const [x, , z] = cellCenter(this.def.cell[0], this.def.cell[1]);
    this.pos.set(x, 0, z);
    this.vel.set(0, 0, 0);
    this.group.position.copy(this.pos);
    this.waypoint = null;
  }

  get distanceToPlayer() {
    const dx = this.player.position.x - this.pos.x;
    const dz = this.player.position.z - this.pos.z;
    return Math.hypot(dx, dz);
  }

  chooseStep() {
    const [cx, cz] = this.world.cellOf(this.pos.x, this.pos.z);
    let step = this.world.nextStep(cx, cz);
    if (!step) {
      const near = this.world.nearestWalkable(cx, cz);
      step = near;
    }
    if (!step) return null;
    const [x, , z] = cellCenter(step[0], step[1]);
    return new THREE.Vector3(x, 0, z);
  }

  update(dt, time, opts) {
    const dist = this.distanceToPlayer;
    const playerSpeed = Math.hypot(this.player.velocity.x, this.player.velocity.z);
    const active = opts.active;
    const demo = opts.demo;
    const dazed = this.state === 'dazed';

    if (!active) {
      this.state = 'idle';
      this.voiceT += dt;
      this.animate(dt, time, 0, false);
      this.applyVoice(0, 0, false);
      return;
    }

    if (dazed) {
      this.dazedT -= dt;
      this.voiceT += dt;
      this.animate(dt, time, 0, true);
      this.applyVoice(0.02, 0, false);
      if (this.dazedT <= 0) {
        this.state = 'chase';
        this.repathTimer = 0;
      }
      return;
    }

    // 玩家停下时，奶蛙才敢靠近
    if (playerSpeed < 0.35) this.stillT += dt; else this.stillT = Math.max(0, this.stillT - dt * 2);
    const keeping = this.stillT < 1.4;
    const keepDist = keeping ? 5.6 : 0.85;

    // 冲刺甩开
    if (this.player.sprinting && dist > 13.5) this.farT += dt; else this.farT = Math.max(0, this.farT - dt * 2);
    if (this.farT > 0.9) {
      this.state = 'dazed';
      this.dazedT = 6.0;
      this.farT = 0;
      this.vel.set(0, 0, 0);
      this.applyVoice(0, 0, false);
      return;
    }

    this.repathTimer -= dt;
    if (this.repathTimer <= 0 || !this.waypoint) {
      this.repathTimer = 0.22 + Math.random() * 0.12;
      this.waypoint = this.chooseStep();
    }
    let direction = new THREE.Vector3();
    if (keeping && dist > keepDist + 1.0) {
      if (this.waypoint) direction.set(this.waypoint.x - this.pos.x, 0, this.waypoint.z - this.pos.z);
      if (direction.lengthSq() < 0.01) direction.set(this.player.position.x - this.pos.x, 0, this.player.position.z - this.pos.z);
      direction.normalize();
    } else if (!keeping) {
      direction.set(this.player.position.x - this.pos.x, 0, this.player.position.z - this.pos.z);
      if (direction.lengthSq() > 0.0001) direction.normalize();
    } else if (dist < keepDist - 0.6) {
      // 贴得太近：后退一点，保持“追不上”的压迫感
      direction.set(this.pos.x - this.player.position.x, 0, this.pos.z - this.player.position.z);
      if (direction.lengthSq() > 0.0001) direction.normalize();
    }

    // 与同伴分离
    for (const other of opts.frogs) {
      if (other === this) continue;
      const dx = this.pos.x - other.pos.x;
      const dz = this.pos.z - other.pos.z;
      const d = Math.hypot(dx, dz);
      const min = (this.variant.radius + other.variant.radius) * 1.15;
      if (d > 0.0001 && d < min) {
        direction.x += (dx / d) * (1 - d / min) * 1.3;
        direction.z += (dz / d) * (1 - d / min) * 1.3;
      }
    }
    if (direction.lengthSq() > 0.0001) direction.normalize();

    let speed = 0;
    if (keeping) {
      if (dist > keepDist + 2.2) speed = this.variant.speed;
      else if (dist > keepDist + 0.7) speed = this.variant.speed * 0.45;
      else if (dist < keepDist - 0.6) speed = 2.2;
      else speed = 0;
    } else {
      speed = 2.8 + Math.min(1.2, this.stillT);
      // 倒下时向玩家方向微调
    }
    // 被抓前兆：非常近时放慢，避免巡逻时误触
    if (dist < 2.2 && playerSpeed > 1.2) speed *= 0.35;
    this.vel.x = damp(this.vel.x, direction.x * speed, 6, dt);
    this.vel.z = damp(this.vel.z, direction.z * speed, 6, dt);

    this.world.moveCircle(this.pos, this.vel.x * dt, this.vel.z * dt, this.variant.radius);
    this.group.position.copy(this.pos);

    const sp = Math.hypot(this.vel.x, this.vel.z);
    if (sp > 0.15) {
      const target = Math.atan2(this.vel.x, this.vel.z);
      let d = ((target - this.facing + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
      this.facing += d * Math.min(1, dt * 6);
    }
    this.group.rotation.y = this.facing;
    this.animate(dt, time, sp, false);

    // 靠近时的声音
    const pan = this.computePan();
    const proximity = clamp(1 - (dist - 1) / 14, 0, 1);
    const targetGain = Math.pow(proximity, 1.7) * 0.6;
    this.gain = damp(this.gain, targetGain, 4, dt);
    this.applyVoice(this.gain, pan, true, dist);

    // 抓到玩家
    if (!demo && dist < 1.08 && playerSpeed < 1.0 && opts.grace <= 0) {
      opts.onCatch?.(this);
    }
  }

  computePan() {
    const dx = this.pos.x - this.player.position.x;
    const dz = this.pos.z - this.player.position.z;
    const len = Math.hypot(dx, dz) || 1;
    const nx = dx / len, nz = dz / len;
    const fx = -Math.sin(this.player.yaw), fz = -Math.cos(this.player.yaw);
    const rx = -fz, rz = fx;
    return clamp(nx * rx + nz * rz, -1, 1) * 0.85;
  }

  applyVoice(gain, pan, active, dist = 99) {
    this.voiceTimer = (this.voiceTimer || 0) - 0.016;
    if (this.voiceTimer > 0) return;
    this.voiceTimer = 0.09;
    if (this.audio) this.audio.setFrogVoice(this.index, { gain, pan, rate: 0.92 + this.index * 0.03 });
  }

  animate(dt, time, speed, dazed) {
    const m = this.model;
    const t = time + this.index * 2.1;
    if (dazed) {
      this.group.rotation.z = Math.sin(t * 8) * 0.12;
      m.body.rotation.y = t * 2;
      m.eyes.forEach((e, i) => { e.eye.rotation.z = t * 5 * (i ? 1 : -1); });
      this.group.position.y = this.pos.y + Math.abs(Math.sin(t * 5)) * 0.03;
      return;
    }
    const bob = Math.sin(t * (speed > 0.2 ? 9 : 1.8)) * (speed > 0.2 ? 0.045 : 0.015);
    this.group.position.y = this.pos.y + bob;
    this.group.rotation.z = Math.sin(t * (speed > 0.2 ? 8 : 1.6)) * 0.045;
    m.body.scale.y = 1 + Math.sin(t * 7) * (speed > 0.2 ? 0.035 : 0.012);
    m.legs[0].rotation.x = Math.sin(t * 9) * 0.35 * Math.min(1, speed * 0.4);
    m.legs[1].rotation.x = -Math.sin(t * 9) * 0.35 * Math.min(1, speed * 0.4);
    m.arms[0].rotation.x = -Math.sin(t * 9) * 0.3 * Math.min(1, speed * 0.4);
    m.arms[1].rotation.x = Math.sin(t * 9) * 0.3 * Math.min(1, speed * 0.4);
    if (m.eyes) {
      const blink = (Math.sin(t * 0.7) > 0.985) ? 0.12 : 1;
      for (const e of m.eyes) e.eye.scale.y = blink;
    }
  }

  setDazed() {
    this.state = 'dazed';
    this.dazedT = 6;
  }
}

export class FrogManager {
  constructor(world, player, audio) {
    this.world = world;
    this.player = player;
    this.audio = audio;
    this.frogs = FROG_DEFS.map((d, i) => new Frog(d, i, world, player, audio));
    this.active = false;
    this.flowTimer = 0;
    this.grace = 0;
    this.onCatch = null;
    this.onNearLine = null;
    this.nearLineCooldown = 0;
    this.nearest = 99;
    this.danger = 0;
    // Frog 构造时已把模型加入 world.group，这里不再重复挂载
  }

  reset({ demo = false } = {}) {
    this.active = false;
    this.grace = 3.2;
    this.nearLineCooldown = 2;
    this.nearest = 99;
    this.danger = 0;
    this.demo = demo;
    this.frogs.forEach((f) => {
      f.spawn();
      f.state = 'idle';
      f.stillT = 0;
      f.farT = 0;
      f.vel.set(0, 0, 0);
      f.group.visible = true;
      f.group.rotation.set(0, 0, 0);
      f.group.position.copy(f.pos);
      this.audio?.setFrogVoice(f.index, { gain: 0 });
    });
  }

  activate() {
    if (this.active) return;
    this.active = true;
    this.audio?.playSfx('sfx_frog_alert', { gain: 0.7 });
  }

  update(dt, time, opts = {}) {
    this.grace = Math.max(0, this.grace - dt);
    this.flowTimer -= dt;
    if (this.flowTimer <= 0) {
      this.flowTimer = 0.24;
      this.world.computeFlow(this.player.position.x, this.player.position.z);
    }
    let nearest = 99;
    let nearFrog = null;
    for (const f of this.frogs) {
      f.update(dt, time, {
        active: this.active,
        frogs: this.frogs,
        demo: opts.demo || this.demo,
        grace: this.grace + (opts.grace || 0),
        onCatch: (frog) => {
          if (this.onCatch) this.onCatch(frog);
        },
      });
      const d = f.distanceToPlayer;
      if (d < nearest) { nearest = d; nearFrog = f; }
    }
    this.nearest = nearest;
    const targetDanger = this.active ? clamp(1 - (nearest - 1) / 12, 0, 1) : 0;
    this.danger = damp(this.danger, targetDanger, 3, dt);

    // 心跳
    this.audio?.setHeartbeat(this.active ? Math.pow(clamp(1 - nearest / 13, 0, 1), 1.6) * 0.65 : 0);

    // 近距离字幕
    this.nearLineCooldown -= dt;
    if (this.active && nearFrog && nearest < 7.5 && this.nearLineCooldown <= 0 && nearFrog.state !== 'dazed') {
      this.nearLineCooldown = 8 + Math.random() * 4;
      const line = FROG_LINES[nearFrog.index % FROG_LINES.length];
      this.onNearLine?.(line, nearFrog);
    }
    return { nearest, danger: this.danger };
  }
}
