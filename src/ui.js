// UI：屏幕切换、HUD、小地图、字幕、提示、转场
import { TOTAL_CANDIES, UNLOCK_MAP_AT, UNLOCK_SPEED_AT, ZONE_NAMES } from './config.js';

const $ = (id) => document.getElementById(id);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

export class UI {
  constructor() {
    this.el = {
      hud: $('hud'), menu: $('menu'), story: $('story'), ready: $('ready'),
      pause: $('pause'), help: $('help'), win: $('win'), lose: $('lose'),
      loading: $('loading'), loadingFill: $('loading-fill'), loadingStatus: $('loading-status'),
      fade: $('fade'), flash: $('flash'), demoBanner: $('demo-banner'),
      objective: $('objective-text'), candyProgress: $('candy-progress'),
      minimapWrap: $('minimap-wrap'), minimap: $('minimap'),
      staminaWrap: $('stamina-wrap'), staminaFill: $('stamina-fill'),
      itemMap: $('item-map'), itemSpeed: $('item-speed'),
      subtitles: $('subtitles'), subSpeaker: $('sub-speaker'), subText: $('sub-text'),
      danger: $('danger-tint'), proximity: $('proximity-warning'),
      interact: $('interact-prompt'), toasts: $('toasts'),
      pointerHint: $('pointer-hint'), pickupFlash: $('pickup-flash'),
      storyLine: $('story-line'), storyChapter: $('story-chapter'), storyCaption: $('story-caption'),
      storyProgress: $('story-progress'), storySkip: $('story-skip'),
      winStats: $('win-stats'), volume: $('volume'), pauseVolume: $('pause-volume'),
      mute: $('btn-mute'), pauseMute: $('btn-pause-mute'), sound: $('btn-sound'),
    };
    this.hooks = {};
    this.candies = 0;
    this.mapUnlocked = false;
    this.speedUnlocked = false;
    this.subVisible = false;
    this.subTimer = 0;
    this.minimapStatic = null;
    this.minimapTimer = 0;
    this.bindDiamonds();
    this.bindButtons();
  }

  on(name, fn) { this.hooks[name] = fn; }
  emit(name, ...args) { this.hooks[name]?.(...args); }

  bindDiamonds() {
    this.el.candyProgress.innerHTML = '';
    this.diamonds = [];
    for (let i = 0; i < TOTAL_CANDIES; i++) {
      const d = document.createElement('i');
      this.el.candyProgress.appendChild(d);
      this.diamonds.push(d);
    }
  }

  bindButtons() {
    const click = (id, fn) => { const el = $(id); if (el) el.addEventListener('click', () => { this.emit('click'); fn(); }); };
    click('btn-start', () => this.emit('start'));
    click('btn-demo', () => this.emit('demo'));
    click('btn-help', () => this.emit('help'));
    click('btn-help-close', () => this.emit('helpClose'));
    click('btn-enter', () => this.emit('enter'));
    click('btn-resume', () => this.emit('resume'));
    click('btn-restart', () => this.emit('restart'));
    click('btn-menu', () => this.emit('menu'));
    click('btn-win-replay', () => this.emit('replay'));
    click('btn-win-menu', () => this.emit('menu'));
    click('btn-lose-retry', () => this.emit('retry'));
    click('btn-lose-menu', () => this.emit('menu'));
    click('btn-sound', () => this.emit('soundToggle'));
    click('btn-mute', () => this.emit('soundToggle'));
    click('btn-pause-mute', () => this.emit('soundToggle'));
    click('btn-pause', () => this.emit('pause'));
    $('volume').addEventListener('input', (e) => this.emit('volume', Number(e.target.value) / 100));
    $('pause-volume').addEventListener('input', (e) => this.emit('volume', Number(e.target.value) / 100));
    this.el.storySkip.addEventListener('click', () => this.emit('skip'));
    window.addEventListener('keydown', (e) => {
      if (this.storyVisible) this.emit('skip');
    });
  }

