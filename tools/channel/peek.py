
import io
p = r'D:\debuging\starfall-salvage-w05\src\textures.js'
with io.open(p, 'r', encoding='utf-8') as f:
    lines = f.readlines()
# 1-based 2430..2615 -> 0-based 2429..2614
start = 2429
end = 2615   # exclusive index: line 2615 is the closing '}' of the function at 1-based 2615
print('BEFORE start:', repr(lines[start]))
print('BEFORE end-1:', repr(lines[end-1]))
print('BEFORE end:', repr(lines[end]))
