// 玩家：第一/第三人称、移动碰撞、体力、手电、脚步
import * as THREE from 'three';
import { PLAYER, SPAWN_CELL, SPAWN_YAW, cellCenter } from './config.js';

const damp = (a, b, lambda, dt) => b + (a - b) * Math.exp(-lambda * dt);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export class Player {
  constructor(camera, world, audio) {
    this.camera = camera;
    this.world = world;
    this.audio = audio;
    this.position = new THREE.Vector3();
    this.velocity = new THREE.Vector3();
    this.yaw = SPAWN_YAW;
    this.pitch = 0;
    this.input = { forward: 0, strafe: 0, sprint: false };
    this.bot = null;
    this.lookEnabled = false;
    this.frozen = false;
    this.firstPerson = true;
    this.speedUnlocked = false;
    this.stamina = PLAYER.staminaMax;
    this.staminaDelay = 0;
    this.walkPhase = 0;
    this.stepDist = 0;
    this.stepIndex = 0;
    this.shake = 0;
    this.shakeT = 0;
    this.fovTarget = 70;
    this.demoSpeedFactor = 1;
    this.flashOn = true;
    this.onFootstep = null;
    this.keys = new Set();
    this.moving = false;
    this.sprinting = false;
    this.buildModel();
    this.buildFlashlight();
    this.bindInput();
  }

  reset() {
    const [x, , z] = cellCenter(SPAWN_CELL[0], SPAWN_CELL[1]);
    this.position.set(x, 0, z);
    this.velocity.set(0, 0, 0);
    this.yaw = SPAWN_YAW;
    this.pitch = 0;
    this.stamina = PLAYER.staminaMax;
    this.staminaDelay = 0;
    this.walkPhase = 0;
    this.stepDist = 0;
    this.frozen = false;
    this.shake = 0;
    this.bot = null;
    this.input.forward = 0;
    this.input.strafe = 0;
    this.input.sprint = false;
    this.model.position.copy(this.position);
    this.model.rotation.y = this.yaw;
    this.updateCamera(0, 0);
  }

  buildModel() {
    const g = new THREE.Group();
    const coat = new THREE.MeshStandardMaterial({ color: 0xe0b44f, roughness: 0.75 });
    const coatDark = new THREE.MeshStandardMaterial({ color: 0xb8862f, roughness: 0.8 });
    const skin = new THREE.MeshStandardMaterial({ color: 0xefc39b, roughness: 0.7 });
    const hair = new THREE.MeshStandardMaterial({ color: 0x2a1d17, roughness: 0.9 });
    const bag = new THREE.MeshStandardMaterial({ color: 0xd97b8a, roughness: 0.85 });
    const shoe = new THREE.MeshStandardMaterial({ color: 0x3b2b24, roughness: 0.9 });

    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.34, 0.85, 10), coat);
    body.position.y = 1.02;
    g.add(body);
    const hem = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.37, 0.12, 10), coatDark);
    hem.position.y = 0.62;
    g.add(hem);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 18, 14), skin);
    head.position.y = 1.6;
    g.add(head);
    const hairCap = new THREE.Mesh(new THREE.SphereGeometry(0.245, 18, 14, 0, Math.PI * 2, 0, Math.PI * 0.55), hair);
    hairCap.position.y = 1.63;
    hairCap.rotation.x = -0.15;
    g.add(hairCap);
    // 兜帽
    const hood = new THREE.Mesh(new THREE.TorusGeometry(0.25, 0.07, 8, 16), coatDark);
    hood.position.y = 1.55;
    hood.rotation.x = Math.PI / 2;
    g.add(hood);
    // 背包
    const pack = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.5, 0.24), bag);
    pack.position.set(0, 1.08, 0.32);
    g.add(pack);
    const packPocket = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.2, 0.08), coatDark);
    packPocket.position.set(0, 0.95, 0.45);
    g.add(packPocket);
    // 腿
    this.legs = [];
    for (const s of [-1, 1]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.08, 0.55, 8), coatDark);
      leg.position.set(s * 0.14, 0.34, 0);
      g.add(leg);
      const foot = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.11, 0.3), shoe);
      foot.position.set(0, -0.28, 0.05);
      leg.add(foot);
      this.legs.push(leg);
    }
    // 手臂
    this.arms = [];
    for (const s of [-1, 1]) {
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.065, 0.55, 8), coat);
      arm.position.set(s * 0.36, 1.08, 0);
      arm.rotation.z = s * 0.06;
      g.add(arm);
      const hand = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 8), skin);
      hand.position.y = -0.29;
      arm.add(hand);
      this.arms.push(arm);
    }
    g.visible = false;
    this.model = g;
    this.modelParts = { body, head, hairCap };
  }

  buildFlashlight() {
    const light = new THREE.SpotLight(0xffe2b8, 13, 22, 0.54, 0.9, 1.5);
    light.position.set(0.22, -0.18, 0.05);
    const target = new THREE.Object3D();
    target.position.set(0, -0.05, -1);
    this.camera.add(light);
    this.camera.add(target);
    light.target = target;
    this.flashlight = light;
  }

  bindInput() {
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      const k = e.key.toLowerCase();
      if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) {
        this.keys.add(k);
        if (k.startsWith('arrow')) e.preventDefault();
      }
      if (k === 'shift') this.keys.add('shift');
    });
    window.addEventListener('keyup', (e) => {
      const k = e.key.toLowerCase();
      this.keys.delete(k);
      if (k === 'shift') this.keys.delete('shift');
    });
    window.addEventListener('blur', () => this.keys.clear());
    document.addEventListener('mousemove', (e) => {
      if (!this.lookEnabled || !document.pointerLockElement) return;
      this.yaw -= e.movementX * PLAYER.mouseSensitivity;
      this.pitch -= e.movementY * PLAYER.mouseSensitivity;
      this.pitch = clamp(this.pitch, -1.3, 1.3);
    });
  }

  setCameraMode(firstPerson) {
    this.firstPerson = firstPerson;
    this.model.visible = !firstPerson;
  }

  addShake(amount) { this.shake = Math.min(1.2, this.shake + amount); }

  get forward() {
    return new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
  }

  update(dt, time) {
    const bot = this.bot;
    if (bot) {
      this.input.forward = bot.forward ?? 1;
      this.input.strafe = bot.strafe ?? 0;
      this.input.sprint = !!bot.sprint;
      const dy = ((bot.yaw - this.yaw + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
      this.yaw += dy * Math.min(1, dt * 7.5);
      this.pitch = bot.pitch ?? 0;
    } else if (this.lookEnabled) {
      const f = (this.keys.has('w') || this.keys.has('arrowup') ? 1 : 0) - (this.keys.has('s') || this.keys.has('arrowdown') ? 1 : 0);
      const r = (this.keys.has('d') || this.keys.has('arrowright') ? 1 : 0) - (this.keys.has('a') || this.keys.has('arrowleft') ? 1 : 0);
      this.input.forward = f;
      this.input.strafe = r;
      this.input.sprint = this.keys.has('shift');
    } else {
      this.input.forward = 0;
      this.input.strafe = 0;
      this.input.sprint = false;
    }

    const frozen = this.frozen;
    const f = frozen ? 0 : this.input.forward;
    const r = frozen ? 0 : this.input.strafe;
    const mag = Math.hypot(f, r);
    const wish = new THREE.Vector3();
    if (mag > 0.01) {
      const yawF = this.forward;
      const yawR = new THREE.Vector3(-yawF.z, 0, yawF.x);
      wish.addScaledVector(yawF, f / mag).addScaledVector(yawR, r / mag);
      wish.normalize();
    }
    const wantMove = wish.lengthSq() > 0.001;
    const canSprint = this.speedUnlocked && this.input.sprint && this.stamina > 1 && wantMove && !frozen;
    const targetSpeed = (canSprint ? PLAYER.sprintSpeed : PLAYER.walkSpeed) * (this.bot ? this.demoSpeedFactor : 1);
    this.sprinting = canSprint;
    this.moving = wantMove && !frozen;

    const accel = wantMove ? (canSprint ? 9 : 13) : 11;
    this.velocity.x = damp(this.velocity.x, wish.x * targetSpeed, accel, dt);
    this.velocity.z = damp(this.velocity.z, wish.z * targetSpeed, accel, dt);

    const res = this.world.moveCircle(this.position, this.velocity.x * dt, this.velocity.z * dt, PLAYER.radius);
    // 被墙挡住时削减速度，避免贴墙抖动
    if (Math.abs(res.movedX) < Math.abs(this.velocity.x * dt) * 0.4) this.velocity.x *= 0.4;
    if (Math.abs(res.movedZ) < Math.abs(this.velocity.z * dt) * 0.4) this.velocity.z *= 0.4;

    const speed = Math.hypot(this.velocity.x, this.velocity.z);
    if (canSprint) {
      this.stamina = Math.max(0, this.stamina - PLAYER.staminaDrain * dt);
      this.staminaDelay = 0.9;
    } else {
      this.staminaDelay = Math.max(0, this.staminaDelay - dt);
      if (this.staminaDelay <= 0) this.stamina = Math.min(PLAYER.staminaMax, this.stamina + PLAYER.staminaRegen * dt);
    }

    if (this.moving && speed > 0.5) {
      this.walkPhase += dt * (this.sprinting ? 11.5 : 7.6);
      this.stepDist += speed * dt;
      const interval = this.sprinting ? 0.34 : 0.46;
      const stepLen = interval * (this.sprinting ? PLAYER.sprintSpeed : PLAYER.walkSpeed);
      if (this.stepDist > stepLen) {
        this.stepDist = 0;
        this.stepIndex ^= 1;
        if (this.onFootstep) this.onFootstep(this.stepIndex, this.sprinting);
      }
    } else {
      this.walkPhase += dt * 1.4;
      this.stepDist = 0;
    }

    this.fovTarget = this.sprinting ? 76 : 70;
    this.camera.fov = damp(this.camera.fov, this.fovTarget, 6, dt);
    this.camera.updateProjectionMatrix();

    this.shake = Math.max(0, this.shake - dt * 1.6);
    this.shakeT += dt;
    this.updateCamera(dt, time);
    this.animateModel(dt, speed);
  }

  updateCamera(dt, time) {
    const bobAmp = this.firstPerson ? 1 : 0.6;
    const bobY = Math.sin(this.walkPhase * 2) * 0.028 * bobAmp * (this.moving ? 1 : 0.15);
    const bobX = Math.cos(this.walkPhase) * 0.02 * bobAmp * (this.moving ? 1 : 0.1);
    const shakeX = (Math.random() - 0.5) * this.shake * 0.09;
    const shakeY = (Math.random() - 0.5) * this.shake * 0.09;
    const head = new THREE.Vector3(this.position.x, PLAYER.eyeHeight + bobY, this.position.z);

    if (this.firstPerson) {
      this.camera.position.set(head.x + bobX + shakeX, head.y + shakeY, head.z);
      this.camera.rotation.order = 'YXZ';
      this.camera.rotation.set(this.pitch + (Math.random() - 0.5) * this.shake * 0.02, this.yaw, Math.sin(this.walkPhase) * 0.006 * bobAmp);
    } else {
      this.model.visible = true;
      const fwd = this.forward;
      const desired = new THREE.Vector3(
        head.x - fwd.x * 3.1 + bobX,
        head.y + 0.55,
        head.z - fwd.z * 3.1,
      );
      const clipped = this.world.clipCamera(head, desired, 0.3);
      const dist = clipped.distanceTo(head);
      this.model.visible = dist > 1.1;
      this.camera.position.copy(clipped);
      this.camera.lookAt(head.x + fwd.x * 1.6, head.y - 0.05, head.z + fwd.z * 1.6);
    }
    this.model.position.copy(this.position);
    this.model.rotation.y = this.yaw;
  }

  animateModel(dt, speed) {
    if (!this.model.visible) return;
    const amp = Math.min(0.65, speed * 0.13);
    const s = Math.sin(this.walkPhase);
    if (this.legs) {
      this.legs[0].rotation.x = s * amp;
      this.legs[1].rotation.x = -s * amp;
    }
    if (this.arms) {
      this.arms[0].rotation.x = -s * amp * 0.8;
      this.arms[1].rotation.x = s * amp * 0.8;
    }
    const breathe = Math.sin(performance.now() * 0.0016) * 0.01;
    if (this.modelParts) this.modelParts.body.position.y = 1.02 + breathe;
  }
}
