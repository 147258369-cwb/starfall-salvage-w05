#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
《奶蛙乐园：午夜奶片》—— 原创音频生成器
====================================================
一条命令重建全部音频：

    python tools/gen_audio.py              # 全量生成 + 自检
    python tools/gen_audio.py --only music_menu,sfx_click
    python tools/gen_audio.py --skip-tts   # 复用上次的 TTS 缓存（只重跑 DSP）

依赖：Python 3.10+、numpy；Windows 10/11 自带中文语音
（Microsoft Kangkang / Huihui / Yaoyao，OneCore）。TTS 走
Windows.Media.SpeechSynthesis（WinRT），因为 System.Speech(SAPI5)
在本机只暴露 Huihui Desktop，看不到 Kangkang / Yaoyao。
外部不下载任何素材，全部由本脚本 + 本机语音合成。
"""
from __future__ import annotations

import argparse
import json
import math
import os
import shutil
import subprocess
import sys
import tempfile
import time
import wave
from pathlib import Path

import numpy as np

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

SR = 32000                 # 统一采样率（契约允许 22050–32000）
PEAK_DB = -1.5             # 统一峰值，给引擎留 headroom
ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "assets" / "audio"
TMP = Path(tempfile.gettempdir()) / "milkfrog_tts"
TTS_CACHE = TMP / "tts_raw"          # TTS 中间产物不进仓库

rng_global = np.random.default_rng(20261029)


# --------------------------------------------------------------------------
# 基础工具
# --------------------------------------------------------------------------
def db(x: float) -> float:
    """dBFS -> 线性幅度"""
    return 10.0 ** (x / 20.0)


def norm(x: np.ndarray, peak_db: float = PEAK_DB) -> np.ndarray:
    """峰值归一化到 peak_db，并保证不削波"""
    m = float(np.max(np.abs(x))) if x.size else 0.0
    if m < 1e-9:
        return x
    y = x * (db(peak_db) / m)
    return np.clip(y, -0.999, 0.999)


def t_axis(n: int, sr: int = SR) -> np.ndarray:
    return np.arange(n, dtype=np.float64) / sr


def fftconv(x: np.ndarray, h: np.ndarray) -> np.ndarray:
    """FFT 卷积，返回与 x 等长（超出部分丢弃）"""
    if h.size == 0:
        return x
    n = len(x) + len(h) - 1
    nfft = 1 << int(math.ceil(math.log2(max(n, 2))))
    y = np.fft.irfft(np.fft.rfft(x, nfft) * np.fft.rfft(h, nfft), nfft)
    return y[: len(x)]


def lowpass(x, fc, sr=SR, stages=2):
    """级联一阶低通（用指数 IR 卷积实现，iresponse 短、速度快）"""
    fc = float(min(fc, sr * 0.45))
    a = math.exp(-2.0 * math.pi * fc / sr)
    ln = int(max(8, min(len(x), 6.0 / (2.0 * math.pi * fc) * sr) + 8))
    ir = (1.0 - a) * a ** np.arange(ln)
    y = x
    for _ in range(stages):
        y = fftconv(y, ir)
    return y


def highpass(x, fc, sr=SR, stages=2):
    y = lowpass(x, fc, sr, stages)
    return x - y


def bandpass(x, lo, hi, sr=SR):
    return highpass(lowpass(x, hi, sr, 2), lo, sr, 2)


def resample(x, ratio: float):
    """比值 >1 = 变调升高、时长变短；<1 = 降调、变长（磁带式变速变调）"""
    n_out = max(2, int(round(len(x) / ratio)))
    src = np.arange(len(x), dtype=np.float64)
    dst = np.arange(n_out, dtype=np.float64) * (len(x) - 1) / max(n_out - 1, 1)
    return np.interp(dst, src, x)


def fade(x, fin=0.01, fout=0.05, sr=SR):
    y = x.copy()
    ni = int(min(len(y) // 2, fin * sr))
    no = int(min(len(y) // 2, fout * sr))
    if ni > 0:
        y[:ni] *= np.sin(np.linspace(0, math.pi / 2, ni)) ** 2
    if no > 0:
        y[-no:] *= np.cos(np.linspace(0, math.pi / 2, no)) ** 2
    return y


def loopify(x, xfade_s=0.03, sr=SR):
    """无缝循环：把尾部淡入到头部，接缝处采样级连续"""
    nf = int(xfade_s * sr)
    if nf <= 1 or len(x) < 3 * nf:
        return x
    head = x[:nf].copy()
    tail = x[-nf:].copy()
    body = x[:-nf].copy()
    w = 0.5 - 0.5 * np.cos(np.linspace(0, math.pi, nf))
    w = np.sin(w * math.pi / 2)
    body[:nf] = head * w + tail * (1.0 - w)
    return body


def wrap_tail(buf: np.ndarray, total: int, tail: int) -> np.ndarray:
    """把循环长度之后的余响折回到开头（音乐/环境循环的关键）"""
    out = buf[:total].copy()
    if tail > 0 and len(buf) > total:
        t = buf[total:total + tail]
        out[: len(t)] += t
    return out


def echo(x, delay_s, feedback=0.35, mix=0.25, taps=5, sr=SR):
    y = x.copy()
    d = max(1, int(delay_s * sr))
    buf = np.zeros(len(x) + d * taps)
    buf[: len(x)] = x
    for i in range(1, taps + 1):
        g = mix * (feedback ** (i - 1))
        buf[i * d: i * d + len(x)] += x * g
    return buf[: len(x)]


def reverb(x, wet=0.22, room=1.0, decay=0.72, seed=7, sr=SR, pre=0.006):
    """多抽头延迟混响：指数衰减的稀疏脉冲串当 IR"""
    r = np.random.default_rng(seed)
    n_tap = 34
    ir_len = int(min(2.2 * room, 2.2) * sr) + 64
    ir = np.zeros(ir_len)
    t = pre * sr + 4
    for i in range(n_tap):
        # 抽头间隔逐渐加大，模拟房间模态
        t += (0.011 + 0.0042 * i + r.random() * 0.012) * room * sr
        if t >= ir_len - 2:
            break
        g = decay ** i
        ir[int(t)] += g * (0.55 + 0.45 * r.random())
        # 每个抽头带一点扩散
        for k in (1, 2, 3):
            j = int(t) + k * 7
            if j < ir_len:
                ir[j] += g * 0.22 / k
    # 柔化 IR（避免金属感过强的梳状）
    ir = lowpass(ir, 4800, sr, 2)
    ir[: int(pre * sr)] = 0.0
    wet_sig = fftconv(x, ir)
    # 归一化混响能量
    m = np.max(np.abs(wet_sig))
    if m > 1e-9:
        wet_sig *= (np.max(np.abs(x)) + 1e-9) / m
    return x * (1.0 - wet * 0.55) + wet_sig * wet


def tape_wobble(x, depth=0.0022, rate=0.55, flutter=0.0007, frate=6.3, sr=SR, seed=3):
    """磁带抖动/抖晃：慢速 wow + 快速 flutter 的时变重采样"""
    n = len(x)
    t = np.arange(n) / sr
    r = np.random.default_rng(seed)
    slow = np.sin(2 * math.pi * rate * t + r.random() * 6.0)
    fast = np.sin(2 * math.pi * frate * t + r.random() * 6.0)
    pos = np.arange(n) + (slow * depth + fast * flutter) * sr
    return np.interp(np.clip(pos, 0, n - 1), np.arange(n), x)


def bitcrush(x, bits=10, hold=1):
    """比特粉碎 + 采样保持（降采样）"""
    q = 2.0 ** (bits - 1)
    y = np.round(x * q) / q
    if hold > 1:
        n = len(y)
        idx = (np.arange(n) // hold) * hold
        y = y[np.clip(idx, 0, n - 1)]
    return y


def saturate(x, drive=1.6):
    return np.tanh(x * drive) / math.tanh(drive)


def silence(sec, sr=SR):
    return np.zeros(max(0, int(sec * sr)))


def pad_to(x, n, sr=SR):
    if len(x) >= n:
        return x[:n]
    y = np.zeros(n)
    y[: len(x)] = x
    return y


def add_at(buf, sig, start_sample):
    """把 sig 叠加到 buf 的第 start_sample 个采样处（自动裁剪）"""
    s = max(0, int(start_sample))
    if s >= len(buf):
        return buf
    n = min(len(sig), len(buf) - s)
    buf[s:s + n] += sig[:n]
    return buf


def midi_hz(m, cents=0.0):
    return 440.0 * 2.0 ** ((m - 69 + cents / 100.0) / 12.0)


def noise(n, seed=1, sr=SR):
    return np.random.default_rng(seed).standard_normal(n)


def brown(n, seed=1, sr=SR):
    w = noise(n, seed, sr)
    b = np.cumsum(w)
    b = b - lowpass(b, 3.0, sr, 1)          # 去直流
    return b / (np.max(np.abs(b)) + 1e-9)


# --------------------------------------------------------------------------
# 音色
# --------------------------------------------------------------------------
def mb_tone(freq, dur, amp=1.0, decay=1.15, drift=0.0035, sr=SR,
            partials=((1.0, 1.0, 1.0), (2.004, 0.26, 1.7), (3.02, 0.10, 2.9),
                      (4.37, 0.05, 4.2), (6.24, 0.02, 6.0)), click=0.0, seed=0):
    """音乐盒音色：正弦谐波堆 + 指数衰减 + 轻微失谐/下坠"""
    n = max(2, int(dur * sr))
    t = t_axis(n, sr)
    out = np.zeros(n)
    for mul, a, dk in partials:
        f = freq * mul
        inst = f * (1.0 - drift * t / max(dur, 1e-6))
        ph = 2.0 * math.pi * np.cumsum(inst) / sr
        env = np.exp(-decay * dk * 0.42 * t)
        out += a * env * np.sin(ph)
    na = max(2, int(0.003 * sr))
    out[:na] *= np.linspace(0, 1, na) ** 2
    # 起音瞬态（铃舌/簧片碰击）
    nk = max(2, int(0.012 * sr))
    if click > 0:
        ck = np.random.default_rng(seed + 991).standard_normal(nk) * np.exp(-t[:nk] * 260.0)
        out[:nk] += lowpass(ck, 9000, sr, 1) * click
    return out * amp


def soft_tone(freq, dur, amp=1.0, decay=0.9, attack=0.06, sr=SR, harm=(1.0, 0.0, 0.0)):
    n = max(2, int(dur * sr))
    t = t_axis(n, sr)
    out = np.zeros(n)
    for i, a in enumerate(harm):
        if a <= 0:
            continue
        out += a * np.sin(2 * math.pi * freq * (i + 1) * t)
    env = (1.0 - np.exp(-t / max(attack, 1e-4))) * np.exp(-decay * t)
    return out * env * amp


def thump(freq=90.0, dur=0.35, amp=1.0, drop=0.55, sr=SR, body=0.5, seed=5):
    """低频冲击：音高快速下坠的正弦 + 低频噪声体"""
    n = max(2, int(dur * sr))
    t = t_axis(n, sr)
    f = freq * (1.0 - drop * np.clip(t / max(dur * 0.5, 1e-4), 0, 1) ** 0.6)
    ph = 2.0 * math.pi * np.cumsum(f) / sr
    env = np.exp(-t * (5.5 / max(dur, 0.05)))
    sig = np.sin(ph) * env
    nb = lowpass(np.random.default_rng(seed).standard_normal(n), 260, sr, 3)
    nb *= np.exp(-t * 30.0)
    return (sig + nb * body) * amp


def bell(freq, dur=1.0, amp=1.0, sr=SR, seed=2):
    return mb_tone(freq, dur, amp, decay=2.4, drift=0.002,
                   partials=((1.0, 1.0, 1.0), (2.76, 0.42, 1.9), (5.40, 0.20, 3.2),
                             (8.93, 0.08, 5.0)), click=0.25, seed=seed)


def chirp(f0, f1, dur, amp=1.0, sr=SR, curve=2.0):
    n = max(2, int(dur * sr))
    t = t_axis(n, sr)
    k = np.linspace(0, 1, n) ** curve
    f = f0 + (f1 - f0) * k
    ph = 2.0 * math.pi * np.cumsum(f) / sr
    env = np.sin(np.linspace(0, math.pi, n)) ** 1.5
    return np.sin(ph) * env * amp


# --------------------------------------------------------------------------
# TTS（Windows.Media.SpeechSynthesis / OneCore，支持 zh-CN Kangkang 等）
# --------------------------------------------------------------------------
PS_HELPER = r'''
param([string]$JobsFile)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Runtime.WindowsRuntime | Out-Null
$asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name.StartsWith('IAsyncOperation') })[0]
function Await($WinRtTask, $ResultType) {
  $asTask = $asTaskGeneric.MakeGenericMethod($ResultType)
  $netTask = $asTask.Invoke($null, @($WinRtTask))
  $netTask.Wait(-1) | Out-Null
  $netTask.Result
}
[Windows.Media.SpeechSynthesis.SpeechSynthesizer,Windows.Media.SpeechSynthesis,ContentType=WindowsRuntime] | Out-Null
[Windows.Storage.Streams.DataReader,Windows.Storage.Streams,ContentType=WindowsRuntime] | Out-Null
$jobs = Get-Content -Raw -Encoding UTF8 $JobsFile | ConvertFrom-Json
$all = [Windows.Media.SpeechSynthesis.SpeechSynthesizer]::AllVoices
Write-Output ('VOICES|' + (($all | ForEach-Object { $_.DisplayName }) -join ','))
foreach ($j in $jobs) {
  $synth = [Windows.Media.SpeechSynthesis.SpeechSynthesizer]::new()
  $v = $all | Where-Object { $_.DisplayName -like ('*' + $j.voice + '*') } | Select-Object -First 1
  if ($v -ne $null) { $synth.Voice = $v }
  $stream = Await $synth.SynthesizeSsmlToStreamAsync($j.ssml) ([Windows.Media.SpeechSynthesis.SpeechSynthesisStream])
  if ($stream -eq $null) { Write-Output ('FAIL|' + $j.out); $synth.Dispose(); continue }
  $size = [uint32]$stream.Size
  $reader = [Windows.Storage.Streams.DataReader]::new($stream)
  Await $reader.LoadAsync($size) ([uint32]) | Out-Null
  $bytes = New-Object byte[] $size
  $reader.ReadBytes($bytes)
  [System.IO.File]::WriteAllBytes($j.out, $bytes)
  Write-Output ('OK|' + $j.out + '|' + $size)
  $reader.Dispose(); $stream.Dispose(); $synth.Dispose()
}
'''.strip()


def read_wav_raw(path: Path):
    with wave.open(str(path), "rb") as w:
        nch = w.getnchannels()
        sr = w.getframerate()
        sw = w.getsampwidth()
        nf = w.getnframes()
        raw = w.readframes(nf)
    if sw != 2:
        raise SystemExit(f"unsupported sample width {sw} in {path}")
    a = np.frombuffer(raw, dtype="<i2").astype(np.float64) / 32768.0
    if nch > 1:
        a = a.reshape(-1, nch).mean(axis=1)
    return a, sr


def write_wav(path: Path, x: np.ndarray, sr: int = SR):
    y = np.clip(x, -1.0, 1.0)
    pcm = (y * 32767.0).astype("<i2")
    path.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(path), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(sr)
        w.writeframes(pcm.tobytes())
    return path


def ssml(text: str, rate: str = "1.0", volume: str = "100") -> str:
    """
    只给 prosody 传 rate 与 volume。

    注意本机 OneCore 中文语音把 rate **量化成粗台阶**（实测，同一句 4.85s 基准）：
        rate 0.90            -> 0.896x
        rate 0.96 / 1.00 / 1.05 -> 1.000x
        rate 1.10 / 1.15     -> 1.115x
        rate 1.18 / 1.20 / 1.25 / 1.30 -> 1.244x   <-- 旁白用这一档
        rate 1.40            -> 1.386x
        rate 1.50 / "fast"   -> 1.545x
    也就是说 1.18–1.22 之间没有精确台阶，1.244x 是最近的一档（偏 +2%）。
    实测本机 OneCore zh-CN 语音会忽略 pitch 半音属性（输出字节数不变），
    且 pitch 值不带正负号时 SSML 直接解析失败(0x80131537)，
    所以音高一律交给 numpy 的变速变调处理，SSML 里不出现 pitch。
    """
    return (
        '<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="zh-CN">'
        f'<prosody rate="{rate}" volume="{volume}">{text}</prosody></speak>'
    )


# (key, voice, 文本, 语速)
# 旁白语速：rate 1.20 -> 实际 1.244x（见 ssml() 说明）。片头压到 5 句，目标把剧情总时长
# 从 ~45s 压到 ~26.5s（文件合计 23.1s + 引擎每句后 0.68s 停顿）。
VOICE_JOBS = [
    ("vo_01", "Kangkang", "1999年，奶蛙乐园举办最后一场生日会。", "1.20"),
    ("vo_02", "Kangkang", "老师说：吃了奶片，就能变成奶龙。", "1.20"),
    ("vo_03", "Kangkang", "所有孩子都吃了。只有你，把八片奶片藏了起来。", "1.20"),
    ("vo_04", "Kangkang", "第二天，乐园空了。只剩那首歌——我是奶龙，我才是奶龙。", "1.20"),
    ("vo_05", "Kangkang", "推土机明天就来。你回来取走奶片。", "1.20"),
    ("frog_voice_1", "Huihui", "我是奶龙！我才是奶龙！", "1.0"),
    ("frog_voice_2", "Kangkang", "奶……奶片……给我……", "0.70"),
    ("frog_voice_3", "Yaoyao", "龙……奶龙……都是奶龙……", "1.05"),
    ("frog_voice_4", "Huihui", "嘘……别怕……留下来……", "0.85"),
]


def synth_tts(jobs, force=False):
    """调 PowerShell + WinRT 批量合成，缓存在 %TEMP%/milkfrog_tts/tts_raw（带文本指纹）"""
    TTS_CACHE.mkdir(parents=True, exist_ok=True)
    todo = []
    for key, voice, text, rate in jobs:
        out = TTS_CACHE / f"{key}.wav"
        meta = TTS_CACHE / f"{key}.json"
        doc = ssml(text, rate)
        stamp = json.dumps({"voice": voice, "ssml": doc}, ensure_ascii=False)
        hit = False
        if out.exists() and out.stat().st_size > 2000 and meta.exists() and not force:
            try:
                hit = json.loads(meta.read_text(encoding="utf-8")) == json.loads(stamp)
            except Exception:
                hit = False
        if hit:
            continue
        (TTS_CACHE / f"{key}.json").write_text(stamp, encoding="utf-8")
        todo.append({"voice": voice, "ssml": doc, "out": str(out)})
    if not todo:
        print("[tts] 全部命中缓存，跳过合成")
        return
    TMP.mkdir(parents=True, exist_ok=True)
    ps1 = TMP / "synth.ps1"
    jobfile = TMP / "jobs.json"
    ps1.write_text("\ufeff" + PS_HELPER, encoding="utf-8")
    jobfile.write_text("\ufeff" + json.dumps(todo, ensure_ascii=False), encoding="utf-8")
    print(f"[tts] 合成 {len(todo)} 条语音 …")
    r = subprocess.run(
        ["powershell.exe", "-NoProfile", "-ExecutionPolicy", "Bypass",
         "-File", str(ps1), str(jobfile)],
        capture_output=True, text=True, encoding="utf-8", errors="replace",
    )
    for line in (r.stdout or "").splitlines():
        if line.startswith(("VOICES|", "OK|")):
            print("   ", line)
    missing = [j["out"] for j in todo if not Path(j["out"]).exists()]
    if r.returncode != 0 or missing:
        print(r.stderr)
        raise SystemExit(
            "TTS 失败：" + (", ".join(Path(m).name for m in missing) or "见 stderr")
            + "（检查 zh-CN 语音是否安装：Kangkang / Huihui / Yaoyao）"
        )


def load_tts(key: str):
    p = TTS_CACHE / f"{key}.wav"
    if not p.exists():
        raise SystemExit(f"缺 TTS 缓存 {p}，先跑一次不带 --skip-tts 的生成")
    x, sr = read_wav_raw(p)
    return x, sr


# --------------------------------------------------------------------------
# 13 段音乐 / 环境 / 心跳
# --------------------------------------------------------------------------
BPM_MENU = 84.0
BPM_STORY = 64.0

MENU_MELODY = [
    (0, 76, 1), (1, 74, 1), (2, 72, 1.5), (3.5, 71, 0.5),
    (4, 72, 1), (5, 76, 1), (6, 74, 2),
    (8, 79, 1), (9, 76, 0.5), (9.5, 74, 0.5), (10, 72, 2),
    (12, 74, 1), (13, 71, 1), (14, 67, 2),
    (16, 69, 1), (17, 72, 1), (18, 76, 1.5), (19.5, 77, 0.5),
    (20, 76, 1), (21, 72, 1), (22, 69, 2),
    (24, 74, 1), (25, 77, 1), (26, 81, 1.5), (27.5, 79, 0.5),
    (28, 76, 1), (29, 74, 1), (30, 71, 2),
    (32, 72, 1), (33, 74, 1), (34, 76, 1), (35, 79, 1),
    (36, 81, 1), (37, 79, 0.5), (37.5, 76, 0.5), (38, 74, 0.75), (38.75, 69, 1.25),
]
# 第 6 小节塞一个半音高的“错音”——温馨里的一根刺
MENU_GRUDGE = [(29.6, 68, 0.7, 0.16), (22.4, 70, 0.6, 0.10)]
MENU_BASS = [45, 41, 48, 43, 45, 41, 38, 40, 45, 45]   # Am F C G Am F Dm E Am Am

STORY_MELODY = [
    (0, 69, 1.5), (2.5, 72, 1.5), (6.0, 65, 2.0),
    (8, 65, 1.5), (10.5, 69, 2.0),
    (16, 60, 2.0), (18.5, 62, 1.5),
    (24, 64, 2.0), (26.5, 67, 2.0),
    (30, 65, 2.5),
]
STORY_BASS = [41, 41, 38, 38, 45, 45, 40, 41]


def make_music_menu(seed=11):
    r = np.random.default_rng(seed)
    beat = 60.0 / BPM_MENU
    bars = 10
    total_s = bars * 4 * beat
    total = int(total_s * SR)
    tail = int(2.5 * SR)
    buf = np.zeros(total + tail)
    detune = -26.0   # 整体音准偏低 26 音分

    for (b, m, d) in MENU_MELODY:
        f = midi_hz(m, detune + r.normal(0, 3))
        tone = mb_tone(f, min(d * beat + 1.6, 2.8), amp=0.46 * (1.0 - 0.03 * (b / 40)),
                       decay=1.05 + r.random() * 0.25, drift=0.004, click=0.09, seed=int(b * 7))
        s = int(b * beat * SR)
        buf[s:s + len(tone)] += tone[: max(0, len(buf) - s)]

    for (b, m, d, a) in MENU_GRUDGE:
        f = midi_hz(m, detune)
        tone = mb_tone(f, d * beat + 1.2, amp=a, decay=2.2, seed=int(b))
        s = int(b * beat * SR)
        buf[s:s + len(tone)] += tone[: max(0, len(buf) - s)]

    # 低音 + 琶音
    for bar in range(bars):
        root = MENU_BASS[bar]
        for k, off in enumerate([0, 7, 12, 7, 12, 19]):
            b = bar * 4 + k * 0.6667
            f = midi_hz(root + off, detune)
            tone = soft_tone(f, 0.75, amp=0.085, decay=1.6, attack=0.01, harm=(1.0, 0.18, 0.06))
            s = int(b * beat * SR)
            buf[s:s + len(tone)] += tone[: max(0, len(buf) - s)]
        f = midi_hz(root - 12, detune)
        b_tone = soft_tone(f, 2.7, amp=0.13, decay=0.55, attack=0.08, harm=(1.0, 0.25, 0.08))
        s = int(bar * 4 * beat * SR)
        buf[s:s + len(b_tone)] += b_tone[: max(0, len(buf) - s)]

    # 低频不安嗡鸣（始终在下面）
    t = t_axis(len(buf))
    drone = (0.55 * np.sin(2 * math.pi * 55.0 * t)
             + 0.32 * np.sin(2 * math.pi * 55.9 * t)
             + 0.22 * np.sin(2 * math.pi * 41.2 * t)
             + 0.10 * np.sin(2 * math.pi * 110.4 * t))
    drone *= 0.055 * (0.85 + 0.15 * np.sin(2 * math.pi * 0.07 * t))
    buf += lowpass(drone, 170, SR, 3)

    # 磁带底噪 + 稀疏噼啪
    hiss = lowpass(noise(len(buf), 41), 2200, SR, 2) * 0.006
    buf += hiss
    idx = r.integers(0, len(buf) - 200, size=26)
    for i in idx:
        buf[i:i + 160] += noise(160, int(i)) * np.exp(-np.arange(160) / 22.0) * 0.012

    mixed = wrap_tail(buf, total, tail)
    mixed = tape_wobble(mixed, depth=0.0026, rate=0.42, flutter=0.0006, frate=5.7)
    mixed = lowpass(highpass(mixed, 32), 12500, SR, 1)
    mixed = fade(mixed, 0.02, 0.02)
    mixed = loopify(mixed, 0.05)
    return norm(mixed)


def make_music_story(seed=23):
    r = np.random.default_rng(seed)
    beat = 60.0 / BPM_STORY
    bars = 8
    total_s = bars * 4 * beat          # 30.0s
    total = int(total_s * SR)
    tail = int(3.0 * SR)
    buf = np.zeros(total + tail)
    detune = -32.0

    for (b, m, d) in STORY_MELODY:
        f = midi_hz(m, detune + r.normal(0, 4))
        tone = mb_tone(f, min(d * beat + 2.4, 3.6), amp=0.32, decay=0.72,
                       drift=0.006, click=0.06, seed=int(b * 13))
        s = int(b * beat * SR)
        buf[s:s + len(tone)] += tone[: max(0, len(buf) - s)]

    for bar in range(bars):
        root = STORY_BASS[bar]
        f = midi_hz(root - 12, detune)
        bt = soft_tone(f, 4.0, amp=0.16, decay=0.28, attack=0.5, harm=(1.0, 0.3, 0.12))
        s = int(bar * 4 * beat * SR)
        buf[s:s + len(bt)] += bt[: max(0, len(buf) - s)]
        # 每两小节一记远处的铁皮敲击
        if bar % 2 == 1:
            hit = mb_tone(148.0 + r.random() * 30, 2.4, amp=0.07, decay=2.6,
                          partials=((1.0, 1.0, 1.0), (2.41, 0.5, 1.7), (3.87, 0.25, 2.6)), seed=bar)
            s2 = int((bar * 4 + 2.5) * beat * SR)
            buf[s2:s2 + len(hit)] += reverb(hit, wet=0.5, room=1.6, decay=0.8, seed=bar)[: max(0, len(buf) - s2)]

    t = t_axis(len(buf))
    drone = (0.6 * np.sin(2 * math.pi * 41.2 * t)
             + 0.4 * np.sin(2 * math.pi * 41.95 * t)
             + 0.22 * np.sin(2 * math.pi * 61.7 * t)
             + 0.10 * np.sin(2 * math.pi * 82.4 * t))
    drone *= 0.085 * (0.8 + 0.2 * np.sin(2 * math.pi * 0.045 * t + 1.0))
    buf += lowpass(drone, 150, SR, 3)
    # 偶尔的鼻息/风
    for t0 in (5.5, 17.2, 26.0):
        n = int(2.6 * SR)
        w = lowpass(noise(n, int(t0 * 10)), 700, SR, 3)
        w *= np.sin(np.linspace(0, math.pi, n)) ** 2
        s = int(t0 * SR)
        buf[s:s + n] += w * 0.035

    buf += lowpass(noise(len(buf), 77), 1800, SR, 2) * 0.005
    mixed = wrap_tail(buf, total, tail)
    mixed = tape_wobble(mixed, depth=0.0035, rate=0.31, flutter=0.0008, frate=4.3)
    mixed = lowpass(highpass(mixed, 26), 11000, SR, 1)
    mixed = fade(mixed, 0.05, 0.05)
    mixed = loopify(mixed, 0.06)
    return norm(mixed)


def make_amb_game(seed=31):
    r = np.random.default_rng(seed)
    total_s = 24.0
    total = int(total_s * SR)
    tail = int(2.0 * SR)
    buf = np.zeros(total + tail)
    t = t_axis(len(buf))

    # 室内底噪：粉噪感（白噪低通）+ 低频隆隆
    base = lowpass(noise(len(buf), 101), 900, SR, 3) * 0.055
    base *= 0.85 + 0.15 * np.sin(2 * math.pi * 0.11 * t)
    buf += base
    buf += lowpass(brown(len(buf), 102) * 0.10, 160, SR, 3)

    # 日光灯电流声（60Hz 谐波串 + 明暗闪烁）
    buzz = np.zeros(len(buf))
    for k, a in ((1, 1.0), (2, 0.55), (3, 0.32), (5, 0.14), (7, 0.08)):
        buzz += a * np.sin(2 * math.pi * 60.0 * k * t + r.random() * 6)
    flick = 1.0 + 0.55 * np.sign(np.sin(2 * math.pi * 0.37 * t + 0.7)) ** 2 * 0.4
    flick *= 0.7 + 0.3 * np.sin(2 * math.pi * 0.21 * t)
    buzz *= 0.016 * flick
    buf += bandpass(buzz, 45, 520)

    # 远处水滴
    for t0, amp, f0 in ((3.4, 0.20, 1350.0), (10.9, 0.16, 1180.0), (19.1, 0.19, 1520.0)):
        n = int(1.1 * SR)
        w = np.zeros(n)
        tt = t_axis(n)
        fq = f0 * (1.0 - 0.35 * np.clip(tt / 0.05, 0, 1))
        ph = 2 * math.pi * np.cumsum(fq) / SR
        w[:] = np.sin(ph) * np.exp(-tt * 26.0)
        w = lowpass(w, 4200, SR, 2) * amp
        w = reverb(w, wet=0.55, room=1.9, decay=0.8, seed=int(t0))
        s = int(t0 * SR)
        buf[s:s + n] += w

    # 走廊尽头某扇门的木头吱嘎
    t0 = 15.6
    n = int(2.8 * SR)
    tt = t_axis(n)
    f0 = 62.0 * (1.0 + 0.18 * np.sin(2 * math.pi * 0.9 * tt + 0.4))
    ph = 2 * math.pi * np.cumsum(f0) / SR
    saw = 2 * ((ph / (2 * math.pi)) % 1.0) - 1.0
    creak = bandpass(saw, 180, 1800) * np.sin(np.linspace(0, math.pi, n)) ** 2 * 0.05
    s = int(t0 * SR)
    buf[s:s + n] += reverb(creak, wet=0.4, room=1.4, seed=9)

    # 极远处音乐盒残片（几乎听不出旋律）
    for t0, m in ((6.2, 84), (21.6, 81)):
        tone = mb_tone(midi_hz(m, -40), 2.2, amp=0.03, decay=1.3, click=0.02)
        tone = lowpass(reverb(tone, wet=0.6, room=2.0, seed=m), 3000, SR, 2)
        s = int(t0 * SR)
        buf[s:s + len(tone)] += tone

    mixed = wrap_tail(buf, total, tail)
    mixed = tape_wobble(mixed, depth=0.0012, rate=0.25, flutter=0.0004, frate=5.0)
    mixed = fade(mixed, 0.4, 0.4)
    mixed = loopify(mixed, 0.5)
    return norm(mixed)


def make_heartbeat(seed=41):
    """1.6s 双拍循环：lub-dub + 一点点房间回声"""
    total = int(1.6 * SR)
    buf = np.zeros(total + int(0.5 * SR))
    lub = thump(76.0, 0.42, amp=0.95, drop=0.5, body=0.55, seed=7)
    dub = thump(64.0, 0.34, amp=0.62, drop=0.45, body=0.4, seed=8)
    buf[: len(lub)] += lub
    s = int(0.29 * SR)
    buf[s:s + len(dub)] += dub
    # 心包膜摩擦的低频噪声
    n = int(0.5 * SR)
    fw = lowpass(noise(n, 9), 240, SR, 3) * np.exp(-t_axis(n) * 9.0) * 0.06
    buf[:n] += fw
    mixed = wrap_tail(buf, total, int(0.5 * SR))
    mixed = tape_wobble(mixed, 0.0008, 0.4, 0.0002, 6.0)
    mixed = fade(mixed, 0.004, 0.02)
    mixed = loopify(mixed, 0.03)
    return norm(mixed)


# --------------------------------------------------------------------------
# 旁白 / 奶蛙叫声
# --------------------------------------------------------------------------
def to32k(x, sr):
    if sr == SR:
        return x
    n_out = int(round(len(x) * SR / sr))
    dst = np.arange(n_out) * (sr / float(SR))
    y = np.interp(dst, np.arange(len(x)), x)
    if sr < SR:                       # 上采样：压掉镜像
        y = lowpass(y, sr * 0.45, SR, 2)
    return y


def trim_lead(x, thr=0.012):
    m = np.max(np.abs(x)) + 1e-9
    idx = np.argmax(np.abs(x) > m * thr)
    pad = int(0.03 * SR)
    start = max(0, idx - pad)
    return x[start:]


def make_vo(key, resample_ratio=0.93):
    x, sr = load_tts(key)
    x = to32k(x, sr)
    x = trim_lead(x)
    x = resample(x, resample_ratio)         # 降调（伴随轻微放慢，像老播音）
    # 老旧广播 / 电话质感
    x = bandpass(x, 165, 4600)
    x = saturate(x, 1.5)
    x = lowpass(x, 5200, SR, 2)
    # 轻微 50Hz 电源哼声，只在句子内部（很轻）
    t = t_axis(len(x))
    hum = (0.6 * np.sin(2 * math.pi * 50 * t) + 0.3 * np.sin(2 * math.pi * 100 * t)) * 0.006
    x = x + hum * (np.max(np.abs(x)) + 1e-9)
    x = echo(x, 0.115, feedback=0.30, mix=0.10, taps=3)
    x = reverb(x, wet=0.20, room=1.1, decay=0.55, seed=11)   # 湿声 ~20%，听得清
    x = norm(x, PEAK_DB)
    x = fade(x, 0.012, 0.16)
    # 句末留 0.18s 数字静音：剧情压缩成 5 句后，引擎每句后还会等 0.68s。
    # 实测「幅度 < 2% 峰值的可听尾部」≈ 0.21s（0.18s 静音 + 0.16s 淡出的末段），
    # 落在要求的 0.18–0.22s 区间内。
    x = np.concatenate([x, silence(0.18)])
    return norm(x)


def make_frog_1():
    x, sr = load_tts("frog_voice_1")
    x = to32k(x, sr)
    x = trim_lead(x)
    x = resample(x, 1.12)                    # 尖细一点，像塑料玩具
    x = highpass(x, 240, SR, 2)
    x = lowpass(x, 5600, SR, 2)
    x = saturate(x, 1.25)
    x = x + bandpass(x, 900, 2600) * 0.25    # 一点点共振
    x = reverb(x, wet=0.16, room=0.9, decay=0.5, seed=13)
    x = norm(x, PEAK_DB)
    target = max(3.2, len(x) / SR + 0.55)
    y = np.zeros(int(target * SR))
    y[: len(x)] = x
    return loopify(norm(fade(y, 0.01, 0.35)), 0.02)


def make_frog_2():
    x, sr = load_tts("frog_voice_2")
    x = to32k(x, sr)
    x = trim_lead(x)
    x = resample(x, 0.80)                    # 慢速低吼
    x = lowpass(x, 2200, SR, 2)
    x = saturate(x, 2.4)                     # 喉咙里的毛刺
    x = bandpass(x, 70, 2400)
    x = x + thump(58.0, len(x) / SR, amp=0.10, drop=0.2, body=0.2)[: len(x)] * 0.6
    x = reverb(x, wet=0.28, room=1.5, decay=0.68, seed=17)
    x = norm(x, PEAK_DB)
    target = max(3.6, len(x) / SR + 0.4)
    y = np.zeros(int(target * SR))
    y[: len(x)] = x
    return loopify(norm(fade(y, 0.01, 0.3)), 0.025)


def make_frog_3(seed=19):
    """卡带鬼畜：切碎 + 重复 + 掉帧 + 比特粉碎"""
    r = np.random.default_rng(seed)
    x, sr = load_tts("frog_voice_3")
    x = to32k(x, sr)
    x = trim_lead(x)
    grain = int(0.055 * SR)
    ng = len(x) // grain
    if ng < 3:
        ng = 3
        x = np.concatenate([x, silence(0.2)])
    grains = [x[i * grain: (i + 1) * grain] for i in range(ng)]
    pattern = [0, 1, 2, 2, 1, 3, 3, 2, 4, 1, 0, 2, 5, 5, 2, 1, 3, 4, 2, 0]
    out = []
    total_n = 0
    i = 0
    while total_n < 4.0 * SR:
        g = grains[pattern[i % len(pattern)] % max(1, ng)]
        if r.random() < 0.18:                 # 掉帧
            out.append(np.zeros(grain * 2))
            total_n += grain * 2
        else:
            piece = g.copy()
            if r.random() < 0.30:
                piece = resample(piece, 1.35)     # 随机升调重放
            if r.random() < 0.20:
                piece = piece[::-1]               # 倒放
            out.append(piece)
            total_n += len(piece)
        i += 1
    y = np.concatenate(out)
    y = pad_to(y, int(4.0 * SR))
    y = bitcrush(y, bits=8, hold=3)
    y = bandpass(y, 180, 6000)
    y = saturate(y, 1.8)
    y = tape_wobble(y, depth=0.004, rate=1.1, flutter=0.002, frate=8.0)
    y = reverb(y, wet=0.18, room=0.9, decay=0.5, seed=23)
    y = fade(y, 0.006, 0.25)
    return loopify(norm(y), 0.03)


def make_frog_4():
    """耳语：滤掉低频，用包络调制的气声补足"""
    x, sr = load_tts("frog_voice_4")
    x = to32k(x, sr)
    x = trim_lead(x)
    x = resample(x, 0.95)
    env = lowpass(np.abs(x), 42, SR, 2)
    env = env / (np.max(env) + 1e-9)
    air = lowpass(noise(len(x), 61), 6500, SR, 2) - lowpass(noise(len(x), 61), 1200, SR, 2)
    air = air / (np.max(np.abs(air)) + 1e-9)
    x = highpass(x, 900, SR, 2)
    y = x * 0.9 + air * env * 0.55
    y = lowpass(y, 7000, SR, 2)
    y = reverb(y, wet=0.26, room=1.3, decay=0.6, seed=29)
    y = norm(y, PEAK_DB - 1.0)
    target = max(3.3, len(y) / SR + 0.5)
    z = np.zeros(int(target * SR))
    z[: len(y)] = y
    return loopify(norm(fade(z, 0.02, 0.4)), 0.035)


# --------------------------------------------------------------------------
# SFX
# --------------------------------------------------------------------------
def make_sfx_click():
    n = int(0.10 * SR)
    y = np.zeros(n)
    ck = lowpass(noise(int(0.014 * SR), 3), 7000, SR, 1) * np.exp(-t_axis(int(0.014 * SR)) * 320 * 0.1)
    ck *= 0.55
    y[: len(ck)] += ck
    ping = soft_tone(1500, 0.07, amp=0.5, decay=26, attack=0.001, harm=(1, 0.2, 0))
    y[: len(ping)] += ping
    body = thump(180, 0.05, amp=0.22, drop=0.3, body=0.2)
    y[: len(body)] += body
    y = fade(y, 0.001, 0.03)
    return norm(y)


def make_sfx_ui_hover():
    n = int(0.07 * SR)
    y = np.zeros(n)
    p = soft_tone(3300, 0.06, amp=0.22, decay=85, attack=0.002, harm=(1, 0.15, 0))
    y[: len(p)] += p
    y = lowpass(y, 9000, SR, 1)
    return norm(fade(y, 0.002, 0.02))


def make_sfx_pickup():
    n = int(1.15 * SR)
    y = np.zeros(n)
    for f, a, d in ((1046.5, 1.0, 0.6), (1568.0, 0.55, 0.9), (2093.0, 0.36, 1.2), (2637.0, 0.18, 1.6)):
        b = bell(f, 1.1, amp=a, seed=int(f))
        y[: len(b)] += b * a
    # 一颗小星星
    sp = soft_tone(4186.0, 0.5, amp=0.12, decay=9, attack=0.001)
    y[int(0.03 * SR): int(0.03 * SR) + len(sp)] += sp[: max(0, n - int(0.03 * SR))]
    y = reverb(y, wet=0.16, room=0.9, decay=0.5, seed=31)
    y = fade(y, 0.002, 0.15)
    return norm(y)


def make_sfx_unlock_map():
    n = int(2.6 * SR)
    y = np.zeros(n)
    # 温暖大三和弦缓慢铺开
    for f, a, st in ((261.6, 0.30, 0.00), (329.6, 0.26, 0.06), (392.0, 0.24, 0.12), (523.3, 0.16, 0.20)):
        tone = soft_tone(f, 2.4, amp=a, decay=1.1, attack=0.22, harm=(1, 0.35, 0.16, 0.07))
        s = int(st * SR)
        y[s:s + len(tone)] += tone[: max(0, n - s)]
    # 最后多出的一根不和谐刺（C#5）
    bad = mb_tone(midi_hz(73, 0), 1.4, amp=0.22, decay=2.0, click=0.05, seed=5)
    s = int(1.35 * SR)
    y[s:s + len(bad)] += bad[: max(0, n - s)]
    y = reverb(y, wet=0.24, room=1.3, decay=0.7, seed=37)
    y = fade(y, 0.02, 0.5)
    return norm(y)


def make_sfx_unlock_speed():
    n = int(2.3 * SR)
    y = np.zeros(n)
    # 上升滑音
    g = chirp(180, 900, 1.7, amp=0.5, curve=1.7)
    g = lowpass(g, 6000, SR, 1)
    y[: len(g)] += g
    y[: len(g)] += chirp(181, 905, 1.7, amp=0.22, curve=1.7) * 0.7
    # 加速的滴答
    tcur = 0.05
    dt = 0.20
    while tcur < 1.75:
        tk = soft_tone(2400, 0.06, amp=0.16, decay=70, attack=0.001)
        s = int(tcur * SR)
        y[s:s + len(tk)] += tk[: max(0, n - s)]
        tcur += dt
        dt = max(0.05, dt * 0.82)
    # 空气扫过
    nn = int(1.8 * SR)
    w = bandpass(noise(nn, 43), 500, 3200) * np.sin(np.linspace(0, math.pi, nn)) ** 2 * 0.10
    y[:nn] += w
    y = reverb(y, wet=0.18, room=1.0, decay=0.55, seed=41)
    y = fade(y, 0.01, 0.55)
    return norm(y)


def make_sfx_exit_open():
    n = int(3.0 * SR)
    y = np.zeros(n)
    # 门闩金属声
    lat = np.zeros(int(0.5 * SR))
    for f, a, d in ((820, 0.7, 0.9), (1340, 0.5, 0.7), (2110, 0.35, 0.55), (3050, 0.2, 0.4)):
        add_at(lat, mb_tone(f, 0.45, amp=a, decay=3.0, drift=0.002, seed=int(f)), 0)
    add_at(lat, lowpass(noise(int(0.02 * SR), 51), 8000, SR, 1) * 0.5, 0)
    add_at(y, lat * 0.6, 0)
    # 沉重锁体松动
    cl = thump(84, 0.6, amp=0.65, drop=0.4, body=0.7, seed=53)
    s = int(0.30 * SR)
    y[s:s + len(cl)] += cl[: max(0, n - s)]
    # 门缝灌进来的风
    nn = int(2.2 * SR)
    w = lowpass(noise(nn, 57), 1400, SR, 3)
    w = bandpass(w, 180, 1400)
    env = np.linspace(0, 1, nn) ** 1.6
    env *= np.exp(-np.linspace(0, 2.2, nn) * 0.35)
    w *= env * 0.30
    s = int(0.55 * SR)
    y[s:s + nn] += w[: max(0, n - s)]
    # 木头吱嘎
    nn2 = int(1.5 * SR)
    tt = t_axis(nn2)
    f0 = 78 * (1 + 0.25 * np.sin(2 * math.pi * 1.7 * tt + 0.2) * np.linspace(0.2, 1, nn2))
    ph = 2 * math.pi * np.cumsum(f0) / SR
    saw = 2 * ((ph / (2 * math.pi)) % 1.0) - 1
    cr = bandpass(saw, 220, 2400) * np.sin(np.linspace(0, math.pi, nn2)) ** 2 * 0.11
    s = int(1.35 * SR)
    y[s:s + nn2] += cr[: max(0, n - s)]
    y = reverb(y, wet=0.26, room=1.6, decay=0.72, seed=59)
    y = fade(y, 0.005, 0.45)
    return norm(y)


def make_sfx_start_sting():
    n = int(4.4 * SR)
    y = np.zeros(n)
    # 反向吸气（前 1.2s 渐强）
    nn = int(1.25 * SR)
    w = bandpass(noise(nn, 61), 400, 5200)
    w *= (np.linspace(0, 1, nn) ** 2.6) * 0.16
    y[:nn] += w
    # 冲击
    imp = thump(88, 1.8, amp=0.95, drop=0.62, body=0.9, seed=63)
    s = int(1.22 * SR)
    y[s:s + len(imp)] += imp[: max(0, n - s)]
    # 不和谐音簇（增四度 + 小二度）
    for f, a, d in ((110.0, 0.30, 0.55), (155.6, 0.26, 0.6), (116.5, 0.22, 0.5), (164.8, 0.18, 0.55)):
        tone = soft_tone(f, 2.8, amp=a, decay=d, attack=0.05, harm=(1, 0.6, 0.4, 0.25, 0.15))
        ss = int(1.24 * SR)
        y[ss:ss + len(tone)] += tone[: max(0, n - ss)]
    # 高频擦刮尾音（慢慢退去）
    nn2 = int(2.6 * SR)
    tt = t_axis(nn2)
    hi = np.sin(2 * math.pi * (3150 - 320 * tt) * tt) * (0.055 * np.exp(-tt * 0.9))
    hi *= 1 + 0.3 * np.sin(2 * math.pi * 7.3 * tt)
    s2 = int(1.6 * SR)
    y[s2:s2 + nn2] += hi[: max(0, n - s2)]
    y = reverb(y, wet=0.34, room=1.9, decay=0.76, seed=67)
    y = fade(y, 0.01, 0.7)
    return norm(y)


def make_sfx_win():
    n = int(7.0 * SR)
    y = np.zeros(n)
    # 音乐盒：C 大调上行，温暖收束
    mel = [(0.00, 72, 1.2), (0.28, 76, 1.2), (0.56, 79, 1.4), (1.05, 84, 2.0),
           (2.10, 81, 1.2), (2.38, 79, 1.2), (2.66, 76, 1.6),
           (3.30, 77, 1.2), (3.58, 81, 1.2), (3.86, 84, 2.4)]
    for (st, m, d) in mel:
        tone = mb_tone(midi_hz(m, -8), d, amp=0.34, decay=1.05, click=0.05, seed=m)
        s = int(st * SR)
        y[s:s + len(tone)] += tone[: max(0, n - s)]
    for st, m in ((0.0, 48), (2.10, 53), (3.30, 55)):
        bt = soft_tone(midi_hz(m, -8), 2.8, amp=0.14, decay=0.4, attack=0.25, harm=(1, 0.3, 0.1))
        s = int(st * SR)
        y[s:s + len(bt)] += bt[: max(0, n - s)]
    # 尾音诡异：最后一颗音被磁带拖慢、走低，再叠一层低频
    tail = mb_tone(midi_hz(84, -8), 3.0, amp=0.30, decay=0.55, drift=0.02, seed=3)
    tail = tape_wobble(tail, depth=0.010, rate=0.55, flutter=0.004, frate=4.0)
    tail = resample(tail, 0.90)
    s = int(4.0 * SR)
    y[s:s + min(len(tail), n - s)] += tail[: max(0, n - s)] * 0.8
    drone = soft_tone(midi_hz(36, -8), 3.2, amp=0.10, decay=0.3, attack=1.2)
    s = int(3.4 * SR)
    y[s:s + len(drone)] += drone[: max(0, n - s)]
    y = reverb(y, wet=0.22, room=1.4, decay=0.7, seed=71)
    y = fade(y, 0.01, 1.2)
    return norm(y)


def make_sfx_lose():
    n = int(5.0 * SR)
    y = np.zeros(n)
    # 低频下坠
    nn = int(2.6 * SR)
    tt = t_axis(nn)
    f = 118 * np.exp(-tt * 0.75) + 26
    ph = 2 * math.pi * np.cumsum(f) / SR
    fall = np.sin(ph) * np.exp(-tt * 0.55) * 0.9
    y[:nn] += fall
    y[:nn] += lowpass(noise(nn, 73), 220, SR, 3) * np.exp(-tt * 0.8) * 0.35
    imp = thump(96, 1.2, amp=0.8, drop=0.5, body=0.8, seed=79)
    y[: len(imp)] += imp[: n]
    # 尖啸
    nn2 = int(2.4 * SR)
    t2 = t_axis(nn2)
    mod = np.sin(2 * math.pi * (7.0 + 3 * t2) * t2)
    carrier = np.sin(2 * math.pi * (1750 - 500 * t2) * t2 + 2.4 * mod)
    scr = carrier * np.exp(-t2 * 1.1) * 0.30
    scr = bandpass(scr, 900, 6500)
    s = int(0.55 * SR)
    y[s:s + nn2] += scr[: max(0, n - s)]
    # 呼吸/鼻音残余
    breathe = bandpass(noise(int(3.0 * SR), 83), 300, 2600) * np.exp(-t_axis(int(3.0 * SR)) * 1.5) * 0.05
    s = int(1.6 * SR)
    y[s:s + len(breathe)] += breathe[: max(0, n - s)]
    y = reverb(y, wet=0.30, room=1.8, decay=0.75, seed=89)
    y = fade(y, 0.004, 0.9)
    return norm(y)


def make_sfx_screech():
    n = int(2.0 * SR)
    tt = t_axis(n)
    mod = np.sin(2 * math.pi * (6.5 + 5 * tt) * tt)
    c1 = np.sin(2 * math.pi * (2680 + 240 * tt) * tt + 3.0 * mod) * 0.55
    c2 = np.sin(2 * math.pi * (3420 - 160 * tt) * tt + 2.0 * mod) * 0.30
    hiss = bandpass(noise(n, 91), 2200, 9000) * 0.22
    env = np.exp(-tt * 2.3) * (1 - np.exp(-tt * 60))
    y = (c1 + c2 + hiss) * env
    y = bandpass(y, 700, 9500)
    y = reverb(y, wet=0.20, room=1.1, decay=0.55, seed=97)
    y = fade(y, 0.004, 0.35)
    return norm(y)


def make_footstep(idx=1):
    n = int(0.36 * SR)
    y = np.zeros(n)
    tt = t_axis(n)
    seed = 101 + idx * 17
    # 低频落地
    th = thump(72 + idx * 6, 0.26, amp=0.7, drop=0.45, body=0.5, seed=seed)
    y[: len(th)] += th
    # 鞋底摩擦（不同的滤波 = 不同的地面）
    nn = int(0.13 * SR)
    sc = noise(nn, seed + 1)
    sc = bandpass(sc, 420 + idx * 180, 2600 + idx * 400)
    sc *= np.exp(-t_axis(nn) * (55 - idx * 6))
    y[:nn] += sc * 0.55
    # 细碎沙粒
    gr = lowpass(noise(nn, seed + 2), 5200, SR, 1) * np.exp(-t_axis(nn) * 90)
    y[:nn] += gr * 0.16
    y = fade(y, 0.001, 0.06)
    return norm(y)


def make_sfx_sprint():
    n = int(0.9 * SR)
    y = np.zeros(n)
    nn = int(0.55 * SR)
    tt = t_axis(nn)
    w = bandpass(noise(nn, 111), 380, 3000)
    w *= np.exp(-((tt - 0.13) ** 2) / (2 * 0.10 ** 2)) * 0.55
    y[:nn] += w
    st = make_footstep(1)
    s = int(0.06 * SR)
    y[s:s + len(st)] += st * 0.85
    st2 = make_footstep(2)
    s = int(0.42 * SR)
    y[s:s + len(st2)] += st2 * 0.45
    cl = bandpass(noise(int(0.3 * SR), 113), 1200, 6000) * np.exp(-t_axis(int(0.3 * SR)) * 14) * 0.10
    y[int(0.02 * SR): int(0.02 * SR) + len(cl)] += cl[: max(0, n - int(0.02 * SR))]
    y = fade(y, 0.002, 0.15)
    return norm(y)


def make_sfx_frog_alert():
    n = int(1.2 * SR)
    tt = t_axis(n)
    # 咕噜：声门脉冲，音高先升后落，带强烈颤动
    f0 = 96 + 64 * np.sin(np.linspace(0, math.pi, n)) ** 1.4
    f0 *= 1 + 0.04 * np.sin(2 * math.pi * 22 * tt)
    ph = 2 * math.pi * np.cumsum(f0) / SR
    saw = 2 * ((ph / (2 * math.pi)) % 1.0) - 1
    env = np.exp(-tt * 2.4) * (1 - np.exp(-tt * 40))
    y = saw * env * 0.6
    y = bandpass(y, 200, 2800)
    y = saturate(y, 2.2)
    y += bandpass(noise(n, 117), 600, 4000) * env * 0.06
    y = reverb(y, wet=0.22, room=1.2, decay=0.6, seed=119)
    y = fade(y, 0.003, 0.2)
    return norm(y)


# --------------------------------------------------------------------------
# 轨道表
# --------------------------------------------------------------------------
TRACKS = []


def track(key, kind, loop, gain, desc, fn, text=None):
    TRACKS.append(dict(key=key, kind=kind, loop=loop, gain=gain, desc=desc,
                       fn=fn, text=text))


track("music_menu", "music", True, 0.55, "主菜单循环：A 小调音乐盒摇篮曲，整体音准偏低 26 音分，磁带抖晃，第 6 小节藏了一个半音错音，底下 55Hz 嗡鸣", make_music_menu)
track("music_story", "music", True, 0.50, "片头剧情循环：更暗的低频 drone + 稀疏的音乐盒单音与远处铁皮敲击", make_music_story)
track("amb_game", "ambience", True, 0.42, "游玩环境循环：室内底噪、日光灯电流、远处水滴与门轴吱嘎、几乎听不清的音乐盒残片", make_amb_game)
track("heartbeat", "ambience", True, 0.72, "心跳循环 1.6s：lub-dub 双拍，奶蛙靠近时引擎提高音量", make_heartbeat)

for _i in range(1, 6):
    track(f"vo_0{_i}", "voice", False, 0.95,
          "旁白：" + ["开场/1999 年最后一场生日会", "老师与奶片的规则", "孩子们吃了，你把八片藏了起来",
                      "第二天，乐园空了，只剩那首歌", "推土机明天就来，回来取奶片"][_i - 1],
          (lambda k=f"vo_0{_i}": make_vo(k)), text=None)

track("frog_voice_1", "voice", True, 0.55, "奶蛙叫声 1（正常变调，尖细塑料玩具感）", make_frog_1, text="我是奶龙！我才是奶龙！")
track("frog_voice_2", "voice", True, 0.55, "奶蛙叫声 2（慢速低吼，喉咙毛刺）", make_frog_2, text="奶……奶片……给我……")
track("frog_voice_3", "voice", True, 0.52, "奶蛙叫声 3（卡带鬼畜：切碎重复、掉帧、比特粉碎、随机倒放）", make_frog_3, text="龙……奶龙……都是奶龙……")
track("frog_voice_4", "voice", True, 0.50, "奶蛙叫声 4（耳语气声：滤掉低频，气声包络补足）", make_frog_4, text="嘘……别怕……留下来……")

track("sfx_click", "sfx", False, 0.50, "UI 点击：金属簧片 + 短促气声", make_sfx_click)
track("sfx_ui_hover", "sfx", False, 0.32, "菜单悬停：极短的高频气音", make_sfx_ui_hover)
track("sfx_start_sting", "sfx", False, 0.85, "开始游戏的阴森音效：反向吸气 + 低频冲击 + 增四度音簇 + 长混响", make_sfx_start_sting)
track("sfx_pickup", "sfx", False, 0.68, "拾取奶片：清脆铃铛，可叠音", make_sfx_pickup)
track("sfx_unlock_map", "sfx", False, 0.70, "解锁地图：温暖大三和弦铺开，1.35s 处插入一个不和谐音", make_sfx_unlock_map)
track("sfx_unlock_speed", "sfx", False, 0.70, "解锁加速：上升滑音 + 逐渐加快的滴答", make_sfx_unlock_speed)
track("sfx_exit_open", "sfx", False, 0.80, "出口开启：门闩金属声、锁体松动、门缝灌风、木头吱嘎", make_sfx_exit_open)
track("sfx_win", "sfx", False, 0.85, "通关：音乐盒上行收束，4s 后尾音被磁带拖慢走低，叠上低频 drone", make_sfx_win)
track("sfx_lose", "sfx", False, 0.90, "被抓：低频下坠 + FM 尖啸 + 残余呼吸", make_sfx_lose)
track("sfx_screech", "sfx", False, 0.78, "奶蛙贴脸：高频金属尖啸，带快速颤动与气声", make_sfx_screech)
track("sfx_footstep_1", "sfx", False, 0.42, "脚步 1：低频落地 + 木地板摩擦", lambda: make_footstep(1))
track("sfx_footstep_2", "sfx", False, 0.42, "脚步 2：低频落地 + 瓷砖/碎石摩擦", lambda: make_footstep(2))
track("sfx_sprint", "sfx", False, 0.60, "加速起跑：风声掠过 + 两步急促脚步", make_sfx_sprint)
track("sfx_frog_alert", "sfx", False, 0.75, "奶蛙发现玩家：喉咙咕噜，音高先升后落", make_sfx_frog_alert)

VO_TEXTS = {
    "vo_01": "1999年，奶蛙乐园举办最后一场生日会。",
    "vo_02": "老师说：吃了奶片，就能变成奶龙。",
    "vo_03": "所有孩子都吃了。只有你，把八片奶片藏了起来。",
    "vo_04": "第二天，乐园空了。只剩那首歌——我是奶龙，我才是奶龙。",
    "vo_05": "推土机明天就来。你回来取走奶片。",
}
for t in TRACKS:
    if t["key"] in VO_TEXTS:
        t["text"] = VO_TEXTS[t["key"]]


# --------------------------------------------------------------------------
# 自检
# --------------------------------------------------------------------------
def inspect(path: Path, is_loop: bool):
    with wave.open(str(path), "rb") as w:
        nch = w.getnchannels()
        sr = w.getframerate()
        sw = w.getsampwidth()
        nf = w.getnframes()
        raw = w.readframes(nf)
    a = np.frombuffer(raw, dtype="<i2").astype(np.float64) / 32768.0
    if nch > 1:
        a = a.reshape(-1, nch).mean(axis=1)
    dur = nf / float(sr)
    peak = float(np.max(np.abs(a))) if a.size else 0.0
    rms = float(np.sqrt(np.mean(a ** 2))) if a.size else 0.0
    peak_db = 20 * math.log10(max(peak, 1e-9))
    rms_db = 20 * math.log10(max(rms, 1e-9))
    seam_ok = True
    seam_db = -999.0
    if is_loop and a.size > 2:
        d = abs(a[0] - a[-1])
        g = float(np.median(np.abs(np.diff(a)))) + 1e-9
        seam_ok = d <= max(0.02, 20 * g)
        seam_db = 20 * math.log10(max(d, 1e-9))
    clip_ok = peak <= 0.90          # 留出 1.5dB 以上 headroom，绝不削波
    peak_ok = -3.0 <= peak_db <= -0.5
    return dict(file=path.name, dur=dur, nch=nch, sr=sr, sw=sw,
                peak_db=peak_db, rms_db=rms_db, seam_ok=seam_ok, seam_db=seam_db,
                clip_ok=clip_ok, peak_ok=peak_ok)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", default="")
    ap.add_argument("--skip-tts", action="store_true")
    ap.add_argument("--force-tts", action="store_true")
    args = ap.parse_args()

    only = {s.strip() for s in args.only.split(",") if s.strip()}
    OUT.mkdir(parents=True, exist_ok=True)

    t0 = time.time()
    if args.skip_tts:
        print("[tts] --skip-tts：使用缓存")
    else:
        synth_tts(VOICE_JOBS, force=args.force_tts)
    print(f"[tts] 完成 ({time.time() - t0:.1f}s)")

    # TTS 原始采样率 -> 32k 由 make_vo / make_frog_* 负责
    tracks = [t for t in TRACKS if not only or t["key"] in only]
    results = []
    for t in tracks:
        ts = time.time()
        y = t["fn"]()
        if not np.all(np.isfinite(y)):
            raise SystemExit(f"{t['key']} 输出含 NaN/Inf")
        path = OUT / f"{t['key']}.wav"
        write_wav(path, y)
        results.append((t, path))
        print(f"    {t['key']:<20s} {len(y)/SR:6.2f}s  {path.stat().st_size/1024:7.1f} KB"
              f"  ({time.time()-ts:.2f}s)")

    # 自检
    print("\n=== 自检 ===")
    print(f"{'file':<24}{'dur':>7}{'ch':>3}{'rate':>7}{'peak dB':>9}{'rms dB':>8}{'seam':>9}  ok")
    fails = []
    total_bytes = 0
    for t, path in results:
        r = inspect(path, t["loop"])
        total_bytes += path.stat().st_size
        ok = r["clip_ok"] and r["peak_ok"] and r["seam_ok"] and r["nch"] == 1 and 22050 <= r["sr"] <= 32000
        seam = f"{r['seam_db']:8.1f}" if t["loop"] else "     n/a"
        print(f"{r['file']:<24}{r['dur']:7.2f}{r['nch']:3d}{r['sr']:7d}{r['peak_db']:9.2f}"
              f"{r['rms_db']:8.2f}{seam}"
              f"{'   OK' if ok else '  FAIL'}")
        if not ok:
            fails.append(r["file"])
        # 单文件体积限制
        if path.stat().st_size > 2.5 * 1024 * 1024:
            fails.append(r["file"] + "(>2.5MB)")
    print(f"\n合计 {len(results)} 个文件 / {total_bytes/1024/1024:.2f} MB")

    if only:
        print("（--only 模式跳过 manifest 写入）")
        return

    # manifest
    manifest = {
        "generated": "2026-10-29",
        "generator": "tools/gen_audio.py",
        "tracks": {},
    }
    for t, path in results:
        r = inspect(path, t["loop"])
        entry = {
            "file": f"assets/audio/{t['key']}.wav",
            "kind": t["kind"],
            "loop": bool(t["loop"]),
            "gain": t["gain"],
            "duration": round(r["dur"], 2),
            "desc": t["desc"],
        }
        if t["text"]:
            entry["text"] = t["text"]
        manifest["tracks"][t["key"]] = entry
    mpath = OUT / "manifest.json"
    mpath.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"manifest -> {mpath.relative_to(ROOT)} ({len(manifest['tracks'])} tracks)")

    if fails:
        print("\n!! 未通过：" + ", ".join(fails))
        sys.exit(1)
    print("全部通过")


if __name__ == "__main__":
    main()
