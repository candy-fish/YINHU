"""Original layered aurora geometry, built in the user's live Blender via MCP."""
import bpy, math, os, json
from mathutils import Vector

ROOT = r'D:\VScode\BlackDoor'
SCENE = 'Images_Aurora_Studio_v7'
if SCENE in bpy.data.scenes:
    raise RuntimeError('Aurora scene already exists; inspect it before rebuilding.')
scene = bpy.data.scenes.new(SCENE)
bpy.context.window.scene = scene
scene.render.engine = 'BLENDER_EEVEE_NEXT'
scene.render.resolution_x = 1440
scene.render.resolution_y = 420
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = 'PNG'
scene.render.film_transparent = False
scene.world = bpy.data.worlds.new('Aurora | deep sky')
scene.world.use_nodes = True
world_bg = next(n for n in scene.world.node_tree.nodes if n.type == 'BACKGROUND')
world_bg.inputs['Color'].default_value = (.006, .008, .014, 1)
world_bg.inputs['Strength'].default_value = .15
scene.view_settings.view_transform = 'Standard'
scene.view_settings.look = 'None'
scene.view_settings.exposure = 0

def linear(c):
    return c / 12.92 if c <= .04045 else ((c + .055) / 1.055) ** 2.4

def rgba(code):
    return (*[linear(int(code[i:i+2], 16) / 255) for i in (1, 3, 5)], 1)

def material(name, color, phase):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = rgba(color)
    mat.use_nodes = True
    mat.surface_render_method = 'BLENDED'
    if hasattr(mat, 'use_transparency_overlap'): mat.use_transparency_overlap = False
    nodes = mat.node_tree.nodes; nodes.clear(); links = mat.node_tree.links
    output = nodes.new('ShaderNodeOutputMaterial'); output.location = (850, 100)
    mix = nodes.new('ShaderNodeMixShader'); mix.location = (630, 100)
    transparent = nodes.new('ShaderNodeBsdfTransparent'); transparent.location = (420, -30)
    emission = nodes.new('ShaderNodeEmission'); emission.location = (420, 130)
    emission.inputs['Color'].default_value = rgba(color)
    emission.inputs['Strength'].default_value = 2.0
    uv = nodes.new('ShaderNodeTexCoord'); uv.location = (-1000, 40)
    mapping = nodes.new('ShaderNodeMapping'); mapping.location = (-820, 40)
    links.new(uv.outputs['UV'], mapping.inputs['Vector'])
    mapping.inputs['Location'].default_value = (phase * .1, 0, 0)
    wave = nodes.new('ShaderNodeTexWave'); wave.location = (-600, 130)
    wave.wave_type = 'BANDS'; wave.bands_direction = 'X'
    wave.inputs['Scale'].default_value = 65
    wave.inputs['Distortion'].default_value = 3.5
    wave.inputs['Detail Scale'].default_value = .7
    links.new(mapping.outputs['Vector'], wave.inputs['Vector'])
    streaks = nodes.new('ShaderNodeMapRange'); streaks.location = (-380, 130)
    streaks.inputs['From Min'].default_value = 0
    streaks.inputs['From Max'].default_value = 1
    streaks.inputs['To Min'].default_value = .025
    streaks.inputs['To Max'].default_value = .42
    links.new(wave.outputs['Color'], streaks.inputs['Value'])
    split = nodes.new('ShaderNodeSeparateXYZ'); split.location = (-600, -140)
    links.new(uv.outputs['UV'], split.inputs[0])
    fade = nodes.new('ShaderNodeValToRGB'); fade.location = (-370, -140)
    ramp = fade.color_ramp
    ramp.elements[0].position = 0; ramp.elements[0].color = (0, 0, 0, 1)
    ramp.elements[1].position = 1; ramp.elements[1].color = (0, 0, 0, 1)
    for position, value in [(.025, 1), (.16, .64), (.48, .16)]:
        stop = ramp.elements.new(position); stop.color = (value, value, value, 1)
    links.new(split.outputs['Y'], fade.inputs[0])
    multiply = nodes.new('ShaderNodeMath'); multiply.operation = 'MULTIPLY'; multiply.location = (120, 20)
    links.new(streaks.outputs['Result'], multiply.inputs[0]); links.new(fade.outputs['Color'], multiply.inputs[1])
    ends = nodes.new('ShaderNodeValToRGB'); ends.location = (-370, -380)
    ends.color_ramp.elements[0].color = (0,0,0,1)
    ends.color_ramp.elements[1].color = (0,0,0,1)
    for position in [.14, .86]:
        stop = ends.color_ramp.elements.new(position); stop.color = (1,1,1,1)
    links.new(split.outputs['X'], ends.inputs[0])
    alpha = nodes.new('ShaderNodeMath'); alpha.operation = 'MULTIPLY'; alpha.location = (310,20)
    links.new(ends.outputs['Color'], alpha.inputs[0]); links.new(multiply.outputs[0], alpha.inputs[1])
    cloud = nodes.new('ShaderNodeTexNoise'); cloud.location = (-360, -620)
    cloud.inputs['Scale'].default_value = 8; cloud.inputs['Detail'].default_value = 2
    cloud.inputs['Roughness'].default_value = .55
    links.new(mapping.outputs['Vector'], cloud.inputs['Vector'])
    clustered = nodes.new('ShaderNodeMath'); clustered.operation = 'MULTIPLY'; clustered.location = (470, -80)
    links.new(alpha.outputs[0], clustered.inputs[0]); links.new(cloud.outputs['Fac'], clustered.inputs[1])
    links.new(clustered.outputs[0], mix.inputs[0]); links.new(transparent.outputs[0], mix.inputs[1]); links.new(emission.outputs[0], mix.inputs[2]); links.new(mix.outputs[0], output.inputs['Surface'])
    mapping.inputs['Location'].default_value = (phase * .1, 0, 0)
    mapping.inputs['Location'].keyframe_insert('default_value', frame=1)
    mapping.inputs['Location'].default_value[0] += .7
    mapping.inputs['Location'].keyframe_insert('default_value', frame=481)
    if mat.node_tree.animation_data and mat.node_tree.animation_data.action:
        for curve in mat.node_tree.animation_data.action.fcurves:
            for key in curve.keyframe_points: key.interpolation = 'LINEAR'
            curve.modifiers.new('CYCLES')
    return mat

