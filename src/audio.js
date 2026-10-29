// 音频管理：manifest 加载、音乐交叉淡化、3D 奶蛙声、心跳、语音、静音
const MANIFEST_URL = './assets/audio/manifest.json';

const FALLBACK_DURATION = {
  music_menu: 28, music_story: 30, amb_game: 24, heartbeat: 1.7,
  vo_01: 4.2, vo_02: 4.0, vo_03: 5.6, vo_04: 6.4, vo_05: 5.2, vo_06: 3.4,
  sfx_click: 0.12, sfx_start_sting: 4, sfx_pickup: 0.9, sfx_unlock_map: 2.4,
  sfx_unlock_speed: 2.4, sfx_exit_open: 3, sfx_win: 7, sfx_lose: 5.5,
  sfx_screech: 2, sfx_footstep_1: 0.3, sfx_footstep_2: 0.3, sfx_sprint: 0.8,
  sfx_frog_alert: 1.2, sfx_ui_hover: 0.1,
};

export class AudioManager {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.comp = null;
    this.buffers = new Map();
    this.manifest = null;
    this.volume = 0.7;
    this.muted = false;
    this.ready = false;
    this.hasFiles = false;
    this.music = null;
    this.musicKey = null;
    this.voice = null;
    this.frogs = [];
    this.heartbeat = null;
    this.started = false;
  }

  async init(onProgress) {
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC({ latencyHint: 'interactive' });
      this.comp = this.ctx.createDynamicsCompressor();
      this.comp.threshold.value = -18;
      this.comp.knee.value = 18;
      this.comp.ratio.value = 3.5;
      this.comp.attack.value = 0.004;
      this.comp.release.value = 0.25;
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume;
      this.comp.connect(this.master);
      this.master.connect(this.ctx.destination);
    } catch (e) {
      console.warn('[audio] WebAudio unavailable', e);
      this.ready = true;
      return;
    }

    let manifest = null;
    try {
      const res = await fetch(MANIFEST_URL, { cache: 'no-store' });
      if (res.ok) manifest = await res.json();
    } catch (e) {
      console.warn('[audio] manifest missing, using fallback tones');
    }
    if (!manifest || !manifest.tracks) {
      this.ready = true;
      this.buildFallbackFrogs();
      return;
    }
    this.manifest = manifest;
    const entries = Object.entries(manifest.tracks);
    let loaded = 0;
    const queue = entries.slice();
    const loadOne = async ([key, info]) => {
      try {
        const url = './' + String(info.file || '').replace(/^\/+/, '');
        const load = (async () => {
          const res = await fetch(url, { cache: 'no-store' });
          if (!res.ok) throw new Error('HTTP ' + res.status);
          const ab = await res.arrayBuffer();
          return await this.ctx.decodeAudioData(ab);
        })();
        const buf = await Promise.race([
          load,
          new Promise((_, reject) => setTimeout(() => reject(new Error('decode timeout')), 12000)),
        ]);
        this.buffers.set(key, buf);
      } catch (e) {
        console.warn('[audio] failed to load', key, e.message);
      }
      loaded++;
      if (onProgress) onProgress(loaded / entries.length);
    };
    const worker = async () => {
      for (;;) {
        const item = queue.shift();
        if (!item) return;
        await loadOne(item);
      }
    };
    // 并发 6 路：串行 fetch+decode 27 个 WAV 在慢机器/无头浏览器上会过久
    await Promise.all(Array.from({ length: Math.min(6, entries.length) }, worker));
    this.hasFiles = this.buffers.size > 0;
    this.buildFrogs();
    this.buildHeartbeat();
    this.ready = true;
  }

  async resume() {
    if (this.ctx && this.ctx.state === 'suspended') {
      try { await this.ctx.resume(); } catch (e) { /* ignore */ }
    }
  }

  setVolume(v) {
    this.volume = Math.max(0, Math.min(1, v));
    if (this.master) {
      const target = this.muted ? 0 : this.volume;
      this.master.gain.setTargetAtTime(target, this.ctx.currentTime, 0.05);
    }
  }
  toggleMute() {
    this.muted = !this.muted;
    if (this.master) this.master.gain.setTargetAtTime(this.muted ? 0 : this.volume, this.ctx.currentTime, 0.05);
    return this.muted;
  }

  duration(key) {
    const b = this.buffers.get(key);
    if (b) return b.duration;
    if (this.manifest?.tracks?.[key]?.duration) return this.manifest.tracks[key].duration;
    return FALLBACK_DURATION[key] || 2.5;
  }

  _gainNode(gain, pan = 0) {
    const g = this.ctx.createGain();
    g.gain.value = gain;
    if (pan && this.ctx.createStereoPanner) {
      const p = this.ctx.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, pan));
      g.connect(p);
      p.connect(this.comp);
    } else {
      g.connect(this.comp);
    }
    return g;
  }

  playMusic(key, { fade = 1.4, gain } = {}) {
    if (!this.ctx) return;
    const buf = this.buffers.get(key);
    if (!buf) return;
    if (this.musicKey === key && this.music) return;
    const targetGain = gain ?? this.manifest?.tracks?.[key]?.gain ?? 0.55;
    const t = this.ctx.currentTime;
    if (this.music) {
      const old = this.music;
      old.gain.gain.cancelScheduledValues(t);
      old.gain.gain.setValueAtTime(old.gain.gain.value, t);
      old.gain.gain.linearRampToValueAtTime(0, t + fade);
      try { old.source.stop(t + fade + 0.05); } catch (e) { /* ignore */ }
      this.music = null;
    }
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const g = this.ctx.createGain();
    g.gain.value = 0;
    src.connect(g);
    g.connect(this.comp);
    src.start(t);
    g.gain.linearRampToValueAtTime(targetGain, t + fade);
    this.music = { source: src, gain: g, key };
    this.musicKey = key;
  }

  stopMusic(fade = 1) {
    if (!this.music || !this.ctx) return;
    const t = this.ctx.currentTime;
    const old = this.music;
    old.gain.gain.cancelScheduledValues(t);
    old.gain.gain.setValueAtTime(old.gain.gain.value, t);
    old.gain.gain.linearRampToValueAtTime(0, t + fade);
    try { old.source.stop(t + fade + 0.05); } catch (e) { /* ignore */ }
    this.music = null;
    this.musicKey = null;
  }

  playSfx(key, { gain = 1, rate = 1, pan = 0, delay = 0 } = {}) {
    if (!this.ctx) return;
    const buf = this.buffers.get(key);
    if (!buf) { this.synthSfx(key, gain); return; }
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = rate;
    const g = this._gainNode(gain, pan);
    src.connect(g);
    src.start(this.ctx.currentTime + delay);
  }

  synthSfx(key, gain = 1) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const mk = (type, f0, f1, dur, vol = 0.2) => {
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = type;
      o.frequency.setValueAtTime(f0, t);
      o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
      g.gain.setValueAtTime(vol * gain, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(this.comp);
      o.start(t); o.stop(t + dur + 0.02);
    };
    if (key === 'sfx_pickup') { mk('sine', 880, 1500, 0.35, 0.22); mk('sine', 1320, 1980, 0.5, 0.1); }
    else if (key === 'sfx_click' || key === 'sfx_ui_hover') mk('triangle', 520, 280, 0.09, 0.1);
    else if (key.startsWith('sfx_footstep')) mk('sine', 120, 45, 0.12, 0.16);
    else if (key === 'sfx_unlock_map' || key === 'sfx_unlock_speed') { mk('sine', 523, 523, 0.4, 0.15); mk('sine', 784, 784, 0.6, 0.12); }
    else if (key === 'sfx_start_sting') { mk('sine', 80, 28, 3.5, 0.35); mk('sawtooth', 220, 30, 3, 0.08); }
    else if (key === 'sfx_screech') { mk('sawtooth', 1200, 200, 1.2, 0.2); }
    else if (key === 'sfx_win') { [523, 659, 784, 1047].forEach((f, i) => { const o = this.ctx.createOscillator(), g = this.ctx.createGain(); o.type = 'sine'; o.frequency.value = f; g.gain.setValueAtTime(0, t + i * 0.25); g.gain.linearRampToValueAtTime(0.12, t + i * 0.25 + 0.05); g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.25 + 2.2); o.connect(g); g.connect(this.comp); o.start(t + i * 0.25); o.stop(t + i * 0.25 + 2.4); }); }
    else if (key === 'sfx_lose') { mk('sawtooth', 160, 40, 2.5, 0.2); }
    else if (key === 'sfx_exit_open') { mk('sine', 200, 800, 1.4, 0.15); }
    else if (key === 'sfx_frog_alert') { mk('square', 90, 60, 0.7, 0.12); }
    else { mk('sine', 440, 220, 0.25, 0.1); }
  }

  playVoice(key) {
    return new Promise((resolve) => {
      if (!this.ctx) { setTimeout(() => resolve(this.duration(key)), 100); return; }
      const buf = this.buffers.get(key);
      if (!buf) {
        const d = this.duration(key);
        setTimeout(() => resolve(d), d * 1000);
        return;
      }
      this.stopVoice();
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      const gain = this.manifest?.tracks?.[key]?.gain ?? 0.9;
      const g = this._gainNode(gain);
      src.connect(g);
      let done = false;
      const finish = () => { if (done) return; done = true; if (this.voice?.src === src) this.voice = null; resolve(buf.duration); };
      src.onended = finish;
      src.start();
      this.voice = { src, gain: g, finish };
    });
  }
  stopVoice() {
    if (this.voice) {
      try { this.voice.src.stop(); } catch (e) { /* ignore */ }
      this.voice.finish();
      this.voice = null;
    }
  }

  buildFrogs() {
    if (!this.ctx) return;
    this.frogs = [];
    for (let i = 0; i < 4; i++) {
      const key = 'frog_voice_' + (i + 1);
      const buf = this.buffers.get(key);
      if (!buf) { this.frogs.push(null); continue; }
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      src.playbackRate.value = 0.94 + i * 0.035;
      const g = this.ctx.createGain();
      g.gain.value = 0;
      const pan = this.ctx.createStereoPanner ? this.ctx.createStereoPanner() : null;
      if (pan) { src.connect(g); g.connect(pan); pan.connect(this.comp); }
      else { src.connect(g); g.connect(this.comp); }
      try { src.start(0, Math.random() * Math.min(1, buf.duration)); } catch (e) { /* ignore */ }
      this.frogs.push({ src, gain: g, pan });
    }
  }
  buildFallbackFrogs() {
    this.frogs = [null, null, null, null];
  }
  setFrogVoice(i, { gain = 0, pan = 0, rate } = {}) {
    const f = this.frogs[i];
    if (!f || !this.ctx) return;
    const t = this.ctx.currentTime;
    f.gain.gain.setTargetAtTime(Math.max(0, Math.min(0.9, gain)), t, 0.12);
    if (f.pan) f.pan.pan.setTargetAtTime(Math.max(-1, Math.min(1, pan)), t, 0.15);
    if (rate) f.src.playbackRate.setTargetAtTime(rate, t, 0.2);
  }

  buildHeartbeat() {
    if (!this.ctx) return;
    const buf = this.buffers.get('heartbeat');
    if (!buf) return;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const g = this.ctx.createGain();
    g.gain.value = 0;
    src.connect(g);
    g.connect(this.comp);
    src.start();
    this.heartbeat = { src, gain: g };
  }
  setHeartbeat(v) {
    if (!this.heartbeat) return;
    this.heartbeat.gain.gain.setTargetAtTime(Math.max(0, Math.min(0.8, v)), this.ctx.currentTime, 0.2);
  }

  stopAll() {
    this.stopMusic(0.4);
    this.stopVoice();
    this.setHeartbeat(0);
    for (let i = 0; i < this.frogs.length; i++) this.setFrogVoice(i, { gain: 0 });
  }
}
