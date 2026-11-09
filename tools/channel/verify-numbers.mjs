// 复核关键数字（世界坐标），供 docs/scene-audit-static.md 引用
const C = 3.2, WH = 3.45;
const cc = (cx, cz) => [(cx + 0.5) * C, (cz + 0.5) * C];
const r = (v, n = 2) => Math.round(v * 10 ** n) / 10 ** n;
const out = [];
const P = (...a) => out.push(a.join(' '));

P('== 1. addTable 台面与腿的缝 ==');
for (const h of [0.66, 0.78, 0.8, 0.92, 0.94]) {
  P('h=' + h, '腿顶', r(h - 0.09), '台面底', r(h - 0.045), '缝隙', r((h - 0.045) - (h - 0.09), 3));
}

P('\n== 2. 椅子到桌子的最近距离 ==');
const chairTable = [
  ['门厅接待', 3.3, 1.35, 3.3, 1.95, 2.5, 1.0],
  ['园长室', 23.3, 1.4, 23.3, 2.1, 2.4, 1.0],
  ['教室 A1', 12.3, 3.0, 12.3, 3.7, 1.5, 0.8],
  ['教室 A2', 12.3, 4.45, 12.3, 3.7, 1.5, 0.8],
  ['教室 B1', 15.0, 3.1, 15.0, 3.8, 1.5, 0.8],
  ['教室 B2', 15.0, 4.55, 15.0, 3.8, 1.5, 0.8],
  ['教室 C1', 13.6, 4.65, 13.6, 5.35, 1.5, 0.8],
  ['教室 C2', 13.6, 6.05, 13.6, 5.35, 1.5, 0.8],
  ['教室 D', 14.4, 5.35, 13.6, 5.35, 1.5, 0.8],
];
for (const [name, chx, chz, tx, tz, w, d] of chairTable) {
  const [x, z] = cc(chx, chz), [ax, az] = cc(tx, tz);
  const x0 = ax - w / 2, x1 = ax + w / 2, z0 = az - d / 2, z1 = az + d / 2;
  const hs = 0.275;
  const dx = Math.max(x0 - (x + hs), (x - hs) - x1, 0);
  const dz = Math.max(z0 - (z + hs), (z - hs) - z1, 0);
  P(name.padEnd(8), '椅', r(x) + ',' + r(z), '桌', r(ax) + ',' + r(az), '缝隙', r(Math.hypot(dx, dz)) + ' m');
}
P('食堂 6 椅（桌 4.2 x 1.5 @ 13.5,14.3）');
for (const [chx, chz] of [[12.0, 13.3], [13.5, 13.3], [15.0, 13.3], [12.0, 15.3], [13.5, 15.3], [15.0, 15.3]]) {
  const [x, z] = cc(chx, chz), [ax, az] = cc(13.5, 14.3);
  const x0 = ax - 2.1, x1 = ax + 2.1, z0 = az - 0.75, z1 = az + 0.75;
  const hs = 0.275;
  const dx = Math.max(x0 - (x + hs), (x - hs) - x1, 0);
  const dz = Math.max(z0 - (z + hs), (z - hs) - z1, 0);
  P('  椅', chx + ',' + chz, 'world', r(x) + ',' + r(z), '缝隙', r(Math.hypot(dx, dz)) + ' m');
}

P('\n== 3. 长椅腿 vs 座面 ==');
P('门厅 座面 x', r(1.75 * C - 0.3), '..', r(1.75 * C + 0.3), 'z', r(4.7 * C - 1.0), '..', r(4.7 * C + 1.0), '| 腿 z', r(3.9 * C), r(5.5 * C), '| 腿在座面外', r(4.7 * C - 1.0 - 3.9 * C) + ' m');
P('出口厅 座面 x', r(23 * C - 1.2), '..', r(23 * C + 1.2), '| 腿 x', r(22 * C), r(24 * C), '| 外溢', r(23 * C - 1.2 - 22 * C) + ' m');
P('走廊 座面 x', r(22.4 - 0.275), '..', r(22.4 + 0.275), '| 腿 x', 21.65, 23.15, '| 外溢', r(22.4 - 0.275 - 21.65) + ' m');

P('\n== 4. 园长室台灯 vs 桌子 ==');
const dx2 = cc(23.3, 2.1), lamp = [22.35 * C, 2.0 * C];
P('桌中心', r(dx2[0]) + ',' + r(dx2[1]), '桌 AABB x', r(dx2[0] - 1.2), '..', r(dx2[0] + 1.2), 'z', r(dx2[1] - 0.5), '..', r(dx2[1] + 0.5));
P('灯', r(lamp[0]) + ',' + r(lamp[1]), '灯到桌中心', r(Math.hypot(lamp[0] - dx2[0], lamp[1] - dx2[1])) + ' m');