def catmull(points, t):
    t = min(.999999, max(0, t)) * (len(points) - 1)
    i = int(t); f = t - i
    a, b, c, d = [Vector(points[max(0, min(len(points)-1, j))]) for j in (i-1, i, i+1, i+2)]
    return .5 * ((2*b) + (-a+c)*f + (2*a-5*b+4*c-d)*f*f + (-a+3*b-3*c+d)*f*f*f)

root = bpy.data.objects.new('Images_Aurora_Rig', None)
scene.collection.objects.link(root)
root['imagesRole'] = 'aurora'
root['source'] = 'Original Blender meshes; user aurora shape reference; supplied pastel palette.'
root['palette'] = ['#EBCEE5', '#BBD7E5', '#BBDDC5', '#77718F', '#ECC5B9']
specs = [
    ('Ice | near cascade', '#BBD7E5', .4, 4.4, [(-15,.3,3.8),(-10,-.3,1.45),(-5,.8,2.2),(1,1.8,4.3)]),
    ('Mint | middle cascade', '#BBDDC5', 4.1, 4.1, [(-1,-.5,3.9),(3,.4,2.35),(8,1.5,3.25),(14,1.1,4.5)]),
    ('Pink | right cascade', '#EBCEE5', 2.3, 4.0, [(5,2.5,5.5),(9,3.2,4.5),(14,3.9,5.2),(18,4.2,6.2)]),
    ('Violet | far veil', '#77718F', 1.2, 3.9, [(-16,3.4,6.4),(-10,2.8,5.3),(-3,3.5,6.1)]),
    ('Rose | high wisp', '#ECC5B9', 3.3, 3.8, [(-6,3,6.2),(0,3.5,5.4),(7,4.2,6.4)]),
]
curtains = []
for name, tint, phase, tall, path in specs:
    nu, nv = 192, 18
    verts, faces = [], []
    for i in range(nu+1):
        u = i/nu; p = catmull(path, u)
        # Broad C1-continuous sweeps: no reversals or high-frequency edge kinks.
        height = tall + .4*math.sin(u*4+phase) + .12*math.cos(u*8+phase)
        envelope = math.sin(math.pi*u)**2
        base = p.z + .10*math.sin(u*9+phase)*envelope
        for j in range(nv+1):
            v = j/nv
            verts.append((p.x + .04*math.sin(u*5 + v + phase)*v,
                p.y + .22*math.sin(u*8+phase)*envelope + .10*v*math.sin(u*6+phase),
                base + v*height))
    for i in range(nu):
        for j in range(nv):
            a = i*(nv+1)+j; faces.append((a,a+nv+1,a+nv+2,a+1))
    mesh = bpy.data.meshes.new(name); mesh.from_pydata(verts, [], faces); mesh.update()
    uv = mesh.uv_layers.new(name='CurtainUV')
    for polygon in mesh.polygons:
        polygon.use_smooth = True
        for loop in polygon.loop_indices:
            index = mesh.loops[loop].vertex_index
            uv.data[loop].uv = (index//(nv+1)/nu, index%(nv+1)/nv)
    obj = bpy.data.objects.new(name, mesh); scene.collection.objects.link(obj); obj.parent = root
    obj['auroraTint'] = tint; obj['auroraPhase'] = phase; obj['auroraRole'] = 'curtain'
    obj['auroraStrength'] = .22 if phase in [1.2,3.3] else (.55 if phase == 2.3 else 1.0)
    obj.data.materials.append(material('Aurora | '+name, tint, phase))
    obj.shape_key_add(name='Basis')
    for key_name, offset in [('Flow A',0),('Flow B',2.1)]:
        key = obj.shape_key_add(name=key_name)
        for index, vert in enumerate(key.data):
            u = index//(nv+1)/nu; v = index%(nv+1)/nv
            vert.co.x += .04*math.sin(u*5+v+phase+offset)*v
            vert.co.y += .12*math.sin(u*5+v+phase+offset)
            vert.co.z += .025*math.sin(u*5+phase+offset)*(1-v)
        for frame, value in [(1,0),(121,1),(241,0),(361,.7),(481,0)]:
            key.value = value; key.keyframe_insert('value', frame=frame)
        key.value = 0
    if mesh.shape_keys.animation_data:
        for curve in mesh.shape_keys.animation_data.action.fcurves:
            for keyframe in curve.keyframe_points: keyframe.interpolation = 'BEZIER'
            curve.modifiers.new('CYCLES')
    curtains.append(obj)

camera_data = bpy.data.cameras.new('Aurora | gallery view')
camera = bpy.data.objects.new('Aurora | gallery view', camera_data); scene.collection.objects.link(camera)
camera.location = (0,-25,10)
camera.rotation_euler = (Vector((0,0,3.8))-camera.location).to_track_quat('-Z','Y').to_euler()
camera_data.type = 'ORTHO'; camera_data.ortho_scale = 26
scene.camera = camera
scene.frame_start = 1; scene.frame_end = 480; scene.render.fps = 30; scene.frame_set(1)
scene.use_nodes = True
nodes = scene.node_tree.nodes; nodes.clear()
render = nodes.new('CompositorNodeRLayers'); glow = nodes.new('CompositorNodeGlare'); composite = nodes.new('CompositorNodeComposite')
glow.glare_type = 'FOG_GLOW'; glow.quality = 'MEDIUM'; glow.threshold = .8
scene.node_tree.links.new(render.outputs['Image'], glow.inputs['Image']); scene.node_tree.links.new(glow.outputs['Image'], composite.inputs['Image'])

out = os.path.join(ROOT,'transition','images','assets','aurora-curtains.glb')
source = os.path.join(ROOT,'art','images-aurora','映相-立体极光.blend')
os.makedirs(os.path.dirname(source), exist_ok=True)
bpy.ops.object.select_all(action='DESELECT')
root.select_set(True)
for obj in curtains: obj.select_set(True)
bpy.context.view_layer.objects.active = root
# A simple receiver is used for glTF; the browser recreates the emissive transparent shader.
saved = []
receiver = bpy.data.materials.new('Aurora | export receiver'); receiver.use_nodes = True
for obj in curtains:
    saved.append((obj, list(obj.data.materials)))
    obj.data.materials.clear(); obj.data.materials.append(receiver)
bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', use_selection=True, use_active_scene=True,
    export_animations=False, export_morph=True, export_extras=True, export_cameras=False, export_lights=False)
for obj, materials in saved:
    obj.data.materials.clear()
    for mat in materials: obj.data.materials.append(mat)
bpy.data.libraries.write(source, {scene}, fake_user=True, compress=True)
print(json.dumps({'scene':scene.name,'curtains':len(curtains),'vertices':sum(len(o.data.vertices) for o in curtains),
    'glb':out,'bytes':os.path.getsize(out),'source':source}, ensure_ascii=False))
