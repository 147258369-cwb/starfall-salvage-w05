// 奶蛙乐园：午夜奶片 — 静态配置与地图布局
export const GRID = { W: 27, H: 21, cell: 3.2, wallH: 3.45 };
// 奶片总数：走廊密铺、房间点缀。解锁门槛按 1/3、2/3 取整。
export const TOTAL_CANDIES = 24;
export const UNLOCK_MAP_AT = 8;
export const UNLOCK_SPEED_AT = 16;
// 龙奶每局随机分布在不同房间；交互距离为水平世界坐标距离。
export const DRAGON_MILK = { count: 3, interactionRadius: 1.6, minSeparation: 12 };
export const PLAYER = {
  walkSpeed: 4.1,
  sprintSpeed: 7.4,
  radius: 0.46,
  eyeHeight: 1.62,
  mouseSensitivity: 0.0021,
  staminaMax: 100,
  staminaDrain: 27,
  staminaRegen: 20,
};
export const SPAWN_CELL = [2, 2];
export const SPAWN_YAW = -Math.PI * 0.75; // 面向东南：奶片、门厅与走廊入口

// x,z 为格子坐标，w,h 为格数；房间/走廊内部都会挖空
export const ROOMS = [
  { id: 'entry',     name: '门厅',   x: 1,  z: 1,  w: 6, h: 6,  zone: 'entry' },
  { id: 'classroom', name: '教室',   x: 11, z: 1,  w: 6, h: 6,  zone: 'classroom' },
  { id: 'office',    name: '园长室', x: 21, z: 1,  w: 5, h: 6,  zone: 'classroom' },
  { id: 'nap',       name: '午睡室', x: 1,  z: 11, w: 6, h: 8,  zone: 'nap' },
  { id: 'canteen',   name: '食堂',   x: 11, z: 11, w: 6, h: 8,  zone: 'canteen' },
  { id: 'exitHall',  name: '出口厅', x: 21, z: 11, w: 5, h: 8,  zone: 'exit' },
];
export const CORRIDORS = [
  { id: 'central', x: 8,  z: 1, w: 2, h: 18, zone: 'corridor' },
  { id: 'right',   x: 18, z: 1, w: 2, h: 18, zone: 'corridor' },
  { id: 'main',    x: 1,  z: 8, w: 25, h: 2, zone: 'corridor' },
];
// 门洞：把墙格挖成可通行
export const DOORS = [
  [7, 3], [3, 7],            // 门厅
  [10, 3], [14, 7], [17, 4], // 教室
  [20, 3], [23, 7],          // 园长室
  [3, 10], [7, 15],          // 午睡室
  [14, 10], [17, 15],        // 食堂
  [23, 10], [20, 15],        // 出口厅
];
// 24 片：走廊为主（15 片），房间点缀（9 片）。
// 顺序即 Demo 自动通关的默认路线的起点参考（Demo 会按最近邻重排）。
export const CANDY_CELLS = [
  // 门厅
  [5, 3],
  // 教室
  [12, 2], [15, 5],
  // 园长室
  [25, 5],
  // 午睡室
  [3, 13], [4, 17],
  // 食堂
  [12, 12], [15, 17],
  // 出口厅
  [24, 15],
  // 中央走廊 x8-9
  [8, 2], [9, 6], [8, 10], [9, 13], [8, 16],
  // 主走廊 z8-9
  [3, 8], [6, 9], [11, 8], [16, 9], [21, 8], [25, 9],
  // 右走廊 x18-19
  [19, 3], [18, 7], [19, 12], [18, 16],
];
export const FROG_DEFS = [
  { variant: 'small', cell: [14, 13], voice: 0 },
  { variant: 'fat',   cell: [4, 17],  voice: 1 },
  { variant: 'tall',  cell: [19, 4],  voice: 2 },
  { variant: 'small', cell: [9, 17],  voice: 3 },
];
export const FOOTSTEP_INTERVAL = { walk: 0.46, sprint: 0.3 };

// 出口：出口厅东侧外墙（x=26 墙格），玩家在厅内 x≈25 处互动
export const EXIT = {
  wallCell: [26, 14],
  insideCell: [25, 14],
  doorHeight: 2.35,
};

export const STORY = [
  { chapter: '1999 · 奶蛙乐园', text: '1999年，奶蛙乐园举办最后一场生日会。' },
  { chapter: '生日会 · 19:30', text: '老师说：吃了奶片，就能变成奶龙。' },
  { chapter: '最后一个孩子', text: '所有孩子都吃了。只有你，把八片奶片藏了起来。' },
  { chapter: '第二天 · 06:00', text: '第二天，乐园空了。只剩那首歌——我是奶龙，我才是奶龙。' },
  { chapter: '现在 · 22:07', text: '推土机明天就来。你回来取走奶片。' },
];

