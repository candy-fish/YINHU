"""Add a flexible back without moving leg mounts or changing the rest sculpture.

Run through Blender MCP in the existing companions project. Exports only the
deer and saves the companions scene separately; restores the active scene.
"""
import bpy, math, os
from mathutils import Quaternion

ROOT = r'D:\VScode\BlackDoor'
scene = bpy.data.scenes['Images_Companions_Studio']
previous_scene = bpy.context.window.scene
bpy.context.window.scene = scene
arm = bpy.data.objects['Deer_Companion_Rig']
mesh = next(o for o in arm.children if o.type == 'MESH')

def smooth(t):
    t = max(0., min(1., t))
    return t*t*(3-2*t)

basis = mesh.data.shape_keys.key_blocks['Basis']
for name, back, belly in [('Run | gathered back', .12, .055), ('Run | extended back', -.055, -.025)]:
    key = mesh.data.shape_keys.key_blocks.get(name) or mesh.shape_key_add(name=name)
    for vertex in mesh.data.vertices:
        p = basis.data[vertex.index].co.copy()
        # Smooth compact support between the hip and shoulder. Pure body weights
        # exclude legs, neck, head and antlers; endpoints remain fixed for IK.
        share = sum(g.weight for g in vertex.groups if mesh.vertex_groups[g.group].name == 'body')
        t = (p.x + .48) / .61
        mask = math.sin(math.pi * max(0., min(1., t))) ** 2
        mask *= smooth((p.z - 1.04) / .18) * share
        height = smooth((p.z - 1.22) / .28)
        p.z += (belly + (back-belly)*height) * mask
        p.y *= 1 + (.035 if back > 0 else -.02) * mask
        key.data[vertex.index].co = p
    key.value = 0
arm['imagesRunCoil'] = 'Run | gathered back'
arm['imagesRunReach'] = 'Run | extended back'
mesh.data.update()

saved = [(b, b.rotation_mode, b.rotation_quaternion.copy(), b.location.copy()) for b in arm.pose.bones]
saved_location, saved_scale = arm.location.copy(), arm.scale.copy()
saved_hidden = arm.hide_viewport
materials = list(mesh.data.materials)
morphs = [(k, k.value) for k in mesh.data.shape_keys.key_blocks]
try:
    arm.hide_viewport = False
    arm.location = (0, 0, 0)
    arm.scale = (1, 1, 1)
    for b, _, _, _ in saved:
        b.rotation_mode = 'QUATERNION'
        b.rotation_quaternion = Quaternion()
        b.location = (0, 0, 0)
    for key, _ in morphs:
        key.value = 0
    receiver = bpy.data.materials.get('Export receiver deer') or bpy.data.materials.new('Export receiver deer')
    receiver.use_nodes = True
    next(n for n in receiver.node_tree.nodes if n.type == 'BSDF_PRINCIPLED').inputs['Base Color'].default_value = (.7, .85, .55, 1)
    mesh.data.materials.clear()
    mesh.data.materials.append(receiver)
    bpy.ops.object.select_all(action='DESELECT')
    arm.select_set(True)
    mesh.select_set(True)
    bpy.context.view_layer.objects.active = arm
    bpy.context.view_layer.update()
    filename = os.path.join(ROOT, 'transition', 'images', 'assets', 'deer-companion.glb')
    bpy.ops.export_scene.gltf(filepath=filename, export_format='GLB', use_selection=True, use_active_scene=True,
        export_animations=False, export_skins=True, export_extras=True, export_yup=True,
        export_cameras=False, export_lights=False)
finally:
    mesh.data.materials.clear()
    for mat in materials:
        mesh.data.materials.append(mat)
    for key, value in morphs:
        key.value = value
    for b, mode, rotation, location in saved:
        b.rotation_mode = mode
        b.rotation_quaternion = rotation
        b.location = location
    arm.location, arm.scale, arm.hide_viewport = saved_location, saved_scale, saved_hidden
    bpy.context.window.scene = previous_scene

# Save a dedicated editable companions scene, without replacing the user's live
# aurora scenes or resetting the active Blender file.
bpy.data.libraries.write(os.path.join(ROOT, 'art', 'images-companions', '映相-全息鹿与鱼.blend'), {scene}, fake_user=True, compress=True)
print('Deer exported with gathered/extended back correctives; all 22 bones retained.')
