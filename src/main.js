// 奶蛙乐园：午夜奶片 — 入口与游戏状态机
import * as THREE from 'three';
import {
  GRID, PLAYER, TOTAL_CANDIES, UNLOCK_MAP_AT, UNLOCK_SPEED_AT,
  cellCenter, MENU_CAM,
} from './config.js';
import { World } from './world.js';
import { Player } from './player.js';
import { FrogManager, loadFrogModelTemplate } from './frogs.js';
import { AudioManager, HALLUCINATION_DURATION } from './audio.js';
import { UI } from './ui.js';
import { Story } from './story.js';
import { Demo } from './demo.js';
import { InternalChannel } from './inspect.js';

const C = GRID.cell;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function loadTextures() {
  try {
    const mod = await import('./textures.js');
    const t = mod.createTextures();
    if (t && t.wallpaper) return t;
  } catch (e) {
    console.warn('[textures] 自定义贴图不可用，使用兜底贴图', e);
  }
  const mod = await import('./textures-fallback.js');
  return mod.createTextures();
}

class Game {
  constructor() {
    this.state = 'loading';
    this.mode = 'human';
    this.collected = new Array(TOTAL_CANDIES).fill(false);
    this.candiesCollected = 0;
    this.mapUnlocked = false;
    this.speedUnlocked = false;
    this.playTime = 0;
    this.grace = 0;
    this.lastFrame = performance.now();
    this.scares = 0;
    this.scareCooldown = 0;
    this.demoReturnTimer = null;
    this.volume = 0.7;
    this.muted = false;
    this.sensMultiplier = 1; // 画面灵敏度倍率（1 = 默认）
    this.pendingMenuMusic = true;
    this.channel = null;   // 内部通道（无怪物体检模式）
    window.__game = this;
    try {
      const v = localStorage.getItem('mfp.volume');
      if (v !== null) this.volume = Math.max(0, Math.min(1, Number(v)));
      this.muted = localStorage.getItem('mfp.muted') === '1';
      const s = localStorage.getItem('mfp.sensitivity');
      if (s !== null) this.sensMultiplier = Math.max(0.2, Math.min(2.5, Number(s)));
    } catch (e) { /* ignore */ }

    this.ui = new UI();
    this.audio = new AudioManager();
    this.setupRenderer();
    this.setupUI();
    this.boot();
    requestAnimationFrame((t) => this.frame(t));
  }

