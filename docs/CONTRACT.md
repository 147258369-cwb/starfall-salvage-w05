# 奶蛙乐园 — 模块契约（Lead 维护）

游戏：**《奶蛙乐园：午夜奶片》**（Milk Frog Park: Midnight Milk Candy）
第一人称、单关、温馨惊悚。核心循环：在废弃幼儿园迷宫里收集 8 片「奶片」→ 进度解锁地图、再解锁加速 → 躲开奶蛙 → 从安全出口离开。
叙事：1999 年最后一场生日会后，所有孩子吃了奶片「变成奶龙」，只有你把 8 片奶片藏了起来；多年后乐园拆除前夜，你回来取走它们。

## 目录与写入范围
- Lead：`index.html`、`src/main.js`、`src/world.js`、`src/player.js`、`src/frogs.js`、`src/ui.js`、`src/story.js`、`src/demo.js`、`src/config.js`、`src/audio.js`、`README.md`、`W05_GroupID.md`
- 音频代理：`assets/audio/**`、`tools/gen_audio.py`、`docs/AUDIO.md`
- 贴图代理：`src/textures.js`、`tools/texture-preview.html`、`docs/TEXTURES.md`
- 任何人不要改别人的文件；需要改契约先在共享任务里说明。

## 技术栈
- Three.js **0.160.0**，本地 vendored：`vendor/three.module.js`（importmap `three`）。禁止 CDN / 运行时外网依赖。
- 纯 ES Module，无构建步骤；通过 `python serve.py 8000` 以 http:// 打开。
- 所有素材必须原创或由本组用程序生成（TTS/合成音频、canvas 贴图、几何体建模）。禁止使用他人版权图片/音频（包括真正的奶龙官方形象；奶蛙是我们自己的低多边形二创）。

## 视觉基调
- 温馨：奶油黄 #ffd9a0、粉 #f7b6c2、薄荷 #a9d6c4、木色 #b07a4a。
- 惊悚：暗红棕 #1a0f12、冷绿应急灯 #7dffb0、脏紫 #3b2344；雾、频闪、噪点、暗角、VHS 轻微色差。
- AAA 式排版：衬线大标题（宋体/思源宋体回退）、金色细线、宽字距、底部字幕。

## 音频契约（音频代理）
放置 `assets/audio/*.wav`（PCM 16-bit，mono 22050–32000Hz；音乐可 stereo）＋ `assets/audio/manifest.json`。

```json
{
  "generated": "2026-10-29",
  "generator": "tools/gen_audio.py",
  "tracks": {
    "music_menu": { "file": "assets/audio/music_menu.wav", "kind": "music", "loop": true, "gain": 0.55, "duration": 28.0, "desc": "音乐盒摇篮曲，微走音" },
    "vo_01":       { "file": "assets/audio/vo_01.wav", "kind": "voice", "loop": false, "gain": 0.9, "duration": 4.0, "text": "1999年，奶蛙乐园举办最后一场生日会。" }
  }
}
```
路径相对仓库根目录。必需 key 及内容：

