# 《奶蛙乐园：午夜奶片》贴图系统

> 文件：`src/textures.js` · 预览：`tools/texture-preview.html` · 契约：`docs/CONTRACT.md`
> 全部贴图由 Canvas 2D 程序化生成：零外部图片、零网络请求、零 renderer 依赖。

---

## 1. 快速开始

```js
import * as THREE from 'three';
import { ZONES, createTextures } from './textures.js';

const tex = createTextures();

const wall  = tex.wallpaper('entry');   // THREE.CanvasTexture, 512×512, RepeatWrapping
const floor = tex.floor('classroom');
const ceil  = tex.ceiling('nap');
const trim  = tex.trim('canteen');      // 512×128

const poster = tex.poster('rules');     // 512×768, ClampToEdgeWrapping
const exit   = tex.sign('安全出口');     // 640×200, 绿色发光
const sign2  = tex.sign('教室', { sub: 'CLASSROOM' }); // 512×160, 木牌
const face   = tex.frogFace();          // 512×512
const glow   = tex.glow();              // 512×512 白色径向渐变（带 alpha）

// 材质（示例）
const mat = new THREE.MeshStandardMaterial({ map: wall, roughness: 0.9, metalness: 0 });
wall.repeat.set(2, 1);                  // 平铺次数由使用方决定；缓存纹理共享 repeat！

// 场景销毁时释放全部
tex.dispose();
```

`createTextures()` 返回的 API **严格**为：

| 方法 | 参数 | 返回 | 尺寸 |
|---|---|---|---|
| `wallpaper(zone)` | `zone ∈ ZONES` | CanvasTexture | 512×512，平铺 |
| `floor(zone)` | 同上 | CanvasTexture | 512×512，平铺 |
| `ceiling(zone)` | 同上 | CanvasTexture | 512×512，平铺 |
| `trim(zone)` | 同上 | CanvasTexture | 512×128，平铺 |
| `poster(kind)` | `frog/birthday/rules/drawing/missing/map/menu` | CanvasTexture | 512×512（frog）或 512×768 |
| `sign(text, opts = {})` | `text: string`，`opts: { bg, fg, glow, sub }` | CanvasTexture | 512×160；`安全出口` 自动 640×200 |
| `frogFace()` | — | CanvasTexture | 512×512 |
| `glow()` | — | CanvasTexture | 512×512 |
| `dispose()` | — | `void` | 释放缓存中的全部纹理 |

`ZONES = ['entry','classroom','nap','canteen','corridor','exit']`。

### 纹理属性保证

对每一次返回：

- `colorSpace === THREE.SRGBColorSpace`
- `anisotropy === 4`
- `generateMipmaps === true`，`minFilter = LinearMipmapLinearFilter`
- 平铺类（wallpaper / floor / ceiling / trim）：`wrapS = wrapT = THREE.RepeatWrapping`
- 单图类（poster / sign / frogFace / glow）：`wrapS = wrapT = THREE.ClampToEdgeWrapping`
- `texture.name` / `texture.userData` 带有 `{zone, kind}` 调试信息

### 缓存与释放

- 相同参数重复调用返回**同一个** texture 对象（`===`）；`sign()` 的缓存键包含排序后的 opts。
- `dispose()` 逐个 `texture.dispose()` 并清空缓存；之后再次调用会重新生成。
- 所有参数非法时抛出带中文提示的 `Error`（未知 zone / 未知 poster kind）。

---

## 2. 视觉基调

| 语义 | 色值 | 用途 |
|---|---|---|
| 奶油黄 | `#ffd9a0` | 门厅墙纸、蛋糕、暖光 |
| 粉 | `#f7b6c2` | 门厅腰线、食堂墙、蛋糕下层 |
| 薄荷 | `#a9d6c4` | 教室墙、蛋糕顶层、规则牌 |
| 木色 | `#b07a4a` | 教室地板、木牌、桌子 |
| 惊悚暗红棕 | `#1a0f12` / `#4a2a26` | 污渍、阴影、暗角 |
| 冷绿应急灯 | `#7dffb0` | 安全出口发光 |
| 脏紫 | `#3b2344` | 只在阴影/污渍里少量使用 |

