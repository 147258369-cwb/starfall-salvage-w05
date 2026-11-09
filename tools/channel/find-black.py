
from PIL import Image
im = Image.open(r'D:\debuging\starfall-salvage-w05\tools\channel\out\fig8-bright.png').convert('RGB')
W, H = im.size
px = im.load()
# 找纯黑/近黑连通块，只看面板右侧画面
import collections
seen = set()
best = []
for y in range(0, H, 4):
    for x in range(400, W, 4):
        if (x, y) in seen: continue
        r, g, b = px[x, y]
        if r + g + b > 26: continue
        # BFS
        q = collections.deque([(x, y)])
        seen.add((x, y))
        minx = maxx = x; miny = maxy = y; n = 0
        while q:
            cx, cy = q.popleft()
            n += 1
            if cx < minx: minx = cx
            if cx > maxx: maxx = cx
            if cy < miny: miny = cy
            if cy > maxy: maxy = cy
            for dx, dy in ((4,0),(-4,0),(0,4),(0,-4)):
                nx, ny = cx+dx, cy+dy
                if 400 <= nx < W and 0 <= ny < H and (nx, ny) not in seen:
                    r2, g2, b2 = px[nx, ny]
                    if r2 + g2 + b2 <= 26:
                        seen.add((nx, ny)); q.append((nx, ny))
        if n > 200:
            best.append((n, minx, miny, maxx, maxy))
best.sort(reverse=True)
for n, x0, y0, x1, y1 in best[:6]:
    print(f'area={n*16:7d} bbox=({x0},{y0})-({x1},{y1}) size={x1-x0+4}x{y1-y0+4} center=({(x0+x1)//2},{(y0+y1)//2})')
