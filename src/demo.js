// Demo 模式：真实游戏内的脚本机器人，自动收集奶片、解锁、冲刺、离开
import { GRID, CANDY_CELLS, EXIT } from './config.js';

const C = GRID.cell;

function cellIndex(x, z, W) { return z * W + x; }

function findPath(world, start, goal) {
  const W = world.W, H = world.H;
  const prev = new Int32Array(W * H).fill(-1);
  if (!world.isWalkable(start[0], start[1]) || !world.isWalkable(goal[0], goal[1])) return [];
  if (!world.isBotWalkable(goal[0], goal[1])) {
    // 目标格被家具占了：退到最近的可走格
    let best = null, bestD = 1e9;
    for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) {
      const nx = goal[0] + dx, nz = goal[1] + dz;
      if (!world.isBotWalkable(nx, nz)) continue;
      const d = dx * dx + dz * dz;
      if (d < bestD) { bestD = d; best = [nx, nz]; }
    }
    if (best) goal = best;
  }
  let startCell = start;
  if (!world.isBotWalkable(start[0], start[1])) {
    let best = null, bestD = 1e9;
    for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) {
      const nx = start[0] + dx, nz = start[1] + dz;
      if (!world.isBotWalkable(nx, nz)) continue;
      const d = dx * dx + dz * dz;
      if (d < bestD) { bestD = d; best = [nx, nz]; }
    }
    if (best) startCell = best;
  }
  const s = cellIndex(startCell[0], startCell[1], W);
  const g = cellIndex(goal[0], goal[1], W);
  const q = [s];
  prev[s] = -2;
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  let found = false;
  for (let head = 0; head < q.length; head++) {
    const idx = q[head];
    if (idx === g) { found = true; break; }
    const x = idx % W, z = (idx / W) | 0;
    for (const [dx, dz] of dirs) {
      const nx = x + dx, nz = z + dz;
      if (!world.isBotWalkable(nx, nz)) continue;
      const ni = cellIndex(nx, nz, W);
      if (prev[ni] === -1) { prev[ni] = idx; q.push(ni); }
    }
  }
  if (!found) return [];
  const path = [];
  let cur = g;
  while (cur !== -2 && cur >= 0) {
    path.push([cur % W, (cur / W) | 0]);
    if (cur === s) break;
    cur = prev[cur];
  }
  path.reverse();
  return path;
}

export class Demo {
  constructor(game, world, player, frogs) {
    this.game = game;
    this.world = world;
    this.player = player;
    this.frogs = frogs;
    this.active = false;
    this.route = [0, 5, 3, 4, 1, 2, 6, 7];
    this.routeIndex = 0;
    this.path = [];
    this.pathIndex = 0;
    this.repathTimer = 0;
    this.stuckTimer = 0;
    this.lastPos = { x: 0, z: 0 };
    this.exitTarget = [EXIT.insideCell[0], EXIT.insideCell[1]];
    this.reachedExit = false;
    this.lookbackTimer = 0;
    this.lookbackDone = false;
    this.sprintTimer = 0;
    this.elapsed = 0;
    this.nudgeT = 0;
  }

  start() {
    this.active = true;
    this.routeIndex = 0;
    this.path = [];
    this.pathIndex = 0;
    this.repathTimer = 0;
    this.stuckTimer = 0;
    this.reachedExit = false;
    this.lookbackTimer = 0;
    this.lookbackDone = false;
    this.sprintTimer = 0;
    this.elapsed = 0;
    this.lastPos = { x: this.player.position.x, z: this.player.position.z };
    this.player.bot = { yaw: this.player.yaw, forward: 1, strafe: 0, sprint: false };
  }

  stop() {
    this.active = false;
    this.player.bot = null;
  }

  currentTargetCell() {
    if (this.routeIndex < this.route.length) {
      const idx = this.route[this.routeIndex];
      return CANDY_CELLS[idx];
    }
    return this.exitTarget;
  }

  repath() {
    const [cx, cz] = this.world.cellOf(this.player.position.x, this.player.position.z);
    const target = this.currentTargetCell();
    this.path = findPath(this.world, [cx, cz], target);
    this.pathIndex = 1;
    this.repathTimer = 1.4;
  }

