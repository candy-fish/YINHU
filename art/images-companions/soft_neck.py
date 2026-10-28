"""Give the reference's curved neck three smooth anatomical bending sections."""
import bpy,math,json
from mathutils import Vector,Quaternion
arm=bpy.data.objects['Deer_Companion_Rig']
if arm.get('imagesSoftNeck'):raise RuntimeError('Three-section neck already present.')
arm.hide_set(False)
bpy.app.driver_namespace['images_pose_deer']({})
bpy.context.view_layer.objects.active=arm;arm.select_set(True)
bpy.ops.object.mode_set(mode='EDIT')
base=arm.data.edit_bones['neck'];base.tail=(.33,0,1.62)
mid=arm.data.edit_bones.new('neck-mid');mid.head=base.tail;mid.tail=(.33,0,1.88);mid.parent=base;mid.use_connect=True
top=arm.data.edit_bones.new('neck-upper');top.head=mid.tail;top.tail=arm.data.edit_bones['head'].head;top.parent=mid;top.use_connect=True
arm.data.edit_bones['head'].parent=top
bpy.ops.object.mode_set(mode='OBJECT')
mesh=next(o for o in arm.children if o.type=='MESH')
names=['body','neck','neck-mid','neck-upper','head']
groups={n:mesh.vertex_groups.get(n) or mesh.vertex_groups.new(name=n) for n in names}
old_indices={groups[n].index for n in names}
def smooth(t):
    t=max(0.,min(1.,t));return t*t*(3-2*t)
chain=[Vector((.13,0,1.23)),Vector((.33,0,1.62)),Vector((.33,0,1.88)),Vector((.43,0,2.10))]
def distance(p,a,b):
    line=b-a;t=max(0.,min(1.,(p-a).dot(line)/line.length_squared));return (p-a-line*t).length,t
for v in mesh.data.vertices:
    share=sum(g.weight for g in v.groups if g.group in old_indices)
    if share<1e-6:continue
    p=mesh.matrix_local @ v.co
    # A diagonal poll plane includes the lowered muzzle in the head weighting.
    head=1. if p.z>2.17 else smooth((.6*(p.x-.35)+.8*(p.z-1.91))/.12)
    neck=max(head,smooth((p.z-1.32)/.30)*max(smooth((p.x-.12)/.18),smooth((p.z-1.55)/.12))*smooth((p.x-.02)/.12))
    result={'body':1-neck,'head':head}
    closest=[distance(p,chain[i],chain[i+1]) for i in range(3)]
    i=min(range(3),key=lambda j:closest[j][0]);t=closest[i][1]
    part=['neck','neck-mid','neck-upper'];portion={part[i]:1.}
    length=(chain[i+1]-chain[i]).length
    if i>0 and t*length<.10:
        blend=.5*(1-smooth(t*length/.10));portion[part[i-1]]=blend;portion[part[i]]-=blend
    if i<2 and (1-t)*length<.10:
        blend=.5*(1-smooth((1-t)*length/.10));portion[part[i+1]]=blend;portion[part[i]]-=blend
    for name,value in portion.items():result[name]=value*(neck-head)
    for name,group in groups.items():group.add([v.index],max(0.,result.get(name,0))*share,'REPLACE')
mesh.data.update()
for modifier in mesh.modifiers:
    if modifier.type=='ARMATURE':modifier.use_deform_preserve_volume=True
axes={b.name:list((b.matrix_local.to_3x3().inverted() @ Vector((0,1,0))).normalized()) for b in arm.data.bones}
arm['imagesRigAxes']=json.dumps(axes);arm['imagesSoftNeck']=True
for b in arm.pose.bones:b.rotation_mode='QUATERNION'
old_pose=bpy.app.driver_namespace['images_pose_deer']
def soft_pose(pose):
    old_pose(pose)
    graze=pose.get('graze',max(0.,pose.get('neck',0)/134))
    for name,angle in [('neck-mid',46*graze),('neck-upper',-8*graze)]:
        arm.pose.bones[name].rotation_quaternion=Quaternion(Vector(axes[name]),math.radians(angle))
    bpy.context.view_layer.update()
bpy.app.driver_namespace['images_pose_deer']=soft_pose
soft_pose({})
print('Neck now flexes through three sections; muzzle follows the skull continuously.')
