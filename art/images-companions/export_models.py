import bpy,os,json
from mathutils import Quaternion
ROOT=r'D:\VScode\BlackDoor'
scene=bpy.data.scenes['Images_Companions_Studio'];bpy.context.window.scene=scene
output=os.path.join(ROOT,'transition','images','assets')
os.makedirs(output,exist_ok=True)
summary=[]
for role,name in [('deer','Deer_Companion_Rig'),('fish','Fish_Companion_Rig')]:
    arm=bpy.data.objects[name]
    saved=[(b,b.rotation_mode,b.rotation_quaternion.copy(),b.location.copy()) for b in arm.pose.bones]
    saved_location=arm.location.copy();saved_scale=arm.scale.copy()
    saved_hidden=arm.hide_viewport;arm.hide_viewport=False
    arm.location=(0,0,0);arm.scale=(1,1,1)
    material_restore=[]
    morph_restore=[]
    placeholder=bpy.data.materials.get('Export receiver '+role) or bpy.data.materials.new('Export receiver '+role)
    placeholder.use_nodes=True
    node=next(n for n in placeholder.node_tree.nodes if n.type=='BSDF_PRINCIPLED')
    node.inputs['Base Color'].default_value=(.7,.85,.55,1)
    node.inputs['Roughness'].default_value=.5
    for b,_,_,_ in saved:b.rotation_mode='QUATERNION';b.rotation_quaternion=Quaternion();b.location=(0,0,0)
    bpy.ops.object.select_all(action='DESELECT');arm.select_set(True)
    for ob in arm.children:
        if ob.type!='MESH':continue
        if ob.data.shape_keys:
            for key in ob.data.shape_keys.key_blocks:
                morph_restore.append((key,key.value));key.value=0
        material_restore.append((ob,list(ob.data.materials)))
        ob.data.materials.clear();ob.data.materials.append(placeholder);ob.select_set(True)
    bpy.context.view_layer.objects.active=arm;bpy.context.view_layer.update()
    filename=os.path.join(output,role+'-companion.glb')
    bpy.ops.export_scene.gltf(filepath=filename,export_format='GLB',use_selection=True,use_active_scene=True,export_animations=False,export_skins=True,export_extras=True,export_yup=True,export_cameras=False,export_lights=False)
    for ob,mats in material_restore:
        ob.data.materials.clear()
        for mat in mats:ob.data.materials.append(mat)
    for key,value in morph_restore:key.value=value
    for b,mode,q,loc in saved:b.rotation_mode=mode;b.rotation_quaternion=q;b.location=loc
    arm.location=saved_location;arm.scale=saved_scale;arm.hide_viewport=saved_hidden
    summary.append({'role':role,'bytes':os.path.getsize(filename),'bones':len(arm.data.bones),'path':filename})
bpy.data.objects['Fish_Companion_Rig'].hide_viewport=False
scene.frame_set(1)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(ROOT,'art','images-companions','映相-全息鹿与鱼.blend'),check_existing=False)
print(json.dumps(summary,ensure_ascii=False))
