#!/usr/bin/env python3
"""把可运行的游戏文件整理成课程提交目录 release/w05_3d_game/。

用法:  python tools/package_submission.py
不会修改源码；重复运行会覆盖 release/w05_3d_game/ 内的旧副本。
"""
import os
import shutil
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "release", "w05_3d_game")

FILES = ["index.html", "styles.css", "serve.py", "run_game.bat", "package.json", "pnpm-lock.yaml", "README.md"]
DIRS = ["src", "vendor", "assets"]

def main():
    if os.path.exists(OUT):
        shutil.rmtree(OUT)
    os.makedirs(OUT, exist_ok=True)
    for name in FILES:
        src = os.path.join(ROOT, name)
        if not os.path.isfile(src):
            print(f"[package] 缺少文件: {name}", file=sys.stderr)
            return 1
        shutil.copy2(src, os.path.join(OUT, name))
    for name in DIRS:
        src = os.path.join(ROOT, name)
        if not os.path.isdir(src):
            print(f"[package] 缺少目录: {name}", file=sys.stderr)
            return 1
        shutil.copytree(src, os.path.join(OUT, name))
    # 生成说明与可选的制作文档（不含 QA 脚本/截图/开发依赖）
    docs_out = os.path.join(OUT, "docs")
    os.makedirs(docs_out, exist_ok=True)
    for name in ["AUDIO.md", "TEXTURES.md", "QA.md"]:
        src = os.path.join(ROOT, "docs", name)
        if os.path.isfile(src):
            shutil.copy2(src, os.path.join(docs_out, name))
    shots_src = os.path.join(ROOT, "docs", "screenshots")
    if os.path.isdir(shots_src):
        shutil.copytree(shots_src, os.path.join(docs_out, "screenshots"))

    total = 0
    count = 0
    for dirpath, _, filenames in os.walk(OUT):
        for fn in filenames:
            total += os.path.getsize(os.path.join(dirpath, fn))
            count += 1
    print(f"[package] 完成: {OUT}")
    print(f"[package] {count} 个文件, {total / 1024 / 1024:.2f} MB")
    print("[package] 提交前请把 W05_GroupID.md 填好放在提交目录（与 w05_3d_game/ 同级）。")
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
