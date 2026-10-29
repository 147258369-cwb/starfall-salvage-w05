# 交接文档 — 《奶蛙乐园：午夜奶片》

> 交接时间：2026-10-29 21:xx（HKT）  
> 最新功能提交：2d7e1d6（奶蛙外观重做）；交接文档提交见最新 git log  
> 远程：https://github.com/147258369-cwb/starfall-salvage-w05.git  
> 接手人请先读本文件，再读 README.md；提交作业前必读 W05_GroupID.md。

---

## 0. 一句话

这是一个已经能跑通、能 Demo、能提交的 **Three.js 单关第一人称 3D 恐怖吃豆游戏**：废弃幼儿园迷宫、8 片奶片、4 只「奶蛙」追逐、地图/加速分阶段解锁、5 句带旁白的片头、可自动通关的 Demo 模式。

代码和美术/音频都已完成；**作业中必须由人类完成的 NO AI 部分（外部试玩、迭代记录、学习总结、真人游玩视频）尚未完成**。

---

## 1. 当前状态（TL;DR）

| 项 | 状态 |
|---|---|
| 游戏是否可运行 | ✅ Windows + Python 3 + 现代 Chrome/Edge |
| 完整流程 | ✅ 菜单 → 片头 → 游玩 → 8/8 → 出口 → 胜利 / 失败 → 重开 |
| Demo 模式 | ✅ 真实游戏自动通关，实测/模拟 51.4 秒，自动回主菜单 |
| 自动化 QA | ✅ 64/64 PASS，0 console error / 0 pageerror，164 请求全部同源 |
| 音频 | ✅ 27 条原创 WAV（9.34 MB）：5 句旁白、4 条奶蛙循环、音乐/环境/SFX |
| 贴图 | ✅ 纯 Canvas 程序化 6 区域墙/地/顶 + 海报/标牌/奶蛙 Jumpscare 脸 |
| 报告 | ⚠️ 骨架已写，NO AI 段落全部是 TODO，必须组员本人填 |
| 视频 | ❌ 尚未录制（≤5:00，需真人游玩 + Demo + 反馈/迭代证据） |
| Git | 最新功能 commit 2d7e1d6；交接文档会再产生一个 commit；按需求 push 到 origin/main |

---

## 2. 五分钟跑起来

~~~bat
cd D:\3dgame\starfall-salvage-w05
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
- 操作：WASD/方向键、鼠标、SHIFT、E、V（第一/第三人称）、F（手电）、M（静音）、ESC（暂停）。
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
- Git 远程：https://github.com/147258369-cwb/starfall-salvage-w05.git ；本次交接会 push main，push 后以 git status -sb 是否显示 up-to-date 为准。

---

## 9. 快速文件定位

| 想改… | 改这里 |
|---|---|
| 地图房间/门/奶片位置 | src/config.js 的 ROOMS/CORRIDORS/DOORS/CANDY_CELLS |
| 奶蛙数量/出生点/变种 | src/config.js 的 FROG_DEFS，src/frogs.js 的 VARIANTS |
| 奶蛙外观/表情 | src/frogs.js 的 buildFrogModel |
| 追逐距离/速度/眩晕 | src/frogs.js 的 Frog.update；src/config.js 的 PLAYER |
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
