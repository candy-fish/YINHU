"""Calibrate visible anatomical bones and layer Fresnel + scales + scrolling code."""
import bpy,json,os,math
from mathutils import Vector,Quaternion
ROOT=r'D:\VScode\BlackDoor'
scene=bpy.data.scenes['Images_Companions_Studio'];bpy.context.window.scene=scene
rig_data=json.load(open(os.path.join(ROOT,'art','images-companions','rig.json'),encoding='utf8'))['legs']
deer=bpy.data.objects['Deer_Companion_Rig']
for p in deer.pose.bones:p.rotation_mode='QUATERNION';p.rotation_quaternion=Quaternion();p.location=(0,0,0)
bpy.context.view_layer.objects.active=deer
bpy.ops.object.mode_set(mode='EDIT')
for bone in deer.data.edit_bones:
    name=bone.name;head=bone.head.copy()
    if name=='body':bone.tail=head+Vector((.44,0,.17))
    elif name=='neck':bone.tail=deer.data.edit_bones['head'].head
    elif name=='head':bone.tail=Vector((.88,0,1.73))
    elif name=='muzzle':bone.tail=Vector((.94,0,1.72))
    elif name.startswith('ear-'):bone.tail=head+Vector((.06,-.16 if name.endswith('near') else .16,.23))
    else:
        for leg in rig_data:
            n=leg['name']
            if name=='thigh-'+n:bone.tail=head+Vector((0,0,-leg['thigh']/100))
            elif name=='upper-'+n:bone.tail=head+Vector((0,0,-leg['upper']/100))
            elif name=='lower-'+n:bone.tail=head+Vector((0,0,-leg['lower']/100))
            elif name=='hoof-'+n:bone.tail=head+Vector((.08,0,0))
    if name.startswith('lower-') or name.startswith('hoof-') or (name.startswith('upper-hind')):bone.use_connect=True
bpy.ops.object.mode_set(mode='OBJECT')

def axes(arm,world_axis):
    result={}
    for b in arm.data.bones:
        axis=(b.matrix_local.to_3x3().inverted() @ Vector(world_axis)).normalized()
        result[b.name]=list(axis)
    return result

deer['imagesRigAxes']=json.dumps(axes(deer,(0,1,0)))
deer['imagesRole']='deer'
deer['imagesSource']='Locally sculpted from the user-supplied single-view posture reference.'
def pose_deer(pose):
    axis_data=json.loads(deer['imagesRigAxes'])
    for b in deer.pose.bones:b.rotation_quaternion=Quaternion();b.location=(0,0,0)
    for name,angle in [('body',pose.get('tilt',0)),('neck',pose.get('neck',0)),('head',pose.get('head',0))]:
        deer.pose.bones[name].rotation_quaternion=Quaternion(Vector(axis_data[name]),math.radians(angle))
    body_basis=deer.data.bones['body'].matrix_local.to_3x3()
    deer.pose.bones['body'].location=body_basis.inverted() @ Vector((0,0,-pose.get('bob',0)/100))
    for leg in pose.get('legs',rig_data):
        n=leg['name'];a=leg.get('pose',leg['neutral'])
        for part in ['thigh','upper','lower','hoof']:
            name=part+'-'+n
            if name not in deer.pose.bones:continue
            angle=a[part]-(pose.get('tilt',0) if part=='hoof' else 0)
            deer.pose.bones[name].rotation_quaternion=Quaternion(Vector(axis_data[name]),math.radians(angle))
    bpy.context.view_layer.update()
pose_deer({})
bpy.app.driver_namespace['images_pose_deer']=pose_deer

fish=bpy.data.objects.get('Fish_Companion_Rig')
if fish:
    fish['imagesRole']='fish'
    fish['imagesYawAxes']=json.dumps(axes(fish,(0,0,1)))
    fish['imagesPitchAxes']=json.dumps(axes(fish,(1,0,0)))