原则：**结构色保持温和、低饱和；脏污只加在边缘、接缝、底部、转角**，整体不能脏到看不清图案。每张平铺图都经过同一套「颗粒 + 大尺度色差 + 浮尘」收尾（`finishTile`），因此六个区域即使配色不同，也共享同一种"1999 年旧涂料"的质感。

---

## 3. 六区域设计

### 3.1 entry · 门厅

**意图**：最后一场生日会的入口。暖黄壁纸、粉色小蛙、水磨石地面，体面、干净、但一切都在褪色。

| 表面 | 设计 |
|---|---|
| wallpaper | `#ffd9a0` 底 + 32px 竖向壁纸条纹 + 128px 双细线；每 256px 一条粉色腰线（带奶油小圆点）；19px 粉色小蛙剪影按 64px 步长错位排列，蛙眼/嘴用更深的粉勾出 |
| floor | 米色水磨石 `#e7dac0`，2×2 大砖（256px 缝），720+ 石粒（米白/浅绿/脏粉/灰褐），缝里积灰，局部发白的踩踏区 |
| ceiling | 奶油色矿棉板 256px 网格 + 吸音针孔 + 水渍/潮痕 + 暖黄灯盘 |
| trim | 奶油木墙裙 + 粉腰线 + 小蛙贴纸，底边积灰 |

调色板：`#ffd9a0` / `#f7b6c2` / `#e7dac0` / `#ffe9b8` / 旧木 `#c9a26a`。
建议 repeat：墙面 `(2,1)` 或 `(1,1)`，地面 `(2,2)`。

### 3.2 classroom · 教室

**意图**：孩子们画画的地方。薄荷绿墙、蜂蜜色木地板，蜡笔涂鸦和身高尺还留在墙上。

| 表面 | 设计 |
|---|---|
| wallpaper | 薄荷 `#a9d6c4` 乳胶漆（滚筒云斑）；蜡笔涂鸦：太阳、彩虹、房子、三个火柴人、小花；右侧 90–150cm 身高尺（刻度+数字+「身高」）；1.1–1.3m 高度的小椅子磨痕；一个灰手印 |
| floor | 蜂蜜木地板：8 条 64px 横向木板，逐板色差、正弦木纹、木节、板端接缝、缝隙积灰、发白的踩踏区、细划痕 |
| ceiling | 米白矿棉板 + 针孔 + 水渍 + 裂缝（**不放灯盘**，与门厅区分） |
| trim | 薄荷色木墙裙，掉漆露白、蜡笔道子、底边脏 |

调色板：`#a9d6c4` / `#b07a4a` / 蜡笔 `#cf6b5f` `#d9a13f` `#7fa06a` `#5b83a8` `#b57fa6`。
彩蛋：手印、身高尺、椅子磨痕，近看才能发现。

### 3.3 nap · 午睡室

**意图**：最冷的一间。灰蓝星月墙纸受潮褪色，深蓝地毯吸走所有声音。

| 表面 | 设计 |
|---|---|
| wallpaper | 灰蓝 `#7d90a4` 底，错位星月图案（四角星+月牙，奶白、低对比），大面积褪色/潮湿云斑，顶部渗水痕（两端淡入，纵铺无硬缝），右下一块撕开的墙纸：露灰泥、纸的厚度、翘起纸角 |
| floor | 深蓝 `#2b3a53` 地毯：8px 织纹、2600 根绒纤维、踩踏暗块、褪色亮斑、毛屑 |
| ceiling | 冷灰蓝 `#5f6a76` 矿棉板，重水渍、霉点、裂缝，几条夜光星贴纸 |
| trim | 深藏青 `#33405a` 踢脚线 |

调色板：`#7d90a4` / `#2b3a53` / `#5f6a76` / `#33405a` / 星 `#e6eeea`。
建议：墙纸纵铺 repeat 1（撕纸洞在墙上只出现一次/面墙更自然）。

### 3.4 canteen · 食堂

**意图**：最温馨也最脏。粉色糖纸墙、生日三角旗、黑白棋盘地，奶油和油渍一起留在墙上。

