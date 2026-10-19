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
from math import atan2, cos, degrees, pi, radians, sin

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


def deform(rig, bone):
    """The matrix that carries a point fixed to a bone from the rest pose to the current pose (world space)."""
    pb = rig.pose.bones[bone]
    return rig.matrix_world @ pb.matrix @ pb.bone.matrix_local.inverted() @ rig.matrix_world.inverted()


def tube(b, pts, radii, mat, n=4, up=Vector((0, 0, 1)), squash=1.0, caps=True):
    """A closed tube of n sides (4 or 6) along a polyline, its rings kept from twisting."""
    rings, u = [], None
    for k, c in enumerate(pts):
        t = (pts[1] - pts[0]) if k == 0 else (pts[-1] - pts[-2]) if k == len(pts) - 1 else (pts[k + 1] - pts[k - 1])
        t = t.normalized()
        base = up if u is None else u
        u = (base - base.dot(t) * t).normalized()
        w = t.cross(u)
        r = radii[k] if isinstance(radii, (list, tuple)) else radii
        rings.append([b.v(c + r * cos(radians(a)) * u + r * squash * sin(radians(a)) * w) for a in range(0, 360, 360 // n)])
    for i in range(len(rings) - 1):
        b.bridge(rings[i], rings[i + 1], mat)
    if caps:
        for r in (list(reversed(rings[0])), rings[-1]):
            if n == 4:
                b.face(tuple(r), mat)
            else:
                b.cap6(r, mat)
    return rings


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


def bake(name, col, pieces, sharp_angle=80, turn=0.0):
    """pieces: (object, part), part a number, 'body' (from its bones) or a function of the vertex's world position.
    turn: degrees about the vertical, so that the unit's aim ends up straight ahead. Returns one mesh object."""
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
            co = M @ v.co
            nv = bm.verts.new(co)
            nv[lay_part] = body_part(ob, v) if part == 'body' else part(co) if callable(part) else part
            nv[lay_wave] = 0.0
            vs.append(nv)
        for p in me.polygons:
            mname = me.materials[p.material_index].name if me.materials else 'tint'
            if mname not in mats:
                mats.append(mname)
            f = bm.faces.new([vs[i] for i in p.vertices])
            f.material_index = mats.index(mname)
        ev.to_mesh_clear()
    if turn:
        bmesh.ops.rotate(bm, verts=bm.verts[:], cent=(0, 0, 0), matrix=Matrix.Rotation(radians(turn), 3, 'Z'))
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


def hood(col, name):
    """A cloth hood in the power's colour: over the head and down the nape, the face left open."""
    b = sb.Builder(['tint'])
    rim = [b.v(p) for p in ((0, -0.212, 1.50), (0.168, -0.162, 1.36), (0.218, -0.02, 1.25), (0.172, 0.152, 1.17), (0, 0.202, 1.15))]
    L1 = [b.v(p) for p in ((0, -0.214, 1.565), (0.182, -0.152, 1.47), (0.23, 0.0, 1.40), (0.182, 0.167, 1.33), (0, 0.217, 1.30))]
    L2 = [b.v(p) for p in ((0, -0.158, 1.618), (0.138, -0.116, 1.598), (0.178, 0.0, 1.566), (0.142, 0.136, 1.546), (0, 0.178, 1.526))]
    b.bridge(rim, L1, 'tint', closed=False)
    b.bridge(L1, L2, 'tint', closed=False)
    b.half_cap(L2, (0, 0.01, 1.652), 'tint')
    ob = b.finish(name, col, [])
    m = ob.modifiers.new('Mirror', 'MIRROR')
    m.use_axis[0] = True; m.use_clip = True; m.use_mirror_merge = True; m.merge_threshold = 0.001
    s = ob.modifiers.new('Solidify', 'SOLIDIFY')                 # cloth with a little thickness: a closed piece
    s.thickness = 0.014; s.offset = -1; s.use_even_offset = True
    return ob


def quiver(col, name):
    """A leather quiver on the back, its mouth by the right shoulder, three fletchings showing."""
    b = sb.Builder(['leather', 'linen'])
    lo, hi = Vector((0.11, 0.205, 0.78)), Vector((-0.04, 0.215, 1.2))
    axis = (hi - lo).normalized()
    tube(b, [lo, hi], [0.05, 0.056], 'leather', n=6, up=Vector((0, 1, 0)))
    for k, off in enumerate((Vector((0.018, -0.012, 0)), Vector((-0.02, 0.0, 0)), Vector((0.0, 0.022, 0)))):
        base = hi + off + axis * 0.005
        tube(b, [base, base + axis * (0.075 + 0.012 * k)], 0.024, 'linen', n=4, up=Vector((0, 1, 0)), squash=0.22)
    return b.finish(name, col, [])


def build_arch():
    """Archer: turned side-on, bow arm straight out, the string drawn to the chin; hood and quiver.
    The whole figure is then turned so that the arrow points straight ahead."""
    rig, (body, skirt) = sb.build_base()
    col = sb.collection('Units')
    Z = Vector((0, 0, 1))
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.mode_set(mode='POSE')
    aim_dir = Vector((0.6, -0.8, 0.0))                 # the arrow's direction before the final turn (front-left)
    sb.rotate(rig, 'spine', Z, -25); sb.rotate(rig, 'chest', Z, -28)     # shoulders into the line of the shot
    sb.rotate(rig, 'neck', Z, 45); sb.rotate(rig, 'head', Z, 45)          # looking along the arrow
    sb.rotate(rig, 'thigh.L', Vector((0, 1, 0)), -6); sb.rotate(rig, 'thigh.R', Vector((0, 1, 0)), 6)   # feet apart
    right = Vector((aim_dir.y, -aim_dir.x, 0))
    A = (rig.matrix_world @ rig.pose.bones['head'].head) + Vector((0, 0, 0.04)) + 0.15 * aim_dir + 0.11 * right   # anchor, by the chin
    SL = rig.matrix_world @ rig.pose.bones['upper_arm.L'].head
    # the grip: on the arrow's line, at the straight left arm's reach (0.56 from the shoulder)
    lo, hi = 0.0, 1.5
    for _ in range(40):
        mid = (lo + hi) / 2
        if ((A + aim_dir * mid) - SL).length < 0.56:
            lo = mid
        else:
            hi = mid
    G = A + aim_dir * lo
    for bone in ('upper_arm.L', 'forearm.L', 'hand.L'):
        aim(rig, bone, G - SL)
    SR = rig.matrix_world @ rig.pose.bones['upper_arm.R'].head
    elbow_to = A - 0.28 * aim_dir + Vector((0, 0, -0.16))
    aim(rig, 'upper_arm.R', elbow_to - SR)
    EL = rig.matrix_world @ rig.pose.bones['forearm.R'].head
    aim(rig, 'forearm.R', A - EL)
    aim(rig, 'hand.R', aim_dir + Vector((0, 0, -0.2)))
    bpy.ops.object.mode_set(mode='OBJECT')

    # bow: a limb bent back toward the archer above and below the grip
    b = sb.Builder(['bow', 'linen', 'wood', 'steel', 'tint'])
    pts = [G + Vector((0, 0, 0.6 * t)) - aim_dir * 0.13 * t * t for t in [k / 4 - 1 for k in range(9)]]
    tube(b, pts, [0.012 + 0.006 * (1 - abs(k / 4 - 1)) for k in range(9)], 'bow', n=4, up=aim_dir, squash=1.8)
    bow = b.finish('arch_bow', col, [])
    # string, drawn from both tips to the archer's hand
    b = sb.Builder(['linen'])
    tube(b, [pts[-1], A], 0.0055, 'linen', n=4, up=aim_dir)
    tube(b, [A, pts[0]], 0.0055, 'linen', n=4, up=aim_dir)
    string = b.finish('arch_string', col, [])
    # arrow: shaft, iron head, fletching in the power's colour
    b = sb.Builder(['wood', 'steel', 'tint'])
    tail, head = A - aim_dir * 0.03, G + aim_dir * 0.17
    tube(b, [tail, head], 0.0085, 'wood', n=4, up=Z)
    base = [b.v(head + 0.022 * (cos(radians(a)) * Z + 0.35 * sin(radians(a)) * right)) for a in range(0, 360, 90)]
    tip = b.v(head + aim_dir * 0.07)
    b.face(tuple(reversed(base)), 'steel')
    for i in range(4):
        b.face((base[i], base[(i + 1) % 4], tip), 'steel')
    for up in (Z, right):
        tube(b, [tail + aim_dir * 0.02, tail + aim_dir * 0.1], 0.022, 'tint', n=4, up=up, squash=0.15)
    arrow = b.finish('arch_arrow', col, [])

    hd = hood(col, 'arch_hood'); hd.matrix_world = deform(rig, 'head')
    qv = quiver(col, 'arch_quiver'); qv.matrix_world = deform(rig, 'chest')
    near_hand = lambda co: 3 if (co - A).length < 0.03 else 0    # the string's middle follows the drawing hand
    pieces = [(body, 'body'), (skirt, 0), (hd, 0), (qv, 0), (bow, 0), (string, near_hand), (arrow, 3)]
    turn = degrees(-pi / 2 - atan2(aim_dir.y, aim_dir.x))
    unit = bake('arch', col, pieces, turn=turn)
    for ob, _ in pieces:
        ob.hide_set(True); ob.hide_render = True
    rig.hide_set(True)
    return unit


UNITS = {'spear': build_spear, 'arch': build_arch}

if __name__ == '__main__':
    for key in [a for a in sys.argv[1:] if a in UNITS] or list(UNITS):
        if bpy.app.background:                    # the bpy module: start from an empty file (never in the editor)
            bpy.ops.wm.read_factory_settings(use_empty=True)
        unit = UNITS[key]()
        print(f'{key}: {triangles(unit)} triangles -> {export(unit, key)}')
