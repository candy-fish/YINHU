"""Original Blender sculpture, guided by the user's local video; no remote generation.
Run in the connected Blender with exec(compile(open(path).read(),path,'exec')).
The studio is a new scene; existing scenes are kept. All outputs stay in BlackDoor.
"""
import bpy, bmesh, math, json, os
from mathutils import Vector, Quaternion

ROOT = r'D:\VScode\BlackDoor'
ART = os.path.join(ROOT, 'art', 'images-companions')
ASSETS = os.path.join(ROOT, 'transition', 'images', 'assets')
RIG = json.load(open(os.path.join(ART, 'rig.json'), encoding='utf8'))['legs']
SCENE_NAME = 'Images_Companions_Studio'
if bpy.data.scenes.get(SCENE_NAME) and len(bpy.data.scenes[SCENE_NAME].objects):
    raise RuntimeError('Studio already exists. Refine it instead of replacing it.')
scene = bpy.data.scenes.get(SCENE_NAME) or bpy.data.scenes.new(SCENE_NAME)
bpy.context.window.scene = scene
scene.render.resolution_x = scene.render.resolution_y = 1000
scene.render.resolution_percentage = 100
scene.render.film_transparent = True
scene.render.image_settings.file_format = 'PNG'
scene.render.fps = 30
scene.frame_end = 870
world = bpy.data.worlds.new('Images midnight studio')
scene.world = world
world.use_nodes = True
background = next(n for n in world.node_tree.nodes if n.type == 'BACKGROUND')
background.inputs[0].default_value = (.035,.05,.065,1)
background.inputs[1].default_value = .32

def material(name, color, metallic=.65, roughness=.32):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    node = next(n for n in mat.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    node.inputs['Base Color'].default_value = (*color,1)
    node.inputs['Metallic'].default_value = metallic
    node.inputs['Roughness'].default_value = roughness
    if 'Coat Weight' in node.inputs:
        node.inputs['Coat Weight'].default_value = .24
        node.inputs['Coat Roughness'].default_value = .23
    return mat

jade = material('Celadon bronze | cool patina', (.19,.37,.34), .72,.32)
gold = material('Old gold | fine raised edges', (.44,.32,.12), .8,.28)
antler_mat = material('Antler bronze | warmer tips', (.30,.37,.25), .72,.32)
hoof_mat = material('Dark split hooves', (.035,.055,.052), .5,.29)
inner_ear = material('Soft moss inside ears', (.14,.25,.19), .4,.42)
eye_mat = material('Obsidian eye', (.008,.018,.014), .28,.12)
iris_mat = material('Amber iris rim', (.38,.26,.07), .65,.19)
highlight_mat = material('Eye glint', (.86,.90,.75), .25,.16)

def smooth(t):
    t = max(0., min(1.,t)); return t*t*(3-2*t)

meshes = []
def mesh_obj(name, verts, faces, mat=jade):
    mesh = bpy.data.meshes.new(name+' mesh')
    mesh.from_pydata(verts,[],faces); mesh.update()
    bm = bmesh.new(); bm.from_mesh(mesh)
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    bm.to_mesh(mesh); bm.free()
    ob=bpy.data.objects.new(name,mesh); scene.collection.objects.link(ob)
    mesh.materials.append(mat)
    for poly in mesh.polygons: poly.use_smooth=True
    meshes.append(ob)
    return ob

def catmull(values, steps=5):
    result=[]
    for i in range(len(values)-1):
        p0=values[max(i-1,0)]; p1=values[i]; p2=values[i+1]; p3=values[min(i+2,len(values)-1)]
        for j in range(steps):
            t=j/steps
            result.append([.5*(p1[k]*2+(p2[k]-p0[k])*t+(p0[k]*2-p1[k]*5+p2[k]*4-p3[k])*t*t+(-p0[k]+p1[k]*3-p2[k]*3+p3[k])*t*t*t) for k in range(len(p1))])
    result.append(values[-1]); return result

def loft(name, points, radii, mat=jade, sides=16, steps=4):
    data=catmull([(*p,*r) for p,r in zip(points,radii)],steps)
    verts=[]; faces=[]
    for i, row in enumerate(data):
        p=Vector(row[:3]); tangent=Vector(data[min(i+1,len(data)-1)][:3])-Vector(data[max(0,i-1)][:3])
        tangent.normalize()
        axis=Vector((0,1,0))
        if abs(axis.dot(tangent))>.94: axis=Vector((1,0,0))
        axis=(axis-tangent*axis.dot(tangent)).normalized(); other=tangent.cross(axis).normalized()
        for j in range(sides):
            a=j*math.tau/sides
            verts.append(tuple(p+axis*math.cos(a)*max(.001,row[3])+other*math.sin(a)*max(.001,row[4])))
    for i in range(len(data)-1):
        for j in range(sides):
            a=i*sides+j;b=i*sides+(j+1)%sides;c=(i+1)*sides+(j+1)%sides;d=(i+1)*sides+j
            faces.append((a,b,c,d))
    faces.append(tuple(range(sides-1,-1,-1)))
    faces.append(tuple((len(data)-1)*sides+j for j in range(sides)))
    return mesh_obj(name,verts,faces,mat)

def sphere(name, location, scale, mat=jade, segments=20, rings=12):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments,ring_count=rings,location=location)
    ob=bpy.context.object; ob.name=name;ob.scale=scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    ob.data.materials.append(mat)
    for p in ob.data.polygons:p.use_smooth=True
    meshes.append(ob);return ob