| 表面 | 设计 |
|---|---|
| wallpaper | 粉 `#f7b6c2` + 64px 糖纸条纹；每张图两条三角旗串（32px 步长，wrap-aware，接缝处旗子连续）；20 个糖纸（扭结+白腰封）；彩纸屑；大块油渍、奶油手印、椅子高度磨弧 |
| floor | 8×8 黑白棋盘（64px），白砖泛黄、黑砖磨亮；缺角、裂缝、鞋印、拖把痕、食物污渍（暗红棕/芥末黄） |
| ceiling | 暖粉米色矿棉板 + 暖灯盘 + 残留彩纸屑 + 水渍 |
| trim | 奶白+粉线墙裙，油渍和磨痕最多 |

调色板：`#f7b6c2` / `#ffce85` / `#8fcbb5` / `#e0ae4a` / `#e8798f` / 棋盘 `#2e2b29` `#e8e0cb`。

### 3.5 corridor · 走廊

**意图**：医院式的长走廊。奶黄小瓷砖 + 深绿墙裙，频闪灯照着永远擦不掉的污渍。

| 表面 | 设计 |
|---|---|
| wallpaper | 上部 32px 奶黄釉面小瓷砖（逐砖高光/色差，缺砖、裂砖、瓷缝），下部从 y=334 起为深绿 `#2f4a3d` 墙裙 + 奶黄压条；顺墙流下的污痕、踢脚磨脏、烟熏水渍 |
| floor | 灰绿亚麻地胶 `#7c8a7d`，128px 分格，1500 个深浅碎屑、鞋底黑印、拖擦弧、缝隙黑垢、霉斑、暗红棕拖痕 |
| ceiling | 灰米色矿棉板 + 冷白灯盘 + 重水渍 + 霉点 + 裂缝 |
| trim | 深绿木墙裙，掉漆露奶黄底 |

调色板：`#f4e6c6` / `#846e4e` / `#2f4a3d` / `#7c8a7d`。
注意：**深绿墙裙已在 wallpaper 里烘焙**，纵向 repeat 建议 1（否则会出现多层墙裙）；横向可自由平铺。

### 3.6 exit · 出口区

**意图**：乐园背后真实的建筑本体。水泥、绿色应急漆、安全出口标识，工业、冷、不容置疑。

| 表面 | 设计 |
|---|---|
| wallpaper | 混凝土 `#8c8b85`：骨料、模板缝（256px）、对拉螺栓孔+锈水、下部绿色应急漆（波浪形漆边）、掉漆露混凝土、滴流、喷涂箭头、裂缝、底部脏 |
| floor | 混凝土 `#6f6f6a`，256px 切缝、磨损黄色安全线、机油渍、拖拽痕、裂缝 |
| ceiling | 深灰混凝土 `#4b4b48`，模板缝、锈水、水渍、护笼工业吊灯（暖光） |
| trim | 绿色钢制踢脚板：拉丝、铆钉、锈斑、划痕、凹痕 |

调色板：`#8c8b85` / `#6f6f6a` / `#3f6b4c` / `#c8a844` / `#ffeec2`（灯）。

---

## 4. 海报 / 告示（poster）

全部为复刻 1999 年幼儿园纸制品：米色纸基、纸纤维、霉点、水渍、折痕、胶带、卷边。单图 `ClampToEdgeWrapping`。

