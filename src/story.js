// 片头剧情：镜头巡游地图 + 语音字幕 + 可跳过
import * as THREE from 'three';
import { STORY, STORY_PATH, GRID } from './config.js';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

export class Story {
  constructor(camera, world, audio, ui) {
    this.camera = camera;
    this.world = world;
    this.audio = audio;
    this.ui = ui;
    this.points = STORY_PATH.map(([x, z]) => new THREE.Vector3(x * GRID.cell, 2.02, z * GRID.cell));
    this.curve = new THREE.CatmullRomCurve3(this.points, false, 'centripetal', 0.5);
    this.duration = 32;
    this.elapsed = 0;
    this.skipped = false;
    this.playing = false;
    this.lookTmp = new THREE.Vector3();
    this.lineCount = STORY.length;
    this.skipFns = [];
  }

  startCamera() {
    const p = this.curve.getPointAt(0);
    this.camera.position.copy(p);
    const ahead = this.curve.getPointAt(0.03);
    this.camera.lookAt(ahead.x, ahead.y - 0.5, ahead.z);
    this.camera.fov = 62;
    this.camera.updateProjectionMatrix();
  }

  async play() {
    this.skipped = false;
    this.elapsed = 0;
    this.playing = true;
    let total = 1.5;
    for (let i = 0; i < STORY.length; i++) total += this.audio.duration('vo_0' + (i + 1)) + 0.8;
    this.duration = Math.max(28, total);
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

  update(dt) {
    if (!this.playing) return;
    this.elapsed = Math.min(this.duration, this.elapsed + dt);
    const p = Math.min(1, this.elapsed / this.duration);
    this.ui.setStoryProgress(p);
    const pos = this.curve.getPointAt(p);
    const aheadP = Math.min(1, p + 0.032);
    const ahead = this.curve.getPointAt(aheadP);
    const sway = Math.sin(this.elapsed * 0.8) * 0.08;
    this.camera.position.set(pos.x + sway * 0.6, pos.y + Math.sin(this.elapsed * 1.3) * 0.03, pos.z);
    this.camera.lookAt(ahead.x, ahead.y - 0.68 + sway, ahead.z);
    this.camera.rotation.z += Math.sin(this.elapsed * 0.6) * 0.004;
  }
}
