"""Continuous, softly weighted deer, traced from the supplied video silhouette.

The older sculpture is retained in a hidden collection for comparison. Geometry
is made in its natural standing pose; there are no rigid tubes at the joints.
"""
import bpy,bmesh,math,json,os,ast
from mathutils import Vector,Quaternion
ROOT=r'D:\VScode\BlackDoor'
scene=bpy.data.scenes['Images_Companions_Studio'];bpy.context.window.scene=scene
old=bpy.data.objects.get('Deer_Companion_Rig')
if old and old.get('imagesContinuousReference'):raise RuntimeError('Reference sculpture already exists; refine in place.')
archive=bpy.data.collections.new('Earlier deer | preserved before continuous rebuild')
scene.collection.children.link(archive)
for ob in [old]+list(old.children):
    for collection in list(ob.users_collection):collection.objects.unlink(ob)
    archive.objects.link(ob)
    ob.name='Earlier '+ob.name
archive.hide_render=True;archive.hide_viewport=True
meshes=[]
jade=bpy.data.materials['Celadon limbs and neck trim'];gold=jade
source=ast.parse(open(os.path.join(ROOT,'art','images-companions','build_deer.py'),encoding='utf8').read())
for item in source.body:
    if isinstance(item,ast.FunctionDef) and item.name in ['mesh_obj','catmull','loft','sphere','trace']:
        exec(compile(ast.Module(body=[item],type_ignores=[]),'original sculpt helpers','exec'),globals())
def smooth(t):
    t=max(0.,min(1.,t));return t*t*(3-2*t)
def P(x,y,d=0):return Vector(((x-120)/100,d,(282-y)/100))
legs=json.load(open(os.path.join(ROOT,'art','images-companions','rig.json'),encoding='utf8'))['legs']

# A raised rump, quiet saddle, deep chest and long concave neck, as in the video.
torso=loft('Reference | flowing back and breast',
 [(-.82,0,1.40),(-.68,0,1.43),(-.43,0,1.39),(-.15,0,1.34),(.10,0,1.30),(.27,0,1.30)],
 [(.025,.04),(.18,.20),(.205,.20),(.17,.185),(.195,.24),(.06,.10)],sides=24,steps=7)
sphere('Reference | haunch',(-.64,0,1.34),(.20,.19,.25),segments=24,rings=16)
loft('Reference | long swan neck',
 [(.10,0,1.12),(.25,0,1.31),(.35,0,1.56),(.30,0,1.78),(.36,0,2.00),(.44,0,2.13)],
 [(.15,.145),(.15,.16),(.105,.135),(.075,.115),(.065,.085),(.06,.07)],sides=24,steps=7)
sphere('Reference | narrow skull',(.48,0,2.12),(.13,.085,.10),segments=24,rings=16)
loft('Reference | gently lowered muzzle',[(.49,0,2.12),(.59,0,2.045),(.66,0,1.95),(.70,0,1.90)],[(.072,.067),(.065,.062),(.044,.045),(.030,.033)],sides=20,steps=6)
# The tail lies down the rump, rather than sticking up.
loft('Reference | hanging tail',[(-.80,0,1.48),(-.89,0,1.27),(-.92,0,1.04)],[(.042,.055),(.033,.045),(.003,.006)],sides=16,steps=6)

chains={};neutral={};segments=[]
for leg in legs:
    n=leg['name'];depth=-.13 if n.endswith('near') else .13
    a=leg['neutral'];neutral[n]=a
    hip=P(*leg['hip'],depth)
    nodes=[hip];parts=[]
    angle=0
    if leg.get('thigh'):
        angle=a['thigh'];r=math.radians(angle)
        nodes.append(hip+Vector((-math.sin(r)*leg['thigh']/100,0,-math.cos(r)*leg['thigh']/100)))
        parts.append('thigh')
    angle+=a['upper'];r=math.radians(angle)
    nodes.append(nodes[-1]+Vector((-math.sin(r)*leg['upper']/100,0,-math.cos(r)*leg['upper']/100)));parts.append('upper')
    angle+=a['lower'];r=math.radians(angle)
    nodes.append(nodes[-1]+Vector((-math.sin(r)*leg['lower']/100,0,-math.cos(r)*leg['lower']/100)));parts.append('lower')
    chains[n]=(nodes,parts)
    # One uninterrupted loft per limb. More sections around joints keep the
    # silhouette round, while the lower tendons remain delicate.
    points=[];radii=[]
    for i,part in enumerate(parts):
        start,end=nodes[i:i+2]
        if part=='thigh':widths=[(.078,.105),(.063,.08),(.036,.043)]
        elif part=='upper' and n.startswith('hind'):widths=[(.036,.043),(.030,.037),(.022,.025)]
        elif part=='upper':widths=[(.062,.080),(.035,.043),(.022,.027)]
        else:widths=[(.022,.025),(.014,.018),(.021,.024)]
        if not points:points.append(tuple(start));radii.append(widths[0])
        points.extend([tuple(start.lerp(end,.46)),tuple(end)]);radii.extend(widths[1:])
        segments.append((part+'-'+n,start,end))
    loft('Reference | continuous '+n,points,radii,sides=18,steps=6)
    # Shoulder and thigh unions remove the cylindrical cut ends.
    if n.startswith('front'):
        sphere('Reference | shoulder transition '+n,tuple(hip+Vector((-.015,0,.13))),(.095,.074,.23))
    else:
        sphere('Reference | thigh transition '+n,tuple(hip+Vector((.02,0,.10))),(.12,.09,.20))