  setupRenderer() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0a0708);
    this.scene.fog = new THREE.FogExp2(0x140c0d, 0.024);
    this.camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.08, 130);
    this.camera.rotation.order = 'YXZ';
    this.scene.add(this.camera);
    try {
      this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    } catch (e) {
      document.body.innerHTML = '<div style="display:grid;place-items:center;height:100vh;background:#000;color:#f0d4a0;font-family:serif;font-size:20px">这个游戏需要 WebGL。请换用最新版 Chrome / Edge。</div>';
      throw e;
    }
    this.pixelRatioCap = Math.min(devicePixelRatio || 1, 1.75);
    this.pixelRatio = this.pixelRatioCap;
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.setSize(innerWidth, innerHeight);
    this.fpsAccum = 0;
    this.fpsFrames = 0;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    document.getElementById('scene').appendChild(this.renderer.domElement);
    this.canvas = this.renderer.domElement;
    window.addEventListener('resize', () => {
      this.camera.aspect = innerWidth / innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(innerWidth, innerHeight);
    });
    this.canvas.addEventListener('click', () => {
      if ((this.state === 'playing' || this.state === 'internal') && !document.pointerLockElement) this.requestLock();
    });
    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('pointerlockchange', () => {
      const locked = document.pointerLockElement === this.canvas;
      this.player.lookEnabled = locked && (this.state === 'playing' || this.state === 'internal');
      if (locked) this.player.onLockAcquire();
      if (!locked && this.state === 'playing') this.pause();
      if (this.state === 'internal') this.channel?.hint?.classList.toggle('hidden', locked);
    });
    window.addEventListener('keydown', (e) => this.onKey(e));
    const suspendOnBlur = () => {
      if (this.state === 'playing') this.pause();
      this.lastFrame = performance.now();
    };
    window.addEventListener('blur', suspendOnBlur);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) suspendOnBlur();
      this.lastFrame = performance.now();
    });
    window.addEventListener('pointerdown', () => this.onFirstGesture(), { once: true });
  }

  setupUI() {
    const ui = this.ui;
    ui.on('click', () => this.audio.playSfx('sfx_click', { gain: 0.5 }));
    ui.on('start', () => this.startHuman());
    ui.on('demo', () => this.startDemo());
    ui.on('help', () => this.openHelp());
    ui.on('helpClose', () => this.closeHelp());
    ui.on('enter', () => this.enterFromReady());
    ui.on('resume', () => this.resume());
    ui.on('restart', () => this.restart());
    ui.on('menu', () => this.goMenu());
    ui.on('replay', () => this.restart());
    ui.on('retry', () => this.restart());
    ui.on('soundToggle', () => this.toggleSound());
    ui.on('volume', (v) => this.setVolume(v));
    ui.on('sensitivity', (v) => this.setSensitivity(v));
    ui.on('pause', () => this.pause());
    ui.on('skip', () => this.skipStory());
    ui.on('internal', () => this.startInternal());
    ui.setVolume(this.volume);
    ui.setSensitivity(this.sensMultiplier);
    ui.setSoundMuted(this.muted);
  }

  async boot() {
    this.ui.setLoading(0.04, '正在布置生日会……');
    await wait(120);
    this.textures = await loadTextures();
    this.ui.setLoading(0.22, '正在画蜡笔画……');
    this.world = new World(this.textures);
    this.scene.add(this.world.group);
    this.ui.setLoading(0.38, '正在摆好蛋糕和蜡烛……');
    this.player = new Player(this.camera, this.world, this.audio);
    this.scene.add(this.player.model);
    this.player.setSensitivity(this.sensMultiplier);
    this.player.onFootstep = (i, sprint) => {
      this.audio.playSfx('sfx_footstep_' + (i + 1), { gain: sprint ? 0.6 : 0.42, rate: 0.92 + Math.random() * 0.16 });
    };
    this.player.onJump = () => this.audio.playSfx('sfx_footstep_1', { gain: 0.5, rate: 1.2 });
    // 预加载奶龙 GLB 模型（失败则回退程序化奶蛙）
    let frogTemplate = null;
    this.ui.setLoading(0.42, '正在给奶蛙换上新装……');
    try { frogTemplate = await loadFrogModelTemplate(); } catch (e) { console.warn('[frog] 模型预加载失败', e); }
    this.frogs = new FrogManager(this.world, this.player, this.audio, frogTemplate);
    this.frogs.onCatch = (f) => this.onCaught(f);
    this.frogs.onActivate = () => {
      if (this.frogAlertShown) return;
      this.frogAlertShown = true;
      this.ui.toast({ kicker: '奶蛙 · 醒来了', title: '它听到你了', sub: '别停下脚步 · 也别被堵住 · 解锁加速后按 SHIFT 可甩开', duration: 5 });
    };
    this.frogs.onNearLine = (line) => {
      if (this.state === 'playing' || this.state === 'demo') {
        this.ui.showSubtitle(line.speaker, line.text, { frog: true, duration: 4.8 });
      }
    };
    this.story = new Story(this.camera, this.world, this.audio, this.ui);
    this.demoGame = {
      collected: this.collected,
      candiesCollected: 0,
      speedUnlocked: false,
      demoReachExit: () => this.demoReachExit(),
    };
    this.demo = new Demo(this.demoGame, this.world, this.player, this.frogs);
    this.ui.setLoading(0.55, '正在叫醒奶蛙……');
    try {
      await this.audio.init((p) => this.ui.setLoading(0.55 + p * 0.4, '正在载入声音……'));
    } catch (e) {
      console.warn('[audio] init failed, continuing silently', e);
    }
    this.ui.setLoading(0.99, '准备就绪');
    this.ui.drawStaticMap(this.world);
    try {
      const face = this.textures.frogFace?.();
      const src = face?.image?.toDataURL?.('image/png');
      if (src) {
        document.getElementById('jumpscare-img').src = src;
        document.querySelectorAll('#hallucination img').forEach(img => { img.src = src; });
      }
    } catch (e) { console.warn('[jumpscare] face texture unavailable', e); }
    this.jumpscareEl = document.getElementById('jumpscare');
    this.resetStage(false);
    this.updateMenuCamera(0);
    await wait(450);
    this.ui.setLoading(1, '欢迎来到奶蛙乐园');
    await wait(350);
    this.ui.hideLoading();
    this.state = 'menu';
    this.ui.showMenu();
    this.ui.setVolume(this.volume);
    this.ui.setSoundMuted(this.muted);
    this.audio.setVolume(this.volume);
    if (this.muted && !this.audio.muted) this.audio.toggleMute();
    this.audio.playMusic('music_menu', { fade: 2.2 });
    this.channel = new InternalChannel(this);
    try {
      const q = new URLSearchParams(location.search);
      if (q.has('channel') || q.get('inspect') === '1') this.startInternal({ instant: true });
    } catch (e) { /* ignore */ }
  }

  onFirstGesture() {
    this.audio.resume();
    if (this.pendingMenuMusic && this.state === 'menu') {
      this.audio.playMusic('music_menu', { fade: 1.4 });
      this.pendingMenuMusic = false;
    }
  }

  // ---------------- 状态控制 ----------------
  resetStage(demo = false) {
    this.mode = demo ? 'demo' : 'human';
    this.collected.fill(false);
    this.candiesCollected = 0;
    this.mapUnlocked = false;
    this.speedUnlocked = false;
    this.playTime = 0;
    this.san = 100;
    this.milkUnlocked = false;
    this.milkCooldown = 0;
    this.hallucinationTriggered = [false, false];
    this.stopHallucination();
    this.world.resetDragonMilk();
    this.ui.setSan(this.san, false, 0);
    this.grace = demo ? 99 : 2.5;
    this.scares = 0;
    this.scareCooldown = 0;
    this.lowStaminaShown = false;
    this.frogAlertShown = false;
    this.reachedExitPrompt = false;
    this.demoGame.candiesCollected = 0;
    this.demoGame.speedUnlocked = false;
    this.player.reset();
    this.player.speedUnlocked = false;
    this.player.frozen = false;
    this.player.setCameraMode(true);
    this.player.flashOn = true;
    this.player.flashlight.visible = true;
    this.player.bot = null;
    this.player.demoSpeedFactor = demo ? 1.42 : 1;
    this.player.lookEnabled = false;
    this.frogs.reset({ demo });
    for (const c of this.world.candies) {
      c.collected = false;
      c.group.visible = true;
      c.group.rotation.set(0, 0, 0);
      c.group.position.y = c.baseY;
    }
    this.world.exitUnlocked = false;
    this.world.exitOpenT = 0;
    for (const p of this.world.exitPanels) {
      p.hinge.rotation.y = 0;
      p.panelMat.emissiveIntensity = 0.35;
    }
    this.world.exitGlowPlane.material.opacity = 0;
    this.world.exitLight.intensity = 2.5;
    this.ui.clearHud();
    this.ui.setCandies(0);
    this.ui.setDanger(0);
    this.ui.hideResults();
    this.ui.hidePause();
    this.ui.hideHelp();
    this.ui.hideInteract();
    this.ui.setPointerHint(false);
    this.ui.hideSubtitle();
    this.ui.setDemo(false);
    this.jumpscareEl?.classList.add('hidden');
    if (this.demo) this.demo.stop();
  }

  async startHuman() {
    if (this.state !== 'menu' || this._starting) return;
    this._starting = true;
    this.pendingMenuMusic = false;
    await this.audio.resume();
    this.audio.playSfx('sfx_start_sting', { gain: 0.9 });
    this.audio.stopMusic(0.5);
    this.ui.flash();
    this.ui.fadeOut(700);
    await wait(750);
    this.resetStage(false);
    this.state = 'story';
    this.ui.showStory();
    const p = this.story.play();
    this.ui.fadeIn(1000);
    await p;
    this.state = 'ready';
    this.ui.showReady();
    this.player.updateCamera(0, 0);
    this.audio.playMusic('music_story', { fade: 1.5 });
    this._starting = false;
  }

  // ---------------- 内部通道（无怪物体检模式） ----------------
  async startInternal({ instant = false } = {}) {
    if (this._starting) return;
    if (!instant && this.state !== 'menu') return;
    this._starting = true;
    this.pendingMenuMusic = false;
    this.ui.el.menu.classList.add('hidden');
    this.ui.hideLoading();
    if (!instant) await this.ui.fadeOut(320);
    this.resetStage(false);       // 重置奶片/龙奶/出口，但随后奶蛙会被通道藏起来
    this.channel.enter();
    if (!instant) await this.ui.fadeIn(320);
    this._starting = false;
  }

  leaveInternal() {
    if (this.state !== 'internal') return false;
    this.channel?.exit();
    this.goMenu();
    return true;
  }

  async startDemo() {
    if (this.state !== 'menu' || this._starting) return;
    this._starting = true;
    this.pendingMenuMusic = false;
    await this.audio.resume();
    this.audio.playSfx('sfx_click', { gain: 0.6 });
    await this.ui.fadeOut(650);
    this.ui.el.menu.classList.add('hidden');
    this.ui.el.loading.classList.add('hidden');
    this.resetStage(true);
    this.enterPlay(true);
    this.ui.fadeIn(650);
    this.state = 'demo';
    this._starting = false;
  }

  skipStory() {
    if (this.state === 'story') this.story.skip();
  }

  enterFromReady() {
    if (this.state !== 'ready') return;
    this.audio.stopVoice();
    this.enterPlay(false);
  }

  enterPlay(demo) {
    this.state = demo ? 'demo' : 'playing';
    this.lastFrame = performance.now();
    this.mode = demo ? 'demo' : 'human';
    this.ui.showHud();
    this.ui.setDemo(demo);
    this.player.setCameraMode(true);
    this.player.lookEnabled = !demo;
    this.audio.resume();
    this.audio.playMusic('amb_game', { fade: 1.8, gain: 0.42 });
    this.audio.playSfx('sfx_click', { gain: 0.5 });
    if (demo) {
      this.demo.start();
      this.ui.toast({ kicker: 'DEMO · 演示模式', title: '自动游玩', sub: '真实游戏运行中 · 无需操作 · 按 ESC 退出', duration: 3.6 });
    } else {
      this.requestLock();
      this.grace = 2.5;
      this.ui.toast({ kicker: '第 1 夜 · 22:07', title: '找到八片奶片', sub: 'WASD 移动 · 鼠标环视 · ESC 暂停 · M 静音', duration: 5.2 });
    }
  }

  requestLock() {
    try {
      const p = this.canvas.requestPointerLock?.();
      if (p && p.catch) p.catch(() => {});
    } catch (e) { /* ignore */ }
  }

  pause() {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    this.audio.stopHallucination();
    this.player.lookEnabled = false;
    this.player.keys.clear();
    this.player.velocity.set(0, 0, 0);
    this.audio.setHeartbeat(0);
    for (let i = 0; i < 4; i++) this.audio.setFrogVoice(i, { gain: 0 });
    if (document.pointerLockElement) document.exitPointerLock();
    this.ui.showPause();
  }

  async resume() {
    if (this.state !== 'paused') return;
    this.ui.hidePause();
    this.state = 'playing';
    this.player.lookEnabled = true;
    this.grace = Math.max(this.grace, 1.2);
    await this.audio.resume();
    this.lastFrame = performance.now();
    if (this.hallucination) this.audio.startHallucination(this.hallucination.level, this.hallucination.elapsed);
    this.requestLock();
  }

  restart() {
    const wasPaused = this.state === 'paused';
    this.ui.hidePause();
    this.ui.hideResults();
    this.resetStage(false);
    this.enterPlay(false);
  }

  goMenu() {
    if (this.state === 'internal') { this.channel?.exit(); }
    this.demo.stop();
    this.player.bot = null;
    this.player.lookEnabled = false;
    this.player.frozen = false;
    if (document.pointerLockElement) document.exitPointerLock();
    this.audio.stopMusic(0.4);
    this.audio.stopVoice();
    this.audio.setHeartbeat(0);
    for (let i = 0; i < this.frogs.frogs.length; i++) this.audio.setFrogVoice(i, { gain: 0 });
    this.audio.stopSfx();
    this.audio.playMusic('music_menu', { fade: 1.6 });
    this.ui.hidePause();
    this.ui.hideResults();
    this.ui.showMenu();
    this.state = 'menu';
    this.mode = 'human';
    this.resetStage(false);
    this.updateMenuCamera(0);
    this.ui.fadeIn(500);
    this.audio.resume();
  }

  openHelp() {
    if (this.state !== 'menu') return;
    this.helpPrev = 'menu';
    this.ui.el.menu.classList.add('hidden');
    this.ui.showHelp();
  }
  closeHelp() {
    this.ui.hideHelp();
    if (this.state === 'menu') this.ui.showMenu();
  }

  // ---------------- 事件 ----------------
  onKey(e) {
    const k = e.key.toLowerCase();
    if (this.state === 'internal') {
      if (k === 'm') this.toggleSound();
      this.channel?.onKey(e);
      return;
    }
    if (this.state === 'story') {
      this.skipStory();
      return;
    }
    if (k === 'm') this.toggleSound();
    if (this.state === 'help' || !this.ui.el.help.classList.contains('hidden')) {
      if (k === 'escape' || k === 'enter') this.closeHelp();
      return;
    }
    if (this.state === 'demo') {
      if (k === 'escape') this.goMenu();
      return;
    }
    if (this.state === 'win' || this.state === 'lose' || this.state === 'caught') return;
    if (this.state === 'paused') {
      if (k === 'escape') this.resume();
      return;
    }
    if (this.state === 'playing') {
      if (k === 'escape') { this.pause(); return; }
      if (k === 'v') {
        this.player.setCameraMode(!this.player.firstPerson);
        this.ui.toast({ kicker: '视角', title: this.player.firstPerson ? '第一人称' : '第三人称', sub: this.player.firstPerson ? '主角形象已隐藏' : '按 V 切回第一人称', duration: 2.2 });
      }
      if (k === 'f') {
        this.player.flashOn = !this.player.flashOn;
        this.player.flashlight.visible = this.player.flashOn;
        this.audio.playSfx('sfx_click', { gain: 0.4 });
      }
      if (k === 'e') this.tryInteract();
    }
  }

  toggleSound() {
    const muted = this.audio.toggleMute();
    this.ui.setSoundMuted(muted);
    try { localStorage.setItem('mfp.muted', muted ? '1' : '0'); } catch (e) { /* ignore */ }
  }
  setVolume(v) {
    this.volume = v;
    this.audio.setVolume(v);
    this.ui.setVolume(v);
    try { localStorage.setItem('mfp.volume', String(v)); } catch (e) { /* ignore */ }
  }

  setSensitivity(mult) {
    this.sensMultiplier = Math.max(0.2, Math.min(2.5, Number(mult) || 1));
    this.player?.setSensitivity(this.sensMultiplier);
    this.ui.setSensitivity(this.sensMultiplier);
    try { localStorage.setItem('mfp.sensitivity', String(this.sensMultiplier)); } catch (e) { /* ignore */ }
  }

  // ---------------- 捡拾 / 解锁 ----------------
  collectCandy(c) {
    if (c.collected) return;
    c.collected = true;
    c.group.visible = false;
    this.collected[c.index] = true;
    this.candiesCollected++;
    this.demoGame.candiesCollected = this.candiesCollected;
    this.ui.setCandies(this.candiesCollected);
    this.ui.pickupPulse();
    this.audio.playSfx('sfx_pickup', { gain: 0.8, pan: (Math.random() - 0.5) * 0.6 });
    this.frogs.activate();
    this.grace = Math.max(this.grace, 0.7);
    if (this.candiesCollected === UNLOCK_MAP_AT) this.unlockMap();
    if (this.candiesCollected === UNLOCK_SPEED_AT) this.unlockSpeed();
    if (this.candiesCollected === TOTAL_CANDIES) this.openExit();
  }

  unlockMap() {
    this.mapUnlocked = true;
    this.ui.unlockMap(this.world.candies);
    this.ui.toast({ kicker: '获得道具 · ITEM', title: '乐园地图', sub: '平面图已展开 · 红色光点代表它们', duration: 5 });
    this.audio.playSfx('sfx_unlock_map', { gain: 0.85 });
    this.ui.setObjective('地图已解锁 · 继续寻找奶片');
  }
  unlockSpeed() {
    this.speedUnlocked = true;
    this.demoGame.speedUnlocked = true;
    this.player.speedUnlocked = true;
    this.ui.unlockSpeed();
    this.ui.toast({ kicker: '获得道具 · ITEM', title: '加速 · 糖分', sub: '按住 SHIFT 冲刺 · 可以把它们甩开', duration: 5.2 });
    this.audio.playSfx('sfx_unlock_speed', { gain: 0.85 });
    this.ui.setObjective('加速已解锁 · 甩开它们');
  }
  openExit() {
    this.world.exitUnlocked = true;
    this.ui.toast({ kicker: '出口 · EXIT', title: '安全出口已开启', sub: '前往出口厅 · 按 E 离开乐园', duration: 5.5 });
    this.audio.playSfx('sfx_exit_open', { gain: 0.9 });
    this.ui.setObjective('出口已打开 · 离开乐园');
  }

  tryInteract() {
    const ex = this.world.exitInfo;
    const d = Math.hypot(this.player.position.x - ex.x, this.player.position.z - ex.z);
    if (d < 2.9) {
      if (this.candiesCollected >= TOTAL_CANDIES) this.win(false);
      else {
        this.audio.playSfx('sfx_click', { gain: 0.5 });
        this.ui.toast({ kicker: '出口 · LOCKED', title: '门被锁住了', sub: `还差 ${TOTAL_CANDIES - this.candiesCollected} 片奶片`, duration: 2.6 });
      }
    }
  }

  stopHallucination(keepAudio = false) {
    if (!keepAudio) this.audio?.stopHallucination();
    this.hallucination = null;
    const el = document.getElementById('hallucination');
    if (el) { el.classList.add('hidden'); el.style.opacity = '0'; }
  }

  startHallucination(level) {
    this.stopHallucination();
    this.hallucination = { level, elapsed: 0 };
    document.getElementById('hallucination').classList.remove('hidden');
    this.audio.startHallucination(level);
  }

  updateSan(dt) {
    this.milkCooldown = Math.max(0, this.milkCooldown - dt);
    let remaining = Math.max(0, dt);
    // 两次幻觉各 7 秒，总耗时保持 120 秒。
    const decayTime = (120 - 2 * HALLUCINATION_DURATION) / Math.log(2);
    // 拆分跨阈值和幻觉结束的时间，保证低帧率下仍按正确顺序触发。
    while (remaining > 1e-9 && this.san > 0) {
      if (this.hallucination) {
        const h = this.hallucination;
        const step = Math.min(remaining, HALLUCINATION_DURATION - h.elapsed);
        h.elapsed += step;
        remaining -= step;
        if (h.elapsed >= HALLUCINATION_DURATION - 1e-9) this.stopHallucination(true);
        else {
          const el = document.getElementById('hallucination');
          const visualTime = h.elapsed;
          const envelope = Math.max(0, Math.min(1, visualTime / 1.5, (HALLUCINATION_DURATION - visualTime) / 1.5));
          el.style.opacity = String((h.level > 0.2 ? 0.8 : 0.55) * envelope);
          el.querySelectorAll('img').forEach((img, i) => {
            const tick = Math.floor(visualTime * (3.3 + i * 0.27) + i * 1.7);
            img.style.opacity = tick % 5 < (h.level > 0.2 ? 3 : 2) ? String(0.35 + (tick % 3) * 0.22) : '0';
          });
        }
        continue;
      }
      const threshold = !this.hallucinationTriggered[0] ? 20 : !this.hallucinationTriggered[1] ? 10 : 0;
      const timeToThreshold = this.san > threshold ? decayTime * Math.log((this.san + 100) / (threshold + 100)) : 0;
      if (remaining >= timeToThreshold) {
        this.san = threshold;
        remaining -= timeToThreshold;
        if (threshold === 0) break;
        const index = threshold === 20 ? 0 : 1;
        this.hallucinationTriggered[index] = true;
        this.startHallucination(index === 0 ? 0.2 : 0.8);
      } else {
        this.san = Math.max(0, (this.san + 100) * Math.exp(-remaining / decayTime) - 100);
        remaining = 0;
      }
    }
    if (!this.milkUnlocked && this.san <= 50) {
      this.milkUnlocked = true;
      this.world.unlockDragonMilk();
      this.ui.toast({ kicker: '意识 · 龙奶', title: '龙奶出现了', sub: '寻找隐藏的玻璃瓶 · 恢复 20% 意识值', duration: 5 });
    }
    if (this.san <= 0) {
      this.ui.setSan(0, this.milkUnlocked, this.milkCooldown);
      this.onCaught(null, 'san');
      return;
    }
    if (this.milkUnlocked && this.milkCooldown <= 0) {
      const milk = this.world.getNearbyDragonMilk(this.player.position);
      if (milk) {
        this.world.collectDragonMilk(milk);
        this.san = Math.min(100, this.san + 20);
        this.milkCooldown = 10;
        this.audio.playSfx('sfx_pickup', { gain: 0.8 });
        this.ui.pickupPulse();
        this.ui.toast({ kicker: '龙奶 · 已拾取', title: '意识值恢复 20%', sub: '下一次拾取需等待 10 秒', duration: 3 });
      }
    }
    this.ui.setSan(this.san, this.milkUnlocked, this.milkCooldown);
  }

  onCaught(frog, reason = 'caught') {
    if (this.state !== 'playing' || (reason !== 'san' && this.grace > 0)) return;
    this.stopHallucination();
    this.state = 'caught';
    this.player.frozen = true;
    this.player.lookEnabled = false;
    if (frog) {
      const dx = frog.pos.x - this.player.position.x;
      const dz = frog.pos.z - this.player.position.z;
      this.player.yaw = Math.atan2(-dx, -dz);
      this.player.pitch = -0.22;
    }
    this.player.addShake(1.1);
    this.audio.stopMusic(0.5);
    this.audio.playSfx('sfx_screech', { gain: 1 });
    this.audio.playSfx('nailong_catch', { gain: 1.0, delay: 0.4 });
    this.ui.flash();
    this.ui.setDanger(1);
    this.ui.showSubtitle('奶蛙', '找到你了。', { frog: true, duration: 2.6 });
    this.jumpscareEl?.classList.remove('hidden');
    if (document.pointerLockElement) document.exitPointerLock();
    setTimeout(() => {
      if (this.state !== 'caught') return;
      this.state = 'lose';
      this.jumpscareEl?.classList.add('hidden');
      this.ui.showLose(reason);
      this.audio.stopMusic(0.4);
    this.audio.stopVoice();
    this.audio.setHeartbeat(0);
    for (let i = 0; i < this.frogs.frogs.length; i++) this.audio.setFrogVoice(i, { gain: 0 });
    }, 2400);
  }

  async win(isDemo) {
    if (this.state !== 'playing' && this.state !== 'demo') return;
    this.stopHallucination();
    this.state = 'winFade';
    this.player.frozen = true;
    this.player.lookEnabled = false;
    this.player.bot = null;
    this.demo.stop();
    if (document.pointerLockElement) document.exitPointerLock();
    this.audio.stopMusic(0.4);
    this.audio.stopVoice();
    this.audio.setHeartbeat(0);
    for (let i = 0; i < this.frogs.frogs.length; i++) this.audio.setFrogVoice(i, { gain: 0 });
    this.audio.playSfx(isDemo ? 'sfx_win' : 'sfx_win', { gain: 0.9 });
    this.ui.flash();
    await this.ui.fadeOut(1500);
    this.state = 'win';
    const mins = Math.floor(this.playTime / 60);
    const secs = Math.floor(this.playTime % 60).toString().padStart(2, '0');
    this.ui.showWin([
      { value: mins + ':' + secs, label: '存活时间' },
      { value: this.candiesCollected + ' / 8', label: '奶片' },
      { value: String(this.scares), label: '惊险时刻' },
    ]);
    this.ui.fadeIn(1200);
    this.audio.playMusic('music_menu', { fade: 2.5, gain: 0.3 });
    if (isDemo) {
      clearTimeout(this.demoReturnTimer);
      this.demoReturnTimer = setTimeout(() => { if (this.state === 'win') this.goMenu(); }, 5200);
    }
  }

  demoReachExit() {
    if (this.state !== 'demo') return;
    this.win(true);
  }

  applyAtmosphere(state) {
    if (!this.renderer) return;
    if (state === 'menu' || state === 'loading') {
      this.renderer.toneMappingExposure = 1.24;
      this.scene.fog.density = 0.019;
      this.scene.fog.color.setHex(0x1a0f0f);
    } else if (state === 'story') {
      this.renderer.toneMappingExposure = 1.12;
      this.scene.fog.density = 0.024;
      this.scene.fog.color.setHex(0x140c0d);
    } else {
      this.renderer.toneMappingExposure = 1.04;
      this.scene.fog.density = 0.026;
      this.scene.fog.color.setHex(0x120b0c);
    }
  }

  updateMenuCamera(t) {
    this.applyAtmosphere('menu');
    const baseX = MENU_CAM.pos[0] * C, baseY = MENU_CAM.pos[1], baseZ = MENU_CAM.pos[2] * C;
    const lookX = MENU_CAM.look[0] * C, lookY = MENU_CAM.look[1], lookZ = MENU_CAM.look[2] * C;
    const sway = Math.sin(t * 0.16) * 0.55;
    const sway2 = Math.cos(t * 0.21) * 0.35;
    this.camera.position.set(baseX + sway, baseY + Math.sin(t * 0.33) * 0.035, baseZ + sway2);
    this.camera.lookAt(lookX + sway * 0.4, lookY + Math.sin(t * 0.4) * 0.02, lookZ);
    this.camera.fov = 58;
    this.camera.updateProjectionMatrix();
  }

  // ---------------- 每帧 ----------------
  frame(now) {
    requestAnimationFrame((t) => this.frame(t));
    const rawDt = Math.max(0, (now - this.lastFrame) / 1000);
    const dt = Math.min(0.05, rawDt);
    this.lastFrame = now;
    const t = now / 1000;
    if (!this.world) return;

    // 低端 GPU 自适应分辨率：低于 42fps 降像素比，高于 57fps 逐步恢复
    this.fpsAccum += rawDt;
    this.fpsFrames++;
    if (this.fpsAccum > 2.0 && this.fpsFrames > 20) {
      const fps = this.fpsFrames / this.fpsAccum;
      if (fps < 42 && this.pixelRatio > 1.0) {
        this.pixelRatio = Math.max(1.0, this.pixelRatio - 0.2);
        this.renderer.setPixelRatio(this.pixelRatio);
        this.renderer.setSize(innerWidth, innerHeight);
      } else if (fps > 57 && this.pixelRatio < this.pixelRatioCap) {
        this.pixelRatio = Math.min(this.pixelRatioCap, this.pixelRatio + 0.1);
        this.renderer.setPixelRatio(this.pixelRatio);
        this.renderer.setSize(innerWidth, innerHeight);
      }
      this.fpsAccum = 0;
      this.fpsFrames = 0;
    }

    this.world.update(dt, t);

    if (this.state === 'menu' || this.state === 'loading') {
      this.updateMenuCamera(t);
      for (const f of this.frogs?.frogs || []) f.animate(dt, t, 0, false);
    } else if (this.state === 'story') {
      this.applyAtmosphere('story');
      this.story.update(dt);
    } else if (this.state === 'ready') {
      // 轻微呼吸镜头
      this.player.updateCamera(0, t);
    } else if (this.state === 'playing' || this.state === 'demo') {
      this.applyAtmosphere('play');
      if (this.state === 'playing' && !document.hidden && document.hasFocus()) {
        this.updateSan(rawDt);
      }
      if (this.state === 'playing' || this.state === 'demo') this.updatePlay(dt, t);
    } else if (this.state === 'internal') {
      this.channel.update(dt, t);
    } else if (this.state === 'paused') {
      // 冻结
    } else if (this.state === 'caught') {
      this.player.updateCamera(dt, t);
    } else if (this.state === 'win' || this.state === 'lose') {
      this.camera.position.x += Math.sin(t * 0.3) * 0.0005;
    }

    this.renderer.render(this.scene, this.camera);
  }

  updatePlay(dt, t) {
    this.playTime += dt;
    this.grace = Math.max(0, this.grace - dt);
    this.scareCooldown = Math.max(0, this.scareCooldown - dt);

    if (this.mode === 'demo') this.demo.update(dt);
    this.player.update(dt, t);
    const info = this.frogs.update(dt, t, { demo: this.mode === 'demo', grace: this.grace });

    // 拾取
    for (const c of this.world.candies) {
      if (c.collected) continue;
      const d = Math.hypot(this.player.position.x - c.group.position.x, this.player.position.z - c.group.position.z);
      if (d < 1.22) this.collectCandy(c);
    }

    // HUD
    this.ui.setPointerHint(this.mode === 'human' && !document.pointerLockElement);
    this.ui.setStamina(this.player.stamina);
    if (this.player.speedUnlocked && this.player.stamina < 25 && !this.lowStaminaShown) {
      this.lowStaminaShown = true;
      this.ui.toast({ kicker: '糖分 · 不足', title: '体力见底了', sub: '松开 SHIFT 停下恢复 · 糖分会自动回满', duration: 3.6 });
    }
    this.ui.setDanger(info.danger);
    if (info.danger > 0.62 && this.scareCooldown <= 0) {
      this.scareCooldown = 6;
      this.scares++;
      this.player.addShake(0.14);
    }
    if (info.nearest < 4.2 && this.mode === 'human') this.player.addShake(dt * 0.16);
    if (this.player.sprinting && !this.wasSprinting) this.audio.playSfx('sfx_sprint', { gain: 0.5 });
    this.wasSprinting = this.player.sprinting;

    // 地图
    if (this.mapUnlocked) {
      this.minimapTimer = (this.minimapTimer || 0) + dt;
      if (this.minimapTimer > 0.12) {
        this.minimapTimer = 0;
        this.ui.drawMinimap({
          x: this.player.position.x, z: this.player.position.z, yaw: this.player.yaw,
          frogs: this.frogs.frogs.map((f) => ({ x: f.pos.x, z: f.pos.z, dist: f.distanceToPlayer })),
          candies: this.world.candies,
        });
      }
    }

    // 出口交互提示
    const ex = this.world.exitInfo;
    const distExit = Math.hypot(this.player.position.x - ex.x, this.player.position.z - ex.z);
    if (distExit < 2.9) {
      if (this.candiesCollected >= TOTAL_CANDIES) {
        this.ui.showInteract('<kbd>E</kbd> 离开乐园');
        if (this.mode === 'demo' && this.player.bot === null) this.demoReachExit();
      } else {
        this.ui.showInteract(`出口锁着 · 还差 ${TOTAL_CANDIES - this.candiesCollected} 片奶片`);
      }
    } else {
      this.ui.hideInteract();
    }

    // 演示模式状态提示
    if (this.mode === 'demo' && this.demo.reachedExit && this.state === 'demo') {
      this.player.bot = null;
    }
  }
}

window.addEventListener('DOMContentLoaded', () => {
  const game = new Game();
  // QA 挂钩：只有带 ?debug=1 时才暴露实例，方便自动化脚本核对镜头路径与碰撞，正常游玩不受影响。
  try {
    if (new URLSearchParams(location.search).has('debug')) window.__mfp = game;
  } catch (e) { /* ignore */ }
});
