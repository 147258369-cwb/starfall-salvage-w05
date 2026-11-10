// 奶蛙：低多边形模型、流场追逐、贴近失败、加速甩脱、距离音效
import * as THREE from 'three';
import { FROG_DEFS, FROG_LINES, cellCenter, GRID } from './config.js';
import { GLTFLoader } from '../vendor/three/loaders/GLTFLoader.js';

const C = GRID.cell;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const damp = (a, b, l, dt) => b + (a - b) * Math.exp(-l * dt);

// ============ 奶龙 GLB 模型预加载 ============
// 用户提供的 nailong_colored_2.0.glb：单个静态网格、4 材质分组、无骨骼无动画。
// 实际颜色被 Blender 导进 COLOR_1（琥珀 0.99/0.53/0.30），COLOR_0 是全白，所以
// 加载后给材质名 'yellow' 的补上本色，并加自发光保证黑暗场景可见。
// 归一化：脚底贴地 y=0、身高 1.5、x/z 居中、正面朝 +Z（与程序化奶蛙一致）。
let _frogTemplatePromise = null;
export function loadFrogModelTemplate() {
  if (!_frogTemplatePromise) {
    _frogTemplatePromise = new Promise((resolve) => {
      const loader = new GLTFLoader();
      // 相对模块文件解析，确保在根目录游戏和 tools/ 预览页都能正确加载
      const modelUrl = new URL('../assets/models/nailong_colored_2.0.glb', import.meta.url).href;
      loader.load(
        modelUrl,
        (gltf) => {
          try {
            const root = gltf.scene;
            root.traverse((o) => {
              if (o.isMesh) {
                const mats = Array.isArray(o.material) ? o.material : [o.material];
                for (const m of mats) {
                  if (!m) continue;
                  const isBody = m.name === 'yellow';
                  if (isBody) m.color.setHex(0xf4d64a);
                  m.emissive = new THREE.Color(isBody ? 0x3a2a05 : 0x0a0a05);
                  m.emissiveIntensity = isBody ? 0.3 : 0.18;
                }
              }
            });
            const box = new THREE.Box3().setFromObject(root);
            const size = new THREE.Vector3();
            box.getSize(size);
            const scale = 1.5 / size.y;
            root.scale.setScalar(scale);
            const box2 = new THREE.Box3().setFromObject(root);
            const c2 = new THREE.Vector3();
            box2.getCenter(c2);
            root.position.x -= c2.x;
            root.position.z -= c2.z;
            root.position.y -= box2.min.y;
            // 模型脸朝 -Z，转 180° 让脸朝 +Z，与游戏内奶蛙朝向一致
            root.rotation.y = Math.PI;
            resolve(root);
          } catch (e) {
            console.warn('[frog-model] 归一化失败，回退程序化奶蛙', e);
            resolve(null);
          }
        },
        undefined,
        (err) => {
          console.warn('[frog-model] 模型加载失败，回退程序化奶蛙', err);
          resolve(null);
        }
      );
    });
  }
  return _frogTemplatePromise;
}

// 奶蛙 = 奶龙的 AI 变异体：黄色软胶身体、绿色圆眼、极小嘴；
// 参考网络「奶蛙」表情包，不使用官方奶龙素材。靠近时裂开成大笑巨口。
// 追击参数：奶蛙永远推进，靠"扑击"造成致命接触。
// chase 特意低于玩家步行 4.1 —— 一直走就能拉开；扑击 5.3 才是威胁，
// 但它是直线，侧身/拐角能躲，躲掉后有 2.2 秒恢复期。
const CHASE = {
  chase: 3.55,        // 常规追击（低于步行 4.1，一直走就能拉开）
  coil: 0.5,          // 前摇：站住蓄力，给玩家反应时间
  lunge: 5.3,         // 扑击速度
  lungeTime: 0.8,     // 扑击持续（一次性动作，不是持续追击）
  recover: 2.2,       // 扑空恢复速度（硬直，打空了就要付代价）
  recoverTime: 2.8,   // 恢复时长
  lungeRange: 5.0,    // 进入这个距离才开始蓄力
};