  // ---------------- 加载与转场 ----------------
  setLoading(p, text) {
    this.el.loadingFill.style.width = Math.round(p * 100) + '%';
    if (text) this.el.loadingStatus.textContent = text;
  }
  hideLoading() { this.el.loading.classList.add('hidden'); }
  async fadeOut(ms = 700) {
    this.el.fade.style.transitionDuration = ms + 'ms';
    this.el.fade.classList.add('on');
    await wait(ms);
  }
  async fadeIn(ms = 700) {
    this.el.fade.style.transitionDuration = ms + 'ms';
    this.el.fade.classList.remove('on');
    await wait(ms);
  }
  flash() {
    this.el.flash.classList.remove('hit');
    void this.el.flash.offsetWidth;
    this.el.flash.classList.add('hit');
  }

  // ---------------- 屏幕 ----------------
  screen(name) {
    const map = {
      menu: this.el.menu, story: this.el.story, ready: this.el.ready,
      pause: this.el.pause, help: this.el.help, win: this.el.win, lose: this.el.lose,
    };
    for (const [k, el] of Object.entries(map)) {
      if (!el) continue;
      if (k === name || (name === 'help' && k === 'pause')) el.classList.remove('hidden');
      else el.classList.add('hidden');
    }
    this.storyVisible = name === 'story';
    if (name === 'menu') { this.el.menu.classList.remove('hidden'); this.el.hud.classList.add('hidden'); }
  }
  showMenu() { this.screen('menu'); this.el.demoBanner.classList.add('hidden'); this.clearHud(); }
  showStory() { this.el.menu.classList.add('hidden'); this.el.hud.classList.add('hidden'); this.screen('story'); }
  showReady() { this.screen('ready'); }
  showHud() { this.el.hud.classList.remove('hidden'); this.el.ready.classList.add('hidden'); }
  hideHud() { this.el.hud.classList.add('hidden'); }
  showPause() { this.el.pause.classList.remove('hidden'); }
  hidePause() { this.el.pause.classList.add('hidden'); }
  showHelp() { this.el.help.classList.remove('hidden'); }
  hideHelp() { this.el.help.classList.add('hidden'); }
  showWin(stats) {
    this.el.hud.classList.add('hidden');
    this.el.win.classList.remove('hidden');
    if (stats && this.el.winStats) {
      this.el.winStats.innerHTML = stats.map((s) => `<div><div class="v">${s.value}</div><div class="k">${s.label}</div></div>`).join('');
    }
  }
  showLose() { this.el.hud.classList.add('hidden'); this.el.lose.classList.remove('hidden'); }
  hideResults() { this.el.win.classList.add('hidden'); this.el.lose.classList.add('hidden'); }
  setDemo(on) { this.el.demoBanner.classList.toggle('hidden', !on); }

  clearHud() {
    this.el.objective.textContent = '取回你的 8 片奶片';
    this.diamonds.forEach((d) => d.classList.remove('on'));
    this.el.minimapWrap.classList.add('hidden');
    this.el.staminaWrap.classList.add('hidden');
    this.el.itemMap.className = 'item locked';
    this.el.itemSpeed.className = 'item locked';
    this.el.itemMap.querySelector('.item-lock').textContent = '未解锁';
    this.el.itemSpeed.querySelector('.item-lock').textContent = '未解锁';
    this.el.subtitles.classList.remove('show');
    this.el.proximity.classList.add('hidden');
    this.el.interact.classList.add('hidden');
    this.el.danger.style.opacity = '0';
    this.el.toasts.innerHTML = '';
    this.candies = 0;
    this.mapUnlocked = false;
    this.speedUnlocked = false;
  }

