# 交接文档 — 《奶蛙乐园：午夜奶片》

## 本次交接更新：内部通道（无怪物体检模式）+ 场景摆放修复（2026-11-09）

> 本节为最新补充；下方 2026-11-08 的 SAN / 龙奶一节与其后的历史记录仍然有效，但场景坐标已按本节改过。

### 一句话

新增了一个只有开发时会用的 **内部通道**：无奶蛙、不扣意识值、可穿墙自由飞行，并带一个自动扫描器，把场景里悬空 / 穿模 / 位置异常的物件列成清单、标在画面上。用它把全图扫了一遍，修掉 **16 类、约 40 处**摆放问题，扫描结果从 38 条问题降到 0 条。正常游玩流程未改动。

### 内部通道怎么用

- 主菜单右下角 **内部通道 · INTERNAL**，或直接开 `http://127.0.0.1:8000/?channel=internal`
- `WASD` 飞行 · `空格/Q` 升 · `C/E/Ctrl` 降 · `SHIFT` 加速 · `滚轮` 调速 · `1-6` 跳房间
- `R` 重扫 · `B` 标记 · `N` 透墙 · `G` 地面格网 · `L` 体检灯光 · `H` 面板 · `I` 显示吊挂参考 · `ESC` 退出
- 左侧列表点一条即自动飞到该物件；准星指着物件时面板底部显示它的房间 / 尺寸 / 底面顶面高度
- 命令行：`node tools/channel/audit.mjs --shots=1`，输出 JSON + 截图到 `tools/channel/out/`

### 代码改动

| 文件 | 改了什么 |
|---|---|
| `src/inspect.js`（新增，约 660 行） | 内部通道：飞行接入、灯光/雾覆盖、问题标记框、地面格网、墙体半透明、面板与准星拾取、扫描算法（悬空 / 穿墙 / 下沉 / 顶穿 / 互相穿模 / 出界） |
| `src/player.js` | 新增 `fly` / `flySpeed` 与 `flyUpdate()`；空格/C/E/Q 进 keys；`update()` 飞行时走另一条分支；相机高度改读 `position.y` |
| `src/main.js` | state 增加 `internal`；`startInternal()` / `leaveInternal()`；指针锁在通道里也生效；URL `?channel=internal` 直达；`goMenu()` 里兜底退出通道 |
| `src/ui.js` | 菜单按钮 `btn-internal` 钩子 |
| `index.html` / `styles.css` | 菜单入口按钮 + 体检面板 DOM 与样式 |
| `src/world.js` | 修 16 类摆放问题（见 `docs/scene-audit-static.md` 第 5 节）；`addPoster` 增加贴墙吸附；门框标 `userData.channelIgnore`；三轮车/海洋球标 `channelFloatOk` |

### 扫描器的边界（别当成万能）

- 判据是**包围盒 + 向下射线**：有没有东西托着、有没有压进墙格、包围盒之间有没有交叉。
- 天花板灯具、彩旗这类"本来就该吊着"的，归到「参考」级，默认不显示。
- 贴墙物件靠"包围盒紧挨不可行走格子"豁免，所以**故意悬在墙边的家具也会被放过**。
- 复合道具（车架靠轮子撑）必须显式标 `userData.channelFloatOk`，否则会误报。
- 它只保证"几何上没穿没飘"，**不判断好不好看**。比例、构图、灯光氛围仍需人眼。

### 验证情况

- 内部通道全图扫描：修复前 38 条问题 -> 修复后 0 条（参考 18 条为吊挂装饰）。
- 扫描器自检：故意注入 2 处悬空 + 1 处穿墙，全部报出，还原后归零。
- 正常流程回归：菜单 -> 片头 -> 游玩 -> 返回菜单 -> 进通道 -> 退通道，状态/灯光/奶蛙全部正确还原，0 console error。
- **仍未做**：真人完整试玩、人耳复测、低配真机帧率。软件渲染下只有 3 FPS，不能代表真实显卡。

---

## 本次交接更新：SAN、幻觉与龙奶（2026-11-08）

> 本节为最新补充；下方 2026-10 至 11 月初的测试、Git 和待办是历史记录，不能直接代表本次版本或当前作业进度。交接人：待本人填写。代码修改由 AI 编码助手协助，需求判断与试玩反馈由组员提供；报告中应按实际情况披露。

### 一句话 / 当前状态

