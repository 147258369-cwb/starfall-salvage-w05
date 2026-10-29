# Week 05 — 3D Game (group)

> **TODO: replace GroupID** —— 文件改名 `W05_<GroupID>.md`，并把下文的组号、成员、视频文件名一起替换。
> **提交前请替换所有 TODO。**
> 标有 **NO AI** 的章节必须由组员本人完成：不得使用 AI 生成、翻译、改写或润色。

Registered group ID: **TODO — 必填，例如 W05_Group12**

Game title and one-sentence goal:
**《奶蛙乐园：午夜奶片》**（Milk Frog Park: Midnight Milk Candy）——在废弃的奶蛙乐园迷宫里收集八片奶片，躲开一直跟着你的奶蛙，从天亮前的安全出口离开。

GitHub repository URL (only if used):
https://github.com/147258369-cwb/starfall-salvage-w05.git

Harness/model(s), why selected, and material AI help:
- **Harness:** DeepSeek Harness（dsh）Web/CLI 编码代理，Team Lead + 子代理协作；**Model:** deepseek-v4-1-flash。
- **为什么选它：** 本作是一个多文件、多资产的 3D 游戏（Three.js 场景、第一人称控制、AI 追踪、程序化贴图、TTS/合成音频、自动化 QA），需要并行处理代码、美术、音频和验证；该 harness 的子代理、共享文件系统与任务板适合拆分为「游戏核心 / 程序化贴图 / 原创音频 / 文档 / QA」几条互不冲突的工作线，并能在本地反复运行截图验收。
- **Material AI help（均为 AI 辅助，非全部代劳）：**
  - AI 按组员给出的玩法、关卡、美术与剧情要求，编写和重构 Three.js 游戏代码（场景、碰撞、奶蛙 AI、Demo、UI）。
  - AI 生成程序化 Canvas 贴图（`src/textures.js`）与 27 条原创音频（Windows 中文 TTS 旁白/奶蛙台词 + NumPy 合成音乐/音效）。
  - AI 编写自动化验收脚本并执行 headless Edge 检查（菜单、剧情、游玩、Demo、暂停、胜负、控制台错误、资源加载）。
  - AI 起草 README 与本报告的可填写事实部分；所有 **NO AI** 章节均留空，等待组员。
  - 人类负责：确定需求与范围、选择题材/剧情方向、验收结果、决定保留哪些改动，以及所有真人试玩、迭代观察和学习总结。

Representative AI interaction — one prompt, short response or resulting change, and what we checked before keeping it:
- **Prompt（给「贴图子代理」的节选）：** “实现 `src/textures.js`：纯 Canvas 2D 程序化贴图，零外部图片；6 个区域（门厅/教室/午睡室/食堂/走廊/出口）的墙、地、顶、墙裙；海报、中文标牌、奶蛙正脸；严格导出 `createTextures()` 与指定 API；每个区域风格统一且温馨惊悚。”
- **Result：** 生成了约 125 KB（127,568 字节）的 `src/textures.js`（36 张 CanvasTexture）、`tools/texture-preview.html` 预览页与 `docs/TEXTURES.md`；贴图被游戏实际使用（墙纸、棋盘地砖、生日横幅、海报、安全出口牌、奶蛙脸）。
- **What we checked before keeping it：** 用 102 条契约断言检查 API/尺寸/颜色空间/平铺参数；在 Edge 打开预览页确认 0 console error / 0 pageerror；查看整页与局部截图（墙地接缝、7 张海报、标牌、奶蛙脸）；确认游戏内有兜底贴图 `textures-fallback.js`，即使该模块异常也不会黑屏。检查后保留了这一版，并对过暗的午睡室与出口曝光做了人工调灯。