const VARIANTS = {
  // radius 必须匹配模型实际身宽（实测半宽：small 0.52、fat 0.87、tall 0.67），
  // 否则奶蛙贴墙走时身体会插进墙里（穿模）。
  small: { bodyColor: 0xf4d64a, scale: 0.78, bodyScale: [1.0, 1.14, 0.98], eyeR: 0.2, legLen: 0.3, speed: 4.45, radius: 0.62, seed: 1 },
  fat:   { bodyColor: 0xf2d247, scale: 1.3, bodyScale: [1.2, 1.02, 1.12], eyeR: 0.17, legLen: 0.24, speed: 4.15, radius: 1.0, seed: 2 },
  tall:  { bodyColor: 0xf6dc5a, scale: 1.0, bodyScale: [0.9, 1.34, 0.92], eyeR: 0.19, legLen: 0.55, speed: 4.35, radius: 0.78, seed: 3 },
};

function buildScaryJaws() {
  const black = new THREE.MeshStandardMaterial({ color: 0x0a0906, roughness: 0.12 });
  const toothMat = new THREE.MeshStandardMaterial({ color: 0xf3ead2, roughness: 0.35 });
  const tongueMat = new THREE.MeshStandardMaterial({ color: 0xb9545c, roughness: 0.6 });
  const scary = new THREE.Group();
  const cavity = new THREE.Mesh(new THREE.SphereGeometry(0.27, 20, 16), black);
  cavity.scale.set(1.18, 0.9, 0.22);
  scary.add(cavity);
  for (let i = 0; i < 5; i++) {
    const tooth = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.07, 0.02), toothMat);
    tooth.position.set(-0.16 + i * 0.08, 0.16, 0.055);
    scary.add(tooth);
  }
  for (let i = 0; i < 4; i++) {
    const tooth = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.055, 0.02), toothMat);
    tooth.position.set(-0.12 + i * 0.08, -0.16, 0.055);
    scary.add(tooth);
  }
  const tongue = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 10), tongueMat);
  tongue.scale.set(1, 0.5, 0.25);
  tongue.position.set(0, -0.07, 0.06);
  scary.add(tongue);
  scary.visible = false;
  return scary;
}

function buildFrogShadow() {
  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(0.58, 18),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.34, depthWrite: false }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.012;
  return shadow;
}

