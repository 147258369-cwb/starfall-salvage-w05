import struct, json, sys
import array

p = sys.argv[1]
with open(p,'rb') as f:
    magic, ver, length = struct.unpack('<III', f.read(12))
    clen, ctype = struct.unpack('<II', f.read(8))
    js = json.loads(f.read(clen).decode('utf-8'))
    blen, btype = struct.unpack('<II', f.read(8))
    binbuf = f.read(blen)

def read_accessor(ai):
    acc = js['accessors'][ai]
    bv = js['bufferViews'][acc['bufferView']]
    comp = acc['componentType']  # 5126 float, 5121 ubyte, 5123 ushort
    ncomp = {'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4}[acc['type']]
    offset = bv.get('byteOffset',0) + acc.get('byteOffset',0)
    stride = bv.get('byteStride', ncomp * {5126:4,5121:1,5123:2}[comp])
    count = acc['count']
    fmt = {5126:'f',5121:'B',5123:'H'}[comp]
    size = {5126:4,5121:1,5123:2}[comp]
    out = []
    for i in range(count):
        base = offset + i*stride
        vals = struct.unpack_from('<'+fmt*ncomp, binbuf, base)
        out.append(vals)
    return out

mesh = js['meshes'][0]
for pi, prim in enumerate(mesh['primitives']):
    mat = js['materials'][prim['material']]['name'] if 'material' in prim else '(none)'
    print(f'=== prim{pi} material={mat} ===')
    for cn in ['COLOR_0','COLOR_1','COLOR_2']:
        if cn in prim['attributes']:
            data = read_accessor(prim['attributes'][cn])
            # sample a few
            import random
            random.seed(1)
            samples = random.sample(data, min(6, len(data)))
            print(f'  {cn} n={len(data)} samples: ' + ' | '.join(f'({v[0]:.2f},{v[1]:.2f},{v[2]:.2f})' for v in samples))