| kind | 尺寸 | 设计意图与关键文案 |
|---|---|---|
| `frog` | 512×512 | 奶蛙偶像贴纸：模切白边、薄荷放射光、半调点；黄绿圆脸、巨大白眼、极小瞳孔、诡异宽笑、腮红、嘴角奶渍；「奶蛙乐园」「奶 蛙」「MILK FROG」 |
| `birthday` | 512×768 | 1999 生日会海报：褪色纸、三角旗、「奶蛙乐园 / 生 日 会」「1999 · 最后一场」；三层蛋糕 + 八根蜡烛（八片奶片的隐喻）+ 小蛙装饰；「六月一日 · 下午三点」「每位小朋友都能领到一片奶片」；胶带、折痕、卷角 |
| `rules` | 512×768 | 游园规则：①不要给奶蛙喂奶片。②22:00 以后请勿在园内停留。③听到歌声时，请闭上眼睛。④不要回应自称「我是奶龙」的人。附英文小字、手印、红色「已作废 1999.6.2」印章 |
| `drawing` | 512×768 | 儿童蜡笔画：蜡笔蓝天/太阳/房子/草地，四个黄色小人依次变成奶蛙，最后一个被黑笔涂掉；「我和奶蛙一起玩」「大班 · 乐乐」「1999.5」 |
| `missing` | 512×768 | 寻人启事：「寻 人 启 事 / MISSING CHILDREN」；四张模糊儿童照片（色块剪影，无真人脸）；小满·6岁 / 阿伟·5岁 / 妞妞·6岁 / 乐乐·7岁；红笔圈出妞妞；「最后见到：1999.6.1」「地点：奶蛙乐园 · 午睡室门口」「如有线索，请联系奶蛙乐园值班室 1999-0601」 |
| `map` | 512×768 | 墙上平面图：网格纸 + 线框房间（教室/午睡室/食堂/走廊/门厅/活动室/安全出口）、红叉封锁、8 个奶片可能位置的金星、图例、「你在这里」「（出口在维修）」 |
| `menu` | 512×768 | 主菜单装饰画：暗色舞台、金色衬线标题「奶蛙乐园 / MIDNIGHT MILK CANDY」、幕布、暖光、奶蛙站在蛋糕旁、漂浮奶片、烛光、暗角；底部「主菜单」「1999.6.1 · 最后一场生日会」 |

贴墙建议：海报/告示用 `MeshStandardMaterial` 或 `MeshBasicMaterial` 贴平面即可；若需要厚度，用 1cm 的薄盒子。`poster('menu')` 适合全屏主菜单背景或立牌。

---

## 5. 标牌（sign）

```js
tex.sign('教室', { sub: 'CLASSROOM' });          // 木牌 512×160，奶油字
tex.sign('午睡室');                              // 木牌，仅大字
tex.sign('安全出口');                            // 自动 640×200，绿色 + 冷绿辉光 + 奔跑小人
tex.sign('食堂', { sub: 'CANTEEN', glow: false });
tex.sign('奶蛙乐园', { bg: '#2f4a3d', fg: '#ffe9b8', sub: 'MILK FROG PARK' });
```

- 非出口默认是**木牌**：木纹（跟随 `bg` 明暗）、倒角、四颗十字螺丝、旧化划痕、脏边。
- `opts.bg` / `opts.fg` 接受 CSS 颜色；`opts.glow` 为 `true` 或颜色字符串（如 `'#7dffb0'`），会在文字后加辉光并叠画一遍字。
- `opts.sub` 为副标题（英文/拼音/说明），自动排在主文字下方。
- 主文字自动缩放到安全宽度（`fitFont`），超长中文也不会顶到边框。
- 文本包含 `安全出口` 或 `EXIT` 时自动切换绿色出口牌版式（含奔跑小人、白色内框、辉光）。
- 同一 `text + opts` 只会生成一次，重复调用返回同一 texture。

---

## 6. 奶蛙正脸与光斑

### frogFace()

512×512，整张是奶蛙皮肤（可用于球体、公告牌、近距离贴脸惊吓）：

- 黄绿渐变皮肤 + 大尺度斑驳 + 深色斑点/疣粒 + 中心高光 + 暗角（球体感）。
- 巨大白眼、极小瞳孔（略向鼻梁内聚，显得正盯着你）、血丝、腮红、鼻孔、宽到不可能的笑、嘴角奶渍。
- 球体贴脸的朝向：`SphereGeometry` 的正面 `+Z` 对应纹理 `u=0.25`，而五官在 `u=0.5`，因此把球体绕 Y 旋转 `-Math.PI / 2` 即可正对镜头（见预览页）。
- 若用于公告牌，直接用 `PlaneGeometry` + 透明/不透明材质均可。

### glow()

512×512 白色径向渐变，中心不透明、边缘透明。用作假光池、粒子、灯晕：

```js
const mat = new THREE.MeshBasicMaterial({
  map: tex.glow(),
  transparent: true,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
});
```

---

## 7. 无缝平铺是怎么做的