export function buildFrogModel(variant, modelTemplate) {
  const v = VARIANTS[variant];
  const g = new THREE.Group();

  // ===== GLB 模型分支：用户提供的奶龙模型作为身体，保留程序化裂口+影子 =====
  if (modelTemplate) {
    const holder = new THREE.Group();
    const body = modelTemplate.clone(true);
    holder.add(body);
    g.add(holder);

    const scary = buildScaryJaws();
    // 归一化身高 1.5、脚底贴地、正面朝 +Z；脸部在上部，裂口贴到脸前
    const scaryBaseScale = 1.1;
    scary.position.set(0, 1.18, 0.28);
    scary.scale.setScalar(scaryBaseScale);
    g.add(scary);

    const shadow = buildFrogShadow();
    shadow.scale.setScalar(1.15);
    g.add(shadow);

    g.scale.setScalar(v.scale);
    return {
      group: g, body: holder, belly: null, eyes: [], arms: [], legs: [],
      mouth: null, scary, shadow, variant: v, modelBased: true,
      scaryBaseScale, scaryBaseY: 1.18,
    };
  }

  // ===== 程序化分支（兜底）：原有低多边形奶蛙 =====
  const yellow = new THREE.MeshStandardMaterial({ color: v.bodyColor, roughness: 0.38, metalness: 0.02, emissive: 0x3a2a05, emissiveIntensity: 0.12 });
  const bellyMat = new THREE.MeshStandardMaterial({ color: 0xf7e9b6, roughness: 0.5 });
  const irisMat = new THREE.MeshStandardMaterial({ color: 0x6f963c, roughness: 0.45, emissive: 0x1c2a08, emissiveIntensity: 0.4 });
  const black = new THREE.MeshStandardMaterial({ color: 0x0a0906, roughness: 0.12 });
  const shine = new THREE.MeshBasicMaterial({ color: 0xfff8e0 });
  const mouthMat = new THREE.MeshStandardMaterial({ color: 0x3a1a12, roughness: 0.7 });

  const bodyY = 0.78 + v.legLen;
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.62, 24, 20), yellow);
  body.scale.set(...v.bodyScale);
  body.position.y = bodyY;
  g.add(body);

  // 奶龙式奶油色肚皮
  const belly = new THREE.Mesh(new THREE.SphereGeometry(0.42, 20, 16), bellyMat);
  belly.scale.set(1.0, 0.82, 0.3);
  belly.position.set(0, bodyY - 0.27, 0.55);
  g.add(belly);

  // 绿色大圆眼 + 黑瞳 + 高光（无眼白，参考奶蛙）
  const eyes = [];
  for (const s of [-1, 1]) {
    const jitter = (v.seed - 2) * 0.006;
    const ring = new THREE.Mesh(new THREE.SphereGeometry(v.eyeR * 1.16, 18, 14), irisMat);
    ring.scale.set(1, 1, 0.42);
    ring.position.set(s * 0.23 + jitter, bodyY + 0.27, 0.52);
    g.add(ring);
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(v.eyeR, 16, 12), black);
    pupil.position.set(s * 0.225 + jitter, bodyY + 0.27, 0.55);
    g.add(pupil);
    const highlight = new THREE.Mesh(new THREE.SphereGeometry(v.eyeR * 0.18, 8, 6), shine);
    highlight.position.set(s * 0.225 + jitter - 0.04, bodyY + 0.31, 0.62);
    g.add(highlight);
    eyes.push({ ring, pupil, highlight });
  }

  // 极小的一条嘴
  const mouth = new THREE.Mesh(new THREE.TorusGeometry(0.082, 0.013, 6, 18, Math.PI), mouthMat);
  mouth.position.set(0, bodyY + 0.0, 0.64);
  mouth.rotation.z = Math.PI;
  g.add(mouth);
  // 两个小鼻孔
  for (const s of [-1, 1]) {
    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.013, 6, 5), black);
    nose.position.set(s * 0.055, bodyY + 0.055, 0.635);
    g.add(nose);
  }

  const scary = buildScaryJaws();
  const scaryBaseScale = 1;
  const scaryBaseY = bodyY - 0.16;
  scary.position.set(0, scaryBaseY, 0.625);
  g.add(scary);

  // 短手（带小手指）
  const arms = [];
  for (const s of [-1, 1]) {
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.062, 0.34, 8), yellow);
    arm.position.set(s * 0.56 * v.bodyScale[0], bodyY - 0.18, 0.06);
    arm.rotation.z = s * 0.75;
    g.add(arm);
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.095, 10, 8), yellow);
    hand.position.y = -0.19;
    arm.add(hand);
    for (let f = -1; f <= 1; f++) {
      const finger = new THREE.Mesh(new THREE.SphereGeometry(0.026, 6, 5), yellow);
      finger.position.set(f * 0.04, -0.075, 0.03);
      hand.add(finger);
    }
    arms.push(arm);
  }
  // 短腿 + 扁脚
  const legs = [];
  for (const s of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.105, 0.09, v.legLen + 0.14, 9), yellow);
    leg.position.set(s * 0.22, (v.legLen + 0.14) / 2, 0);
    g.add(leg);
    const foot = new THREE.Mesh(new THREE.SphereGeometry(0.15, 10, 8), yellow);
    foot.scale.set(1.05, 0.38, 1.5);
    foot.position.set(0, -(v.legLen + 0.14) / 2 + 0.02, 0.08);
    leg.add(foot);
    legs.push(leg);
  }

  const shadow = buildFrogShadow();
  g.add(shadow);

  g.scale.setScalar(v.scale);
  return {
    group: g, body, belly, eyes, arms, legs, mouth, scary, shadow, variant: v,
    modelBased: false, scaryBaseScale, scaryBaseY,
  };
}

class Frog {
  constructor(def, index, world, player, audio, modelTemplate) {
    this.def = def;
    this.index = index;
    this.world = world;
    this.player = player;
    this.audio = audio;
    this.variant = VARIANTS[def.variant];
    this.model = buildFrogModel(def.variant, modelTemplate);
    this.group = this.model.group;
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.facing = 0;
    this.waypoint = null;
    this.repathTimer = Math.random() * 0.2;
    this.state = 'idle';
    this.dazedT = 0;
    this.farT = 0;
    this.coilT = 0;      // 起跳前摇
    this.lungeT = 0;     // 扑击冲刺
    this.recoverT = 0;   // 扑空后的恢复
    this.voiceT = 0;
    this.gain = 0;
    this.yawNoise = Math.random() * Math.PI * 2;
    this.spawn();
    world.group.add(this.group);
  }