code_image=bpy.data.images.load(os.path.join(ROOT,'transition','images','assets','hologram-code.png'),check_existing=True)
scale_image=bpy.data.images.load(os.path.join(ROOT,'transition','images','assets','fish-surface.png'),check_existing=True)
code_image.pack();scale_image.pack()
for role,arm in [('deer',deer),('fish',fish)]:
    if not arm:continue
    mat=bpy.data.materials.get('Hologram | '+role) or bpy.data.materials.new('Hologram | '+role)
    mat.use_nodes=True;mat.surface_render_method='DITHERED'
    nodes=mat.node_tree.nodes;nodes.clear();links=mat.node_tree.links
    output=nodes.new('ShaderNodeOutputMaterial')
    coord=nodes.new('ShaderNodeTexCoord')
    sep=nodes.new('ShaderNodeSeparateXYZ');links.new(coord.outputs['Generated'],sep.inputs[0])
    uv=nodes.new('ShaderNodeCombineXYZ');links.new(sep.outputs['X'],uv.inputs['X']);links.new(sep.outputs['Z'],uv.inputs['Y'])
    mapping=nodes.new('ShaderNodeMapping');links.new(uv.outputs[0],mapping.inputs['Vector'])
    mapping.inputs['Scale'].default_value=(3,2,1)
    tex=nodes.new('ShaderNodeTexImage');tex.image=code_image;links.new(mapping.outputs[0],tex.inputs[0])
    mapping.inputs['Location'].default_value=(0,0,0);mapping.inputs['Location'].keyframe_insert('default_value',frame=1)
    mapping.inputs['Location'].default_value=(0,1,0);mapping.inputs['Location'].keyframe_insert('default_value',frame=181)
    if mat.node_tree.animation_data and mat.node_tree.animation_data.action:
        for curve in mat.node_tree.animation_data.action.fcurves:
            for point in curve.keyframe_points:point.interpolation='LINEAR'
            curve.modifiers.new('CYCLES')
    fresnel=nodes.new('ShaderNodeFresnel');fresnel.inputs['IOR'].default_value=1.23
    edge=nodes.new('ShaderNodeMath');edge.operation='MULTIPLY';edge.inputs[1].default_value=1.8;links.new(fresnel.outputs[0],edge.inputs[0])
    detail=nodes.new('ShaderNodeTexImage');detail.image=scale_image;links.new(uv.outputs[0],detail.inputs[0])
    texture_gain=nodes.new('ShaderNodeMath');texture_gain.operation='MULTIPLY';texture_gain.inputs[1].default_value=.16 if role=='fish' else .06;links.new(detail.outputs[0],texture_gain.inputs[0])
    add=nodes.new('ShaderNodeMath');add.operation='ADD';links.new(tex.outputs['Color'],add.inputs[0]);links.new(edge.outputs[0],add.inputs[1])
    add2=nodes.new('ShaderNodeMath');add2.operation='ADD';links.new(add.outputs[0],add2.inputs[0]);links.new(texture_gain.outputs[0],add2.inputs[1])
    emission=nodes.new('ShaderNodeEmission');emission.inputs['Color'].default_value=(.58,.85,.36,1);emission.inputs['Strength'].default_value=2.2
    transparent=nodes.new('ShaderNodeBsdfTransparent')
    mix=nodes.new('ShaderNodeMixShader');links.new(add2.outputs[0],mix.inputs[0]);links.new(transparent.outputs[0],mix.inputs[1]);links.new(emission.outputs[0],mix.inputs[2]);links.new(mix.outputs[0],output.inputs[0])
    for ob in arm.children:
        if ob.type=='MESH':ob.data.materials.clear();ob.data.materials.append(mat)
scene.frame_set(1)
print(json.dumps({'deer_bones':len(deer.data.bones),'fish_bones':len(fish.data.bones) if fish else 0,'materials':'Fresnel + surface map + looping code map','bone_axes_exported':True}))