在原有收集 8 片奶片、躲避奶蛙并逃出的一关游戏上，增加了意识值（SAN）、两次幻觉及龙奶恢复机制，并依据组员本人试玩进行了多轮调整。用户表示自己的部分已完成；本轮最终音画版本尚未进行完整浏览器回归或人耳复测。外部试玩、报告、视频及其他组员任务是否完成，须向团队确认，不能据此假定。

### 新机制速查

- **SAN**：正式游玩初始 100%，随有效游玩时间非线性下降，SAN 越低下降越慢；不拾取龙奶、不暂停时约 120 秒归零（含两次幻觉）。暂停、切出窗口或标签页时不扣；收齐奶片后仍继续下降直到离开。Demo 同样扣 SAN（2026-11-10 起取消豁免）。
- **幻觉**：SAN 到达 20% 和 10% 阈值时各触发一次；每次画面为六个大小不同的奶龙虚影闪烁，7 秒。奶龙被抓音效以 0.5 倍速与画面同时启动，第一次增益 0.2、第二次 0.8，音频 8 秒，淡入淡出。幻觉画面期间 SAN 停止下降，玩家可移动；音频尾音可比画面多一秒。静音与总音量依旧适用。
- **失败**：SAN 归零复用被奶蛙抓到时的惊吓音画，结算页显示「意识值耗尽」。
- **龙奶**：SAN 降至 50% 解锁，玻璃瓶内为白色液体；每局默认 3 瓶，在不同房间随机分散，靠近自动拾取，每瓶恢复 20 个百分点，上限 100%，每次拾取后冷却 10 秒。龙奶不显示在小地图；重新开始时位置重随机。

### 修改入口

| 功能 | 文件 |
|---|---|
| SAN 下降、幻觉状态、音画触发、龙奶拾取、失败原因 | `src/main.js` |
| 幻觉半速播放、音量、淡入淡出与持续时间 | `src/audio.js` |
| 龙奶数量、拾取半径、间隔 | `src/config.js` 的 `DRAGON_MILK` |
| 龙奶模型、位置随机、拾取接口 | `src/world.js` 的 `buildDragonMilk` / `resetDragonMilk` 等 |
| HUD、结算文案、幻觉元素及样式 | `index.html`、`styles.css`、`src/ui.js` |
| 用户运行说明 | `README.md` |

### 运行、验证与风险

1. 在项目根目录运行 `python serve.py 8000`，用桌面 Chrome/Edge 打开 http://127.0.0.1:8000/；也可双击 `run_game.bat`。不要通过 file:// 双击打开 `index.html`。
2. 本轮曾在浏览器以直接调用游戏状态的方式检查 SAN 归零时间、龙奶恢复与冷却、幻觉阈值、暂停和重置；随机生成逻辑做过批量检查。最后一次音画时间调整仅做了 JavaScript 语法检查，**不是完整真人通关或人耳试听**；原有 64/64 是旧版历史 QA，不代表本版已复跑。
3. 建议真实键鼠完整试玩：检查左下角 SAN / 小地图不遮挡、50% 龙奶解锁与可达性、拾取恢复及 10 秒冷却、两次幻觉、音量/静音、暂停恢复、SAN 归零、重开和 Demo。特别注意画面结束后的音效尾音在暂停或再次触发时的表现；音频响度及音画感受需人耳确认。
4. 试玩反馈中曾认为下降过慢、后来过快、龙奶难找及音画有先后；这些是组员的反馈，不等于已经完成课程要求的非组员外部试玩。NO AI 的观察、两次真实迭代和个人总结需由相应成员本人填写，不能用 AI 代写或编造。
5. 更新游戏后须重新执行 `python tools/package_submission.py` 并在生成的运行包中实测；重复打包会覆盖 `release/w05_3d_game/`。报告、视频与课程要求另行核对。
6. 此次操作的本地文件夹不含 `.git`，Git 状态/远程最新版本无法从中确定；本轮未提交、未推送。同步前先克隆目标仓库，检查远程更新并人工核对差异，不要覆盖他人改动。

### 交接清单

- [ ] 接手人确认收到最新代码和本交接说明，确认远程版本及组内负责人。
- [ ] 真机复测 SAN、龙奶、幻觉、音画同步及音量，并重新验证完整游戏 / Demo。
- [ ] 与组员核实外部试玩、两次改进记录、每人总结、视频和课程提交要求；NO AI 部分由真人完成。
- [ ] 核实素材来源与 AI 披露；填写报告、准备视频、重新打包并测试最终提交包。

---

> 以下为上一阶段的历史交接记录；与本节不一致时以当前代码和本节为准。

