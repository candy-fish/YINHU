"""Original broad-fin holographic fish, using the same studio as the deer."""
import bpy,bmesh,math,json,ast,os
from mathutils import Vector
ROOT=r'D:\VScode\BlackDoor'
scene=bpy.data.scenes['Images_Companions_Studio']
bpy.context.window.scene=scene
if bpy.data.objects.get('Fish_Companion_Rig'):raise RuntimeError('Refine the existing fish rather than replacing it.')
meshes=[]
jade=bpy.data.materials['Celadon limbs and neck trim']
gold=jade
source=open(os.path.join(ROOT,'art','images-companions','build_deer.py'),encoding='utf8').read()
tree=ast.parse(source)
for item in tree.body:
    if isinstance(item,ast.FunctionDef) and item.name in ['mesh_obj','catmull','loft','sphere','trace','material','skin']:
        exec(compile(ast.Module(body=[item],type_ignores=[]),'reused mesh helpers','exec'),globals())
pearl=material('Fish | celadon hologram receiver',(.55,.72,.58),.3,.35)
dark=bpy.data.materials['Obsidian eye']

def fin(name,root,rim,bone):
    boundary=catmull(rim,5)
    verts=[tuple(root)]
    verts.extend(tuple(Vector(p)+Vector((0,.015*math.sin(i*.8),0))) for i,p in enumerate(boundary))
    ob=mesh_obj(name,verts,[(0,i+1,i+2) for i in range(len(boundary)-1)],pearl)
    skin(ob,bone)
    return ob

body=loft('Fish | flowing scale surface',[(-.64,0,0),(-.40,0,.015),(-.12,0,.025),(.22,0,.015),(.53,0,.0),(.76,0,-.025),(.84,0,-.045)],[(.025,.025),(.080,.12),(.14,.22),(.155,.245),(.11,.18),(.06,.085),(.018,.02)],pearl,24,6)
skin(body,'fish-body')
for sign in [1,-1]:
    fin('Fish | flowing forked tail '+str(sign),(-.60,0,0),[(-.61,0,sign*.02),(-.80,0,sign*.20),(-1.12,0,sign*.42),(-1.02,0,sign*.17),(-.91,0,sign*.025),(-.66,0,0)],'fish-tail')
fin('Fish | tall dorsal sail',(-.1,0,.14),[(-.42,0,.10),(-.26,0,.43),(-.17,0,.61),(.04,0,.43),(.31,0,.22),(.44,0,.14)],'fish-dorsal')
for side,y in [('near',-.08),('far',.08)]:
    sign=-1 if y<0 else 1
    fin('Fish | silk pectoral fin '+side,(.32,y,-.075),[(.37,y,-.08),(.16,y+sign*.09,-.32),(-.15,y+sign*.16,-.58),(-.06,y+sign*.09,-.31),(.15,y,-.12)],'fish-fin-'+side)
for y in [-.093,.093]:
    skin(sphere('Fish | dark eye',(.62,y,.045),(.025,.009,.023),dark,16,10),'fish-body')
    skin(trace('Fish | gill arc',[(.39,y,.16),(.34,y*1.5,.07),(.36,y*1.5,-.08),(.43,y,-.14)],.004,pearl),'fish-body')
skin(trace('Fish | paired upper barbel',[(.80,-.04,-.02),(.92,-.07,-.01),(.98,-.06,.04)],.005,pearl),'fish-body')
skin(trace('Fish | paired lower barbel',[(.80,-.035,-.05),(.94,-.07,-.09),(.97,-.05,-.13)],.004,pearl),'fish-body')

data=bpy.data.armatures.new('Fish flexible rig')
arm=bpy.data.objects.new('Fish_Companion_Rig',data);scene.collection.objects.link(arm)
bpy.ops.object.select_all(action='DESELECT');bpy.context.view_layer.objects.active=arm;arm.select_set(True)
bpy.ops.object.mode_set(mode='EDIT')
definitions={'fish-body':((0,0,0),(.65,0,0),None),'fish-tail':((-.60,0,0),(-1.05,0,0),'fish-body'),'fish-dorsal':((-.10,0,.15),(-.12,0,.58),'fish-body'),'fish-fin-near':((.32,-.08,-.075),(-.10,-.24,-.50),'fish-body'),'fish-fin-far':((.32,.08,-.075),(-.10,.24,-.50),'fish-body')}
for name,(head,tail,parent) in definitions.items():
    bone=data.edit_bones.new(name);bone.head=head;bone.tail=tail
    if parent:bone.parent=data.edit_bones[parent]
bpy.ops.object.mode_set(mode='OBJECT')
for ob in meshes:
    ob.parent=arm
    mod=ob.modifiers.new('Fish skin','ARMATURE');mod.object=arm
    ob['images_companion']='fish'
arm.show_in_front=True
arm.location=(2.5,0,1.25)
arm.scale=(.65,.65,.65)
print(json.dumps({'fish_meshes':len(meshes),'vertices':sum(len(o.data.vertices) for o in meshes),'bones':len(definitions)}))
