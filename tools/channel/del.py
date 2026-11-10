
import io
p = r'D:\debuging\starfall-salvage-w05\src\story.js'
with io.open(p, 'r', encoding='utf-8') as f:
    lines = f.readlines()
# 1-based 389..591（0-based 388..590）：旧的“机位路径（预计算）”注释 + 旧 buildCamPath + 残留
start = 388
end = 591   # exclusive
assert '\u673a\u4f4d\u8def\u5f84' in lines[start], repr(lines[start])
assert 'return Math.atan2' in lines[end-1] or lines[end-1].strip() == '}', repr(lines[end-1])
print('will delete', end-start, 'lines')
print('first:', repr(lines[start]))
print('last :', repr(lines[end-1]))
new = lines[:start] + ['   \n'] + lines[end:]
with io.open(p, 'w', encoding='utf-8', newline='') as f:
    f.writelines(new)
print('remaining lines', len(new))
