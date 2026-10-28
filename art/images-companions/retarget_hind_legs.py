"""Replace exaggerated Z-shaped hind stance with the reference's quieter long shank."""
import bpy,json,os
from mathutils import Vector,Quaternion
ROOT=r'D:\VScode\BlackDoor'
rig_data=json.load(open(os.path.join(ROOT,'art','images-companions','rig.json'),encoding='utf8'))['legs']
arm=bpy.data.objects['Deer_Companion_Rig']
if arm.get('imagesHindRetargeted'):raise RuntimeError('Hind geometry already calibrated; refine instead of applying twice.')
for bone in arm.pose.bones:bone.rotation_mode='QUATERNION';bone.rotation_quaternion=Quaternion();bone.location=(0,0,0)
mesh=next(o for o in arm.children if o.type=='MESH')
to_rig=mesh.matrix_local.copy();from_rig=to_rig.inverted()
group_names={g.index:g.name for g in mesh.vertex_groups}
old_lengths={'thigh':.32,'upper':.42,'lower':.58}
for leg in rig_data:
    if not leg['name'].startswith('hind'):continue
    n=leg['name'];depth=-.125 if n.endswith('near') else .125
    hip=Vector(((leg['hip'][0]-120)/100,depth,(282-leg['hip'][1])/100))
    old={'thigh':hip.copy(),'upper':hip+Vector((0,0,-.32)),'lower':hip+Vector((0,0,-.74)),'hoof':hip+Vector((0,0,-1.32))}
    new={'thigh':hip.copy(),'upper':hip+Vector((0,0,-leg['thigh']/100)),'lower':hip+Vector((0,0,-(leg['thigh']+leg['upper'])/100)),'hoof':hip+Vector((0,0,-(leg['thigh']+leg['upper']+leg['lower'])/100))}
    for v in mesh.data.vertices:
        matches=[group_names[g.group] for g in v.groups if g.weight>.99 and group_names[g.group].endswith(n)]
        if not matches:continue
        part=matches[0].split('-')[0]
        if part not in old:continue
        delta=(to_rig @ v.co)-old[part]
        radial={'thigh':.80,'upper':.78,'lower':.84,'hoof':.9}[part]
        delta.x*=radial;delta.y*=radial
        if part in old_lengths:delta.z*=leg[part]/100/old_lengths[part]
        else:delta.z*=.9
        v.co=from_rig @ (new[part]+delta)
    bpy.context.view_layer.objects.active=arm
    bpy.ops.object.mode_set(mode='EDIT')
    for part in ['thigh','upper','lower','hoof']:
        bone=arm.data.edit_bones[part+'-'+n]
        bone.use_connect=False
        bone.head=new[part]
        bone.tail=(new[{'thigh':'upper','upper':'lower','lower':'hoof'}[part]] if part!='hoof' else new[part]+Vector((.07,0,0)))
    bpy.ops.object.mode_set(mode='OBJECT')
mesh.data.update()
arm['imagesHindRetargeted']=True
print('Hind rest geometry and all four rest joints rebuilt from revised video proportions.')