  // ---------------- HUD ----------------
  setObjective(text) { this.el.objective.textContent = text; }
  setCandies(n) {
    this.candies = n;
    this.diamonds.forEach((d, i) => d.classList.toggle('on', i < n));
    if (n < UNLOCK_MAP_AT) this.setObjective(`取回你的奶片 · ${n} / ${TOTAL_CANDIES}`);
    else if (n < UNLOCK_SPEED_AT) this.setObjective(`继续寻找奶片 · ${n} / ${TOTAL_CANDIES}`);
    else if (n < TOTAL_CANDIES) this.setObjective(`只剩 ${TOTAL_CANDIES - n} 片 · 前往安全出口`);
    else this.setObjective('出口已打开 · 离开乐园');
  }
  unlockMap() {
    this.mapUnlocked = true;
    this.el.minimapWrap.classList.remove('hidden');
    this.el.itemMap.className = 'item unlocked';
    this.el.itemMap.querySelector('.item-lock').textContent = '已解锁';
    this.el.itemMap.classList.add('flash');
    setTimeout(() => this.el.itemMap.classList.remove('flash'), 900);
    this.drawMinimap(null);
  }
  unlockSpeed() {
    this.speedUnlocked = true;
    this.el.staminaWrap.classList.remove('hidden');
    this.el.itemSpeed.className = 'item unlocked';
    this.el.itemSpeed.querySelector('.item-lock').textContent = '已解锁';
    this.el.itemSpeed.classList.add('flash');
    setTimeout(() => this.el.itemSpeed.classList.remove('flash'), 900);
  }
  setStamina(v) {
    this.el.staminaFill.style.width = Math.max(0, Math.min(100, v)) + '%';
    this.el.staminaFill.classList.toggle('low', v < 25);
  }
  setDanger(d) {
    this.el.danger.style.opacity = String(Math.min(0.85, d * 0.9));
    this.el.proximity.classList.toggle('hidden', d < 0.72);
  }
  setSoundMuted(muted) {
    const text = muted ? '×' : '♪';
    for (const el of [this.el.mute, this.el.pauseMute, this.el.sound]) {
      if (!el) continue;
      el.classList.toggle('muted', muted);
      if (el === this.el.sound) el.textContent = muted ? '×' : '♪';
      else el.textContent = text;
    }
  }
  setVolume(v) {
    if (this.el.volume) this.el.volume.value = String(Math.round(v * 100));
    if (this.el.pauseVolume) this.el.pauseVolume.value = String(Math.round(v * 100));
  }

  showSubtitle(speaker, text, { frog = false, duration = 4.2 } = {}) {
    this.el.subSpeaker.textContent = speaker;
    this.el.subText.textContent = text;
    this.el.subText.classList.toggle('frog', frog);
    this.el.subtitles.classList.add('show');
    clearTimeout(this.subTimer);
    this.subTimer = setTimeout(() => this.el.subtitles.classList.remove('show'), duration * 1000);
  }
  hideSubtitle() {
    clearTimeout(this.subTimer);
    this.el.subtitles.classList.remove('show');
  }

  showInteract(html) {
    if (this._interactHtml === html && !this.el.interact.classList.contains('hidden')) return;
    this._interactHtml = html;
    this.el.interact.innerHTML = html;
    this.el.interact.classList.remove('hidden');
  }
  hideInteract() {
    if (this.el.interact.classList.contains('hidden')) return;
    this._interactHtml = '';
    this.el.interact.classList.add('hidden');
  }
  setPointerHint(show) { this.el.pointerHint.classList.toggle('hidden', !show); }
  pickupPulse() {
    this.el.pickupFlash.classList.remove('on');
    void this.el.pickupFlash.offsetWidth;
    this.el.pickupFlash.classList.add('on');
  }

  toast({ kicker = '', title = '', sub = '', duration = 4.2 } = {}) {
    const box = document.createElement('div');
    box.className = 'toast';
    box.innerHTML = `${kicker ? `<div class="t-kicker">${kicker}</div>` : ''}
      <div class="t-title">${title}</div>${sub ? `<div class="t-sub">${sub}</div>` : ''}`;
    while (this.el.toasts.children.length >= 3) this.el.toasts.firstElementChild.remove();
    this.el.toasts.appendChild(box);
    setTimeout(() => { box.classList.add('out'); setTimeout(() => box.remove(), 650); }, duration * 1000);
  }