P('\n== 5. 食堂桌面物 ==');
const t = cc(13.5, 14.3);
P('桌中心', r(t[0]) + ',' + r(t[1]), 'AABB x', r(t[0] - 2.1), '..', r(t[0] + 2.1), 'z', r(t[1] - 0.75), '..', r(t[1] + 0.75), '台面顶 y', r(0.94 + 0.045));
for (const [cx, cz] of [[12.3, 14.2], [14.7, 14.4], [13.0, 13.5], [15.1, 14.9]]) {
  P('  纸杯用 cx*C ->', r(cx * C) + ',' + r(cz * C), ' 正确应为', r((cx + 0.5) * C) + ',' + r((cz + 0.5) * C), ' 偏差', r(Math.hypot(cx * C - (cx + 0.5) * C, cz * C - (cz + 0.5) * C)) + ' m');
}
for (let i = 0; i < 4; i++) {
  const cx = 11.8 + i * 1.1, cz = 13.2 + (i % 2) * 1.9;
  P('  派对帽', i, 'cell', r(cx) + ',' + r(cz), 'world', r((cx + 0.5) * C) + ',' + r((cz + 0.5) * C), ' | 在桌内?', (cx + 0.5) * C >= t[0] - 2.1 && (cx + 0.5) * C <= t[0] + 2.1 && (cz + 0.5) * C >= t[1] - 0.75 && (cz + 0.5) * C <= t[1] + 0.75);
}

P('\n== 6. 教室地球仪 vs 讲台 ==');
const pod = cc(15.4, 1.85);
P('讲台中心', r(pod[0]) + ',' + r(pod[1]), 'AABB x', r(pod[0] - 1.0), '..', r(pod[0] + 1.0), 'z', r(pod[1] - 0.425), '..', r(pod[1] + 0.425), '顶', r(0.8 + 0.045));
P('地球仪', r(15.4 * C) + ',' + r(1.85 * C), 'y 0.98..1.06', '距桌心', r(Math.hypot(15.4 * C - pod[0], 1.85 * C - pod[1])) + ' m');

P('\n== 7. 海报离墙距离（墙在 x=22.4 / z=22.4 等） ==');
const posters = [
  ['466 map', 6.94 * C, 4.35 * C, -Math.PI / 2, 22.4, 'x'],
  ['493 rules', 12.0 * C, 6.94 * C, Math.PI, 22.4, 'z'],
  ['492 drawing', 11.04 * C, 3.2 * C, Math.PI / 2, 35.2, 'x'],
  ['548 missing', 21.06 * C, 3.7 * C, Math.PI / 2, 67.2, 'x'],
  ['673 drawing', 4.2 * C, 9.96 * C, Math.PI, 32.0, 'z'],
  ['678 rules', 8.06 * C, 15.7 * C, Math.PI / 2, 25.6, 'x'],
];
for (const [name, px, pz, ry, wall, axis] of posters) {
  const n = [Math.sin(ry), Math.cos(ry)];
  const plane = axis === 'x' ? px + n[0] * 0.045 : pz + n[1] * 0.045;
  const gap = Math.abs(wall - plane);
  P(name.padEnd(12), '贴图面', r(plane), '墙', wall, '离墙', r(gap) + ' m');
}

P('\n== 8. 床 / 摇椅 / 毛绒 / 窗帘 ==');
P('床架 y', r(0.24 - 0.09), '..', r(0.24 + 0.09), '-> 悬空', r(0.24 - 0.09) + ' m');
P('床垫 y', r(0.4 - 0.08), '..', r(0.4 + 0.08));
const rs = 0.4;
const seatHalf = Math.abs(Math.sin(rs)) * 0.3 + Math.abs(Math.cos(rs)) * 0.45;
P('摇椅座面 z', r(11.8 * C - seatHalf), '..', r(11.8 * C + seatHalf), '靠背 z', r(12.15 * C - 0.04 * Math.cos(rs)), '..', r(12.15 * C + 0.04 * Math.cos(rs)), '间隙', r(12.15 * C - 0.04 * Math.cos(rs) - (11.8 * C + seatHalf)) + ' m');
P('毛绒球 y', r(0.62 - 0.15), '..', r(0.62 + 0.15), '-> 悬空', r(0.62 - 0.15) + ' m; x', r(2.1 * C), '最近床心 x', r(1.95 * C), ' 差', r(Math.abs(2.1 * C - 1.95 * C)));
P('窗帘 y', r(1.42 - 1.075), '..', r(1.42 + 1.075), 'x', r(1.12 * C), ' 墙面 x', 3.2, ' 离墙', r(1.12 * C - 3.2) + ' m, 离顶', r(WH - (1.42 + 1.075)) + ' m');

P('\n== 9. 粉笔 / 储物柜 ==');
P('粉笔盒 y', r(1.65 - 0.45), '..', r(1.65 + 0.45), 'x', r(15.6 * C), '黑板 x 到', r(13.5 * C + 2.2), '-> 粉笔在空中高', r(1.65) + ' m');
for (const [cx, cz, ry, count] of [[8.12, 5.2, 0, 2], [21.06, 14.2, Math.PI / 2, 3]]) {
  const x = (cx + 0.5) * C, z = (cz + 0.5) * C, w = 0.55 * count;
  const cw = Math.abs(Math.cos(ry)) * 0.5 + Math.abs(Math.sin(ry)) * w;
  const cd = Math.abs(Math.sin(ry)) * 0.5 + Math.abs(Math.cos(ry)) * w;
  P('储物柜', cx + ',' + cz, '中心', r(x) + ',' + r(z), 'AABB x', r(x - cw / 2), '..', r(x + cw / 2), 'z', r(z - cd / 2), '..', r(z + cd / 2));
}
P('中央走廊 x 范围 25.6..32.0；柜子占 27.334..27.834 -> 立在走廊中间');
console.log(out.join('\n'));
