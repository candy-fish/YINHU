"""A smooth corrective shape preserves the reference neck volume when grazing."""
import bpy,math,json
from mathutils import Vector,Matrix,Quaternion
arm=bpy.data.objects['Deer_Companion_Rig'];mesh=next(o for o in arm.children if o.type=='MESH')
if mesh.data.shape_keys:raise RuntimeError('Corrective already exists; refine its shape key.')
axes=json.loads(arm['imagesRigAxes'])
bpy.app.driver_namespace['images_pose_deer']({'neck':104,'head':-88,'bob':3,'graze':0})
for name,angle in [('neck-mid',46),('neck-upper',-8)]:
    arm.pose.bones[name].rotation_quaternion=Quaternion(Vector(axes[name]),math.radians(angle))
bpy.context.view_layer.update()
for mod in mesh.modifiers:
    if mod.type=='ARMATURE':mod.use_deform_preserve_volume=False
mesh.shape_key_add(name='Basis')
key=mesh.shape_key_add(name='Graze | soft neck volume')
old=[Vector((x,0,z)) for x,z in [(.10,1.10),(.25,1.31),(.35,1.56),(.30,1.78),(.36,2.00),(.44,2.13)]]
new=[Vector((x,0,z-.03)) for x,z in [(.10,1.10),(.28,1.32),(.43,1.10),(.51,.86),(.60,.61),(.68,.49)]]
matrix={b.name:b.matrix @ arm.data.bones[b.name].matrix_local.inverted() for b in arm.pose.bones}
to_rig=mesh.matrix_local;from_rig=to_rig.inverted()
for vertex in mesh.data.vertices:
    weights={mesh.vertex_groups[g.group].name:g.weight for g in vertex.groups if g.weight>1e-6}
    share=sum(weights.get(n,0) for n in ['neck','neck-mid','neck-upper'])
    if share<.005:continue
    p=to_rig @ vertex.co
    options=[]
    for i in range(len(old)-1):
        line=old[i+1]-old[i];t=max(0.,min(1.,(p-old[i]).dot(line)/line.length_squared))
        center=old[i].lerp(old[i+1],t);options.append(((p-center).length,i,t,center))
    _,i,t,center=min(options,key=lambda item:item[0])
    before=old[i+1]-old[i];after=new[i+1]-new[i]
    angle=math.atan2(after.x,after.z)-math.atan2(before.x,before.z)
    offset=Quaternion(Vector((0,1,0)),angle) @ (p-center)
    target=new[i].lerp(new[i+1],t)+offset
    skin=Matrix(((0,0,0,0),)*4)
    for name,weight in weights.items():skin+=matrix[name]*weight
    current=skin @ p
    desired=current.lerp(target,min(1.,share))
    key.data[vertex.index].co=from_rig @ (skin.inverted_safe() @ desired)
key.value=0
arm['imagesGrazeCorrective']='Graze | soft neck volume'
bpy.app.driver_namespace['images_pose_deer']({})
print('Added a neck-volume corrective; leg weights and the reference standing sculpture are preserved.')