flesh=list(meshes)
bpy.ops.object.select_all(action='DESELECT')
for ob in flesh:ob.select_set(True)
bpy.context.view_layer.objects.active=torso;bpy.ops.object.join()
torso.name='Deer | continuous reference sculpture'
meshes=[torso]
torso.data.remesh_voxel_size=.009
bpy.ops.object.voxel_remesh()
mod=torso.modifiers.new('Organic joint transitions','SMOOTH');mod.factor=.45;mod.iterations=6
bpy.ops.object.modifier_apply(modifier=mod.name)
dec=torso.modifiers.new('Lightweight continuous skin','DECIMATE');dec.ratio=.40
bpy.ops.object.modifier_apply(modifier=dec.name)
for poly in torso.data.polygons:poly.use_smooth=True

# Actual anatomical neutral-pose bones, rather than proxy rotation handles.
arm_data=bpy.data.armatures.new('Reference deer | continuous anatomical skeleton')
arm=bpy.data.objects.new('Deer_Companion_Rig',arm_data);scene.collection.objects.link(arm)
bpy.context.view_layer.objects.active=arm;arm.select_set(True)
bpy.ops.object.mode_set(mode='EDIT')
def bone(name,start,end,parent=None):
    b=arm_data.edit_bones.new(name);b.head=start;b.tail=end
    if parent:b.parent=arm_data.edit_bones[parent]
    return b
bone('body',P(100,160),Vector((.17,0,1.44)))
bone('neck',Vector((.13,0,1.23)),Vector((.43,0,2.10)),'body')
bone('head',Vector((.43,0,2.10)),Vector((.70,0,1.91)),'neck')
bone('muzzle',Vector((.61,0,1.98)),Vector((.72,0,1.89)),'head')
for side,d in [('near',-.11),('far',.11)]:
    bone('ear-'+side,Vector((.43,d,2.15)),Vector((.28,d*2.3,2.31)),'head')
for n,(nodes,parts) in chains.items():
    parent='body'
    for i,part in enumerate(parts):
        name=part+'-'+n;b=bone(name,nodes[i],nodes[i+1],parent)
        if parent!='body':b.use_connect=True
        parent=name
    bone('hoof-'+n,nodes[-1],nodes[-1]+Vector((.07,0,0)),parent).use_connect=True
bpy.ops.object.mode_set(mode='OBJECT')

groups={b.name:torso.vertex_groups.new(name=b.name) for b in arm.data.bones}
def nearest_segment(p,start,end):
    v=end-start;t=max(0.,min(1.,(p-start).dot(v)/v.length_squared));return (p-(start+v*t)).length,t
for vertex in torso.data.vertices:
    p=torso.matrix_world @ vertex.co
    # Smooth neck transition over a broad shoulder area. Head flexes at the poll.
    head=smooth((p.z-1.94)/.15)*smooth((p.x-.31)/.15)
    neck=max(head,smooth((p.z-1.30)/.36)*smooth((p.x+.03)/.22))
    weights={'body':1-neck,'neck':neck-head,'head':head}
    # Lower limb weights follow a continuous chain, blending across each joint.
    options=[]
    for n,(nodes,parts) in chains.items():
        distances=[nearest_segment(p,nodes[i],nodes[i+1]) for i in range(len(parts))]
        best=min(range(len(parts)),key=lambda i:distances[i][0])
        options.append((distances[best][0],n,best,distances[best][1]))
    distance,n,index,t=min(options)
    nodes,parts=chains[n]
    hip=nodes[0]
    influence=smooth((hip.z+.14-p.z)/.25)*smooth((.23-distance)/.10)
    if influence>0:
        for key in weights:weights[key]*=1-influence
        length=(nodes[index+1]-nodes[index]).length
        joint_width=.09 if index==0 else .065
        local={parts[index]+'-'+n:1.}
        if index>0 and t*length<joint_width:
            blend=.5*(1-smooth(t*length/joint_width));local[parts[index-1]+'-'+n]=blend;local[parts[index]+'-'+n]-=blend
        if index<len(parts)-1 and (1-t)*length<joint_width:
            blend=.5*(1-smooth((1-t)*length/joint_width));local[parts[index+1]+'-'+n]=blend;local[parts[index]+'-'+n]-=blend
        for key,value in local.items():weights[key]=weights.get(key,0)+value*influence
    for key,value in weights.items():
        if value>1e-5:groups[key].add([vertex.index],value,'REPLACE')