export const FROG_LINES = [
  { speaker: '奶蛙', text: '我是奶龙！我才是奶龙！' },
  { speaker: '胖奶蛙', text: '奶……奶片……给我……' },
  { speaker: '长腿奶蛙', text: '龙……奶龙……都是奶龙……' },
  { speaker: '小奶蛙', text: '嘘……别怕……留下来……' },
];

export const ZONE_NAMES = {
  entry: '门厅', classroom: '教室', nap: '午睡室',
  canteen: '食堂', corridor: '走廊', exit: '出口',
};

// 剧情镜头路线（格子坐标）。
//
// 【重要】这条线是"导轨"，不是"折线"：摄像机沿它做匀速曲线运动，永远不在这里掉头。
// 掉头会由「镜头段落表」STORY_SHOTS 负责 —— 转到下一段时，摄像机回退/跳位，
// 再花几秒平滑地转过去。原来的写法把"回折"写进路径里（例如 ... [13.2,3.6], [14.0,7.6] ... 走进去又原路退出来），
// 网格寻路会在折返点生成一次 180 度掉头，而走廊只有一格宽，只能原地甩头，所以整段镜头抽搐。
//
// 顺序：门厅 -> 主走廊 -> 教室 -> 主走廊 -> 午睡室 -> 主走廊 -> 食堂 -> 出口厅
export const STORY_PATH = [
  [2.4, 2.3],   // 门厅出生点
  [2.8, 6.2],   // 门厅往南
  [4.2, 8.6],   // 出门厅，进主走廊
  [9.0, 8.6],   // 主走廊往东
  [11.8, 8.2],  // 拐进教室
  [12.6, 6.4],  // 教室内
  [13.5, 4.2],  // 讲台前
  [13.5, 3.6],  // 教室北侧（黑板前）
  [14.4, 6.6],  // 折回教室南侧（这一段由段落表控制，不掉头）
  [14.2, 9.5],  // 出教室进主走廊
  [13.4, 13.2], // 下到食堂
  [13.0, 16.0], // 食堂蛋糕前
  [14.4, 12.2], // 食堂北端
  [17.4, 8.6],  // 回主走廊
  [3.6, 8.6],   // 主走廊往西
  [3.6, 12.4],  // 下到午睡室
  [3.4, 16.6],  // 午睡室深处
  [20.4, 8.6],  // 主走廊往东（长镜头）
  [23.4, 9.8],  // 转到出口厅
  [24.0, 13.6], // 出口厅
  [24.2, 15.2], // 安全出口前
];

// 镜头段落表：按时间顺序把上面的导轨切成若干段。
// from/to 是在 STORY_PATH 上的弧长比例（0..1），yaw 是这一段机头相对行进方向的偏移（度），
// look 是这一段的注视倾向：fwd 看前方 / side 侧看（望向墙面或房间中央）。
// 每段之间由镜头自动做一次平滑过渡（不再原地猛转）。
export const STORY_SHOTS = [
  { from: 0.00, to: 0.16, yaw: -18, name: '门厅' },
  { from: 0.16, to: 0.30, yaw: 0, name: '主走廊往东' },
  { from: 0.30, to: 0.52, yaw: 22, name: '教室' },
  { from: 0.52, to: 0.66, yaw: 0, name: '下到食堂' },
  { from: 0.66, to: 0.72, yaw: -25, name: '蛋糕' },
  { from: 0.72, to: 0.86, yaw: 0, name: '回主走廊往西' },
  { from: 0.86, to: 0.92, yaw: 30, name: '午睡室' },
  { from: 0.92, to: 1.00, yaw: 0, name: '出口厅' },
];

// 菜单镜头：从食堂南侧看向蛋糕与生日横幅
export const MENU_CAM = { pos: [12.35, 2.08, 17.25], look: [13.65, 1.18, 12.55] };

export function buildGrid() {
  const { W, H } = GRID;
  const grid = Array.from({ length: H }, () => new Array(W).fill(0));
  const zone = Array.from({ length: H }, () => new Array(W).fill(null));
  const carve = (r) => {
    for (let z = r.z; z < r.z + r.h; z++) {
      for (let x = r.x; x < r.x + r.w; x++) {
        if (x > 0 && x < W - 1 && z > 0 && z < H - 1) {
          grid[z][x] = 1;
          zone[z][x] = r.zone;
        }
      }
    }
  };
  ROOMS.forEach(carve);
  CORRIDORS.forEach(carve);
  for (const [x, z] of DOORS) {
    grid[z][x] = 1;
    if (!zone[z][x]) zone[z][x] = 'corridor';
  }
  return { grid, zone };
}

export function cellCenter(cx, cz, y = 0) {
  const c = GRID.cell;
  return [ (cx + 0.5) * c, y, (cz + 0.5) * c ];
}
export function worldToCell(x, z) {
  return [ Math.floor(x / GRID.cell), Math.floor(z / GRID.cell) ];
}