def trace(name, points, radius, mat=gold):
    return loft(name,points,[(radius*(1-i/(len(points)-1)*.7),)*2 for i in range(len(points))],mat,8,4)

def skin(ob, bone=None, blend=False):
    if blend:
        groups={n:ob.vertex_groups.new(name=n) for n in ['body','neck','head']}
        for vertex in ob.data.vertices:
            x,y,z = ob.matrix_world @ vertex.co
            head=max(smooth((z-1.65)/.15)*smooth((x-.29)/.12),smooth((x-.5)/.1)*smooth((z-1.50)/.15))
            neck=max(head,smooth((z-1.24)/.30)*smooth((x+.04)/.23))
            for n,w in [('body',1-neck),('neck',neck-head),('head',head)]:
                if w>1e-6:groups[n].add([vertex.index],w,'REPLACE')
    else:
        ob.vertex_groups.new(name=bone).add(list(range(len(ob.data.vertices))),1,'REPLACE')
    return ob

# Flowing shoulder, tucked abdomen and gentle haunch. The union gives one surface.
torso = loft('Sculpted flowing torso', [(-.82,0,1.23),(-.68,0,1.26),(-.44,0,1.25),(-.16,0,1.29),(.12,0,1.36),(.27,0,1.35)],[(.035,.06),(.20,.235),(.22,.24),(.18,.195),(.205,.245),(.085,.13)],sides=24,steps=6)
haunch=sphere('Rounded haunch',(-.62,0,1.20),(.235,.205,.23))
neck=loft('Arched living neck',[(.10,0,1.10),(.12,0,1.26),(.20,0,1.43),(.30,0,1.60),(.40,0,1.76),(.46,0,1.84)],[(.16,.15),(.155,.17),(.125,.15),(.10,.13),(.075,.10),(.07,.085)],sides=24,steps=6)
skull=sphere('Tapered skull',(.51,0,1.84),(.16,.105,.115),segments=24,rings=16)
muzzle=loft('Slender deer muzzle',[(.53,0,1.83),(.65,0,1.79),(.78,0,1.74),(.90,0,1.72)],[(.084,.075),(.072,.066),(.057,.051),(.043,.038)],sides=20,steps=5)
bpy.ops.object.select_all(action='DESELECT')
for ob in [torso,haunch,neck,skull,muzzle]:ob.select_set(True)
bpy.context.view_layer.objects.active=torso
bpy.ops.object.join()
torso.name='Deer | seamless patinated sculpture'
for ob in [haunch,neck,skull,muzzle]:
    if ob in meshes:meshes.remove(ob)