> 交接时间：2026-10-29 21:xx（HKT）  
> 最新功能提交：2d7e1d6（奶蛙外观重做）；交接文档提交见最新 git log  
> 远程：https://github.com/147258369-cwb/milk-frog-park-w05.git  
> 推送状态：**已 push 到 origin/main**（2026-10-29；git status -sb 显示 up-to-date）  
> 接手人请先读本文件，再读 README.md；提交作业前必读 W05_GroupID.md。

---

## 0. 一句话

这是一个已经能跑通、能 Demo、能提交的 **Three.js 单关第一人称 3D 恐怖吃豆游戏**：废弃幼儿园迷宫、8 片奶片、4 只「奶蛙」追逐、地图/加速分阶段解锁、5 句带旁白的片头、可自动通关的 Demo 模式。

代码和美术/音频都已完成；**作业中必须由人类完成的 NO AI 部分（外部试玩、迭代记录、学习总结、真人游玩视频）尚未完成**。

---

## 0.5 最近一次迭代：奶蛙身体换成 GLB 模型（2026-11-05）

- **改动：** 奶蛙身体从程序化低多边形几何体换成组员提供的 **`assets/models/nailong_colored_2.0.glb`**（原创奶龙模型，单网格 4 材质分组、无骨骼无动画）；新增本地 vendored 的 `vendor/three/loaders/GLTFLoader.js` 与 `vendor/three/utils/BufferGeometryUtils.js`（MIT，离线可用）。
- **关键处理：** ① 模型朝向修正（原脸朝 -Z，转 180° 与游戏内奶蛙朝向一致）；② 颜色修正（模型颜色被 Blender 导出到非标准 `COLOR_1` 通道，GLTFLoader 读标准 `COLOR_0` 会变白，加载后给 `yellow` 材质补回奶黄色）；③ 加轻微自发光，保证黑暗场景可见；④ 保留程序化「靠近时裂开的大笑巨口」+ 影子（模型无骨骼不能自己张嘴，这是核心惊吓机制）；⑤ 动画改为整体摇摆/呼吸/颠簸。
- **回退保障：** `src/frogs.js` 的 `loadFrogModelTemplate()` 加载失败时自动回退程序化奶蛙，游戏不黑屏。
- **验证：** 本地 Edge/Chrome headless（CDP）加载游戏，0 console error / 0 pageerror；奶蛙模型在黑暗场景中正常渲染、靠近危险暗角生效；预览页 `tools/model-preview.html`（模型四视角）与 `tools/frog-look-preview.html`（闭口/裂口对比）可用。
- **已知限制：** 模型为静态网格，无四肢摆动/眨眼动画；若需走路动画或更贴合参考图，改 `src/frogs.js` 的 `buildFrogModel` 与 `loadFrogModelTemplate`。

---

## 0.6 最近一次迭代：手感与体验打磨（2026-11-06）

- **画面灵敏度滑条：** 主菜单与暂停菜单新增「画面灵敏度」滑条（20–250%，默认 100%，存 localStorage `mfp.sensitivity`）；`src/player.js` 的 `setSensitivity()` 乘 `PLAYER.mouseSensitivity`，不改 0.0021 基准。
- **角色跳跃：** 按 **空格** 起跳（约 0.7 米，竖直速度 + 重力，落地才能再跳）；相机跟着跳、第三人称收腿摆臂；起跳有小脚步声；帮助页/底部提示加了「空格 跳跃」。
- **修复第一人称视角「某个角度突然跳」：** 根因是浏览器 **Pointer Lock 重置**后第一个 mousemove 报超大 `movementX`（光标位置重置），250% 灵敏度下可让视角瞬转 150°+；`src/player.js` 重锁后跳过前 2 个 mousemove + 尖峰相对检测（单次增量 >200px 且 >4× 上一次则按上一次衰减）+ yaw 归一化到 [-π, π)；正常快速转身不受影响。
- **修复画面抖动：** 奶蛙靠近/惊吓的相机晃动从「每帧随机」改为「平滑正弦波形」（多频叠加脉动），幅度调低，不再高频乱抖。
- **奶蛙动画打磨：** `src/frogs.js` animate() modelBased 分支：小跳 + 落地挤压 + 摇摆 + 前倾。
- **玩法提示：** 首次激活奶蛙教学 toast「它听到你了…」；糖分不足 toast「糖分不足…」。
- **修复小地图奶片不实时消失：** `src/ui.js` drawMinimap 只画未收集奶片（实时读 `collected`），`unlockMap(candies)` 解锁瞬间也带当前状态；`src/main.js` 每帧传 `world.candies`。
- **验证：** CDP 无 console error / pageerror；跳跃 peak≈0.71m、空格触发、落地复位；地图 3/8 收集后画 5/8；扫 yaw 0–360°（含俯仰、完整 3D 朝向）最大跳变 = 步长（平滑）；锁定重置尖峰 0°、孤立尖峰 120°→7.2°、正常快速转身不受影响。

