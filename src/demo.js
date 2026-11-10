// Demo 模式：真实游戏内的脚本机器人。
// 规则与真人完全一致：会掉 SAN、会被抓、速度不加成、龙奶要自己捡。
// 机器人靠"不停下 + 贴近就反向跑 + 危机时喝奶"活下来。
import { GRID, CANDY_CELLS, EXIT, TOTAL_CANDIES } from './config.js';

const C = GRID.cell;

// 奶蛙在玩家移动时会保持 ~5.6m，所以"危险"必须明显小于这个值，
// 否则机器人会一直以为被追、永远在逃、一片奶片都捡不到（第一版就是这么翻车的）。
const FLEE_RADIUS = 3.6;
// 已经在逼近（奶蛙停下后会追到 0.85m）时提前冲刺
const PRESS_RADIUS = 5.4;
// 只有最近的奶蛙比这个远，才允许停下来（回头展示/到达终点）
const SAFE_IDLE = 10.5;
// SAN 低于这个值且冷却结束，就顺路去喝龙奶
const MILK_SAN = 62;

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
  // 起点就是玩家所在格：即使它被判成"bot 不可走"也必须从这儿出发，
  // 否则会去别的格子起算，路径穿过墙、机器人贴着墙原地磨 —— 这正是之前"卡住"的根因。
  if (!world.isWalkable(start[0], start[1])) {
    let best = null, bestD = 1e9;
    for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) {
      const nx = start[0] + dx, nz = start[1] + dz;
      if (!world.isWalkable(nx, nz)) continue;
      const d = dx * dx + dz * dz;
      if (d < bestD) { bestD = d; best = [nx, nz]; }
    }
    if (!best) return [];
    start = best;
  }
  const s = cellIndex(start[0], start[1], W);
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
    this.banned = new Map();     // 奶片索引 -> 解禁时间（卡太久就先跳过，稍后再来）
    this.targetCandy = null;
    this.tour = [];
    this.tourPos = 0;
    this.path = [];
    this.pathIndex = 0;
    this.repathTimer = 0;
    this.stuckTimer = 0;
    this.stuckCount = 0;
    this.lastPos = { x: 0, z: 0 };
    this.exitTarget = [EXIT.insideCell[0], EXIT.insideCell[1]];
    this.reachedExit = false;
    this.lookbackTimer = 0;
    this.lookbackDone = false;
    this.sprintTimer = 0;
    this.elapsed = 0;
    this.nudgeT = 0;
    this.nudgeDir = 1;
    this.milkTarget = null;
    this.fleeing = false;
    this.avoidSide = 0;
  }

  start() {
    this.active = true;
    this.banned.clear();
    this.targetCandy = null;
    this.tour = [];
    this.tourPos = 0;
    this.planTour();
    this.path = [];
    this.pathIndex = 0;
    this.repathTimer = 0;
    this.stuckTimer = 0;
    this.stuckCount = 0;
    this.reachedExit = false;
    this.lookbackTimer = 0;
    this.lookbackDone = false;
    this.sprintTimer = 0;
    this.elapsed = 0;
    this.nudgeT = 0;
    this.milkTarget = null;
    this.fleeing = false;
    this.lastPos = { x: this.player.position.x, z: this.player.position.z };
    this.player.bot = { yaw: this.player.yaw, forward: 1, strafe: 0, sprint: false };
  }

  stop() {
    this.active = false;
    this.player.bot = null;
  }

  // 以真实迷宫距离（BFS 格数）算一趟巡回：贪心最近邻 + 2-opt。
  // 直接"每次选最近的"会来回拉锯，实测多走 60% 路程；这里一次算好顺序再跟着走。
  gridDistance(from) {
    const W = this.world.W, H = this.world.H;
    const d = new Int32Array(W * H).fill(-1);
    const [sx, sz] = from;
    if (!this.world.isBotWalkable(sx, sz)) return d;
    const q = [sz * W + sx];
    d[sz * W + sx] = 0;
    for (let head = 0; head < q.length; head++) {
      const idx = q[head];
      const x = idx % W, z = (idx / W) | 0;
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, nz = z + dz;
        if (!this.world.isBotWalkable(nx, nz)) continue;
        const ni = nz * W + nx;
        if (d[ni] === -1) { d[ni] = d[idx] + 1; q.push(ni); }
      }
    }
    return d;
  }

  planTour() {
    const W = this.world.W;
    const [cx, cz] = this.world.cellOf(this.player.position.x, this.player.position.z);
    const start = this.world.isBotWalkable(cx, cz) ? [cx, cz] : this.world.nearestBotWalkable?.(cx, cz) || [cx, cz];
    const now = this.elapsed;
    const goals = [];
    for (let i = 0; i < CANDY_CELLS.length; i++) {
      if (this.game.collected[i]) continue;
      if (this.banned.has(i) && this.banned.get(i) > now) continue;
      goals.push({ i, cell: CANDY_CELLS[i] });
    }
    if (!goals.length && this.banned.size) { this.banned.clear(); return this.planTour(); }
    this.tour = [];
    if (!goals.length) { this.tourPos = 0; return; }
    const nodes = [start, ...goals.map((g) => g.cell)];
    const field = nodes.map((n) => this.gridDistance(n));
    const D = (a, b) => {
      const v = field[a][nodes[b][1] * W + nodes[b][0]];
      return v < 0 ? 1e6 : v;
    };
    // 贪心最近邻
    const order = [0];
    const used = new Set([0]);
    for (let k = 1; k < nodes.length; k++) {
      const cur = order[order.length - 1];
      let best = -1, bd = Infinity;
      for (let j = 1; j < nodes.length; j++) {
        if (used.has(j)) continue;
        const d = D(cur, j);
        if (d < bd) { bd = d; best = j; }
      }
      if (best < 0) break;
      used.add(best);
      order.push(best);
    }
    // 2-opt 收敛
    for (let pass = 0; pass < 40; pass++) {
      let improved = false;
      for (let i = 1; i < order.length - 1; i++) {
        for (let j = i + 1; j < order.length - 1; j++) {
          const a = order[i - 1], b = order[i], c = order[j], d = order[j + 1];
          if (D(a, b) + D(c, d) > D(a, c) + D(b, d) + 0.001) {
            const seg = order.slice(i, j + 1).reverse();
            order.splice(i, j - i + 1, ...seg);
            improved = true;
          }
        }
      }
      if (!improved) break;
    }
    this.tour = order.slice(1).map((n) => goals[n - 1].i);
    this.tourPos = 0;
    this.targetCandy = this.tour[0] ?? null;
  }

  currentTargetCell() {
    if (this.milkTarget) return [Math.floor(this.milkTarget.x / C), Math.floor(this.milkTarget.z / C)];
    if (this.tourPos >= this.tour.length) this.planTour();
    while (this.tourPos < this.tour.length && this.game.collected[this.tour[this.tourPos]]) this.tourPos++;
    this.targetCandy = this.tourPos < this.tour.length ? this.tour[this.tourPos] : null;
    if (this.targetCandy != null) return CANDY_CELLS[this.targetCandy];
    return this.exitTarget;
  }

  nearestFrog() {
    let best = null, bd = Infinity;
    for (const f of this.frogs.frogs) {
      if (!f.group.visible) continue;
      const d = Math.hypot(f.pos.x - this.player.position.x, f.pos.z - this.player.position.z);
      if (d < bd) { bd = d; best = f; }
    }
    return { frog: best, dist: best ? bd : Infinity };
  }

  // 两点之间按玩家半径采样，判断能不能直着走过去
  segClear(x0, z0, x1, z1, pad = 0.5) {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const steps = Math.max(2, Math.ceil(len / 0.3));
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      if (this.world.pointBlocked(x0 + (x1 - x0) * t, z0 + (z1 - z0) * t, pad)) return false;
    }
    return true;
  }

  clearAhead(px, pz, dx, dz, len, pad = 0.5) {
    for (const d of [0.5, 0.85, len]) {
      if (this.world.pointBlocked(px + dx * d, pz + dz * d, pad)) return false;
    }
    return true;
  }

  // 正前方被椅子/桌子挡住就侧着绕：先试小角度，再试大角度，并记住上次绕行方向减少抖动
  steerTo(tx, tz) {
    const p = this.player.position;
    const baseYaw = Math.atan2(-(tx - p.x), -(tz - p.z));
    if (this.segClear(p.x, p.z, tx, tz)) { this.avoidSide = 0; return baseYaw; }
    const offs = this.avoidSide >= 0
      ? [0.45, -0.45, 0.9, -0.9, 1.35, -1.35]
      : [-0.45, 0.45, -0.9, 0.9, -1.35, 1.35];
    for (const off of offs) {
      const a = baseYaw + off;
      const dx = -Math.sin(a), dz = -Math.cos(a);
      if (this.clearAhead(p.x, p.z, dx, dz, 1.4)) {
        this.avoidSide = off >= 0 ? 1 : -1;
        return a;
      }
    }
    this.avoidSide = 0;
    return baseYaw;
  }

  repath() {
    const [cx, cz] = this.world.cellOf(this.player.position.x, this.player.position.z);
    const target = this.currentTargetCell();
    this.path = findPath(this.world, [cx, cz], target);
    this.pathIndex = 1;
    this.repathTimer = 1.4;
  }

  // 逃离最近的奶蛙：朝远离它的方向找一条不被挡的直线
  flee(threat, dt) {
    this.fleeing = true;
    const { frog } = threat;
    const px = this.player.position.x, pz = this.player.position.z;
    let ax = px - frog.pos.x, az = pz - frog.pos.z;
    const len = Math.hypot(ax, az) || 1;
    ax /= len; az /= len;
    // 优先正后方，其次 ±30/±55/±80 度，挑第一个前面 2.4m 没有被挡的
    const base = Math.atan2(ax, az);
    for (const off of [0, 0.52, -0.52, 0.96, -0.96, 1.4, -1.4]) {
      const a = base + off;
      const dx = Math.sin(a), dz = Math.cos(a);
      const tx = px + dx * 2.4, tz = pz + dz * 2.4;
      if (this.world.pointBlocked(px + dx * 0.9, pz + dz * 0.9)) continue;
      if (!this.world.isWalkable(Math.floor(tx / C), Math.floor(tz / C))) continue;
      this.player.bot.yaw = Math.atan2(-dx, -dz);
      this.player.bot.forward = 1;
      this.player.bot.strafe = 0;
      const needSprint = this.player.speedUnlocked && this.player.stamina > 18;
      this.player.bot.sprint = needSprint;
      this.path = [];
      this.repathTimer = 0;
      return;
    }
    // 全被挡住：贴墙原地绕，至少别停
    this.player.bot.forward = 1;
    this.player.bot.strafe = 0.6;
    this.nudgeT = Math.max(this.nudgeT, 0.5);
  }

  update(dt) {
    if (!this.active) return;
    this.elapsed += dt;
    const game = this.game;
    const bot = this.player.bot;
    if (!bot) return;

    // 离开 demo 状态（被抓/胜利）就交还控制
    if (game.state !== 'demo') { bot.forward = 0; bot.sprint = false; return; }

    this.fleeing = false;

    // 目标奶片已被吃掉 -> 前进一格并重新规划剩余巡回
    if (this.targetCandy != null && game.collected[this.targetCandy]) {
      this.tourPos++;
      this.targetCandy = null;
      this.planTour();
      this.path = [];
      this.repathTimer = 0;
    }

    if (this.reachedExit) { bot.forward = 0; bot.sprint = false; return; }

    const ex = this.world.exitInfo;
    const distExit = Math.hypot(this.player.position.x - ex.x, this.player.position.z - ex.z);
    const allCandies = game.candiesCollected >= TOTAL_CANDIES;
    if (allCandies && distExit < 2.6) {
      this.reachedExit = true;
      bot.forward = 0;
      bot.sprint = false;
      game.demoReachExit?.();
      return;
    }

    const nearest = this.nearestFrog();

    // 1) 保命优先：奶蛙贴上来就跑，跑的同时也不停
    if (nearest.dist < FLEE_RADIUS) {
      this.flee(nearest, dt);
      this.trackStuck(dt);
      return;
    }

    // 2) 需要龙奶：SAN 低时顺路去喝（拾取由 updateSan 判定，和真人一样）
    if (this.milkTarget && (this.milkTarget.collected || !this.milkTarget.available)) this.milkTarget = null;
    if (!this.milkTarget && game.milkUnlocked && game.san < MILK_SAN) {
      let best = null, bd = Infinity;
      for (const m of this.world.dragonMilk) {
        if (!m.available || m.collected || !m.group.visible) continue;
        const d = Math.hypot(m.x - this.player.position.x, m.z - this.player.position.z);
        if (d < bd) { bd = d; best = m; }
      }
      if (best) {
        this.milkTarget = best;
        this.path = [];
        this.repathTimer = 0;
      }
    }
    if (this.milkTarget) {
      const d = Math.hypot(this.milkTarget.x - this.player.position.x, this.milkTarget.z - this.player.position.z);
      if (d < 1.7) this.milkTarget = null;   // 已经进到拾取半径，交给游戏判定
    }

    // 3) 沿路径走
    this.repathTimer -= dt;
    if (this.repathTimer <= 0 || this.path.length === 0) this.repath();
    if (this.path.length === 0) { bot.forward = 0; bot.sprint = false; this.trackStuck(dt); return; }

    while (this.pathIndex < this.path.length) {
      const [wx, wz] = this.path[this.pathIndex];
      const tx = (wx + 0.5) * C, tz = (wz + 0.5) * C;
      if (Math.hypot(tx - this.player.position.x, tz - this.player.position.z) < 0.9) this.pathIndex++;
      else break;
    }

    if (this.pathIndex >= this.path.length) {
      const target = this.currentTargetCell();
      const tx2 = (target[0] + 0.5) * C, tz2 = (target[1] + 0.5) * C;
      const dx2 = tx2 - this.player.position.x, dz2 = tz2 - this.player.position.z;
      const d2 = Math.hypot(dx2, dz2);
      if (d2 > 0.5) {
        bot.yaw = this.steerTo(tx2, tz2);
        bot.forward = 1;
        bot.strafe = 0;
      } else {
        bot.forward = 0;
      }
      bot.sprint = this.sprintWanted(nearest);
      this.repathTimer = 0.5;
      this.trackStuck(dt);
      return;
    }

    // 纯追踪：直接瞄准「前方看得见的最远航点」，而不是逐格中心。
    // 逐格中心会让机器人在每个拐角先刹车再转身，实测平均只有 2.5m/s 还会贴着家具磨。
    let aim = this.pathIndex;
    for (let k = Math.min(this.path.length - 1, this.pathIndex + 5); k > this.pathIndex; k--) {
      const [ax, az] = this.path[k];
      if (this.segClear(this.player.position.x, this.player.position.z, (ax + 0.5) * C, (az + 0.5) * C, 0.46)) { aim = k; break; }
    }
    const [wx, wz] = this.path[aim];
    const tx = (wx + 0.5) * C, tz = (wz + 0.5) * C;
    if (aim !== this.pathIndex && Math.hypot(tx - this.player.position.x, tz - this.player.position.z) < 1.1) this.pathIndex = aim + 1;
    bot.yaw = this.steerTo(tx, tz);
    bot.forward = 1;
    bot.strafe = 0;
    bot.sprint = this.sprintWanted(nearest);

    // 4) 停下来看一眼奶蛙：只有在足够安全、且时间很短的时候才做
    if (!this.lookbackDone && game.candiesCollected >= Math.max(2, Math.round(TOTAL_CANDIES / 6))) {
      this.lookbackDone = true;
      if (nearest.dist > SAFE_IDLE) this.lookbackTimer = 1.0;
    }
    if (this.lookbackTimer > 0 && nearest.dist > SAFE_IDLE * 0.8) {
      this.lookbackTimer -= dt;
      bot.forward = 0;
      bot.sprint = false;
      if (nearest.frog) {
        bot.yaw = Math.atan2(
          -(nearest.frog.pos.x - this.player.position.x),
          -(nearest.frog.pos.z - this.player.position.z),
        );
      }
    } else if (this.lookbackTimer > 0) {
      this.lookbackTimer = 0;  // 奶蛙太近，取消展示，继续跑
    }

    this.trackStuck(dt);
  }

  // 冲刺同样是真人可做的操作：按住 SHIFT 把体力跑到 25 留一点应急，再走回满。
  // 这样平均速度 ≈5.3m/s（纯走只有 4.1），是这条路线上唯一合法的提速手段。
  sprintWanted(nearest) {
    if (!this.player.speedUnlocked) return false;
    if (nearest.dist < PRESS_RADIUS) return this.player.stamina > 12;  // 它贴近了，先甩开
    return this.player.stamina > 26;
  }

  trackStuck(dt) {
    const moved = Math.hypot(this.player.position.x - this.lastPos.x, this.player.position.z - this.lastPos.z);
    this.lastPos = { x: this.player.position.x, z: this.player.position.z };
    // 判定要抓「慢爬」：贴着家具挪 0.1m/s 时位移不为 0，但一样是卡住
    if (moved < 0.011) this.stuckTimer += dt;
    else { this.stuckTimer = Math.max(0, this.stuckTimer - dt); if (this.stuckCount > 0) this.stuckCount = Math.max(0, this.stuckCount - dt * 0.5); }

    if (this.stuckTimer > 0.8) {
      this.stuckTimer = 0;
      this.stuckCount++;
      // 先横向蹭一下再重算路径
      this.nudgeT = 0.45;
      this.nudgeDir = this.stuckCount % 2 ? 1 : -1;
      this.path = [];
      this.repathTimer = 0;
      if (this.stuckCount >= 3) {
        // 连着卡：先把当前目标晾一会儿（12 秒后再来），换别的奶片，避免原地死磨
        this.stuckCount = 0;
        if (this.milkTarget) this.milkTarget = null;
        else if (this.targetCandy != null) this.banned.set(this.targetCandy, this.elapsed + 12);
        this.targetCandy = null;
        this.planTour();
        this.path = [];
        this.repathTimer = 0;
      }
    }
    if (this.nudgeT > 0) {
      this.nudgeT -= dt;
      if (this.player.bot) this.player.bot.strafe = this.nudgeDir * 0.55;
    }
  }
}
