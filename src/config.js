// 奶蛙乐园：午夜奶片 — 静态配置与地图布局
export const GRID = { W: 27, H: 21, cell: 3.2, wallH: 3.45 };
export const TOTAL_CANDIES = 8;
export const UNLOCK_MAP_AT = 3;
export const UNLOCK_SPEED_AT = 6;
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
export const CANDY_CELLS = [
  [4, 4],   // 门厅
  [13, 3],  // 教室
  [23, 4],  // 园长室
  [9, 13],  // 中央走廊
  [14, 15], // 食堂
  [3, 15],  // 午睡室
  [23, 9],  // 主走廊东段
  [23, 16], // 出口厅
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

// 剧情镜头路线（格子坐标，沿可行走空间）
export const STORY_PATH = [
  [2.3, 2.2], [3.4, 7.4], [3.4, 8.6],
  [13.6, 8.6], [14.0, 7.6], [13.2, 3.6], [14.0, 7.6],
  [14.0, 8.6], [14.0, 10.6], [13.4, 14.8],
  [14.0, 10.6], [13.6, 8.6],
  [3.4, 8.6], [3.4, 10.6], [3.4, 15.8],
  [3.4, 10.6], [3.4, 8.6],
  [22.6, 8.6], [22.6, 10.6], [22.8, 15.2],
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