Outside assets and credits (or None):
- **Three.js 0.160.0** — MIT License，本地 vendored 于 `vendor/three.module.js`，运行时不访问 CDN。
- **无其他外部素材。** 所有几何、贴图、灯光、音效、音乐、旁白均由本组使用代码 / Windows 中文 TTS 生成；未使用第三方图片、模型、录音或官方「奶龙 / 奶蛙」版权素材。奶蛙为原创低多边形二创：参考网络「奶蛙」表情包的黄体、绿眼、小嘴与变异大笑，用几何与 Canvas 重建，不复制具体图片。
- AI 生成的音频与贴图在 `docs/AUDIO.md`、`docs/TEXTURES.md` 中有生成方法与声明。

Known issue (or None):
- 本仓库完成时**尚未进行**作业要求的真人外部试玩与 5 分钟演示视频；报告中的 NO AI 章节尚未填写。
- 本关只实现「地图 + 加速」两种道具，未实现震荡/磁铁；仅支持桌面键鼠，无移动端。
- AI 生成的旁白/奶蛙音效尚未由组员人耳终审；软件渲染/低端 GPU 下帧率较低。
- 本地 Windows 的 TTS 中文语音会把 SSML 音高量化，语速只能落在固定档位（见 `docs/AUDIO.md`）。
- 自动化验收环境：Windows + **Microsoft Edge (Chromium) 155.0.4283.62 headless + Playwright Core 1.64.1**，1440×900 / 1280×720 / 1920×1080；Chrome / Edge 桌面版预期可用，Firefox / Safari 未测。
- **自动化 QA（AI 辅助，不是真人试玩）：64/64 项通过**，0 console error / 0 pageerror / 164 个请求全部同源；详见 `docs/QA.md`。

Members — registered name, official student ID, main contribution, and game check personally run (one line each):
- **TODO（组员1）** — 姓名 / 学号 / 主要负责（例如：玩法与关卡验收）/ 亲自跑过的检查（例如：完整通关 + Demo）。
（按实际人数增删行；每人都要写自己**亲自跑过**的检查，不要照抄同一句。）
- **TODO（组员2）** — 姓名 / 学号 / 主要负责 / 亲自跑过的检查。
- **TODO（组员3）** — 姓名 / 学号 / 主要负责 / 亲自跑过的检查。
- **TODO（组员4）** — 姓名 / 学号 / 主要负责 / 亲自跑过的检查。

Required promotion video:
W05_<GroupID>_Game_Demo.mp4（≤ 5:00；面向 15–25 岁中「喜欢短平快惊悚/梗文化、常在 PC 上玩独立游戏」的玩家；需包含团队与游戏介绍、真实游玩、游戏内 Demo 按钮与自动演示、外部反馈与迭代证据，以及至少一段真人操作鼠标/键盘的实机画面。**尚未录制。**）

---

## External playtest (Task 7) — NO AI

> **以下全部由组员本人在真实外部试玩后填写，禁止使用 AI 生成/翻译/改写/润色。**
> 匿名、不记录姓名/学号/联系方式/学校等敏感信息，并取得 tester 同意。

Anonymous tester label (do not include a name, student ID or contact details):
TODO e.g. “Tester A（非本组成员）”

Intended player/customer segment:
TODO（建议把 15–25 岁收窄，例如：16–22 岁、喜欢短时惊悚/独立游戏/网络梗、每周玩 PC 游戏 3 次以上、能接受第一人称与鼠标锁定）

Non-identifying tester profile — broad age range, general role/context, gaming frequency or experience, and familiarity with similar games:
TODO（例如：20–24 岁；在读学生/初入职场；每周玩 PC 游戏 X 小时；玩过/没玩过第一人称迷宫或恐怖游戏）

Why this tester fits or does not fit the intended segment:
TODO

Playtest date:
TODO

What the tester tried:
TODO（例如：从菜单开始，不看攻略完成一局；试了地图/加速解锁、暂停、Demo）

What we directly observed before helping:
TODO（只写亲眼观察：卡在哪、按了什么、看了哪里、有没有被吓到、是否理解目标）

Tester feedback — exact words or faithful notes:
TODO（原话或忠实笔记；不要润色）

