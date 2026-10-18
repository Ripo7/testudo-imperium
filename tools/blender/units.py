# Testudo Imperium · close-up unit models, made from the base soldier (soldier_base.py) and exported for the game.
# The game shows these when the camera is close and its light procedural soldiers from afar (src/render/crowds.js).
#
#   python3 tools/blender/units.py spear          (with the bpy module: pip install bpy)
#   or in Blender: Scripting tab > Open > Run Script (builds every unit in the open file and exports them)
#
# Each unit: the base soldier posed with its skeleton, plus its gear, baked into one mesh and written to
# src/assets/units/<key>.glb. What the game reads from the file:
#   - one plain colour per material (no textures); the material `tint` takes the power's colour;
#   - `_part` per vertex: 1 and 2 the legs (they swing on the march), 3 the weapon arm and its weapon (it thrusts);
#   - `_wave` per vertex: how much cloth flutters (0 to 1);
#   - Blender metres, feet at 0, facing -Y (Blender's front view); the game scales by 0.2.
import os, sys
import bpy, bmesh
from mathutils import Vector, Matrix
from math import cos, sin, radians, degrees

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import soldier_base as sb  # noqa: E402

OUT = os.path.normpath(os.path.join(HERE, '..', '..', 'src', 'assets', 'units'))
LEGS = {'thigh.L': 1, 'shin.L': 1, 'foot.L': 1, 'thigh.R': 2, 'shin.R': 2, 'foot.R': 2}


def aim(rig, bone, direction):
    """Turn a pose bone about its head so that it points along a world direction."""
    pb = rig.pose.bones[bone]
    head, tail = rig.matrix_world @ pb.head, rig.matrix_world @ pb.tail
    q = (tail - head).normalized().rotation_difference(Vector(direction).normalized())
    R = Matrix.Translation(head) @ q.to_matrix().to_4x4() @ Matrix.Translation(-head)
    pb.matrix = rig.matrix_world.inverted() @ R @ rig.matrix_world @ pb.matrix
    bpy.context.view_layer.update()


def bone_point(rig, bone, k=0.5):
    pb = rig.pose.bones[bone]
    return rig.matrix_world @ (pb.head + (pb.tail - pb.head) * k)


# ---------- gear ----------
def helmet(col, name):
    """A rounded helmet over the base soldier's head, lower at the back to guard the neck."""
    b = sb.Builder(['steel'])
    rim = [b.v(p) for p in ((0, -0.215, 1.475), (0.16, -0.158, 1.46), (0.216, 0.0, 1.43), (0.166, 0.152, 1.40), (0, 0.208, 1.385))]
    M1 = b.half_ring(1.548, [(0, -0.18), (0.148, -0.138), (0.192, 0.0), (0.15, 0.142), (0, 0.178)])
    M2 = b.half_ring(1.625, [(0, -0.112), (0.09, -0.086), (0.12, 0.0), (0.09, 0.088), (0, 0.112)])
    b.bridge(rim, M1, 'steel', closed=False)
    b.bridge(M1, M2, 'steel', closed=False)
    b.half_cap(M2, (0, 0, 1.662), 'steel')
    b.half_cap(list(reversed(rim)), (0, 0, 1.44), 'steel')      # underside, inside the head
    ob = b.finish(name, col, [])
    m = ob.modifiers.new('Mirror', 'MIRROR')
    m.use_axis[0] = True; m.use_clip = True; m.use_mirror_merge = True; m.merge_threshold = 0.001
    return ob


def round_shield(col, name, centre, yaw=-10, radius=0.36, n=12):
    """A round shield with a central grip: bronze rim and boss, the face in the power's colour, a wooden back."""
    b = sb.Builder(['tint', 'bronze', 'wood'])

    def disc(r, y):
        return [b.v((r * cos(radians(90 + 360 * k / n)), y, r * sin(radians(90 + 360 * k / n)))) for k in range(n)]

    def cap(r, mat):                                             # an even ring closed with quads only
        k = 0
        inner = []
        while k + 3 <= len(r):
            b.face((r[k], r[k + 1], r[k + 2], r[(k + 3) % len(r)]), mat)
            inner.append(r[k]); k += 3
        b.face(tuple(inner), mat)
    rim_out, rim_in, boss, back = disc(radius, 0.0), disc(radius * 0.86, -0.014), disc(0.085, -0.05), disc(radius, 0.035)
    b.bridge(rim_out, rim_in, 'bronze')
    b.bridge(rim_in, boss, 'tint')
    cap(boss, 'bronze')
    b.bridge(back, rim_out, 'bronze')
    cap(list(reversed(back)), 'wood')
    bmesh.ops.transform(b.bm, matrix=Matrix.Translation(centre) @ Matrix.Rotation(radians(yaw), 4, 'Z'), verts=b.bm.verts[:])
    return b.finish(name, col, [])


