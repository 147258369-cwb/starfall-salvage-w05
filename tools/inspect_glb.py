import struct, json, sys
p = sys.argv[1]
with open(p,'rb') as f:
    magic, ver, length = struct.unpack('<III', f.read(12))
    clen, ctype = struct.unpack('<II', f.read(8))
    js = json.loads(f.read(clen).decode('utf-8'))
mesh = js['meshes'][0]
print('mesh name:', mesh['name'])
for i, pr in enumerate(mesh['primitives']):
    attrs = pr['attributes']
    mat = js['materials'][pr['material']]['name'] if 'material' in pr else '(none)'
    print(f'  prim{i}: material={mat!r} attrs={list(attrs.keys())} mode={pr.get("mode",4)}')
print('--- node transforms:')
for n in js['nodes']:
    print('  name:', n.get('name'), 'translation:', n.get('translation'),
          'rotation:', n.get('rotation'), 'scale:', n.get('scale'),
          'matrix' if 'matrix' in n else '')