---

## 1. 当前状态（TL;DR）

| 项 | 状态 |
|---|---|
| 游戏是否可运行 | ✅ Windows + Python 3 + 现代 Chrome/Edge |
| 完整流程 | ✅ 菜单 → 片头 → 游玩 → 8/8 → 出口 → 胜利 / 失败 → 重开 |
| Demo 模式 | ✅ 真实游戏自动通关（无特权：会掉 SAN、会被抓）；定步长模拟 142–157 秒收 24 片，自动回主菜单 |
| 自动化 QA | ✅ 64/64 PASS，0 console error / 0 pageerror，164 请求全部同源 |
| 音频 | ✅ 27 条原创 WAV（9.34 MB）：5 句旁白、4 条奶蛙循环、音乐/环境/SFX |
| 贴图 | ✅ 纯 Canvas 程序化 6 区域墙/地/顶 + 海报/标牌/奶蛙 Jumpscare 脸 |
| 报告 | ⚠️ 骨架已写，NO AI 段落全部是 TODO，必须组员本人填 |
| 视频 | ❌ 尚未录制（≤5:00，需真人游玩 + Demo + 反馈/迭代证据） |
| Git | 最新功能 commit 529aeef（GLB 奶蛙）+ 本批手感/跳跃/视角修复待提交；交接文档见 HANDOFF.md；已 push 到 origin/main，工作树含未提交改动 |

---

## 2. 五分钟跑起来

~~~bat
cd D:\3dgame\milk-frog-park-w05
python serve.py 8000
~~~

打开 **http://127.0.0.1:8000/**；或双击 run_game.bat。

- **必须 http**：ES Module 与 fetch() 音频在 file:// 下会被浏览器拦截，双击 index.html 会黑屏。
- 需要 Python 3（只用标准库），运行时不联网、不需要 pnpm install。
- 首次加载要下载/解码约 9.3 MB 音频；软件渲染下可能 5–20 秒，真实 GPU 通常几秒。
- 浏览器先点击页面才会出声（autoplay 策略）。
- 只支持桌面键鼠；不支持手机/触屏。

---

## 3. 仓库里有什么

~~~
index.html / styles.css        页面、菜单、HUD、剧情、结算、视觉系统
serve.py / run_game.bat        零依赖本地服务器（Windows 双击启动）
src/
  main.js                      游戏状态机、渲染循环、流程衔接
  config.js                    地图布局/奶片/奶蛙/剧情文本/数值
  world.js                     迷宫、6 区域装修、家具、灯光、奶片、出口
  player.js                    第一/第三人称、碰撞、体力、手电、脚步
  frogs.js                     奶蛙模型、流场追逐、眩晕、距离音效
  textures.js                  程序化 Canvas 贴图（含奶蛙 Jumpscare 脸）
  audio.js                     WebAudio 音乐/音效/旁白/3D 奶蛙声/静音
  ui.js                        HUD、小地图、字幕、提示、结算
  story.js                     片头镜头巡游 + 字幕
  demo.js                      Demo 机器人（真实游戏，非录像）
  textures-fallback.js         贴图兜底
assets/audio/                  27 × WAV + manifest.json
docs/
  CONTRACT.md                  内部契约（地图/音频/贴图 API）
  AUDIO.md                     音频生成方式、AI 声明、重新生成
  TEXTURES.md                  贴图设计、API、预览
  QA.md                        自动化验收 64/64、限制与复现
  SUBMISSION.md                组员提交前一页 checklist
  screenshots/                 README/报告用截图