| key | 用途 | 要求 |
|---|---|---|
| `music_menu` | 主菜单循环 | 28s 左右，音乐盒小调摇篮曲，温馨但微走音/低频嗡鸣 |
| `music_story` | 片头剧情循环 | 30s 左右，更暗的低频 drone + 稀疏音符 |
| `amb_game` | 游玩环境循环 | 24s 左右，室内底噪、远处水滴/电流声 |
| `heartbeat` | 心跳循环 | 1.5–2s 无缝，奶蛙靠近时提高音量 |
| `vo_01`…`vo_05` | 旁白，五句 | 中文男声（Kangkang）降调 + 混响，逐句文件；vo_06 已随剧情压缩删除 |
| `frog_voice_1`…`frog_voice_4` | 奶蛙循环叫声 | 3–5s 可循环；1 必须是「我是奶龙！我才是奶龙！」；其余自拟抽象台词 |
| `sfx_click` | UI 点击 | 短促 |
| `sfx_start_sting` | 点击开始后的阴森音效 | 3–5s，有冲击与长混响 |
| `sfx_pickup` | 拾取奶片 | 清脆铃铛，可叠音 |
| `sfx_unlock_map` | 解锁地图 | 2–3s，温暖但有一个不和谐音 |
| `sfx_unlock_speed` | 解锁加速 | 2–3s，上升音 |
| `sfx_exit_open` | 出口开启 | 3s，门闩/风声 |
| `sfx_win` | 通关 | ≤8s，温暖收束但尾音诡异 |
| `sfx_lose` | 被抓 | ≤6s，低频下坠 + 尖啸 |
| `sfx_screech` | 奶蛙贴脸惊吓 | 1.5–2.5s |
| `sfx_footstep_1`/`_2` | 脚步 | 各 ≤0.5s |
| `sfx_sprint` | 加速起跑 | ≤1s |
| `sfx_frog_alert` | 奶蛙发现玩家 | ≤1.5s |
| `sfx_ui_hover` | 菜单悬停（可选） | 很短 |

旁白文本（必须逐字）：
1. 1999年，奶蛙乐园举办最后一场生日会。
2. 老师说：吃了奶片，就能变成奶龙。
3. 所有孩子都吃了。只有你，把八片奶片藏了起来。
4. 第二天，乐园空了。只剩那首歌——我是奶龙，我才是奶龙。
5. 推土机明天就来。你回来取走奶片。

生成要求：用 Windows SAPI（`System.Speech` 的 zh-CN 语音）导出 wav，再用 numpy 处理（降调、回声/混响、失真、无缝循环化），全部由一个可复现脚本 `tools/gen_audio.py` 生成。`docs/AUDIO.md` 写清楚：生成方式、AI 生成声明、每轨参数、如何重新生成。不要把版权音频放进来。

## 贴图契约（贴图代理）
`src/textures.js` 导出：

```js
export const ZONES = ['entry','classroom','nap','canteen','corridor','exit'];
export function createTextures() // 返回缓存对象
// 对象方法（全部返回 THREE.Texture，已设置 colorSpace=SRGBColorSpace、需要平铺的设置 RepeatWrapping+anisotropy）：
//   wallpaper(zone)    512x512 平铺墙纸（含 1.1m 高墙裙的感觉可另用 trim）
//   floor(zone)        512x512 平铺地面
//   ceiling(zone)      512x512 平铺天花板
//   trim(zone)         64x64 或 512x128 平铺墙裙/踢脚线
//   poster(kind)       kind: 'frog' | 'birthday' | 'rules' | 'drawing' | 'missing' | 'map' | 'menu'；非平铺单图 512x768/512x512
//   sign(text, opts)   512x160 中文标牌（opts: {bg,fg,glow}）；用于教室/午睡室/食堂/安全出口/门头
//   frogFace()         512x512 奶蛙正脸（黄绿色圆脸、巨大白眼、极小瞳孔、诡异微笑）
//   glow()             512x512 白色径向渐变（用于假光池/粒子）
// ```
所有纹理用 canvas 2D 程序化绘制（OffscreenCanvas 或 document.createElement('canvas')），**不加载外部图片**。风格需统一、分辨率够近看。另写 `tools/texture-preview.html`：用本地 three 渲染每个 zone 的墙/地/顶+全部 poster 和 frogFace，方便截图验收。`docs/TEXTURES.md` 记录 zone 的设计意图、调色板、如何新增。

## 测试
- 本地服务：`python serve.py 8000`。
- 截图/自动化：`tools/qa`（Lead 建）用 playwright-core + 本机 Edge，可截图菜单/剧情/游玩/Demo。
- 交付标准：Chrome/Edge 最新版、1280×720 与 1920×1080 都能玩；键盘+鼠标锁定；音量可调/静音；无控制台报错。

## 命名与文本
全部玩家可见文字使用中文（可带少量英文副标题，如 `MILK FROG PARK`、`DEMO`）。代码注释中文或英文均可，但要能看懂。