torso.data.remesh_voxel_size=.018
bpy.ops.object.voxel_remesh()
mod=torso.modifiers.new('Gentle sculpt smoothing','SMOOTH');mod.factor=.35;mod.iterations=4
bpy.ops.object.modifier_apply(modifier=mod.name)
dec=torso.modifiers.new('Web sculpture topology','DECIMATE');dec.ratio=.65
bpy.ops.object.modifier_apply(modifier=dec.name)
for p in torso.data.polygons:p.use_smooth=True
skin(torso,blend=True)

# Neutral sculpture data; the final hologram replaces this material in both renderers.
colors=torso.data.color_attributes.new(name='Patina',type='FLOAT_COLOR',domain='POINT')
for vertex in torso.data.vertices:
    x,y,z=torso.matrix_world @ vertex.co
    top=smooth((z-1.03)/.85)
    wave=.025*math.sin(x*9+z*7)
    colors.data[vertex.index].color=(.10+.18*top+wave,.25+.23*top+wave,.24+.18*top,1)
node=next(n for n in jade.node_tree.nodes if n.type=='BSDF_PRINCIPLED')
vc=jade.node_tree.nodes.new('ShaderNodeVertexColor');vc.layer_name='Patina'
jade.node_tree.links.new(vc.outputs['Color'],node.inputs['Base Color'])
# Other parts use a plain material, rather than an absent vertex color layer.
plain=material('Celadon limbs and neck trim',(.24,.42,.36),.68,.34)
for ob in meshes:
    if ob is not torso and ob.data.materials and ob.data.materials[0] is jade:ob.data.materials[0]=plain

tail=loft('Lifted deer tail',[(-.78,0,1.32),(-.92,0,1.43),(-1.02,0,1.55)],[(.065,.075),(.05,.06),(.004,.005)],plain,16,5);skin(tail,'body')
for y, side in [(-.108,'near'),(.108,'far')]:
    skin(sphere('Amber eye socket '+side,(.596,y,1.846),(.030,.012,.024),iris_mat), 'head')
    skin(sphere('Polished dark eye '+side,(.602,y*1.045,1.847),(.019,.009,.016),eye_mat), 'head')
    skin(sphere('Eye catchlight '+side,(.610,y*1.105,1.855),(.0045,.003,.0045),highlight_mat,12,8),'head')
skin(sphere('Velvet dark nose',(.925,0,1.72),(.036,.044,.031),hoof_mat),'muzzle')
for y in [-.037,.037]:skin(sphere('Small nostril',(.929,y,1.725),(.012,.006,.007),eye_mat,12,8),'muzzle')
skin(trace('Quiet mouth line',[(.75,-.058,1.712),(.84,-.049,1.696),(.91,-.033,1.702)],.004,hoof_mat),'muzzle')

for side, y in [('near',-.13),('far',.13)]:
    sign=-1 if y<0 else 1
    ear=loft('Leaf shaped ear '+side,[(.46,y,1.94),(.45,y+sign*.075,2.025),(.50,y+sign*.13,2.11),(.57,y+sign*.18,2.16)],[(.023,.025),(.053,.028),(.037,.020),(.002,.003)],plain,16,5)
    skin(ear,'ear-'+side)
    ear_in=loft('Recessed ear '+side,[(.47,y+sign*.02,1.97),(.48,y+sign*.08,2.045),(.53,y+sign*.14,2.12)],[(.011,.012),(.029,.014),(.002,.002)],inner_ear,12,4)
    skin(ear_in,'ear-'+side)