tools/
  gen_audio.py                 音频全量重建（Windows 中文 TTS + NumPy）
  audio-preview.html           音频试听台
  texture-preview.html         贴图预览
  package_submission.py        生成 release/w05_3d_game/ 提交包
  qa/full.mjs                  64 项 Playwright 验收脚本
  smoke.mjs / qa/*.mjs         其他快速验证脚本
vendor/three.module.js         Three.js r160（MIT，本地 vendored）
W05_GroupID.md                 小组报告（含 TODO）
HANDOFF.md                     本文件
~~~

> 原来的 Starfall Salvage demo 的 index.html / README.md 已在 68ec32c 中被新游戏覆盖；旧文件只保留在初始提交 3411d1d 的快照里，不需要也不可能从当前工作树再删一次。当前两个文件是新游戏本体。

---

## 4. 玩法/数值速查

- 目标：收集 **8 片奶片**，在出口厅对着安全出口按 **E** 离开。
- 进度：**3 片 → 地图**；**6 片 → 加速/糖分**（按住 SHIFT，消耗体力）；**8 片 → 出口开启**。
- 奶蛙：4 只，3 变种（小/胖/长腿）。正常行走追不上也甩不掉；**站着不动**会被贴近并抓到；冲刺可把它们甩到眩晕。
- 奶蛙接近：循环语音「我是奶龙！我才是奶龙！」音量随距离增大，叠加心跳、红色暗角、字幕。
- 被抓：Jumpscare → 「你被找到了」→ 再试一次/回主菜单。
- 操作：WASD/方向键、鼠标、**空格（跳跃）**、SHIFT、E、V（第一/第三人称）、F（手电）、M（静音）、ESC（暂停）；菜单里有画面灵敏度滑条（20–250%）。
- 片头 5 句旁白，音频合计 22.69s；引擎每句后停 0.68s，约 26s；可跳过。

---

## 5. 测试与验收

### 快速冒烟
~~~bat
python serve.py 8010
node tools/smoke.mjs
~~~
（需要已 pnpm install 安装 playwright-core，并使用本机 Edge。node_modules/ 不在提交包里。）

### 完整 QA（64 项）
~~~bat
python serve.py 8010
node tools/qa/full.mjs
~~~
- 报告：tools/qa/out/report.json
- 截图：tools/qa/out/
- 最近一次：**64/64 PASS**，Edge 155.0.4283.62 headless，0 console error / 0 pageerror，1280×720 与 1920×1080。
- 注意：无头 SwiftShader 只有约 3–4 FPS，流程时间会被拉长；真实 GPU 正常。

### Demo 单独模拟
~~~bat
node tools/qa/simdemo.mjs
~~~
预期：1027 步 / 51.4 模拟秒，8/8、到达出口、进入胜利页。

### 提交包
~~~bat
python tools/package_submission.py
~~~
生成 release/w05_3d_game/（56 文件 / 约 11.53 MB），已包含最新 README、docs、截图；release/ 被 .gitignore 忽略，不入库。

---

## 6. 已知问题 / 风险

1. **真人外部试玩、两次迭代、学习总结、视频全部未完成**，W05_GroupID.md 的 NO AI 段落是 TODO，不能直接提交。
2. 音频只做了资源/解码/增益/时长验证，**没有人耳试听**；音量平衡可能仍需人工调整。
3. 3D 奶蛙外观刚刚按用户参考图重做（黄体/绿眼/小嘴，靠近裂开大笑）；如果组里觉得比例/眼睛/嘴还要调，src/frogs.js 的 buildFrogModel 是入口。
4. 无头/软件渲染性能低（3–4 FPS）；建议用集显真机再跑一轮，必要时降 renderer.setPixelRatio（main.js 已有自适应分辨率）或减少灯光。
5. 首次加载 9.3 MB 音频，低配/低带宽等待偏长；有加载进度，不是卡死。
6. 仅桌面键鼠；无手柄、无移动端；没有关卡存档，只有音量/静音存 localStorage。
7. 本关只做「地图 + 加速」，震荡/磁铁未实现（符合当前需求，报告里应说明）。
8. 不同 GPU/浏览器/分辨率下画面与帧率有差异；Firefox/Safari 未测。
9. AI 生成/辅助的代码、贴图、音频均已披露在 README/W05/docs；未使用第三方版权素材。奶蛙是对网路迷因（AI 生成的奶龙变体）的原创几何二创，不复制官方角色图片。

---

## 7. 接手后按优先级做什么

### P0 — 作业提交必需（NO AI，必须人做）
1. 填 W05_GroupID.md：组号/文件名、成员姓名学号分工、每人亲自跑过的检查。
2. 找 **1 位非组员** 做外部试玩：按 docs/SUBMISSION.md 的话术，匿名记录画像、日期、观察、原话、授权。
3. 根据试玩写 **2 次真实迭代记录**（观察/改动/负责人/重测）。
4. 每位成员写 ≤200 词学习总结。
5. 录制 W05_<GroupID>_Game_Demo.mp4（≤5:00）：团队/游戏介绍、**真人键鼠游玩**、游戏内 Demo、外部反馈与迭代证据。
6. 运行 python tools/package_submission.py，把 W05_GroupID.md 与 w05_3d_game/ 一起按课程要求提交。

### P1 — 交付前验证
7. 在真实 GPU 的 Chrome/Edge 跑一局 + Demo，确认帧率/声音/加载。
8. 人耳试听 5 句旁白、4 条奶蛙音、音乐与 SFX；必要时调 manifest.json 的 gain 或 tools/gen_audio.py 参数。
9. 组员各自完整通关一次，检查 E/V/F/M/ESC/Shift。
10. 确认文件名、组号、视频名一致；检查提交包里没有 node_modules/密钥。

### P2 — 可选打磨
11. 奶蛙外观继续贴近参考图（眼睛更大/更歪、身体更软、牙齿更拟人）。
12. 更多房间细节、光照平衡、片头镜头路线。
13. 若要做第二关，在 config.js 增加布局，main.js 扩展关卡状态。

---

## 8. 容易踩的坑

- python serve.py 8000 端口被占用时会直接报错；换 8001。
- 不要用 file:// 打开；不要用 npx http-server（需要联网装包，和离线交付冲突）。
- 开发/QA 服务器不要用旧的 python -m http.server（偶发并发拒绝）；用 python serve.py 8010（ThreadedServer）。
- 音频加载是并发 6 路；无头环境很慢，等待 window.__game.state === 'menu'，不要只等固定秒数。
- node_modules/、release/、tools/qa/out/、tools/shots/ 都被 .gitignore 忽略，不要强行提交。
- 改动 src/textures.js 后要同时看 tools/texture-preview.html；贴图缓存共享 repeat，需要不同平铺时 clone。
- 改动 assets/audio/manifest.json 后，音频键名必须和 src/audio.js / src/story.js 对应。
- Git 远程：https://github.com/147258369-cwb/milk-frog-park-w05.git ；本次交接已 push main，后续以 git status -sb 是否显示 up-to-date 为准。

---

## 9. 快速文件定位

| 想改… | 改这里 |
|---|---|
| 地图房间/门/奶片位置 | src/config.js 的 ROOMS/CORRIDORS/DOORS/CANDY_CELLS |
| 奶蛙数量/出生点/变种 | src/config.js 的 FROG_DEFS，src/frogs.js 的 VARIANTS |
| 奶蛙外观/表情 | src/frogs.js 的 buildFrogModel（GLB 模式）；模型文件 assets/models/nailong_colored_2.0.glb；加载/颜色/朝向在 loadFrogModelTemplate |
| 追逐距离/速度/眩晕 | src/frogs.js 的 Frog.update；src/config.js 的 PLAYER |
| 视角/灵敏度/跳跃/视角跳变 | src/player.js 的 bindInput / jump / updateCamera / onLockAcquire |
| 小地图绘制/解锁 | src/ui.js 的 drawMinimap / unlockMap |
| 解锁阈值/目标 | src/config.js 的 UNLOCK_MAP_AT/UNLOCK_SPEED_AT/TOTAL_CANDIES |
| 片头文本/镜头 | src/config.js 的 STORY/STORY_PATH，src/story.js |
| HUD/菜单样式 | styles.css、src/ui.js |
| Demo 路线 | src/demo.js 的 route |
| 菜单/结算文案 | index.html、src/main.js |
| 音频增益 | assets/audio/manifest.json 的 gain |
| 贴图颜色/图案 | src/textures.js 各 *_DRAW 函数 |
| 提交包内容 | tools/package_submission.py |

---

## 10. 交接检查清单

- [ ] 能按第 2 节启动，菜单/剧情/游玩/Demo/暂停/胜负都跑通
- [ ] 已确认 W05_GroupID.md 里 NO AI 段落没有 AI 代写
- [ ] 外部试玩记录 + 两次迭代 + 每人学习总结已完成
- [ ] 视频 ≤5:00，含真人游玩与 Demo
- [ ] 真实 GPU 上复测、音频人耳试听
- [ ] python tools/package_submission.py 后实际跑一遍 release/w05_3d_game/
- [ ] 提交前确认组号/文件名/成员信息/视频名一致

---

*如果接手人只做一件事：先把第 2 节跑通，再判断第 6 节的限制是否可接受；不要在没有真人试玩的情况下编造 W05_GroupID.md 的 NO AI 记录。*