  spawn() {
    const [x, , z] = cellCenter(this.def.cell[0], this.def.cell[1]);
    this.homeX = x;
    this.homeZ = z;
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
    // 永远朝你推进：远处用寻路绕墙，近处直接朝人。
    // （2026-11-10 起取消"你不动它才敢靠近"的保距规则：那是"不停就无敌"的来源。）
    let direction = new THREE.Vector3();
    // 非猎手：退回自己的出生点待命，绝不跟着玩家挤成一团
    if (!opts.aggro) {
      direction.set(this.homeX - this.pos.x, 0, this.homeZ - this.pos.z);
      if (direction.lengthSq() < 1.0) direction.set(0, 0, 0);
    } else if (dist > 6.5 && this.waypoint) {
      direction.set(this.waypoint.x - this.pos.x, 0, this.waypoint.z - this.pos.z);
    }
    if (direction.lengthSq() < 0.01) {
      direction.set(this.player.position.x - this.pos.x, 0, this.player.position.z - this.pos.z);
    }
    // 扑击是"锁定方向"的直线冲刺：这是玩家能靠侧身/拐角躲开的唯一依据
    if (this.coilT > 0 || this.lungeT > 0) {
      const a = this.lungeAim ?? 0;
      direction.set(Math.sin(a), 0, Math.cos(a));
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

    // 追击节奏：慢追（3.55，低于步行 4.1，所以一直走就能拉开）
    // → 靠近后蓄力 → 直线扑击（5.3）→ 扑空恢复（2.3）。
    // 扑击是唯一的致命窗口，也是唯一能靠侧身躲掉的东西。
    if (this.coilT > 0) this.coilT -= dt;
    else if (this.lungeT > 0) this.lungeT -= dt;
    else if (this.recoverT > 0) this.recoverT -= dt;

    let speed;
    if (!opts.aggro) {
      // 只负责回位，不扑击
      const back = Math.hypot(this.homeX - this.pos.x, this.homeZ - this.pos.z);
      speed = back > 1.0 ? Math.min(CHASE.chase, 1.8) : 0;
    } else if (this.coilT > 0) speed = 0.15;              // 前摇：几乎站住，给玩家反应时间
    else if (this.lungeT > 0) speed = CHASE.lunge;
    else if (this.recoverT > 0) speed = CHASE.recover;
    else speed = CHASE.chase;
    if (this.coilT <= 0 && this.lungeT <= 0 && this.recoverT <= 0
        && dist < CHASE.lungeRange && dist > 1.5) {
      this.coilT = CHASE.coil;
      this.lungeT = CHASE.lungeTime;
      this.recoverT = CHASE.recoverTime;
      this.lungeAim = Math.atan2(this.player.position.x - this.pos.x, this.player.position.z - this.pos.z);
    }
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

    // 抓到玩家：接触即死，不再要求"玩家站着不动"。
    // 半径分两种：它扑上来时按体型算（小 0.89 / 胖 1.10 / 长腿 0.98）；
    // 平时只是擦身而过时只有 0.62 —— 否则"贴着它走"就必死，四只一挤就是必死局。
    const contact = (this.lungeT > 0 || this.coilT > 0)
      ? 0.55 + this.variant.radius * 0.55
      : 0.62;
    if (dist < contact && opts.grace <= 0) {
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
    const dist = this.distanceToPlayer;
    const walk = speed > 0.2;
    if (dazed) {
      this.group.rotation.z = Math.sin(t * 8) * 0.12;
      if (m.modelBased) m.body.rotation.z = Math.sin(t * 5) * 0.18;
      else m.body.rotation.y = t * 2;
      if (m.eyes) m.eyes.forEach((e, i) => { e.pupil.rotation.z = t * 5 * (i ? 1 : -1); });
      m.scary.visible = false;
      if (m.mouth) m.mouth.visible = true;
      this.group.position.y = this.pos.y + Math.abs(Math.sin(t * 5)) * 0.03;
      return;
    }
    const bob = Math.sin(t * (walk ? 9 : 1.8)) * (walk ? 0.045 : 0.015);
    this.group.position.y = this.pos.y + bob;
    this.group.rotation.z = Math.sin(t * (walk ? 8 : 1.6)) * 0.045;
    if (m.modelBased) {
      // GLB 模型：小跳 + 落地挤压 + 走路摇摆 + 前倾（无独立四肢关节）
      const hop = walk ? Math.abs(Math.sin(t * 9)) : 0;   // 0..1 跳跃周期
      const squash = walk ? Math.sin(t * 18) : 0;          // 落地挤压
      m.body.scale.y = (1 + Math.sin(t * 7) * 0.02) * (1 + hop * 0.12 - Math.max(0, squash) * 0.09);
      m.body.scale.x = (1 - Math.sin(t * 7) * 0.012) * (1 - hop * 0.05 + Math.max(0, squash) * 0.05);
      m.body.scale.z = m.body.scale.x;
      m.body.rotation.z = Math.sin(t * (walk ? 8 : 1.6)) * (walk ? 0.09 : 0.03);
      m.body.rotation.x = walk ? 0.05 + Math.sin(t * 9) * 0.04 : 0;
      // 跳跃整体抬升
      this.group.position.y += walk ? hop * 0.05 : 0;
    } else {
      const baseY = m.variant.bodyScale[1];
      m.body.scale.y = baseY * (1 + Math.sin(t * 7) * (walk ? 0.035 : 0.012));
      m.legs[0].rotation.x = Math.sin(t * 9) * 0.35 * Math.min(1, speed * 0.4);
      m.legs[1].rotation.x = -Math.sin(t * 9) * 0.35 * Math.min(1, speed * 0.4);
      m.arms[0].rotation.x = -Math.sin(t * 9) * 0.3 * Math.min(1, speed * 0.4);
      m.arms[1].rotation.x = Math.sin(t * 9) * 0.3 * Math.min(1, speed * 0.4);
    }
    // 越近越失控：小嘴裂成表情包里的大笑巨口
    const open = this.state === 'chase' && dist < 10.5;
    m.scary.visible = open;
    if (m.mouth) m.mouth.visible = !open;
    if (open) {
      const k = clamp((11 - dist) / 7, 0, 1);
      if (m.modelBased) {
        const s = m.scaryBaseScale * (0.9 + 0.4 * k);
        m.scary.scale.set(s, s, s);
        m.scary.position.y = m.scaryBaseY - 0.05 * k;
      } else {
        m.scary.scale.set(0.8 + 0.35 * k, 0.8 + 0.3 * k, 1);
        m.scary.position.y = m.scaryBaseY;
      }
      if (m.eyes) {
        for (const e of m.eyes) { e.pupil.scale.setScalar(1 + 0.16 * k); e.ring.scale.z = 0.42; }
      }
    } else {
      if (m.eyes) for (const e of m.eyes) e.pupil.scale.setScalar(1);
    }
    if (m.eyes) {
      const blink = (Math.sin(t * 0.7) > 0.985) ? 0.12 : 1;
      for (const e of m.eyes) {
        e.ring.scale.y = blink;
        e.pupil.scale.y = blink;
        e.highlight.scale.y = blink;
      }
    }
  }

  setDazed() {
    this.state = 'dazed';
    this.dazedT = 6;
  }
}

export class FrogManager {
  constructor(world, player, audio, modelTemplate) {
    this.world = world;
    this.player = player;
    this.audio = audio;
    this.frogs = FROG_DEFS.map((d, i) => new Frog(d, i, world, player, audio, modelTemplate));
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

  reset() {
    this.active = false;
    this.grace = 3.2;
    this.nearLineCooldown = 2;
    this.nearest = 99;
    this.danger = 0;
    this.frogs.forEach((f) => {
      f.spawn();
      f.state = 'idle';
      f.farT = 0;
      f.coilT = 0;
      f.lungeT = 0;
      f.recoverT = 0;
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
    this.onActivate?.();
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
    // 只有最近的一只主动猎杀，其余退回出生点待命。
    // 四只全图围猎 + 接触即死 = 必死局（实测机器人固定死在第 12 片）。
    for (const f of this.frogs) {
      f.update(dt, time, {
        active: this.active,
        aggro: true,
        frogs: this.frogs,
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