def rigid(ob,name):ob.vertex_groups.new(name=name).add(list(range(len(ob.data.vertices))),1,'REPLACE');return ob
dark=bpy.data.materials['Obsidian eye']
for side,d in [('near',-.09),('far',.09)]:
    rigid(sphere('Reference | eye '+side,(.53,d,2.104),(.017,.008,.013),dark,16,10),'head')
    rigid(loft('Reference | leaf ear '+side,[(.43,d,2.15),(.33,d*1.7,2.25),(.23,d*2.5,2.31)],[(.02,.02),(.044,.021),(.001,.002)],sides=16,steps=5),'ear-'+side)
rigid(sphere('Reference | soft nose',(.715,0,1.89),(.025,.031,.023),dark,16,10),'muzzle')
for n,(nodes,_) in chains.items():
    for split in [-1,1]:
        rigid(sphere('Reference | cloven hoof '+n+str(split),tuple(nodes[-1]+Vector((.012,split*.014,.016))),(.034,.014,.022),dark,16,10),'hoof-'+n)

# The video's crown grows BACKWARDS over the back. X is the muzzle direction,
# so each main beam runs toward decreasing X, with asymmetrical fine offshoots.
beams=[[(.40,-.07,2.17),(.45,-.10,2.43),(.32,-.13,2.64),(.06,-.16,2.78),(-.32,-.18,2.86),(-.78,-.17,2.89),(-1.35,-.14,2.84)],
       [(.39,.07,2.17),(.50,.10,2.45),(.49,.13,2.77),(.31,.15,3.03),(.02,.18,3.20),(-.35,.20,3.27),(-.70,.23,3.25)]]
for j,beam in enumerate(beams):
    rigid(loft('Reference | backwards main antler '+str(j),beam,[(r,r*.9) for r in [.053,.046,.036,.028,.021,.013,.002]],sides=14,steps=6),'head')
    for k in range(1,6):
        base=Vector(beam[k]);length=.32+(k%3)*.12
        for side in [-1,1]:
            if k==1 and side<0:continue
            mid=base+Vector((-length*.30,side*.045,.17 if side>0 else -.09))
            tip=base+Vector((-length,side*.08,.28 if side>0 else -.16))
            rigid(loft(f'Reference | branching antler {j}-{k}-{side}',[tuple(base),tuple(mid),tuple(tip)],[(.016,.016),(.009,.009),(.0015,.0015)],sides=10,steps=5),'head')
            for u in [.48,.80,1.]:
                pos=mid.lerp(tip,u)
                rigid(sphere('Reference | tiny crown bud',tuple(pos),(.017,.012,.024),jade,10,8),'head')
            twig=mid+Vector((-.09,side*.035,.18))
            rigid(loft('Reference | fine crown fork',[tuple(mid),tuple(mid.lerp(twig,.6)),tuple(twig)],[(.007,.007),(.004,.004),(.001,.001)],sides=8,steps=4),'head')

for ob in meshes:
    mod=ob.modifiers.new('Soft anatomical deformation','ARMATURE');mod.object=arm
    ob.parent=arm;ob['images_companion']='deer'
bpy.ops.object.select_all(action='DESELECT')
for ob in meshes:ob.select_set(True)
bpy.context.view_layer.objects.active=torso;bpy.ops.object.join()
torso.name='Deer_Hologram_Surface'
mat=bpy.data.materials['Hologram | deer'];torso.data.materials.clear();torso.data.materials.append(mat)
axes={b.name:list((b.matrix_local.to_3x3().inverted() @ Vector((0,1,0))).normalized()) for b in arm.data.bones}
arm['imagesRigAxes']=json.dumps(axes);arm['imagesRole']='deer'
arm['imagesNeutralAngles']=json.dumps(neutral)
arm['imagesContinuousReference']=True
arm['imagesSource']='Continuous sculpt reconstructed by hand from the user video silhouette; crown sweeps behind the head.'
for b in arm.pose.bones:b.rotation_mode='QUATERNION'
def pose_deer(pose):
    for b in arm.pose.bones:b.rotation_quaternion=Quaternion();b.location=(0,0,0)
    for name,angle in [('body',pose.get('tilt',0)),('neck',pose.get('neck',0)),('head',pose.get('head',0))]:
        arm.pose.bones[name].rotation_quaternion=Quaternion(Vector(axes[name]),math.radians(angle))
    arm.pose.bones['body'].location=arm.data.bones['body'].matrix_local.to_3x3().inverted() @ Vector((0,0,-pose.get('bob',0)/100))
    for leg in pose.get('legs',legs):
        n=leg['name'];a=leg.get('pose',neutral[n])
        for part in ['thigh','upper','lower','hoof']:
            name=part+'-'+n
            if name in arm.pose.bones:
                angle=a[part]-neutral[n][part]-(pose.get('tilt',0) if part=='hoof' else 0)
                arm.pose.bones[name].rotation_quaternion=Quaternion(Vector(axes[name]),math.radians(angle))
    bpy.context.view_layer.update()
bpy.app.driver_namespace['images_pose_deer']=pose_deer
pose_deer({})
arm.show_in_front=False
for ob in scene.objects:ob.select_set(False)
arm.select_set(True);bpy.context.view_layer.objects.active=arm
print(json.dumps({'continuous_vertices':len(torso.data.vertices),'bones':len(arm.data.bones),'backwards_antlers':True,'previous_model_preserved':True}))
