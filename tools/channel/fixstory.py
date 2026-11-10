
import io
p = r'D:\debuging\starfall-salvage-w05\src\story.js'
with io.open(p, 'r', encoding='utf-8') as f:
    lines = f.readlines()
# 找到 __dead_update_removed 开始到文件末尾，全部删除；并把第 648 行的多余 '}' 去掉
start = None
for i, l in enumerate(lines):
    if '__dead_update_removed' in l:
        start = i
        break
assert start is not None, 'not found'
# 上一行是 '}' 结束 shotAt，再上一行是真正的类结尾
# 第 start-1 行是空行，start-2 行是 '}' —— 这个 '}' 是我误加的类结尾
assert lines[start-1].strip() == '', repr(lines[start-1])
assert lines[start-2].rstrip() == '}', repr(lines[start-2])
end = len(lines)
# 找到 __dead... 函数的结束（类结尾的 '}'）
tail = lines[start:]
# 从后往前找最后一个只含 '}' 的行
last = None
for j in range(len(tail)-1, -1, -1):
    if tail[j].rstrip() == '}':
        last = j
        break
new = lines[:start-2] + ['}\n']
with io.open(p, 'w', encoding='utf-8', newline='') as f:
    f.writelines(new)
print('ok, removed', len(lines) - len(new), 'lines')
