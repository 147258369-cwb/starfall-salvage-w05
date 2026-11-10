
import io
p = r'D:\debuging\starfall-salvage-w05\src\story.js'
with io.open(p, 'r', encoding='utf-8') as f:
    lines = f.readlines()
# 删除 387..592（0-based 386..591）：旧 buildCamPath 及其残留
# 先核对边界
assert '机位路径（预计算）' in lines[386] or '机位路径' in lines[386], repr(lines[386])
print('start:', repr(lines[386]))
print('end-1:', repr(lines[590]))
print('end:', repr(lines[591]))
