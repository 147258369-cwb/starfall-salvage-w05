
import io
p = r'D:\debuging\starfall-salvage-w05\src\textures.js'
with io.open(r'D:\debuging\starfall-salvage-w05\tools\channel\newfn.txt', 'r', encoding='utf-8') as f:
    new = f.read()
with io.open(p, 'r', encoding='utf-8') as f:
    lines = f.readlines()
assert lines[2429].strip().startswith('function drawMilkFrogSticker'), lines[2429]
assert lines[2614].rstrip() == '  }', repr(lines[2614])
out = lines[:2429] + [new] + lines[2615:]
with io.open(p, 'w', encoding='utf-8', newline='') as f:
    f.writelines(out)
print('patched, total lines', len(out))