Permission to include this anonymous profile and these notes: Yes
（TODO：确认已口头/书面取得同意，并在提交前再次核对）

Improvement cycle that used this feedback: 1 或 2（TODO）

---

## Iteration record (Task 8) — NO AI

> **以下两次改进循环必须由组员根据真实观察亲自记录，禁止 AI 代写。**
> 至少一次必须从上面的外部试玩反馈出发；每次都要写清「观察到什么 → 改了什么 → 谁做/谁查 → 重测结果」。
> 保留一次失败或部分成功的尝试也可以，它帮助了后续决策。

### Improvement cycle 1
What we personally observed:
TODO

What we changed and any AI help:
TODO（说明是否用了 AI、用在何处；AI 不得替写观察）

Who worked on or checked it:
TODO

Retest result:
TODO

### Improvement cycle 2
What we personally observed:
TODO

What we changed and any AI help:
TODO

Who worked on or checked it:
TODO

Retest result:
TODO

---

## What I learned — NO AI

> 每位组员一段，**200 词以内**，用你自己的话；AI 不得生成/翻译/改写/润色。英文优先，中文也接受；语法不影响评分。

### TODO — 组员姓名 / 学号
TODO（≤200 words，本人撰写）

### TODO — 组员姓名 / 学号
TODO（≤200 words，本人撰写）

### TODO — 组员姓名 / 学号
TODO（≤200 words，本人撰写）

### TODO — 组员姓名 / 学号
TODO（≤200 words，本人撰写）

---

## 提交打包（Submission packaging）

运行 `python tools/package_submission.py` 会自动生成 `release/w05_3d_game/`，也可手工复制：

- **运行包 `w05_3d_game/` 必须包含（保持相对路径不变）：** `index.html`、`styles.css`、`src/`、`vendor/`、`assets/`、`serve.py`、`run_game.bat`、`package.json`、`pnpm-lock.yaml`、`README.md`。
- **不要把 `node_modules/`、`tools/`、开发脚本、`.git/` 放进运行包**（打包脚本也不会带 `tools/`）。
- `docs/` 按课程要求处理：打包脚本只把 `docs/AUDIO.md`、`docs/TEXTURES.md` 复制到包内的 `docs/` 作为制作说明；若课程不要求附件，删掉这个子目录即可，游戏本身不依赖它。
- `W05_<GroupID>.md`（填好的报告）放在 `release/` 下，与 `w05_3d_game/` **同级**一起提交。
- 解压后自检：进入 `w05_3d_game/` → `python serve.py 8000` → 打开 http://127.0.0.1:8000/ → 完整走一局并跑一次 Demo，确认相对路径没有断。

## 组员提交前检查表（人工）

> 更细的一页版（试玩提问脚本、迭代记录表、视频分镜、10 项自检）见 **`docs/SUBMISSION.md`**。

- [ ] 文件名改为 `W05_<GroupID>.md`，组号、所有成员姓名/学号、分工与个人检查补齐。
- [ ] 外部试玩：1 位非组员，匿名资料 + 日期 + 观察 + 原话 + 同意，且至少一次迭代从该反馈出发。
- [ ] 两次改进循环均有「观察 / 改动 / 负责人 / 重测」且为本人记录。
- [ ] 每位成员 200 词以内学习总结，本人撰写。
- [ ] 视频 ≤5:00，包含真人游玩片段（手在键鼠上即可，不需要露脸）、Demo 模式、外部反馈与迭代证据；不含密码/隐私。
- [ ] 运行提交包：解压/进入 `w05_3d_game/` → `python serve.py 8000` → 打开 http://127.0.0.1:8000/ → 点击提交约定路径，完整跑一局并测试 Demo。
- [ ] 提交包保留相对路径（index.html、styles.css、src/、vendor/、assets/、serve.py、run_game.bat、package.json、pnpm-lock.yaml、README.md）。
- [ ] 不在提交包内放 `node_modules/`、API key、账号、聊天记录或个人隐私。
- [ ] 在提交历史中确认文件齐全，再点击提交。
