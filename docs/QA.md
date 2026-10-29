# 《奶蛙乐园：午夜奶片》独立 QA 验收报告

- 验收对象：D:/3dgame/starfall-salvage-w05 工作树（Lead 宣布冻结后的版本）
- 验收时间：2026-10-29 20:47:33（HKT，UTC+8；报告 JSON 中为 12:47:33Z）开始，耗时约 203 秒
- 验收执行：独立 QA 代理（浏览器自动化；未改游戏源码、README、资产）
- 报告文件：tools/qa/out/report.json（机器可读，64 项逐条记录）
- 自动化脚本：tools/qa/full.mjs（可重复运行）

## 1. 结论

**64 项检查全部 PASS，0 FAIL。**

- 加载→菜单→剧情→准备→游玩→暂停/重启→胜负→Demo 全链路可用。
- 1280×720 与 1920×1080 下 HUD 无重叠、无溢出、无页面滚动条。
- 整个会话 0 条 console error、0 条 pageerror；164 个请求全部同源（http://127.0.0.1:8010），无 CDN、无外网、无 4xx/5xx/failed。
- 27 条 WAV 全部解码成功（manifest 27 键，26 必需 + 可选 sfx_ui_hover）；frogs=4，heartbeat 已建立。
- Demo 真实点击后 10 秒截图证据 + 直接步进 updatePlay 的完整逻辑验证：1027 步 / 51.4 模拟秒自动收集 8 片、解锁地图与加速、到达出口、进入胜利页并 5 秒后自动回菜单。
- 上一轮报告中的 5 条 FAIL 均已按 Lead 说明完成“预期更新 / 设计修复 / 测试方法修复”，本轮全部转 PASS（见第 5 节）。

## 2. 环境与方法

| 项 | 值 |
|---|---|
| 操作系统 | Windows（本机） |
| 浏览器 | Microsoft Edge 155.0.4283.62，headless |
| 自动化 | playwright-core 1.64.1，Node v24.18.0 |
| 渲染 | SwiftShader（--use-angle=swiftshader --enable-unsafe-swiftshader）；软件渲染下约 3–4 FPS |
| 主分辨率 | 1280×720（deviceScaleFactor=1） |
| 副分辨率 | 1920×1080 |
| 开发/验收服务 | http://127.0.0.1:8010（python http.server） |
| serve.py 验证 | NO_BROWSER=1 python serve.py 8033，请求 / 与 /assets/audio/manifest.json 均为 200，manifest 7361 bytes |
| 音频策略 | --autoplay-policy=no-user-gesture-required |

方法说明：

- 主流程全部使用真实 UI 点击与键盘事件（开始、跳过、进入、E/V/F/M、Shift、ESC、暂停面板按钮、Demo 点击等）。
- 状态断言通过页面暴露的 window.__game（state/player/frogs/audio/world/ui）读取。
- 进度解锁用 evaluate 将玩家移动到奶片位置，由游戏自身的拾取逻辑触发；WASD 位移、鼠标 yaw、E 提示、V/F/M、冲刺、被抓等均另有真实输入的独立断言。
- Demo 完整逻辑按任务允许方式直接步进 updatePlay 加速；另有一次真实点击 Demo 后 10 秒的截图证据。
- 声音仅验证资源加载、解码时长、增益值、AudioContext 状态、播放调用与字幕；**没有试听，也不声称试听**。
- 没有真人试玩、没有外部玩家反馈；本报告不编造此类证据。

## 3. 逐项结果表（64 项）