  update(dt) {
    if (!this.active) return;
    this.elapsed += dt;
    const game = this.game;

    // 目标已被吃掉或已经到达出口
    if (this.routeIndex < this.route.length) {
      if (game.collected[this.route[this.routeIndex]]) {
        this.routeIndex++;
        this.path = [];
        this.repathTimer = 0;
      }
    }
    if (this.reachedExit) {
      this.player.bot.forward = 0;
      return;
    }

    // 接近出口：交给游戏判定
    const ex = this.world.exitInfo;
    const distExit = Math.hypot(this.player.position.x - ex.x, this.player.position.z - ex.z);
    const allCandies = game.candiesCollected >= 8;
    if (allCandies && distExit < 2.6) {
      this.reachedExit = true;
      this.player.bot.forward = 0;
      game.demoReachExit?.();
      return;
    }

    // 路径
    this.repathTimer -= dt;
    if (this.repathTimer <= 0 || this.path.length === 0) {
      this.repath();
      // 目标若在视野外，直接走向目标（近距离）
    }
    if (this.path.length === 0) {
      this.player.bot.forward = 0;
      return;
    }
    while (this.pathIndex < this.path.length) {
      const [wx, wz] = this.path[this.pathIndex];
      const tx = (wx + 0.5) * C, tz = (wz + 0.5) * C;
      const d = Math.hypot(tx - this.player.position.x, tz - this.player.position.z);
      if (d < 0.6) this.pathIndex++;
      else break;
    }
    if (this.pathIndex >= this.path.length) {
      // 沿最后一段直接走向目标（奶片/出口）
      const target = this.currentTargetCell();
      const tx2 = (target[0] + 0.5) * C, tz2 = (target[1] + 0.5) * C;
      let dx2 = tx2 - this.player.position.x, dz2 = tz2 - this.player.position.z;
      let d2 = Math.hypot(dx2, dz2);
      if (this.routeIndex < this.route.length) {
        const candy = this.game.collected[this.route[this.routeIndex]];
        if (candy) { this.player.bot.forward = 0; this.routeIndex++; return; }
      }
      if (d2 > 0.55) {
        this.player.bot.yaw = Math.atan2(-dx2, -dz2);
        this.player.bot.forward = 1;
        this.player.bot.strafe = 0;
      } else {
        this.player.bot.forward = 0;
      }
      this.repathTimer = 0.5;
      return;
    }
    const [wx, wz] = this.path[this.pathIndex];
    const tx = (wx + 0.5) * C, tz = (wz + 0.5) * C;
    const dx = tx - this.player.position.x;
    const dz = tz - this.player.position.z;
    const yaw = Math.atan2(-dx, -dz);
    this.player.bot.yaw = yaw;
    this.player.bot.forward = 1;
    this.player.bot.strafe = 0;

    // 演示冲刺：解锁后主动冲刺，并在奶蛙靠近时甩开
    const nearest = this.frogs.nearest;
    if (game.speedUnlocked && (this.player.stamina > 55 || nearest < 8.5)) {
      this.sprintTimer = Math.max(this.sprintTimer, 0.6);
    }
    if (nearest < 6.5) this.sprintTimer = Math.max(this.sprintTimer, 2.2);
    this.sprintTimer = Math.max(0, this.sprintTimer - dt);
    this.player.bot.sprint = this.sprintTimer > 0 && this.player.stamina > 6;

    // 第 4 片后的一次回头：展示奶蛙
    if (!this.lookbackDone && game.candiesCollected >= 4) {
      this.lookbackDone = true;
      this.lookbackTimer = 1.7;
    }
    if (this.lookbackTimer > 0) {
      this.lookbackTimer -= dt;
      this.player.bot.forward = 0;
      let near = null, nd = 99;
      for (const f of this.frogs.frogs) {
        const d = f.distanceToPlayer;
        if (d < nd) { nd = d; near = f; }
      }
      if (near) {
        const dx2 = near.pos.x - this.player.position.x;
        const dz2 = near.pos.z - this.player.position.z;
        this.player.bot.yaw = Math.atan2(-dx2, -dz2);
      }
    }

    // 卡住检测
    const moved = Math.hypot(this.player.position.x - this.lastPos.x, this.player.position.z - this.lastPos.z);
    this.lastPos = { x: this.player.position.x, z: this.player.position.z };
    if (moved < 0.02) this.stuckTimer += dt; else this.stuckTimer = 0;
    if (this.stuckTimer > 1.1) {
      this.nudgeT = 0.6;
      this.repathTimer = 0;
      this.stuckTimer = 0;
    }
    if (this.nudgeT > 0) {
      this.nudgeT -= dt;
      this.player.bot.strafe = Math.sin(this.elapsed * 12) * 0.5;
    }
  }
}