1. **周期化图案**：所有网格/条带的步长整除 512（如 32 / 64 / 128 / 256），所以左右、上下边缘自然对齐；跨界的点、线、色块通过 `eachWrap()` 在相邻 tile 的对应位置重画一遍。
2. **可平铺噪声**：`tileNoise()` 使用环绕晶格（lattice 索引取模）生成值噪声，大尺度色差天然无缝；逐像素颗粒本身没有结构，接缝不可见。
3. **水渍/裂纹/石粒**：位置随机但形状参数预生成，然后环绕复制；相邻 tile 的形状完全一致。
4. **避免破坏平铺的元素**：平铺纹理不使用覆盖全图的线性渐变/暗角；局部灯盘、图案都放在纹理内部。
5. **特别说明**：
   - corridor 的深绿墙裙烘焙在 wallpaper 里，纵向 repeat 建议 1。
   - exit 的黄色安全线位于纹理上缘，纵铺会形成每 512px 一条的车道线，属预期图案。
   - trim 是横向墙裙条，纵向平铺会重复"压条+底边脏"，但不会有像素断裂。

### 自检接缝的方法

预览页支持单张贴图 1:1（实际是 2×2）查看：

```
http://127.0.0.1:8000/tools/texture-preview.html#tex=wall:entry
http://127.0.0.1:8000/tools/texture-preview.html#tex=floor:canteen
http://127.0.0.1:8000/tools/texture-preview.html#tex=ceiling:corridor
http://127.0.0.1:8000/tools/texture-preview.html#tex=trim:exit
```

---

## 8. 预览页

```bash
python serve.py 8000
# 打开 http://127.0.0.1:8000/tools/texture-preview.html
```

页面用本地 `vendor/three.module.js` 渲染：

- **A** 六区域：墙纸 / 地面 / 天花 / 墙裙，均以 2×2 repeat 展示，验证平铺；
- **B** 全部 7 张海报；
- **C** 三种中文标牌（木牌、发光安全出口、门头）；
- **D** `frogFace` 球体贴脸 + 原始贴图 + `glow`；
- 深色背景，所有元素带中文标注；右上是操作提示，底部是生成说明。

**聚焦查看（URL hash）**：

| hash | 内容 |
|---|---|
| `#all`（默认） | 整张 contact sheet |
| `#zones` / `#posters` / `#signs` / `#frog` | 分区放大 |
| `#p=rules` 等 | 单张海报放大（frog/birthday/rules/drawing/missing/map/menu） |
| `#zone=entry` 等 | 单个区域的 4 个表面 |
| `#tex=wall:nap` | 单张贴图 1:1（wall/floor/ceiling/trim + zone） |
| `#tex=frogFace` / `#tex=glow` / `#tex=poster:rules` | 特殊贴图 |

**验收截图**（仓库根目录执行）：

```bash
node tools/shot.mjs http://127.0.0.1:8000/tools/texture-preview.html tools/shots/textures.png 4000 1600 1200
```

产物：`tools/shots/textures.png`（1600×1200）。页面加载时无控制台报错（`pageerror` / `console error` 均为空）。

---

## 9. 自测记录

- `tools/shots/api-check.mjs`：Playwright 加载预览页后在页面内动态 import 本模块，逐条断言 **102 项**（六个区域 × 四个表面尺寸/属性、7 张海报、标牌尺寸、缓存同一性、异常抛出、dispose 事件、重新生成）。
- 结果：**0 failures / 0 console errors / 0 page errors**；全部 36 张 texture 首次生成约 **0.7–0.8s**（headless Edge + SwiftShader，Windows）。
- 截图实际观察：
  - 六个区域在 2×2 平铺下风格统一但可一眼区分：门厅暖黄+粉腰线，教室薄荷+蜡笔涂鸦+木地板，午睡室灰蓝星月+深蓝地毯，食堂粉墙三角旗+黑白棋盘，走廊小瓷砖+深绿墙裙+灰绿地胶，出口水泥+绿色应急漆+工业吊灯。
  - 平铺纹理在 2×2 下接缝不可见；撕纸洞、三角旗、身高尺等元素重复位置符合"每面墙/每块地砖"的语义。
  - 海报中文可读；`rules` 第 4 条长句、`missing` 四张照片下方姓名均未越界/被遮挡；`map` 的红叉不再压住房间名。
  - `安全出口` 标牌辉光正常；`frogFace` 球体贴脸朝向正确、瞳孔"极小"的诡异感到位；`glow` 叠在深色背景上无黑边。