# A pair of asymmetrical branch antlers: long primary beams, fine tines and sparse buds.
beams=[[(.43,-.11,1.98),(.24,-.14,2.19),(.18,-.13,2.43),(.36,-.10,2.64),(.75,-.06,2.76),(1.20,-.025,2.79),(1.65,.01,2.74)],[(.41,.11,1.98),(.12,.14,2.20),(.025,.16,2.48),(.10,.18,2.75),(.36,.20,2.94),(.77,.22,3.05),(1.13,.25,3.02)]]
for index, points in enumerate(beams):
    skin(loft('Living antler beam '+str(index),points,[(r,r*.9) for r in [.057,.050,.040,.032,.024,.015,.003]],antler_mat,14,5),'head')
    twigs=[(1,(-.02,-.02,.34),(.08,-.015,.56)),(2,(.16,-.04,.24),(.38,-.04,.42)),(3,(.31,.025,.19),(.65,.03,.25)),(4,(.17,-.015,.23),(.34,-.025,.39)),(4,(.28,.035,-.025),(.62,.04,-.06)),(5,(.17,-.025,.15),(.32,-.03,.20))]
    for k,(at,delta,tip) in enumerate(twigs):
        base=Vector(points[at]); middle=base+Vector(delta); end=base+Vector(tip)
        if index: end.z-=.06
        branch=[tuple(base),tuple(middle),tuple(end)]
        skin(loft(f'Antler {index} tine {k}',branch,[(.021,.021),(.012,.012),(.002,.002)],antler_mat,10,5),'head')
        for n,t in enumerate([.64,1.]):
            p=middle.lerp(end,t)
            pod=sphere(f'Bronze bud {index}-{k}-{n}',tuple(p),(.020,.013,.028),gold,12,8)
            pod.rotation_euler[1]=-.45
            skin(pod,'head')
    skin(trace('Fine antler edge '+str(index),[(p[0]+.01,p[1]-.025,p[2]+.01) for p in points[1:]],.006,gold),'head')

# Rig coordinates intentionally match the tested 2-D gait, in centimetre units.
def P(x,y,depth=0): return Vector(((x-120)/100,depth,(282-y)/100))
bones={ 'body':(P(100,160),None), 'neck':(P(133,170),'body'), 'head':(P(158,108),'neck'), 'muzzle':(P(194,110),'head'), 'ear-near':(P(173,91,-.13),'head'), 'ear-far':(P(160,89,.13),'head') }
for leg in RIG:
    name=leg['name'];depth=-.125 if name.endswith('near') else .125
    origin=P(*leg['hip'],depth)
    if leg.get('thigh'):
        bones['thigh-'+name]=(origin,'body');upper_origin=origin+Vector((0,0,-leg['thigh']/100))
        parent='thigh-'+name
        thigh=loft('Muscular thigh '+name,[tuple(origin),tuple(origin+Vector((0,0,-.13))),tuple(upper_origin)],[(.085,.11),(.065,.08),(.037,.045)],plain,16,5)
        skin(thigh,parent)
    else:upper_origin=origin;parent='body'
    bones['upper-'+name]=(upper_origin,parent)
    knee=upper_origin+Vector((0,0,-leg['upper']/100))
    bones['lower-'+name]=(knee,'upper-'+name)
    foot=knee+Vector((0,0,-leg['lower']/100))
    bones['hoof-'+name]=(foot,'lower-'+name)
    upper=loft('Tapered upper limb '+name,[tuple(upper_origin),tuple(upper_origin.lerp(knee,.48)),tuple(knee)],[(.044,.06),(.033,.035),(.025,.028)],plain,14,5);skin(upper,'upper-'+name)
    lower=loft('Fine cannon and tendon '+name,[tuple(knee),tuple(knee.lerp(foot,.45)),tuple(foot+Vector((0,0,.045)))],[(.025,.028),(.014,.016),(.022,.024)],plain,14,5);skin(lower,'lower-'+name)
    skin(sphere('Hock joint '+name,tuple(knee),(.032,.030,.034),plain,16,10),'lower-'+name)
    for split in [-1,1]:
        hoof=sphere('Cloven hoof '+name+str(split),tuple(foot+Vector((.012,split*.018,.022))),(.043,.018,.027),hoof_mat,16,10)
        skin(hoof,'hoof-'+name)
    skin(trace('Quiet leg edge '+name,[tuple(knee+Vector((.016,-.015,-.035))),tuple(knee.lerp(foot,.55)+Vector((.011,-.012,0))),tuple(foot+Vector((.017,-.015,.06)))],.0028,gold),'lower-'+name)