  // ---------------- 小地图 ----------------
  drawStaticMap(world) {
    const data = world.getMinimapData();
    const cv = this.el.minimap;
    const W = cv.width, H = cv.height;
    const pad = 8;
    const cell = Math.min((W - pad * 2) / data.W, (H - pad * 2) / data.H);
    const ox = (W - data.W * cell) / 2, oy = (H - data.H * cell) / 2;
    const off = document.createElement('canvas');
    off.width = W; off.height = H;
    const g = off.getContext('2d');
    g.fillStyle = '#0b0909'; g.fillRect(0, 0, W, H);
    const zoneColor = {
      entry: '#5c4b39', classroom: '#3f5549', nap: '#394754', canteen: '#57414a',
      corridor: '#474538', exit: '#33493d',
    };
    for (let z = 0; z < data.H; z++) for (let x = 0; x < data.W; x++) {
      const walk = data.grid[z][x];
      if (!walk) continue;
      g.fillStyle = zoneColor[data.rooms.find((r) => x >= r.x && x < r.x + r.w && z >= r.z && z < r.z + r.h)?.zone] || '#474538';
      g.fillRect(ox + x * cell, oy + z * cell, cell + 0.4, cell + 0.4);
      if (cell > 7) {
        g.strokeStyle = 'rgba(0,0,0,.18)';
        g.strokeRect(ox + x * cell, oy + z * cell, cell, cell);
      }
    }
    // 房间标签
    g.font = `${Math.max(7, cell * 0.95)}px "Microsoft YaHei", sans-serif`;
    g.textAlign = 'center';
    g.fillStyle = 'rgba(255, 226, 180, .55)';
    for (const r of data.rooms) {
      g.fillText(r.name || ZONE_NAMES[r.zone] || '', ox + (r.x + r.w / 2) * cell, oy + (r.z + r.h / 2) * cell + 3);
    }
    // 外框
    g.strokeStyle = 'rgba(216,168,90,.3)';
    g.strokeRect(ox - 1, oy - 1, data.W * cell + 2, data.H * cell + 2);
    this.minimapStatic = { off, ox, oy, cell, data };
  }

  drawMinimap(playerInfo) {
    if (!this.minimapStatic) return;
    const { off, ox, oy, cell, data } = this.minimapStatic;
    const cv = this.el.minimap;
    const g = cv.getContext('2d');
    g.clearRect(0, 0, cv.width, cv.height);
    g.drawImage(off, 0, 0);
    // 奶片
    for (const [cx, cz] of data.candies) {
      g.beginPath();
      g.arc(ox + (cx + 0.5) * cell, oy + (cz + 0.5) * cell, Math.max(1.6, cell * 0.22), 0, Math.PI * 2);
      g.fillStyle = '#ffd27a';
      g.fill();
    }
    // 出口
    const ex = ox + (data.exit.wallCell[0] + 0.5) * cell;
    const ez = oy + (data.exit.wallCell[1] + 0.5) * cell;
    g.fillStyle = '#7dffb0';
    g.fillRect(ex - 2.5, ez - 3, 5, 6);
    // 奶蛙
    if (playerInfo?.frogs) {
      for (const f of playerInfo.frogs) {
        if (f.dist > 16) continue;
        g.beginPath();
        g.arc(ox + (f.x / 3.2) * cell, oy + (f.z / 3.2) * cell, Math.max(1.8, cell * 0.26), 0, Math.PI * 2);
        g.fillStyle = '#e13b3b';
        g.fill();
      }
    }
    // 玩家
    if (playerInfo) {
      const px = ox + (playerInfo.x / 3.2) * cell;
      const pz = oy + (playerInfo.z / 3.2) * cell;
      g.save();
      g.translate(px, pz);
      g.rotate(-playerInfo.yaw);
      g.beginPath();
      g.moveTo(0, -5.2);
      g.lineTo(3.6, 4.2);
      g.lineTo(0, 2.4);
      g.lineTo(-3.6, 4.2);
      g.closePath();
      g.fillStyle = '#ffe9b8';
      g.shadowColor = '#ffd98a';
      g.shadowBlur = 8;
      g.fill();
      g.restore();
    }
  }

  setStoryLine(text, chapter, caption = '') {
    this.el.storyLine.classList.remove('show');
    setTimeout(() => {
      this.el.storyLine.textContent = text;
      this.el.storyLine.classList.add('show');
      if (chapter) {
        this.el.storyChapter.textContent = chapter;
        this.el.storyChapter.parentElement.classList.add('show');
      }
      if (caption) {
        this.el.storyCaption.textContent = caption;
        this.el.storyCaption.classList.add('show');
      } else this.el.storyCaption.classList.remove('show');
    }, 260);
  }
  setStoryProgress(p) { this.el.storyProgress.style.width = Math.round(p * 100) + '%'; }
  resetStory() {
    this.el.story.classList.remove('active');
    this.el.storyLine.classList.remove('show');
    this.el.storyChapter.parentElement.classList.remove('show');
    this.el.storyCaption.classList.remove('show');
    this.el.storyProgress.style.width = '0%';
  }
  storyActive() { this.el.story.classList.add('active'); }
  storyInactive() { this.el.story.classList.remove('active'); }
}
