
from PIL import Image
im = Image.open(r'D:\debuging\starfall-salvage-w05\tools\channel\out\model-real.png').convert('RGB')
# 正面视图在左上象限，模型大致 x 140-310, y 165-380
box = (120, 155, 330, 400)
c = im.crop(box).resize(((box[2]-box[0])*4, (box[3]-box[1])*4), Image.LANCZOS)
c.save(r'D:\debuging\starfall-salvage-w05\tools\channel\out\model-front-zoom.png')
# 头部特写
box2 = (175, 160, 275, 230)
c2 = im.crop(box2).resize(((box2[2]-box2[0])*8, (box2[3]-box2[1])*8), Image.LANCZOS)
c2.save(r'D:\debuging\starfall-salvage-w05\tools\channel\out\model-head-zoom.png')
print('ok')