arm_data=bpy.data.armatures.new('Deer anatomical rig')
arm=bpy.data.objects.new('Deer_Companion_Rig',arm_data);scene.collection.objects.link(arm)
bpy.context.view_layer.objects.active=arm;arm.select_set(True)
bpy.ops.object.mode_set(mode='EDIT')
for name,(head,parent) in bones.items():
    b=arm_data.edit_bones.new(name);b.head=head;b.tail=head+Vector((0,0,.1))
    if parent:b.parent=arm_data.edit_bones[parent]
bpy.ops.object.mode_set(mode='OBJECT')
for ob in list(meshes):
    if not ob.vertex_groups:skin(ob,'body')
    mod=ob.modifiers.new('Deer skin','ARMATURE');mod.object=arm
    ob.parent=arm
    ob['images_companion']='deer'
for bone in arm.pose.bones:bone.rotation_mode='XYZ'

def apply_pose(bob=0,tilt=0,neck=0,head=0,legs=None):
    for bone in arm.pose.bones:bone.rotation_euler=(0,0,0);bone.location=(0,0,0)
    arm.pose.bones['body'].location.y=-bob/100
    arm.pose.bones['body'].rotation_euler.z=-math.radians(tilt)
    arm.pose.bones['neck'].rotation_euler.z=-math.radians(neck)
    arm.pose.bones['head'].rotation_euler.z=-math.radians(head)
    for leg in (legs or RIG):
        n=leg['name'];angles=leg.get('pose',leg['neutral'])
        if leg.get('thigh'):arm.pose.bones['thigh-'+n].rotation_euler.z=-math.radians(angles['thigh'])
        arm.pose.bones['upper-'+n].rotation_euler.z=-math.radians(angles['upper'])
        arm.pose.bones['lower-'+n].rotation_euler.z=-math.radians(angles['lower'])
        arm.pose.bones['hoof-'+n].rotation_euler.z=-math.radians(angles['hoof']-tilt)
    bpy.context.view_layer.update()

apply_pose()
arm.show_in_front=True

# The studio is separate from the user's startup scene and the video reference scene.
def light(name,position,power,size,color):
    data=bpy.data.lights.new(name,'AREA');data.energy=power;data.shape='DISK';data.size=size;data.color=color
    ob=bpy.data.objects.new(name,data);scene.collection.objects.link(ob);ob.location=position
    ob.rotation_euler=(Vector((.2,0,1.5))-ob.location).to_track_quat('-Z','Y').to_euler();return ob
light('Large soft jade key',(3,-5,6),1000,5,(.80,.94,1.0))
light('Warm sculpting fill',(-3,-2,3),850,4,(1,.84,.55))
light('Fine antler rim',(2,4,5),1500,4,(.68,.87,1.0))
camera_data=bpy.data.cameras.new('Companion portrait camera');camera_data.type='ORTHO';camera_data.ortho_scale=4.0
camera=bpy.data.objects.new('Companion portrait camera',camera_data);scene.collection.objects.link(camera)
camera.location=(3.4,-8,2.8);camera.rotation_euler=(Vector((.25,0,1.55))-camera.location).to_track_quat('-Z','Y').to_euler();scene.camera=camera
for area in bpy.context.screen.areas:
    if area.type=='VIEW_3D':area.spaces.active.region_3d.view_perspective='CAMERA'
scene['images_reference']='User-supplied local video, 343 frames at 30fps; original sculpture and procedural rig.'
scene['images_build_script']=os.path.join(ART,'build_deer.py')
scene.render.filepath=os.path.join(ROOT,'.cache','blender-deer-studio.png')
print(json.dumps({'scene':scene.name,'objects':len(scene.objects),'meshes':len(meshes),'bones':len(bones),'vertices':sum(len(o.data.vertices) for o in meshes),'render':scene.render.filepath},ensure_ascii=False))
