"""One-time correction for a joined mesh whose origin was an antler detail."""
import bpy,json,os
from mathutils import Vector,Quaternion
ROOT=r'D:\VScode\BlackDoor'
arm=bpy.data.objects['Deer_Companion_Rig']
if arm.get('imagesHindSpaceFixed'):raise RuntimeError('Coordinate repair already applied.')
mesh=next(o for o in arm.children if o.type=='MESH')
names={g.index:g.name for g in mesh.vertex_groups}
data=json.load(open(os.path.join(ROOT,'art','images-companions','rig.json'),encoding='utf8'))['legs']
M=mesh.matrix_local.copy();inv=M.inverted()
for leg in data:
    if not leg['name'].startswith('hind'):continue
    n=leg['name'];depth=-.125 if n.endswith('near') else .125
    h=Vector(((leg['hip'][0]-120)/100,depth,(282-leg['hip'][1])/100))
    old={'thigh':h,'upper':h+Vector((0,0,-.32)),'lower':h+Vector((0,0,-.74)),'hoof':h+Vector((0,0,-1.32))}
    new={'thigh':h,'upper':h+Vector((0,0,-.26)),'lower':h+Vector((0,0,-.60)),'hoof':h+Vector((0,0,-1.24))}
    oldlength={'thigh':.32,'upper':.42,'lower':.58}
    for vertex in mesh.data.vertices:
        match=[names[g.group] for g in vertex.groups if g.weight>.99 and names[g.group].endswith(n)]
        if not match:continue
        part=match[0].split('-')[0]
        if part not in old:continue
        radial={'thigh':.80,'upper':.78,'lower':.84,'hoof':.9}[part]
        zscale=leg[part]/100/oldlength[part] if part in oldlength else .9
        d=vertex.co-new[part]
        recovered=old[part]+Vector((d.x/radial,d.y/radial,d.z/zscale))
        rigpos=M @ recovered
        delta=rigpos-old[part]
        vertex.co=inv @ (new[part]+Vector((delta.x*radial,delta.y*radial,delta.z*zscale)))
mesh.data.update();arm['imagesHindSpaceFixed']=True
print('Joined-mesh coordinate origin accounted for; hind surface is continuous again.')