| 组 | ID | 结果 | 检查项 | 证据/细节 |
|---|---|---|---|---|
| 1 冷启动 | cold-start | **PASS** | 加载页→菜单，状态机进入 menu | load=4759ms, menu=true, loadingHidden=true, AudioContext=running |
| 1 冷启动 | cold-errors | **PASS** | 0 console error / 0 pageerror | consoleError=0, pageerror=0 |
| 1 冷启动 | cold-network | **PASS** | 所有网络请求同源，无 CDN/外网 | origins=["http://127.0.0.1:8010"], external=[] |
| 1 冷启动 | favicon | **PASS** | favicon 不 404（内联 data: 图标） | href=data:image/svg+xml,%3Csvg xmlns='http://..., 404=false |
| 1 冷启动 | cold-chinese | **PASS** | 中文标题无乱码 | title=奶蛙乐园, mojibake=false |
| 2 菜单 | menu-buttons | **PASS** | 主菜单按钮可见/可用 | {"btn-start":{"visible":true,"disabled":false,"cursor":"pointer"},"btn-demo":{"visible":true,"disabled":false,"cursor":"pointer"}, |
| 2 菜单 | menu-hover | **PASS** | 按钮 hover 有视觉反馈 | changed=true |
| 2 菜单 | menu-volume | **PASS** | 音量滑条可调（点击 31%） | {"v":0.29,"input":"29","master":0.291877418756485} |
| 2 菜单 | menu-mute | **PASS** | 静音按钮生效（master gain→0）并恢复 | {"muted":{"muted":true,"gain":0.00015771006292197853,"icon":"×"},"unmuted":{"muted":false,"gain":0.7197939157485962}} |
| 2 菜单 | menu-help | **PASS** | 操作说明可开可关（按钮） | open=true, closed=true |
| 3 开始游戏 | start-state | **PASS** | 点击开始→进入剧情，剧情文字出现 | {"line":"1999年，奶蛙乐园举办最后一场生日会。","chapter":"1999 · 奶蛙乐园"} |
| 3 开始游戏 | start-sting | **PASS** | 阴森音效触发 (sfx_start_sting) 且 AudioContext running | sfx=["sfx_click","sfx_click","sfx_click","sfx_click","sfx_click","sfx_start_sting"], ctx=running |
| 3 开始游戏 | start-voice | **PASS** | 旁白音频播放（audio.voice 非空） | voice=true, music=music_story |
| 3 开始游戏 | story-skip | **PASS** | 跳过剧情→ready 页 | {"ready":true,"story":false,"progress":"2%"} |
| 3 开始游戏 | enter-lock | **PASS** | 点击进入后 pointerLockElement 存在 | {"lock":true,"state":"playing","look":true,"hud":true} |
| 4 游玩 | play-mouse | **PASS** | 鼠标移动改变 yaw（pointer lock 下） | yaw -2.356 -> -3.196 |
| 4 游玩 | play-wasd | **PASS** | WASD 位移 > 2m（真实按键） | moved=6.93m, [8,8] -> [12.902089825174075,12.902089825174075] |
| 4 游玩 | play-interact | **PASS** | E 互动提示与锁定门反馈 | {"prompt":{"show":true,"text":"出口锁着 · 还差 8 片奶片"},"toast":"出口 · LOCKED\n门被锁住了\n还差 8 片奶片"} |
| 4 游玩 | play-thirdperson | **PASS** | V 切换第三人称（model.visible 变化） | {"vInfo":{"visible":true,"first":false},"vBack":{"visible":false,"first":true}} |
| 4 游玩 | play-flashlight | **PASS** | F 切换手电（flashlight.visible） | {"fOff":{"on":false,"visible":false},"fOn":{"on":true,"visible":true}} |
| 4 游玩 | play-mute | **PASS** | M 静音（master gain→0）并恢复 | {"mOn":{"muted":true,"gain":0},"mOff":{"muted":false,"gain":0.7200000286102295}} |
| 7 暂停/恢复 | pause-hint | **PASS** | HUD 右上角改为文字提示（ESC 暂停 · M 静音），无锁定态下不可点的按钮 | {"text":"ESC 暂停 · M 静音","buttons":0} |
| 5 进度 | progress-map | **PASS** | 3 片→地图解锁、小地图出现且 canvas 非空 | {"n":3,"map":true,"mapWrap":true,"item":"item unlocked","pixels":50960} |
| 5 进度 | progress-map-arrow | **PASS** | 小地图玩家箭头随移动更新 | dataURL changed=true |
| 5 进度 | progress-speed | **PASS** | 6 片→体力条+加速解锁 | {"n":6,"speed":true,"playerSpeed":true,"staminaWrap":true,"item":"item unlocked flash","map":true} |
| 5 进度 | progress-sprint | **PASS** | 6 后 Shift 冲刺：体力下降且速度提升 | {"sprinting":true,"stamina":75.7000000000001,"speed":7.397753810378216,"state":"playing"} |
| 5 进度 | progress-exit | **PASS** | 8 片→出口开启并发光 | {"n":8,"exit":true,"openT":0.40000000000000013,"glow":0.23413709888805878,"light":4.0816,"objective":"出口已打开 · 离开乐园"} |
| 5 进度 | progress-exit-prompt | **PASS** | 8 片后出口提示 E 离开 | {"show":true,"text":"E 离开乐园"} |
| 10 分辨率/HUD | layout-1280x720 | **PASS** | HUD 不重叠、不溢出 @ 1280x720 | {"overflow":[],"overlaps":[],"vw":1280,"vh":720} |
| 7 暂停/恢复 | pause-esc | **PASS** | ESC 暂停（指针解锁、暂停层出现） | {"visible":true,"lock":false} |
| 7 暂停/恢复 | pause-audio-controls | **PASS** | 暂停面板音量滑条+静音可点（指针已解锁） | {"pvol":{"v":0.41,"input":"41"},"pmute":{"muted":true,"gain":0.00007652871136087924},"punmute":{"muted":false,"gain":0.40988281369 |
| 7 暂停/恢复 | resume-button | **PASS** | 继续游戏按钮恢复并重新锁定指针 | state playing + lock ok |
| 7 暂停/恢复 | restart-reset | **PASS** | 重新开始：奶片/解锁/出口/位置归零 | {"state":"playing","candies":0,"map":false,"speed":false,"exit":false,"stamina":100,"pos":[8,8],"mapWrap":true,"staminaWrap":true} |
| 7 暂停/恢复 | pause-menu | **PASS** | 暂停→返回主菜单 | state menu |
| 6 奶蛙 | frog-activate | **PASS** | 拾取后奶蛙激活并播放 alert | {"active":true,"sfxAlert":true} |
| 6 奶蛙 | frog-audio | **PASS** | 靠近奶蛙：gain/heartbeat > 0 且字幕出现 | {"nearest":0.1720519862204477,"frogGain":0.4420570433139801,"heartbeat":0.6190950274467468,"subShow":true,"subText":"我是奶龙！我才是奶龙！", |
| 6 奶蛙 | frog-catch | **PASS** | 站立不动会被抓：caught→lose | {"caughtState":"caught","caughtSnap":{"state":"caught","jumpscare":true,"frozen":true},"loseVisible":{"visible":true,"text":"你被找到了 |
| 6 奶蛙 | frog-move-safe | **PASS** | 移动时不会被抓（保持 playing） | {"nearest0":41.6,"movingResult":{"state":"playing","nearest":7.765161952043194,"speed":2.3654941930640496}} |
| 6 奶蛙 | frog-daze | **PASS** | 冲刺把它们甩到 daze | {"states":["dazed","dazed","dazed","dazed"],"stamina":52.750000000000135,"sprinting":true} |
| 8 Demo | demo-real-10s | **PASS** | 真实点击 Demo：10 秒内自动游玩、HUD/音频工作 | {"state":"demo","active":true,"candies":0,"playTime":2.1500000000000004,"banner":true,"hud":true,"music":"amb_game","ctx":"running |
| 8 Demo | demo-esc | **PASS** | ESC 退出 Demo 回菜单 | {"state":"menu","banner":false} |
| 8 Demo | demo-sim-logic | **PASS** | Demo 完整逻辑：自动拾取 8 片→解锁→到出口 | {"steps":1027,"simTime":51.4,"state":"winFade","candies":8,"route":8,"reachedExit":true,"map":true,"speed":true} |
| 8 Demo | demo-win | **PASS** | Demo 到出口→胜利页统计 | {"visible":true,"stats":["0:51","8 / 8","5"]} |
| 8 Demo | demo-auto-return | **PASS** | Demo 结束自动回主菜单 | {"state":"menu","menu":true,"banner":false} |
| 9 胜负 | win-stats | **PASS** | 胜利页显示统计（时间/奶片/惊险） | {"visible":true,"h2":"你带走了最后八片奶片。","stats":["存活时间","奶片","惊险时刻"],"vals":["0:00","8 / 8","0"]} |
| 9 胜负 | win-replay | **PASS** | 胜利页再玩一次→重置 | {"candies":0,"map":false,"speed":false} |
| 9 胜负 | win-menu | **PASS** | 胜利页返回主菜单 | state menu |
| 9 胜负 | lose-page | **PASS** | 失败页出现并可重试 | {"visible":true,"h2":"你被找到了。"} |
| 9 胜负 | lose-retry | **PASS** | 失败页再试一次→重置并进入游玩 | {"state":"playing","candies":0} |
| 10 分辨率/HUD | layout-1920x1080 | **PASS** | HUD 不重叠、不溢出 @ 1920x1080 | {"overflow":[],"overlaps":[],"vw":1920,"vh":1080} |
| 10 分辨率/HUD | win-layout-1920 | **PASS** | 胜利页 1920×1080 不溢出 | {"visible":true,"rect":{"x":610,"y":366.5625,"w":700,"h":346.875},"vw":1920,"vh":1080,"scrollW":1920,"scrollH":1080} |
| 11 音频资产 | audio-load | **PASS** | WAV 全部解码加载（27/27）且 frogs=4、heartbeat 已建 | buffers.size=27/27, ctx=running, manifest=27, frogs=4, heartbeat=true |
| 11 音频资产 | audio-keys | **PASS** | manifest 键齐全（26 必需 + 可选 sfx_ui_hover） | missing=[], extra=["sfx_ui_hover"], unexpected=[] |
| 11 音频资产 | audio-duration | **PASS** | manifest 时长与解码 buffer 一致 | mismatch=[] |
| 11 音频资产 | audio-wav-headers | **PASS** | WAV 文件头有效（RIFF/WAVE） | wav=27, bad=[] |
| 12 交付自检 | deliver-no-cdn | **PASS** | index.html 无 CDN/外链 | externalRefs=[] |
| 12 交付自检 | deliver-three | **PASS** | vendor/three.module.js 自包含、无 import | imports=0, REVISION=160 |
| 12 交付自检 | deliver-local | **PASS** | 游戏不依赖网络/AI 服务（源码扫描） | external=[], ai=[] |
| 12 交付自检 | deliver-readme | **PASS** | README 运行命令可执行、内容与游戏一致 | stale=false, hasServeCommand=true, head="# 奶蛙乐园：午夜奶片\n**Milk Frog Park: Midnight Milk Candy**\n\n> 一款第一人称、温馨又惊悚的 3D 迷宫游戏。  \n> 在废弃 |
| 12 交付自检 | deliver-serve | **PASS** | serve.py 可启动并正确返回资源（NO_BROWSER=1, 8033） | {"port":8033,"ok":true,"statuses":{"/":200,"/assets/audio/manifest.json":200},"manifestBytes":7361} |
| 12 交付自检 | deliver-assets | **PASS** | 素材原创/程序生成声明与生成脚本齐全 | gen_audio.py=true, AUDIO.md=11640B, TEXTURES.md=11958B |
| 12 交付自检 | deliver-story-contract | **PASS** | 旁白 5 句与更新后的契约同步（vo_01..vo_05，无 vo_06） | config STORY lines=5, contract lines=5, vo_06=false |
| 1 冷启动 | final-console | **PASS** | 整轮运行 0 console error / 0 pageerror | consoleError=0, pageerror=0, warning=0 |
| 1 冷启动 | final-network | **PASS** | 整轮网络请求同源、无 4xx/5xx/failed | bad=[], failed=[] |

## 4. 关键证据截图

截图目录：tools/qa/out/（共 21 张）。

菜单（1280×720）：

![菜单 1280](../tools/qa/out/menu-1280.png)

游玩 HUD（1280×720，0/8 片、初始提示、未解锁道具）：

![游玩 1280](../tools/qa/out/play-1280.png)

真实点击 Demo 后 10 秒（1/8 片，横幅与 HUD 正常）：

![Demo 10 秒](../tools/qa/out/demo-10s-1280.png)

3 片后地图解锁（小地图 canvas 非空，道具状态已解锁）：

![地图解锁](../tools/qa/out/progress-map-1280.png)

被抓失败页（真实站立不动触发 caught→lose）：

![失败页](../tools/qa/out/lose-1280.png)

胜利页（1920×1080，统计区完整、不溢出）：

![胜利 1920](../tools/qa/out/win-1920.png)

全部截图清单：

- tools/qa/out/menu-1280.png
- tools/qa/out/menu-hover-1280.png
- tools/qa/out/help-1280.png
- tools/qa/out/story-1280.png
- tools/qa/out/ready-1280.png
- tools/qa/out/play-1280.png
- tools/qa/out/thirdperson-1280.png
- tools/qa/out/progress-map-1280.png
- tools/qa/out/progress-speed-1280.png
- tools/qa/out/exit-open-1280.png
- tools/qa/out/hud-1280.png
- tools/qa/out/pause-1280.png
- tools/qa/out/frog-close-1280.png
- tools/qa/out/lose-1280.png
- tools/qa/out/demo-10s-1280.png
- tools/qa/out/demo-win-1280.png
- tools/qa/out/win-1280.png
- tools/qa/out/lose-triggered-1280.png
- tools/qa/out/menu-1920.png
- tools/qa/out/play-1920.png
- tools/qa/out/win-1920.png

## 5. 上一轮 5 条 FAIL 的处置与复核

| # | 上轮失败 | 性质 | 处置 | 复核结果 |
|---|---|---|---|---|
| 1 | audio-load 期望 28/28 | 过时预期 | 剧情压缩为 5 句，vo_06 主动删除；契约已同步为 vo_01…vo_05。测试改为 27/27。 | PASS：buffers=27，manifest=27 |
| 2 | audio-keys 缺 vo_06 | 过时预期 | 必需键改为 26 条；sfx_ui_hover 为契约可选键。 | PASS：missing=[]，unexpected=[] |
| 3 | pause-button-lock | 真实设计问题，已修复 | HUD 右上角移除 pointer lock 下不可点的 sound/pause 按钮，改为文字提示「ESC 暂停 · M 静音」；测试改为 ESC 暂停 + M 静音 + 暂停面板音量/静音可点。 | PASS：提示存在且按钮数=0；暂停面板滑条 0.41、静音 gain≈0、恢复 gain≈0.41 |
| 4 | deliver-serve spawn error | 测试方式问题 | 改为 NO_BROWSER=1、空闲端口 8033、等待 1.7 秒后请求 / 与 manifest，taskkill /T /F 清理进程。 | PASS：/ 与 manifest 均 200，manifest 7361 bytes |
| 5 | progress-speed 截图失败 | 截图时序/环境抖动（minor） | 等 toast 消失后同步调用 ui.drawMinimap 再截图；截图失败仅记 note，不阻塞。 | PASS：progress-speed-1280.png 已生成（889716 bytes），无 note |

补充：上轮 audio-load 的 27 条并非加载失败，而是“28/28”的过时断言；本轮显式验证 frogs=4 与 heartbeat 对象存在，排除只解码未建图的情况。

## 6. 作业最低要求逐条判断

| 最低要求 | 判断 | 依据 |
|---|---|---|
| 真实 3D 场景 | **PASS** | Three.js 0.160.0 本地 vendor；6 个功能区、走廊、门、家具、蛋糕、奶片、奶蛙、雾/灯光/粒子；1280 与 1920 截图可见真实 3D 画面 |
| 相机 | **PASS** | 第一人称 pointer lock；鼠标 yaw -2.356→-3.196；V 切第三人称 model.visible=true，切回 false |
| 控制 | **PASS** | WASD 真实按键位移 6.93m；E 出口提示与锁定门反馈；F 手电 visible 切换；M 静音；Shift 冲刺；ESC 暂停 |
| 目标与反馈 | **PASS** | 8 片奶片收集、进度菱形、3 片地图、6 片体力+加速、8 片出口开启发光、字幕/Toast/心跳/危险提示 |
| 开始/重启流程 | **PASS** | 菜单→剧情→ready→点击进入；ESC/暂停面板重开；重开后奶片、地图、加速、出口、位置全部归零；胜负页可重玩/返回菜单 |
| 约 5 分钟循环 | **PASS（结构）/ 未做真人计时** | Demo 完整逻辑 51.4 模拟秒完成 8 片→出口；迷宫规模、移动速度与 8 片路线支持数分钟游玩。本轮无真人 5 分钟计时（无头 3–4 FPS，墙钟不代表真实体验），不作虚假声明 |
| 声音 | **PASS（资源/状态级）** | 27 WAV 全部 decode；music/menu、story、amb_game、heartbeat、vo_01–05、frog_voice_1–4、13 个 SFX 键齐全；manifest 时长与解码时长一致；AudioContext running；未试听 |
| 静音 | **PASS** | 菜单按钮、M 键、暂停面板按钮三条路径；master gain 实测降到 0.0002 以下，恢复约 0.41–0.72 |
| Demo | **PASS** | 真实点击 Demo 10 秒截图（自动移动、HUD、横幅、amb_game）；完整逻辑 8/8→胜利→自动回菜单；ESC 可退出 |
| 本地运行 | **PASS** | serve.py 8033 返回 200；README 命令可执行；index.html 无外链；vendor/three.module.js 无 import、REVISION=160；运行期 164 请求全同源 |
| 素材权利 | **PASS（文档/代码证据）** | 音频由 tools/gen_audio.py 生成并有 docs/AUDIO.md；贴图由 src/textures.js 程序化生成并有 docs/TEXTURES.md；运行期无外部媒体请求。非法律意见 |
| 稳定性/控制台 | **PASS** | 0 console error、0 pageerror、0 requestfailed；1280/1920 HUD 无重叠/溢出/滚动条 |

## 7. 限制与剩余风险

1. **无头软件渲染帧率低（约 3–4 FPS）**：所有交互测试按“状态达成”而非固定墙钟断言；真实浏览器帧率会更高。部分动画（开门、冲刺）在截图中只到中间态，属预期。
2. **进度收集使用 evaluate 传送**：这是任务允许的辅助手段，用于快速验证 3/6/8 片解锁；真实走位、鼠标视角、按键交互另有独立用例。胜利页存活时间 0:00 是传送辅助造成，不代表真实游玩时长。
3. **Demo 完整逻辑用直接 updatePlay 步进**：按任务明确允许；真实点击 Demo 仅取证前 10 秒。
4. **音频未试听**：无法判断主观音质、响度平衡与“温馨惊悚”听感；仅能证明资源、解码、时长、增益、状态机和调用链。
5. **无真人 5 分钟试玩/无外部玩家**：不声称完成真人验收或试听。
6. **8010 单线程开发服务器偶发瞬时拒绝**：本轮 full.mjs 内置 goto 重试 3 次，本次运行未触发；serve.py 已单独在 8033 验证。
7. **截图失败策略**：截图失败只记 note、不阻塞逻辑断言；本轮 21 张全部成功，notes 为空。

## 8. 复现步骤

1. 在仓库根目录启动验收服务（任选其一）：
   - python serve.py 8010
   - 或使用本次的 python http.server（根目录=仓库根，端口 8010）
2. 另开终端运行：
   - node tools/qa/full.mjs
3. 读取：
   - tools/qa/out/report.json（summary/failures/checks/screenshots/audio/demo）
   - tools/qa/out/*.png（21 张证据截图）
4. 可用环境变量覆盖：QA_BASE=http://127.0.0.1:8010/，EDGE_PATH=本机 Edge 路径。

## 9. 附：机器报告摘要

- summary：total=64, pass=64, fail=0
- console errors：0；pageerrors：0；warnings：0
- 网络：requestCount=164；origins=["http://127.0.0.1:8010"]；badResponses=0
- 音频：buffers=27；frogs=4；heartbeat=true；missing=[]
- Demo：steps=1027；simTime=51.4s；candies=8；route=8；autoReturn=menu
- 截图：21 张
