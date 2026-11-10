
import io, re
p = r'D:\debuging\starfall-salvage-w05\src\story.js'
with io.open(p, 'r', encoding='utf-8') as f:
    src = f.read()

def cut(src, marker_start, marker_end):
    i = src.find(marker_start)
    if i < 0:
        print('MISS', marker_start[:40]); return src
    j = src.find(marker_end, i)
    if j < 0:
        print('MISS-END', marker_end[:40]); return src
    return src[:i] + src[j:]

# 删除旧的 buildCamPath（第二个定义，从注释行开始到 buildRail 之前）
start = src.find('// ---------------- 机位路径（预计算） ----------------')
end = src.find('  // 导轨：把安全路径重采样成"等弧长"的密集点')
if start > 0 and end > start:
    src = src[:start] + src[end:]
    print('removed old buildCamPath block')

# 删除 yawAt / camPath / blendAngle 等残留
for name in ['yawAt(p) {', 'camPath(p) {', 'blendAngle(a, b, k) {']:
    i = src.find('  ' + name)
    if i < 0: continue
    # 找到该方法的结束：从 i 开始计数花括号
    j = src.find('{', i)
    depth = 0
    k = j
    while k < len(src):
        if src[k] == '{': depth += 1
        elif src[k] == '}':
            depth -= 1
            if depth == 0: break
        k += 1
    src = src[:i] + src[k+2:]
    print('removed', name)

with io.open(p, 'w', encoding='utf-8', newline='') as f:
    f.write(src)
print('done')