---

## 10. 如何新增

### 新增一个区域

1. 在 `ZONES` 数组里加入新 zone（会同时成为 `wallpaper/floor/ceiling/trim` 的合法参数）。
2. 新增 4 个绘制函数 `wallXxx / floorXxx / ceilXxx / trimXxx(ctx, w, h)`，风格上复用 `eachWrap`、`softStain`、`finishTile`、`dropCeiling`、`baseboard` 等工具。
3. 注册到文件末尾的 `WALLPAPER_DRAW / FLOOR_DRAW / CEILING_DRAW / TRIM_DRAW`。
4. 预览页 `ZONE_INFO` 加一行（中文名/英文/描述/强调色），布局会自动生成新行。
5. 用 `#tex=wall:<zone>` 检查接缝。

### 新增一张海报

1. 写 `posterXxx(ctx, w, h)`（非平铺，可自由使用 `paperBase`、`drawText`、`drawFrogHead`、`drawCake` 等）。
2. 在 `POSTER_DRAW` 注册 `{ draw: posterXxx, w: 512, h: 512|768 }`。
3. 在预览页 `POSTER_INFO` 与 `posterOrder` 里加入，自动参与排版与 `#p=` 聚焦。
4. 约定：纸基、旧化、留白边；中文用 `FONT`，衬线标题用 `SERIF`。

### 新增标牌样式

在 `buildSign()` 内按 `opts` 分支即可；缓存键会自动包含新字段。若要新增自动版式，参照 `isExit` 的检测方式。

### 保持无缝的检查清单

- 平铺元素不要依赖绝对坐标的渐变（覆盖全图的 linear/radial 都会破坏平铺）。
- 步长取 512 的因数；需要错位排布时用 `eachWrap`。
- 任何在边缘被裁掉的水渍/裂缝/石粒都必须环绕重画。
- 完成后用 `#tex=` 在 2×2 下肉眼检查四个边和中心十字。

---

## 11. 注意事项 / 坑

- **共享 repeat**：纹理是缓存的，`texture.repeat` 是纹理级属性。若同一张贴图要在不同墙面用不同 repeat，请 `texture.clone()` 并 `needsUpdate = true`（clone 共享 image，开销小）。
- **释放**：`dispose()` 只释放本模块缓存的纹理；材质里的 `map` 引用会变成已销毁状态，切换场景时先移除材质或重新取纹理。
- **颜色空间**：已设为 sRGB，不要在游戏代码里再改 `colorSpace`；使用 `MeshStandardMaterial` 时不要把它当数据贴图。
- **字体**：使用系统字体回退（Microsoft YaHei / SimHei / Source Han Serif / SimSun / KaiTi）。若目标机器缺少中文字体，文字会回退到系统默认；建议目标机为 Windows / 装有中文字体。
- **确定性**：所有随机数均由字符串种子驱动，同一浏览器多次生成像素一致；不同浏览器/不同 canvas 实现可能有 1–2 px 的抗锯齿差异，属正常。
- **性能**：全量 36 张首次生成 <1s（桌面级），显存约 40–60MB（含 mipmap）。若只需要某个区域，按需调用即可（惰性生成）。
- **不依赖 renderer**：可以在 `new WebGLRenderer()` 之前调用；在 Node 环境会因为没有 canvas 抛错（游戏只在浏览器跑）。
- **版权**：全部图形为原创程序化绘制，没有使用第三方图片素材；奶蛙是本项目自己的低多边形/贴图二创，与任何官方形象无关。

---

## 12. 文件清单

| 文件 | 作用 |
|---|---|
| `src/textures.js` | 全部贴图生成与缓存 API（唯一游戏代码文件） |
| `tools/texture-preview.html` | 贴图预览/验收页（Three.js 本地渲染） |
| `docs/TEXTURES.md` | 本文档 |
| `tools/shots/textures.png` | 验收截图（不提交） |
| `tools/shots/api-check.mjs` | API 契约自检脚本（Playwright，可选） |
| `tools/shots/tex-*.png` | 局部/单张贴图截图（QA 用，不提交） |
