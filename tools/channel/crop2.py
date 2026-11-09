
from PIL import Image
im = Image.open(r'D:\debuging\starfall-salvage-w05\tools\channel\out\model-real.png').convert('RGB')
box = (560, 160, 730, 390)
c = im.crop(box).resize(((box[2]-box[0])*4, (box[3]-box[1])*4), Image.LANCZOS)
c.save(r'D:\debuging\starfall-salvage-w05\tools\channel\out\model-face-zoom.png')
print(im.size)