def spear(col, name, at, length=3.05):
    """A spear held upright: a six-sided shaft and a leaf-shaped iron head."""
    b = sb.Builder(['wood', 'steel'])
    x, y = at

    def ring(z, rx, ry):
        return [b.v((x + rx * cos(radians(a)), y + ry * sin(radians(a)), z)) for a in range(0, 360, 60)]
    butt, top = ring(0.05, 0.028, 0.028), ring(0.05 + length, 0.028, 0.028)
    blade = ring(0.05 + length + 0.11, 0.07, 0.022)
    tip = b.v((x, y, 0.05 + length + 0.36))
    b.cap6(list(reversed(butt)), 'wood')
    b.bridge(butt, top, 'wood')
    b.bridge(top, blade, 'steel')
    for i in range(6):
        b.face((blade[i], blade[(i + 1) % 6], tip), 'steel')
    return b.finish(name, col, [])


# ---------- baking one unit into a single mesh for the game ----------
def body_part(ob, v):
    """The game part of a body vertex from its strongest bone: legs 1/2, the weapon arm (right forearm and hand) 3."""
    best, bw = None, 0.0
    for g in v.groups:
        if g.weight > bw:
            best, bw = ob.vertex_groups[g.group].name, g.weight
    if best in LEGS:
        return LEGS[best]
    if best in ('forearm.R', 'hand.R'):
        return 3
    return 0


def bake(name, col, pieces, sharp_angle=80):
    """pieces: (object, part) with part a number or 'body' (from its bones). Returns one mesh object."""
    old = bpy.data.objects.get(name)
    if old:
        bpy.data.objects.remove(old, do_unlink=True)
    dg = bpy.context.evaluated_depsgraph_get()
    bm = bmesh.new()
    lay_part = bm.verts.layers.float.new('_part')
    lay_wave = bm.verts.layers.float.new('_wave')
    mats = []
    for ob, part in pieces:
        ev = ob.evaluated_get(dg)
        me = ev.to_mesh(preserve_all_data_layers=True, depsgraph=dg)
        M = ob.matrix_world
        vs = []
        for v in me.vertices:
            nv = bm.verts.new(M @ v.co)
            nv[lay_part] = body_part(ob, v) if part == 'body' else part
            nv[lay_wave] = 0.0
            vs.append(nv)
        for p in me.polygons:
            mname = me.materials[p.material_index].name if me.materials else 'tint'
            if mname not in mats:
                mats.append(mname)
            f = bm.faces.new([vs[i] for i in p.vertices])
            f.material_index = mats.index(mname)
        ev.to_mesh_clear()
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    for e in bm.edges:
        e.smooth = not (len(e.link_faces) == 2 and degrees(e.calc_face_angle(0)) > sharp_angle)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    for m in mats:
        me.materials.append(sb.material(m))
    for p in me.polygons:
        p.use_smooth = True
    ob = bpy.data.objects.new(name, me)
    col.objects.link(ob)
    return ob


def export(ob, key):
    if not hasattr(bpy.ops.export_scene, 'gltf'):
        bpy.ops.preferences.addon_enable(module='io_scene_gltf2')
    os.makedirs(OUT, exist_ok=True)
    for o in bpy.context.view_layer.objects:
        o.select_set(False)
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob
    path = os.path.join(OUT, key + '.glb')
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True, export_attributes=True,
                              export_apply=True, export_yup=True, export_normals=True, export_texcoords=False,
                              export_materials='EXPORT', export_vertex_color='NONE', export_animations=False,
                              export_skins=False, export_morph=False, export_cameras=False, export_lights=False,
                              export_extras=False)
    return path


def triangles(ob):
    return sum(len(p.vertices) - 2 for p in ob.data.polygons)


# ---------- units ----------
def build_spear():
    """Spearman: spear upright in the right hand, round shield on the left, rounded helmet."""
    rig, (body, skirt) = sb.build_base()
    col = sb.collection('Units')
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.mode_set(mode='POSE')
    aim(rig, 'upper_arm.R', (-0.2, -0.14, -0.97))     # the soldier's right is -X
    aim(rig, 'forearm.R', (-0.04, -0.96, 0.26))
    aim(rig, 'hand.R', (-0.04, -0.96, 0.2))
    aim(rig, 'upper_arm.L', (0.24, -0.16, -0.96))
    aim(rig, 'forearm.L', (-0.3, -0.94, 0.14))
    aim(rig, 'hand.L', (-0.3, -0.94, 0.14))
    bpy.ops.object.mode_set(mode='OBJECT')
    rh, lh = bone_point(rig, 'hand.R', 0.45), bone_point(rig, 'hand.L', 0.5)
    pieces = [(body, 'body'), (skirt, 0),
              (helmet(col, 'spear_helmet'), 0),
              (round_shield(col, 'spear_shield', lh + Vector((0.02, -0.075, 0.03))), 0),
              (spear(col, 'spear_spear', (rh.x, rh.y)), 3)]
    unit = bake('spear', col, pieces)
    for ob, _ in pieces:
        ob.hide_set(True); ob.hide_render = True
    rig.hide_set(True)
    return unit


UNITS = {'spear': build_spear}

if __name__ == '__main__':
    for key in [a for a in sys.argv[1:] if a in UNITS] or list(UNITS):
        if bpy.app.background:                    # the bpy module: start from an empty file (never in the editor)
            bpy.ops.wm.read_factory_settings(use_empty=True)
        unit = UNITS[key]()
        print(f'{key}: {triangles(unit)} triangles -> {export(unit, key)}')
