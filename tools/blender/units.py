# Testudo Imperium · close-up unit models, made from the base soldier (soldier_base.py) and exported for the game.
# The game shows these when the camera is close and its light procedural soldiers from afar (src/render/crowds.js).
#
#   python3 tools/blender/units.py spear          (with the bpy module: pip install bpy)
#   or in Blender: Scripting tab > Open > Run Script (builds every unit in the open file and exports them)
#
# Each unit: the base soldier posed with its skeleton, plus its gear, baked into one mesh and written to
# src/assets/units/<key>.glb. What the game reads from the file:
#   - one plain colour per material (no textures); the material `tint` takes the power's colour;
#   - `_part` per vertex: 1 and 2 the legs (they swing on the march), 3 the weapon arm and its weapon (it thrusts),
#     4 a siege engine's throwing arm (it swings back and throws);
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
    """The matrix that carries a point fixed to a bone from the soldier's rest pose (its own coordinates, as the base
    soldier is built) to where the posed figure is in the world."""
    pb = rig.pose.bones[bone]
    return rig.matrix_world @ pb.matrix @ pb.bone.matrix_local.inverted()


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
    """pieces: (object, part[, wave]). part: a number, 'body' (from its bones), 'rider' (the same, legs kept still),
    'walker' (legs only, no weapon arm)
    or a function of the vertex's world position; wave (cloth flutter, 0 to 1): a number or such a function;
    post: a matrix applied after both (to mirror a posed figure, say).
    turn: degrees about the vertical, so that the unit's aim ends up straight ahead. Returns one mesh object."""
    old = bpy.data.objects.get(name)
    if old:
        bpy.data.objects.remove(old, do_unlink=True)
    dg = bpy.context.evaluated_depsgraph_get()
    bm = bmesh.new()
    lay_part = bm.verts.layers.float.new('_part')
    lay_wave = bm.verts.layers.float.new('_wave')
    mats = []
    for piece in pieces:
        ob, part, wave, post = (*piece, 0.0, None)[:4] if len(piece) == 2 else (*piece, None)[:4]
        ev = ob.evaluated_get(dg)
        me = ev.to_mesh(preserve_all_data_layers=True, depsgraph=dg)
        M = ob.matrix_world
        vs = []
        for v in me.vertices:
            co = M @ v.co
            nv = bm.verts.new(post @ co if post else co)
            if part in ('body', 'rider', 'walker'):
                nv[lay_part] = body_part(ob, v)
                if (part == 'rider' and nv[lay_part] in (1, 2)) or (part == 'walker' and nv[lay_part] == 3):
                    nv[lay_part] = 0
            else:
                nv[lay_part] = part(co) if callable(part) else part
            nv[lay_wave] = wave(co) if callable(wave) else wave
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


def hood(col, name, bands=('tint', 'tint', 'tint')):
    """A cloth hood in the power's colour: over the head and down the nape, the face left open.
    bands: the materials of its lower band, upper band and crown (stripes for an Egyptian headdress)."""
    b = sb.Builder(sorted(set(bands)))
    rim = [b.v(p) for p in ((0, -0.212, 1.50), (0.168, -0.162, 1.36), (0.218, -0.02, 1.25), (0.172, 0.152, 1.17), (0, 0.202, 1.15))]
    L1 = [b.v(p) for p in ((0, -0.214, 1.565), (0.182, -0.152, 1.47), (0.23, 0.0, 1.40), (0.182, 0.167, 1.33), (0, 0.217, 1.30))]
    L2 = [b.v(p) for p in ((0, -0.158, 1.618), (0.138, -0.116, 1.598), (0.178, 0.0, 1.566), (0.142, 0.136, 1.546), (0, 0.178, 1.526))]
    b.bridge(rim, L1, bands[0], closed=False)
    b.bridge(L1, L2, bands[1], closed=False)
    b.half_cap(L2, (0, 0.01, 1.652), bands[2])
    ob = b.finish(name, col, [])
    m = ob.modifiers.new('Mirror', 'MIRROR')
    m.use_axis[0] = True; m.use_clip = True; m.use_mirror_merge = True; m.merge_threshold = 0.001
    s = ob.modifiers.new('Solidify', 'SOLIDIFY')                 # cloth with a little thickness: a closed piece
    s.thickness = 0.014; s.offset = -1; s.use_even_offset = True
    return ob


def quiver(col, name, lo=Vector((0.11, 0.205, 0.78)), hi=Vector((-0.04, 0.215, 1.2))):
    """A leather quiver (by default on the back, its mouth by the right shoulder), three fletchings showing."""
    b = sb.Builder(['leather', 'linen'])
    axis = (hi - lo).normalized()
    tube(b, [lo, hi], [0.05, 0.056], 'leather', n=6, up=Vector((0, 1, 0)))
    for k, off in enumerate((Vector((0.018, -0.012, 0)), Vector((-0.02, 0.0, 0)), Vector((0.0, 0.022, 0)))):
        base = hi + off + axis * 0.005
        tube(b, [base, base + axis * (0.075 + 0.012 * k)], 0.024, 'linen', n=4, up=Vector((0, 1, 0)), squash=0.22)
    return b.finish(name, col, [])


def draw_bow_pose(rig, aim_dir):
    """Pose an archer (the rig in pose mode): turned side-on along aim_dir, bow arm straight out, the string drawn to
    the chin. Returns the anchor (the drawing hand, by the chin) and the grip."""
    Z = Vector((0, 0, 1))
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
    return A, G


def bow_pieces(col, prefix, A, G, aim_dir):
    """Bow, drawn string and nocked arrow for an archer posed by draw_bow_pose, as pieces for bake()."""
    Z = Vector((0, 0, 1))
    right = Vector((aim_dir.y, -aim_dir.x, 0))
    # bow: a limb bent back toward the archer above and below the grip
    b = sb.Builder(['bow', 'linen', 'wood', 'steel', 'tint'])
    pts = [G + Vector((0, 0, 0.6 * t)) - aim_dir * 0.13 * t * t for t in [k / 4 - 1 for k in range(9)]]
    tube(b, pts, [0.012 + 0.006 * (1 - abs(k / 4 - 1)) for k in range(9)], 'bow', n=4, up=aim_dir, squash=1.8)
    bow = b.finish(prefix + '_bow', col, [])
    # string, drawn from both tips to the archer's hand
    b = sb.Builder(['linen'])
    tube(b, [pts[-1], A], 0.0055, 'linen', n=4, up=aim_dir)
    tube(b, [A, pts[0]], 0.0055, 'linen', n=4, up=aim_dir)
    string = b.finish(prefix + '_string', col, [])
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
    arrow = b.finish(prefix + '_arrow', col, [])
    near_hand = lambda co: 3 if (co - A).length < 0.03 else 0    # the string's middle follows the drawing hand
    return [(bow, 0), (string, near_hand), (arrow, 3)]


def build_arch():
    """Archer: turned side-on, bow arm straight out, the string drawn to the chin; hood and quiver.
    The whole figure is then turned so that the arrow points straight ahead."""
    rig, (body, skirt) = sb.build_base()
    col = sb.collection('Units')
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.mode_set(mode='POSE')
    aim_dir = Vector((0.6, -0.8, 0.0))                 # the arrow's direction before the final turn (front-left)
    A, G = draw_bow_pose(rig, aim_dir)
    bpy.ops.object.mode_set(mode='OBJECT')
    bow, string, arrow = bow_pieces(col, 'arch', A, G, aim_dir)
    hd = hood(col, 'arch_hood'); hd.matrix_world = deform(rig, 'head')
    qv = quiver(col, 'arch_quiver'); qv.matrix_world = deform(rig, 'chest')
    pieces = [(body, 'body'), (skirt, 0), (hd, 0), (qv, 0), bow, string, arrow]
    turn = degrees(-pi / 2 - atan2(aim_dir.y, aim_dir.x))
    unit = bake('arch', col, pieces, turn=turn)
    for ob, *_ in pieces:
        ob.hide_set(True); ob.hide_render = True
    rig.hide_set(True)
    return unit


def horse_ring(b, c, t, w, ht, hb):
    """Half a cross-section of the horse (x >= 0): top, upper side, side, lower side, belly; t is the body's direction."""
    t = Vector(t).normalized()
    Z = Vector((0, 0, 1))
    u = (Z - Z.dot(t) * t).normalized()                         # the back (dorsal) side
    X = Vector((1, 0, 0))
    c = Vector(c)
    return [b.v(c + ht * u), b.v(c + 0.72 * w * X + 0.62 * ht * u), b.v(c + w * X - 0.05 * hb * u),
            b.v(c + 0.72 * w * X - 0.65 * hb * u), b.v(c - hb * u)]


def horse(col, name='horse_body'):
    """A horse facing -Y: body, neck and head as one mirrored piece (all quads), the mane along the neck, ears;
    the legs and the tail are separate pieces (see horse_legs, horse_tail)."""
    b = sb.Builder(['horse', 'horse_dark', 'dark'])
    R = [horse_ring(b, *spec) for spec in (
        ((0, 0.70, 1.00), (0, -1, 0), 0.10, 0.10, 0.13),          # rump end
        ((0, 0.62, 0.99), (0, -1, 0), 0.20, 0.17, 0.24),
        ((0, 0.42, 0.97), (0, -1, 0), 0.235, 0.20, 0.28),         # haunch
        ((0, 0.12, 0.93), (0, -1, 0), 0.24, 0.19, 0.30),          # barrel
        ((0, -0.20, 0.95), (0, -1, 0.1), 0.23, 0.20, 0.29),       # chest, withers
        ((0, -0.42, 1.06), (0, -0.8, 0.6), 0.18, 0.19, 0.22),     # base of the neck
        ((0, -0.56, 1.28), (0, -0.45, 0.89), 0.13, 0.13, 0.15),
        ((0, -0.66, 1.48), (0, -0.6, 0.8), 0.11, 0.105, 0.12),    # throat
        ((0, -0.80, 1.56), (0, -0.95, -0.3), 0.105, 0.09, 0.13),  # poll, forehead
        ((0, -0.91, 1.49), (0, -0.6, -0.8), 0.095, 0.08, 0.115),  # cheeks
        ((0, -1.01, 1.33), (0, -0.45, -0.89), 0.075, 0.065, 0.08),  # muzzle
    )]
    b.half_cap(list(reversed(R[0])), (0, 0.73, 1.0), 'horse')
    for i in range(len(R) - 1):
        mane = 'dark' if 4 <= i <= 7 else 'horse'
        b.bridge(R[i], R[i + 1], [mane, 'horse', 'horse', 'horse'], closed=False)
    b.half_cap(R[-1], (0, -1.05, 1.28), 'horse_dark')
    # ears, pricked up on the poll
    base = Vector((0.055, -0.77, 1.635))
    tube(b, [base, base + Vector((0.01, 0.01, 0.1))], [0.026, 0.008], 'horse', n=4, up=Vector((0, 1, 0)), squash=0.6)
    ob = b.finish(name, col, [])
    m = ob.modifiers.new('Mirror', 'MIRROR')
    m.use_axis[0] = True; m.use_clip = True; m.use_mirror_merge = True; m.merge_threshold = 0.001
    return ob


def horse_legs(col, name='horse_legs'):
    """Four legs tucked into the body: forelegs straight, hind legs with the hock bent back; dark lower legs, hooves."""
    b = sb.Builder(['horse', 'horse_dark', 'dark'])
    for sx in (1, -1):
        x = 0.13 * sx
        fore = [((x, -0.22, 0.95), 0.105), ((x, -0.24, 0.68), 0.08), ((x * 1.02, -0.24, 0.45), 0.055),
                ((x * 1.02, -0.23, 0.13), 0.043), ((x * 1.02, -0.25, 0.0), 0.056)]
        hind = [((x * 1.07, 0.42, 0.95), 0.125), ((x * 1.07, 0.47, 0.68), 0.095), ((x * 1.04, 0.53, 0.45), 0.058),
                ((x * 1.02, 0.47, 0.13), 0.043), ((x * 1.02, 0.46, 0.0), 0.056)]
        for leg in (fore, hind):
            pts = [Vector(p) for p, _ in leg]
            rings = []
            u = Vector((0, -1, 0))
            for k, (c, r) in enumerate(zip(pts, [r for _, r in leg])):
                t = ((pts[min(k + 1, 4)] - pts[max(k - 1, 0)])).normalized()
                uu = (u - u.dot(t) * t).normalized()
                w = t.cross(uu)
                rings.append([b.v(c + r * cos(radians(a)) * uu + r * sin(radians(a)) * w) for a in range(0, 360, 60)])
            b.bridge(rings[0], rings[1], 'horse')
            b.bridge(rings[1], rings[2], 'horse')
            b.bridge(rings[2], rings[3], 'horse_dark')
            b.bridge(rings[3], rings[4], 'dark')                 # hoof
            b.cap6(list(reversed(rings[0])), 'horse')
            b.cap6(rings[4], 'dark')
    return b.finish(name, col, [])


def horse_tail(col, name='horse_tail'):
    b = sb.Builder(['dark'])
    pts = [Vector(p) for p in ((0, 0.70, 1.04), (0, 0.79, 0.95), (0, 0.84, 0.76), (0, 0.83, 0.55))]
    tube(b, pts, [0.045, 0.06, 0.055, 0.02], 'dark', n=4, up=Vector((1, 0, 0)), squash=0.7)
    return b.finish(name, col, [])


def saddle_cloth(col, name='cav_cloth'):
    """A cloth in the power's colour over the horse's back, hanging down both flanks."""
    b = sb.Builder(['tint'])
    rows = [[b.v((x, y, z)) for x, z in ((0, 1.148), (0.185, 1.108), (0.258, 0.98), (0.262, 0.80))] for y in (-0.2, 0.02, 0.24)]
    b.bridge(rows[0], rows[1], 'tint', closed=False)
    b.bridge(rows[1], rows[2], 'tint', closed=False)
    ob = b.finish(name, col, [])
    m = ob.modifiers.new('Mirror', 'MIRROR')
    m.use_axis[0] = True; m.use_clip = True; m.use_mirror_merge = True; m.merge_threshold = 0.001
    s = ob.modifiers.new('Solidify', 'SOLIDIFY')
    s.thickness = 0.016; s.offset = 1; s.use_even_offset = True
    return ob


def crest(col, name):
    """A horsehair crest in the power's colour, front to back over the helmet."""
    b = sb.Builder(['tint'])
    pts = [Vector(p) for p in ((0, -0.15, 1.625), (0, -0.07, 1.705), (0, 0.05, 1.712), (0, 0.17, 1.64), (0, 0.23, 1.55))]
    tube(b, pts, [0.03, 0.045, 0.045, 0.035, 0.02], 'tint', n=4, up=Vector((0, 0, 1)), squash=0.3)
    return b.finish(name, col, [])


def lance(col, name, through, direction, back=0.9, ahead=2.1):
    b = sb.Builder(['wood', 'steel'])
    d = Vector(direction).normalized()
    side = d.cross(Vector((1, 0, 0))).normalized()
    butt, end = through - d * back, through + d * ahead
    tube(b, [butt, end], 0.026, 'wood', n=6, up=side)
    blade = [b.v(end + d * 0.1 + 0.055 * cos(radians(a)) * side + 0.018 * sin(radians(a)) * d.cross(side)) for a in range(0, 360, 60)]
    ring = [b.v(end + 0.026 * cos(radians(a)) * side + 0.026 * sin(radians(a)) * d.cross(side)) for a in range(0, 360, 60)]
    b.bridge(ring, blade, 'steel')
    tip = b.v(end + d * 0.32)
    for i in range(6):
        b.face((blade[i], blade[(i + 1) % 6], tip), 'steel')
    return b.finish(name, col, [])


def build_cav():
    """Cavalryman: the base soldier seated on a horse, lance in the right hand, round shield on the left arm,
    crested helmet; a saddle cloth in the power's colour."""
    col = sb.collection('Units')
    hb, legs, tail, cloth = horse(col), horse_legs(col), horse_tail(col), saddle_cloth(col)
    rig, (body, skirt) = sb.build_base()
    rig.location = (0, 0.0, 0.6)                          # into the saddle
    bpy.context.view_layer.update()
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.mode_set(mode='POSE')
    for s, k in (('L', 1), ('R', -1)):
        aim(rig, 'thigh.' + s, (0.65 * k, -0.55, -0.52))   # astride the barrel
        aim(rig, 'shin.' + s, (0.1 * k, 0.25, -0.96))      # down the flanks
        aim(rig, 'foot.' + s, (0.05 * k, -0.95, -0.3))
    aim(rig, 'upper_arm.R', (-0.2, -0.3, -0.93))
    aim(rig, 'forearm.R', (-0.05, -0.85, 0.5))
    aim(rig, 'hand.R', (-0.05, -0.8, 0.6))
    aim(rig, 'upper_arm.L', (0.25, -0.15, -0.95))
    aim(rig, 'forearm.L', (0.05, -0.95, 0.25))
    aim(rig, 'hand.L', (0.05, -0.95, 0.25))
    bpy.ops.object.mode_set(mode='OBJECT')
    hand_r = bone_point(rig, 'hand.R', 0.45)
    arm_l = bone_point(rig, 'forearm.L', 0.55)
    hm = helmet(col, 'cav_helmet'); hm.matrix_world = deform(rig, 'head')
    cr = crest(col, 'cav_crest'); cr.matrix_world = deform(rig, 'head')
    sh = round_shield(col, 'cav_shield', arm_l + Vector((0.075, 0.0, 0.02)), yaw=64, radius=0.27, n=10)
    ln = lance(col, 'cav_lance', hand_r, (-0.05, -0.7, 0.71))
    gait = lambda co: 1 if (co.x > 0) == (co.y < 0) else 2      # diagonal pairs swing together
    flutter = lambda co: max(0.0, min(1.0, (1.0 - co.z) / 0.45)) * 0.8
    pieces = [(hb, 0), (legs, gait), (tail, 0, flutter), (cloth, 0), (body, 'rider'), (skirt, 0), (hm, 0), (cr, 0),
              (sh, 0), (ln, 3)]
    unit = bake('cav', col, pieces)
    for ob, *_ in pieces:
        ob.hide_set(True); ob.hide_render = True
    rig.hide_set(True)
    return unit


def beam(b, p0, p1, hw, hh, mat, up=Vector((0, 0, 1))):
    """A squared timber from p0 to p1, hw wide and hh high (half sizes), its faces square to `up`."""
    p0, p1 = Vector(p0), Vector(p1)
    t = (p1 - p0).normalized()
    u = Vector(up)
    if abs(u.dot(t)) > 0.99:
        u = Vector((0, 1, 0))
    u = (u - u.dot(t) * t).normalized()
    w = t.cross(u)
    corners = [(1, 1), (-1, 1), (-1, -1), (1, -1)]
    r0 = [b.v(p0 + hw * sx * w + hh * sy * u) for sx, sy in corners]
    r1 = [b.v(p1 + hw * sx * w + hh * sy * u) for sx, sy in corners]
    b.bridge(r0, r1, mat)
    b.face(tuple(reversed(r0)), mat)
    b.face(tuple(r1), mat)


def wheel(b, c, r, thick, n=12):
    """A solid wheel turning about X: wooden faces, an iron tyre, a hub."""
    c = Vector(c)
    def ring(x):
        return [b.v(c + Vector((x, r * cos(radians(360 * k / n)), r * sin(radians(360 * k / n))))) for k in range(n)]
    inner, outer = ring(-thick / 2), ring(thick / 2)
    b.bridge(inner, outer, 'dark')                               # tyre
    for face_ring in (list(reversed(inner)), outer):              # a 12-sided face in five quads
        for k in (0, 3, 6, 9):
            b.face((face_ring[k], face_ring[k + 1], face_ring[k + 2], face_ring[(k + 3) % n]), 'wood')
        b.face((face_ring[0], face_ring[3], face_ring[6], face_ring[9]), 'wood')
    side = 1 if c.x > 0 else -1
    beam(b, c, c + Vector((side * (thick / 2 + 0.05), 0, 0)), 0.045, 0.045, 'steel')   # hub


def quad_sphere(b, c, r, mat):
    """A round stone made of 24 quads (a cube's faces split in four, pushed out to a sphere)."""
    c = Vector(c)
    vs = {}
    def v(key):
        if key not in vs:
            vs[key] = b.v(c + r * Vector(key).normalized())
        return vs[key]
    for axis in range(3):
        for sgn in (-1, 1):
            a1, a2 = [i for i in range(3) if i != axis]
            for i in (-1, 0):
                for j in (-1, 0):
                    quad = []
                    for di, dj in ((0, 0), (1, 0), (1, 1), (0, 1)):
                        key = [0, 0, 0]
                        key[axis] = sgn; key[a1] = i + di; key[a2] = j + dj
                        quad.append(v(tuple(key)))
                    b.face(quad if sgn > 0 else list(reversed(quad)), mat)


def pennant(b, top, length=0.5, height=0.3, segs=4):
    """A flag in the power's colour off the pole at `top`, along +X; returns its vertices with their distance out."""
    out = []
    cols = []
    for k in range(segs + 1):
        x = length * k / segs
        col_v = [b.v(Vector(top) + Vector((x, dy, dz))) for dz, dy in ((0, -0.008), (0, 0.008), (-height, 0.008), (-height, -0.008))]
        cols.append(col_v)
        out += [(v, k / segs) for v in col_v]
    for k in range(segs):
        b.bridge(cols[k], cols[k + 1], 'tint')
    b.face(tuple(reversed(cols[0])), 'tint')
    b.face(tuple(cols[-1]), 'tint')
    return out


def build_siege():
    """Siege engine: an onager on four wheels, its arm up with a stone in the cup, a pennant in the power's colour,
    and a crewman pushing from behind. The arm swings in a fight (part 4); the crewman's legs walk."""
    col = sb.collection('Units')
    b = sb.Builder(['wood', 'dark', 'steel', 'rope', 'leather', 'tint'])
    X, Z = Vector((1, 0, 0)), Vector((0, 0, 1))
    for sx in (1, -1):
        beam(b, (0.32 * sx, -0.95, 0.4), (0.32 * sx, 0.95, 0.4), 0.06, 0.07, 'wood')              # side beams
        wheel(b, (0.44 * sx, -0.62, 0.27), 0.27, 0.08)
        wheel(b, (0.44 * sx, 0.62, 0.27), 0.27, 0.08)
        beam(b, (0.3 * sx, -0.2, 0.46), (0.3 * sx, -0.2, 1.3), 0.05, 0.05, 'wood', up=Vector((0, 1, 0)))   # uprights
        beam(b, (0.3 * sx, 0.1, 0.45), (0.3 * sx, -0.18, 1.0), 0.035, 0.035, 'wood', up=X)               # braces
        beam(b, (0.32 * sx, 0.95, 0.42), (0.3 * sx, 1.2, 0.8), 0.035, 0.035, 'wood', up=X)               # push handles
    for y in (-0.88, 0.88):
        beam(b, (-0.36, y, 0.4), (0.36, y, 0.4), 0.06, 0.06, 'wood', up=Vector((0, 1, 0)))              # cross beams
    for y in (-0.62, 0.62):
        beam(b, (-0.5, y, 0.27), (0.5, y, 0.27), 0.035, 0.035, 'steel', up=Vector((0, 1, 0)))           # axles
    beam(b, (-0.36, -0.2, 1.3), (0.36, -0.2, 1.3), 0.06, 0.06, 'wood', up=Vector((0, 1, 0)))             # buffer beam
    beam(b, (-0.2, -0.13, 1.27), (0.2, -0.13, 1.27), 0.05, 0.06, 'leather', up=Vector((0, 1, 0)))       # its cushion
    tube(b, [Vector((-0.27, 0.25, 0.47)), Vector((0.27, 0.25, 0.47))], 0.11, 'rope', n=6, up=Z)          # torsion skein
    tube(b, [Vector((-0.3, 0.8, 0.55)), Vector((0.3, 0.8, 0.55))], 0.06, 'wood', n=6, up=Z)              # winch
    for sx in (1, -1):
        beam(b, (0.33 * sx, 0.8, 0.55), (0.33 * sx, 0.8, 0.75), 0.025, 0.025, 'wood', up=Vector((0, 1, 0)))
    tube(b, [Vector((0.34, 0.92, 0.45)), Vector((0.34, 0.92, 2.05))], 0.022, 'wood', n=4, up=Vector((0, 1, 0)))   # pennant pole
    flag_wave = {tuple(round(c, 4) for c in v.co): w for v, w in pennant(b, (0.36, 0.92, 2.0))}
    frame = b.finish('siege_frame', col, [])

    # the throwing arm, standing up from the skein, a cup and a stone at its top
    b = sb.Builder(['wood', 'rope', 'steel'])
    top = Vector((0, 0.42, 1.72))
    beam(b, (0, 0.25, 0.42), top, 0.045, 0.055, 'wood', up=Vector((0, -1, 0)))
    tube(b, [top + Vector((0, -0.05, -0.02)), top + Vector((0, -0.05, 0.06))], 0.11, 'rope', n=6, up=Vector((0, 1, 0)))   # sling cup
    quad_sphere(b, top + Vector((0, -0.05, 0.15)), 0.1, 'steel')
    arm = b.finish('siege_arm', col, [])

    rig, (body, skirt) = sb.build_base()                     # the crewman, pushing at the handles
    rig.location = (0, 1.82, 0)
    bpy.context.view_layer.update()
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.mode_set(mode='POSE')
    sb.rotate(rig, 'spine', X, 14); sb.rotate(rig, 'chest', X, 12)                # leaning into it
    aim(rig, 'thigh.L', (0.04, -0.3, -0.95)); aim(rig, 'shin.L', (0.0, 0.08, -1))
    aim(rig, 'thigh.R', (-0.04, 0.42, -0.9)); aim(rig, 'shin.R', (0.0, 0.62, -0.78)); aim(rig, 'foot.R', (0, -0.6, -0.8))
    for s, k in (('L', 1), ('R', -1)):
        handle = Vector((0.3 * k, 1.2, 0.8))
        sh = rig.matrix_world @ rig.pose.bones['upper_arm.' + s].head
        aim(rig, 'upper_arm.' + s, (handle - sh) + Vector((0, 0, -0.08)))
        el = rig.matrix_world @ rig.pose.bones['forearm.' + s].head
        aim(rig, 'forearm.' + s, handle - el)
        aim(rig, 'hand.' + s, handle - el)
    bpy.ops.object.mode_set(mode='OBJECT')
    pieces = [(frame, 0, lambda co: flag_wave.get(tuple(round(c, 4) for c in co), 0.0)), (arm, 4),
              (body, 'walker'), (skirt, 0)]
    unit = bake('siege', col, pieces)
    for ob, *_ in pieces:
        ob.hide_set(True); ob.hide_render = True
    rig.hide_set(True)
    return unit


def scutum(col, name, centre, width=0.68, height=0.95, radius=0.75, flat=False, cols=5):
    """The legionary's curved shield: its face in the power's colour between two bronze bands, a bronze rim and boss,
    a leather back. Built facing -Y (curving round the bearer); flat=True lays it face up, for the testudo's roof."""
    b = sb.Builder(['tint', 'bronze', 'leather'])
    half = width / 2 / radius
    zs = (-height / 2, -height / 2 + 0.07, height / 2 - 0.07, height / 2)

    def surface(r):
        return [[b.v((r * sin(-half + 2 * half * c / cols), radius - r * cos(-half + 2 * half * c / cols), z))
                 for c in range(cols + 1)] for z in zs]
    front, back = surface(radius), surface(radius - 0.035)
    for row in range(3):
        mat = 'tint' if row == 1 else 'bronze'
        for c in range(cols):
            b.face((front[row][c], front[row][c + 1], front[row + 1][c + 1], front[row + 1][c]), mat)
            b.face((back[row][c + 1], back[row][c], back[row + 1][c], back[row + 1][c + 1]), 'leather')
    for c in range(cols):                                          # rims, top and bottom
        b.face((front[0][c + 1], front[0][c], back[0][c], back[0][c + 1]), 'bronze')
        b.face((front[3][c], front[3][c + 1], back[3][c + 1], back[3][c]), 'bronze')
    for row in range(3):                                           # rims, the two sides
        b.face((front[row + 1][0], front[row][0], back[row][0], back[row + 1][0]), 'bronze')
        b.face((front[row][cols], front[row + 1][cols], back[row + 1][cols], back[row][cols]), 'bronze')
    beam(b, (0, 0.01, 0), (0, -0.06, 0), 0.075, 0.075, 'bronze', up=Vector((0, 0, 1)))   # boss
    M = Matrix.Translation(centre)
    if flat:
        M = M @ Matrix.Rotation(radians(-90), 4, 'X')
    bmesh.ops.transform(b.bm, matrix=M, verts=b.bm.verts[:])
    return b.finish(name, col, [])


def pilum(col, name, at, z0=0.05):
    """The legionary's javelin, upright: wooden shaft, bronze weight, long iron shank, pyramid point."""
    b = sb.Builder(['wood', 'bronze', 'steel'])
    x, y = at
    Y = Vector((0, 1, 0))
    tube(b, [Vector((x, y, z0)), Vector((x, y, z0 + 1.55))], 0.026, 'wood', n=6, up=Y)
    beam(b, (x, y, z0 + 1.52), (x, y, z0 + 1.62), 0.038, 0.038, 'bronze', up=Y)
    tube(b, [Vector((x, y, z0 + 1.6)), Vector((x, y, z0 + 2.2))], 0.011, 'steel', n=4, up=Y)
    base = [b.v((x + 0.022 * cos(radians(a + 45)), y + 0.022 * sin(radians(a + 45)), z0 + 2.2)) for a in range(0, 360, 90)]
    tip = b.v((x, y, z0 + 2.34))
    b.face(tuple(reversed(base)), 'steel')
    for i in range(4):
        b.face((base[i], base[(i + 1) % 4], tip), 'steel')
    return b.finish(name, col, [])


def cheek_guards(col, name):
    b = sb.Builder(['steel'])
    for sx in (1, -1):
        beam(b, (0.172 * sx, -0.075, 1.455), (0.158 * sx, -0.105, 1.3), 0.012, 0.042, 'steel', up=Vector((0, -1, 0)))
    return b.finish(name, col, [])


def legionary(testudo):
    rig, (body, skirt) = sb.build_base(armour=True)
    col = sb.collection('Units')
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.mode_set(mode='POSE')
    if testudo:                                          # the roof shield up in the left hand, a wall shield in the right
        aim(rig, 'upper_arm.L', (0.12, -0.05, 0.99)); aim(rig, 'forearm.L', (-0.12, 0.0, 0.99)); aim(rig, 'hand.L', (-0.12, 0.0, 0.99))
        aim(rig, 'upper_arm.R', (-0.15, -0.2, -0.97)); aim(rig, 'forearm.R', (0.25, -0.95, 0.1)); aim(rig, 'hand.R', (0.25, -0.95, 0.1))
    else:                                                # pilum upright in the right hand, scutum before him on the left
        aim(rig, 'upper_arm.R', (-0.2, -0.14, -0.97)); aim(rig, 'forearm.R', (-0.04, -0.96, 0.26)); aim(rig, 'hand.R', (-0.04, -0.96, 0.2))
        aim(rig, 'upper_arm.L', (0.24, -0.16, -0.96)); aim(rig, 'forearm.L', (-0.3, -0.94, 0.14)); aim(rig, 'hand.L', (-0.3, -0.94, 0.14))
    bpy.ops.object.mode_set(mode='OBJECT')
    head = deform(rig, 'head')
    hm = helmet(col, 'leg_helmet'); hm.matrix_world = head
    ch = cheek_guards(col, 'leg_cheeks'); ch.matrix_world = head
    pieces = [(body, 'walker' if testudo else 'body'), (skirt, 0), (hm, 0), (ch, 0)]
    if testudo:
        rh = bone_point(rig, 'hand.R', 0.5)
        pieces += [(scutum(col, 'legT_roof', Vector((0, -0.05, 1.71)), width=0.82, height=1.09, flat=True), 0),
                   (scutum(col, 'legT_wall', Vector((0.0, rh.y - 0.12, 0.84))), 0)]
    else:
        cr = crest(col, 'leg_crest'); cr.matrix_world = head
        lh, rh = bone_point(rig, 'hand.L', 0.5), bone_point(rig, 'hand.R', 0.45)
        pieces += [(cr, 0), (scutum(col, 'leg_scutum', Vector((lh.x - 0.02, lh.y - 0.075, 0.84))), 0),
                   (pilum(col, 'leg_pilum', (rh.x, rh.y)), 3)]
    unit = bake('legT' if testudo else 'leg', col, pieces)
    for ob, *_ in pieces:
        ob.hide_set(True); ob.hide_render = True
    rig.hide_set(True)
    return unit


def build_leg():
    """Legionary: segmented cuirass, crested helmet with cheek guards, curved scutum, pilum."""
    return legionary(False)


def build_legT():
    """Legionary in testudo: the scutum raised overhead to roof the formation, a second one as its wall."""
    return legionary(True)


def spoked_wheel(b, c, r, n=12, spokes=6):
    """A chariot wheel turning about X: a rim of n segments, a hub, spokes."""
    c = Vector(c)
    X = Vector((1, 0, 0))
    rings = []
    for k in range(n):
        a = radians(360 * k / n)
        radial = Vector((0, cos(a), sin(a)))
        p = c + r * radial
        rings.append([b.v(p + 0.03 * cos(radians(q)) * radial + 0.03 * sin(radians(q)) * X) for q in (45, 135, 225, 315)])
    for k in range(n):
        b.bridge(rings[k], rings[(k + 1) % n], 'wood')
    beam(b, c - X * 0.07, c + X * 0.07, 0.05, 0.05, 'gold')      # hub
    for k in range(spokes // 2):
        a = radians(180 * k / (spokes // 2))
        d = Vector((0, cos(a), sin(a)))
        beam(b, c - d * (r - 0.02), c + d * (r - 0.02), 0.014, 0.014, 'wood', up=X)


def nemes(col, name):
    """The striped royal headdress of Egypt's chariot crews: blue and gold bands over the head and nape."""
    return hood(col, name, bands=('nemes', 'gold', 'nemes'))


def build_char():
    """Chariot (Egypt): two horses under a yoke, a car in the power's colour with gold rails on two six-spoke wheels,
    a driver in white linen at the reins and an archer shooting out to the right; both in the striped headdress."""
    col = sb.collection('Units')
    S = 0.82                                             # the team's horses are a little smaller than a cavalry horse
    pieces = []
    for k, x in enumerate((0.27, -0.27)):
        M = Matrix.Translation((x, -0.95, 0)) @ Matrix.Scale(S, 4)
        hb, legs, tail = horse(col, f'char_horse{k}'), horse_legs(col, f'char_legs{k}'), horse_tail(col, f'char_tail{k}')
        cloth = saddle_cloth(col, f'char_cloth{k}')
        b = sb.Builder(['tint'])                          # a plume on the poll
        tube(b, [Vector(p) for p in ((0, -0.79, 1.64), (0, -0.76, 1.8), (0, -0.7, 1.92))], [0.03, 0.05, 0.03], 'tint', n=4, up=Vector((1, 0, 0)), squash=0.5)
        plume = b.finish(f'char_plume{k}', col, [])
        for ob in (hb, legs, tail, cloth, plume):
            ob.matrix_world = M
        cy = -0.95 + 0.1 * S
        gait = lambda co, x=x, cy=cy: 1 if (co.x > x) == (co.y < cy) else 2
        flutter = lambda co: max(0.0, min(1.0, (S - co.z) / (0.45 * S))) * 0.8
        pieces += [(hb, 0), (legs, gait), (tail, 0, flutter), (cloth, 0), (plume, 0, lambda co: max(0.0, min(1.0, (co.z - 1.38) / 0.2)) * 0.6)]

    # the car, the wheels, axle, pole and yoke
    b = sb.Builder(['tint', 'gold', 'wood', 'dark'])
    Y, Z = Vector((0, 1, 0)), Vector((0, 0, 1))
    beam(b, (-0.42, 0.38, 0.555), (0.42, 0.38, 0.555), 0.28, 0.025, 'wood')                 # floor
    beam(b, (-0.42, 0.12, 0.79), (0.42, 0.12, 0.79), 0.02, 0.21, 'tint')                    # front, painted
    beam(b, (-0.44, 0.12, 1.0), (0.44, 0.12, 1.0), 0.03, 0.025, 'gold', up=Z)               # front rail
    beam(b, (-0.42, 0.115, 0.76), (0.42, 0.115, 0.76), 0.024, 0.02, 'gold', up=Z)           # a gold band across it
    for sx in (1, -1):
        beam(b, (0.42 * sx, 0.12, 0.74), (0.42 * sx, 0.56, 0.74), 0.02, 0.16, 'tint', up=Z)  # sides
        beam(b, (0.42 * sx, 0.12, 0.9), (0.42 * sx, 0.58, 0.9), 0.025, 0.022, 'gold', up=Z)  # side rails
        spoked_wheel(b, (0.54 * sx, 0.45, 0.38), 0.36)
    beam(b, (-0.64, 0.45, 0.38), (0.64, 0.45, 0.38), 0.03, 0.03, 'dark', up=Y)              # axle
    beam(b, (0, 0.2, 0.53), (0, -1.12, 0.93), 0.03, 0.03, 'wood', up=Z)                      # pole
    beam(b, (-0.47, -1.12, 0.96), (0.47, -1.12, 0.96), 0.035, 0.035, 'wood', up=Z)          # yoke
    car = b.finish('char_car', col, [])
    pieces.append((car, 0))

    # the driver, at the reins, in white linen
    rig, (body, skirt) = sb.build_base()
    for ob in (rig, body, skirt):                        # renamed, so that building the archer's body keeps them
        ob.name = ob.name + '_driver'
    for ob in (body, skirt):
        for i, m in enumerate(ob.data.materials):
            if m.name == 'tint':
                ob.data.materials[i] = sb.material('linen')
    rig.location = (0.2, 0.36, 0.58)
    bpy.context.view_layer.update()
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.mode_set(mode='POSE')
    hands = {}
    for s_, k in (('L', 1), ('R', -1)):
        hold = Vector((0.2 + 0.12 * k, 0.06, 1.26))
        sh = rig.matrix_world @ rig.pose.bones['upper_arm.' + s_].head
        aim(rig, 'upper_arm.' + s_, (hold - sh) + Vector((0.05 * k, 0.12, -0.25)))
        el = rig.matrix_world @ rig.pose.bones['forearm.' + s_].head
        aim(rig, 'forearm.' + s_, hold - el)
        aim(rig, 'hand.' + s_, hold - el)
        hands[s_] = bone_point(rig, 'hand.' + s_, 0.5)
    bpy.ops.object.mode_set(mode='OBJECT')
    hd = nemes(col, 'char_driver_nemes'); hd.matrix_world = deform(rig, 'head')
    pieces += [(body, 0), (skirt, 0), (hd, 0)]
    # reins, from each horse's mouth to a hand
    b = sb.Builder(['leather'])
    for x, s_ in ((0.27, 'L'), (-0.27, 'R')):
        mouth = Vector((x, -0.95 - 1.0 * S, 1.33 * S))
        tube(b, [mouth, hands[s_]], 0.007, 'leather', n=4, up=Z)
    reins = b.finish('char_reins', col, [])
    pieces.append((reins, 0))

    # the archer: posed on the left and drawing to the front-left, then mirrored to stand on the right and shoot
    # out to that side (so he is drawn left-handed); his legs stay still in the car
    rig2, (body2, skirt2) = sb.build_base()
    rig2.location = (0.2, 0.42, 0.58)
    bpy.context.view_layer.update()
    bpy.context.view_layer.objects.active = rig2
    bpy.ops.object.mode_set(mode='POSE')
    aim_dir = Vector((0.6, -0.8, 0.0))
    A, G = draw_bow_pose(rig2, aim_dir)
    bpy.ops.object.mode_set(mode='OBJECT')
    mirror = Matrix.Scale(-1, 4, (1, 0, 0))
    hd2 = nemes(col, 'char_archer_nemes'); hd2.matrix_world = deform(rig2, 'head')
    qv = quiver(col, 'char_quiver', lo=Vector((0.47, 0.5, 0.62)), hi=Vector((0.5, 0.3, 1.05)))    # on the car's side
    archer = [(body2, 'rider'), (skirt2, 0), (hd2, 0), (qv, 0)] + bow_pieces(col, 'char', A, G, aim_dir)
    pieces += [(ob, part, *rest, mirror) if rest else (ob, part, 0.0, mirror) for ob, part, *rest in archer]

    unit = bake('char', col, pieces)
    for ob, *_ in pieces:
        ob.hide_set(True); ob.hide_render = True
    rig.hide_set(True); rig2.hide_set(True)
    return unit


def flap(b, c, ry, rz, thick, mat, yaw=0.0, n=10, rim=None):
    """A flat oval plate in the YZ plane (an elephant's ear), turned by yaw degrees about Z; rim: its edge's material.
    Returns its edge vertices."""
    c = Vector(c)
    R = Matrix.Rotation(radians(yaw), 3, 'Z')
    def ring(x):
        return [b.v(c + R @ Vector((x, ry * cos(radians(360 * k / n)), rz * sin(radians(360 * k / n))))) for k in range(n)]
    inner, outer = ring(-thick / 2), ring(thick / 2)
    b.bridge(inner, outer, rim or mat)
    for face_ring in (list(reversed(inner)), outer):
        if n == 10:
            for k in (0, 3, 6):
                b.face((face_ring[k], face_ring[k + 1], face_ring[k + 2], face_ring[k + 3]), mat)
            b.face((face_ring[9], face_ring[0], face_ring[3], face_ring[6]), mat)
        else:                                                    # any even n: a ladder of quads across the plate
            for i in range(n // 2 - 1):
                b.face((face_ring[i], face_ring[i + 1], face_ring[n - 2 - i], face_ring[(n - 1 - i) % n]), mat)
    return inner + outer


def elephant(col):
    """A war elephant facing -Y: body, neck and head as one mirrored piece (all quads), eyes; legs, ears, trunk,
    tusks and tail as their own pieces. Returns (body, legs, ears, trunk, tusks, tail)."""
    b = sb.Builder(['ele', 'dark'])
    R = [horse_ring(b, *spec) for spec in (
        ((0, 1.02, 1.30), (0, -1, 0), 0.20, 0.22, 0.24),           # rump end
        ((0, 0.88, 1.32), (0, -1, 0), 0.40, 0.42, 0.42),
        ((0, 0.55, 1.33), (0, -1, 0), 0.50, 0.52, 0.50),           # haunches
        ((0, 0.10, 1.33), (0, -1, 0), 0.52, 0.55, 0.52),           # barrel
        ((0, -0.35, 1.36), (0, -1, 0.05), 0.50, 0.56, 0.50),       # shoulders
        ((0, -0.62, 1.45), (0, -1, 0.2), 0.38, 0.44, 0.42),        # neck
        ((0, -0.85, 1.62), (0, -1, 0.0), 0.36, 0.40, 0.42),        # the dome of the head
        ((0, -1.05, 1.55), (0, -0.85, -0.5), 0.28, 0.30, 0.32),    # forehead, face
    )]
    b.half_cap(list(reversed(R[0])), (0, 1.06, 1.3), 'ele')
    for i in range(len(R) - 1):
        b.bridge(R[i], R[i + 1], 'ele', closed=False)
    b.half_cap(R[-1], (0, -1.16, 1.42), 'ele')
    beam(b, (0.255, -1.0, 1.66), (0.27, -0.96, 1.66), 0.02, 0.03, 'dark', up=Vector((0, 0, 1)))   # eye
    body = b.finish('ele_body', col, [])
    m = body.modifiers.new('Mirror', 'MIRROR')
    m.use_axis[0] = True; m.use_clip = True; m.use_mirror_merge = True; m.merge_threshold = 0.001

    b = sb.Builder(['ele_dark'])
    for x in (0.3, -0.3):
        for y in (-0.45, 0.6):
            pts = [Vector((x, y, z)) for z in (1.2, 0.6, 0.25, 0.06, 0.0)]
            tube(b, pts, [0.24, 0.2, 0.19, 0.22, 0.21], 'ele_dark', n=6, up=Vector((0, -1, 0)))
    legs = b.finish('ele_legs', col, [])

    b = sb.Builder(['ele'])
    ear_edges = []
    for sx in (1, -1):
        ear_edges += flap(b, (0.42 * sx, -0.74, 1.6), 0.24, 0.3, 0.04, 'ele', yaw=-22 * sx)
    ears = b.finish('ele_ears', col, [])

    b = sb.Builder(['ele'])
    tube(b, [Vector(p) for p in ((0, -1.1, 1.48), (0, -1.24, 1.18), (0, -1.3, 0.85), (0, -1.27, 0.52), (0, -1.18, 0.3))],
         [0.13, 0.11, 0.085, 0.065, 0.05], 'ele', n=6, up=Vector((0, -1, 0)))
    trunk = b.finish('ele_trunk', col, [])

    b = sb.Builder(['ivory'])
    for sx in (1, -1):
        tube(b, [Vector((0.15 * sx, -1.1, 1.32)), Vector((0.17 * sx, -1.34, 1.13)), Vector((0.15 * sx, -1.56, 1.17))],
             [0.045, 0.034, 0.012], 'ivory', n=4, up=Vector((1, 0, 0)))
    tusks = b.finish('ele_tusks', col, [])

    b = sb.Builder(['ele', 'dark'])
    tube(b, [Vector((0, 1.03, 1.42)), Vector((0, 1.12, 1.15)), Vector((0, 1.13, 0.9))], [0.035, 0.025, 0.02], 'ele', n=4, up=Vector((1, 0, 0)))
    tube(b, [Vector((0, 1.13, 0.92)), Vector((0, 1.13, 0.78))], [0.045, 0.02], 'dark', n=4, up=Vector((1, 0, 0)))   # tuft
    tail = b.finish('ele_tail', col, [])
    return body, legs, ears, trunk, tusks, tail


def ele_blanket(col):
    """A blanket in the power's colour over the elephant's back, a gold border along its hem."""
    b = sb.Builder(['tint', 'gold'])
    rows = [[b.v((x, y, z)) for x, z in ((0, 1.95), (0.4, 1.73), (0.565, 1.31), (0.558, 1.08), (0.555, 1.0))] for y in (-0.45, 0.05, 0.55)]
    for r0, r1 in ((rows[0], rows[1]), (rows[1], rows[2])):
        b.bridge(r0, r1, ['tint', 'tint', 'tint', 'gold'], closed=False)
    ob = b.finish('ele_blanket', col, [])
    m = ob.modifiers.new('Mirror', 'MIRROR')
    m.use_axis[0] = True; m.use_clip = True; m.use_mirror_merge = True; m.merge_threshold = 0.001
    s = ob.modifiers.new('Solidify', 'SOLIDIFY')
    s.thickness = 0.02; s.offset = 1; s.use_even_offset = True
    return ob


def howdah(col):
    """The wooden tower on the elephant's back, its rim in the power's colour."""
    b = sb.Builder(['wood', 'tint', 'gold'])
    Y, Z = Vector((0, 1, 0)), Vector((0, 0, 1))
    beam(b, (-0.43, 0.05, 1.96), (0.43, 0.05, 1.96), 0.46, 0.03, 'wood', up=Z)              # floor
    for y in (-0.38, 0.48):
        beam(b, (-0.4, y, 2.18), (0.4, y, 2.18), 0.025, 0.22, 'wood', up=Z)                # front and back
        beam(b, (-0.44, y, 2.42), (0.44, y, 2.42), 0.045, 0.03, 'tint', up=Z)              # rim
    for x in (-0.4, 0.4):
        beam(b, (x, -0.38, 2.18), (x, 0.48, 2.18), 0.025, 0.22, 'wood', up=Z)              # sides
        beam(b, (x, -0.42, 2.42), (x, 0.52, 2.42), 0.045, 0.03, 'tint', up=Z)
        for y in (-0.38, 0.48):
            beam(b, (x, y, 1.96), (x, y, 2.56), 0.045, 0.045, 'wood', up=Y)                # corner posts
            beam(b, (x, y, 2.56), (x, y, 2.62), 0.06, 0.06, 'gold', up=Y)                  # their caps
    return b.finish('ele_howdah', col, [])


def build_ele():
    """War elephant (Carthage): tusks, flapping ears, a trunk that swings forward in a fight; a blanket and a tower,
    a soldier in it with a javelin raised to throw, a mahout on the neck with his goad."""
    col = sb.collection('Units')
    body, legs, ears, trunk, tusks, tail = elephant(col)
    blanket, tower = ele_blanket(col), howdah(col)
    gait = lambda co: 1 if (co.x > 0) == (co.y < 0.07) else 2          # diagonal pairs
    ear_wave = lambda co: max(0.0, min(1.0, (abs(co.x) - 0.4) / 0.25)) * 0.5
    tail_wave = lambda co: max(0.0, min(1.0, (1.3 - co.z) / 0.5)) * 0.7
    pieces = [(body, 0), (legs, gait), (ears, 0, ear_wave), (trunk, 3), (tusks, 0), (tail, 0, tail_wave),
              (blanket, 0), (tower, 0)]

    # the soldier in the tower, javelin raised over his shoulder
    rig, (sbody, sskirt) = sb.build_base()
    for ob in (rig, sbody, sskirt):
        ob.name = ob.name + '_tower'
    rig.location = (0, 0.05, 1.99)
    bpy.context.view_layer.update()
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.mode_set(mode='POSE')
    aim(rig, 'upper_arm.R', (-0.35, 0.3, 0.88)); aim(rig, 'forearm.R', (-0.05, -0.25, 0.97)); aim(rig, 'hand.R', (0, -0.3, 0.95))
    aim(rig, 'upper_arm.L', (0.3, -0.45, -0.84)); aim(rig, 'forearm.L', (0.05, -0.97, 0.2)); aim(rig, 'hand.L', (0.05, -0.97, 0.2))
    bpy.ops.object.mode_set(mode='OBJECT')
    grip = bone_point(rig, 'hand.R', 0.45)
    d = Vector((0, -0.95, -0.3)).normalized()
    b = sb.Builder(['wood', 'steel'])
    tube(b, [grip - d * 0.6, grip + d * 0.95], 0.02, 'wood', n=4, up=Vector((1, 0, 0)))
    head_ = grip + d * 0.95
    base = [b.v(head_ + 0.03 * cos(radians(a)) * Vector((1, 0, 0)) + 0.03 * sin(radians(a)) * d.cross(Vector((1, 0, 0)))) for a in range(0, 360, 90)]
    tip = b.v(head_ + d * 0.16)
    b.face(tuple(reversed(base)), 'steel')
    for i in range(4):
        b.face((base[i], base[(i + 1) % 4], tip), 'steel')
    javelin = b.finish('ele_javelin', col, [])
    hm = helmet(col, 'ele_helmet'); hm.matrix_world = deform(rig, 'head')
    pieces += [(sbody, 'rider'), (sskirt, 0), (hm, 0), (javelin, 3)]

    # the mahout, astride the neck, in linen
    rig2, (mbody, mskirt) = sb.build_base()
    for ob in (mbody, mskirt):
        for i, m in enumerate(ob.data.materials):
            if m.name == 'tint':
                ob.data.materials[i] = sb.material('linen')
    rig2.location = (0, -0.6, 1.38)
    bpy.context.view_layer.update()
    bpy.context.view_layer.objects.active = rig2
    bpy.ops.object.mode_set(mode='POSE')
    for s_, k in (('L', 1), ('R', -1)):
        aim(rig2, 'thigh.' + s_, (0.75 * k, -0.4, -0.5))
        aim(rig2, 'shin.' + s_, (0.15 * k, 0.15, -0.97))
        aim(rig2, 'foot.' + s_, (0.05 * k, -0.95, -0.3))
        aim(rig2, 'upper_arm.' + s_, (0.2 * k, -0.3, -0.93))
        aim(rig2, 'forearm.' + s_, (-0.1 * k, -0.9, 0.4))
        aim(rig2, 'hand.' + s_, (-0.1 * k, -0.9, 0.4))
    bpy.ops.object.mode_set(mode='OBJECT')
    hr = bone_point(rig2, 'hand.R', 0.45)
    b = sb.Builder(['wood'])
    tube(b, [hr + Vector((0.0, 0.12, -0.12)), hr + Vector((0.0, -0.3, 0.3))], 0.014, 'wood', n=4, up=Vector((1, 0, 0)))   # goad
    goad = b.finish('ele_goad', col, [])
    pieces += [(mbody, 0), (mskirt, 0), (goad, 0)]

    unit = bake('ele', col, pieces)
    for ob, *_ in pieces:
        ob.hide_set(True); ob.hide_render = True
    rig.hide_set(True); rig2.hide_set(True)
    return unit


def ring_tube(b, c, r, thick, mat, n=10):
    """A closed ring lying flat (a torc), its section a small square."""
    c = Vector(c)
    Z = Vector((0, 0, 1))
    rings = []
    for k in range(n):
        a = radians(360 * k / n)
        radial = Vector((cos(a), sin(a), 0))
        p = c + r * radial
        rings.append([b.v(p + thick * cos(radians(q)) * radial + thick * sin(radians(q)) * Z) for q in (45, 135, 225, 315)])
    for k in range(n):
        b.bridge(rings[k], rings[(k + 1) % n], mat)


def gaul_head(col, name):
    """What makes a Gaesatus's head: hair limed into spikes, a drooping moustache; and the gold torc at his neck."""
    b = sb.Builder(['lime', 'gold'])
    centre = Vector((0, 0.01, 1.43))
    for d in ((0, -0.35, 1), (0.45, -0.1, 0.9), (-0.45, -0.1, 0.9), (0.3, 0.45, 0.85), (-0.3, 0.45, 0.85), (0, 0.6, 0.75),
              (0.55, 0.3, 0.45), (-0.55, 0.3, 0.45), (0, 0.15, 1)):
        d = Vector(d).normalized()
        base = centre + d * 0.16
        tube(b, [base, base + d * 0.13], [0.045, 0.006], 'lime', n=4, up=Vector((0, 1, 0)) if abs(d.y) < 0.9 else Vector((1, 0, 0)))
    for sx in (1, -1):
        beam(b, (0, -0.205, 1.322), (0.075 * sx, -0.175, 1.282), 0.012, 0.016, 'lime', up=Vector((0, -1, 0)))
    head = b.finish(name, col, [])
    b = sb.Builder(['gold'])
    ring_tube(b, (0, 0.0, 1.185), 0.095, 0.014, 'gold')
    torc = b.finish(name + '_torc', col, [])
    return head, torc


def build_gae():
    """Gaesatae (Gaul): bare-chested in chequered trousers, hair limed into spikes, a moustache and a gold torc; the long
    oval shield in the power's colour with a gold spine and boss, a long sword raised to strike."""
    rig, (body, skirt) = sb.build_base(style='gaul')
    col = sb.collection('Units')
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.mode_set(mode='POSE')
    aim(rig, 'upper_arm.R', (-0.38, 0.22, 0.9)); aim(rig, 'forearm.R', (-0.08, -0.2, 0.97)); aim(rig, 'hand.R', (0, -0.15, 0.99))
    aim(rig, 'upper_arm.L', (0.24, -0.16, -0.96)); aim(rig, 'forearm.L', (-0.3, -0.94, 0.14)); aim(rig, 'hand.L', (-0.3, -0.94, 0.14))
    aim(rig, 'thigh.L', (0.08, -0.3, -0.95)); aim(rig, 'thigh.R', (-0.08, 0.2, -0.98))     # a stride
    bpy.ops.object.mode_set(mode='OBJECT')
    hd, torc = gaul_head(col, 'gae_head')
    hd.matrix_world = deform(rig, 'head'); torc.matrix_world = deform(rig, 'neck')
    # the shield: a long oval, its face in the power's colour, a bronze edge, a gold spine and boss
    lh = bone_point(rig, 'hand.L', 0.5)
    c = Vector((lh.x - 0.02, lh.y - 0.07, 0.92))
    b = sb.Builder(['tint', 'bronze', 'gold'])
    flap(b, c, 0.29, 0.58, 0.03, 'tint', yaw=90, rim='bronze', n=16)
    beam(b, c + Vector((0, -0.016, -0.5)), c + Vector((0, -0.016, 0.5)), 0.022, 0.012, 'gold', up=Vector((0, -1, 0)))
    beam(b, c + Vector((0, -0.01, 0)), c + Vector((0, -0.07, 0)), 0.06, 0.08, 'gold', up=Vector((0, 0, 1)))
    shield = b.finish('gae_shield', col, [])
    # the sword, raised: a long blade, gold guard and pommel
    grip = bone_point(rig, 'hand.R', 0.45)
    d = Vector((0.05, 0.3, 0.95)).normalized()
    b = sb.Builder(['steel', 'gold', 'leather'])
    beam(b, grip - d * 0.1, grip + d * 0.06, 0.016, 0.016, 'leather', up=Vector((0, -1, 0)))               # grip
    beam(b, grip + d * 0.06, grip + d * 0.09, 0.065, 0.018, 'gold', up=Vector((0, -1, 0)))                 # guard
    beam(b, grip + d * 0.09, grip + d * 0.86, 0.03, 0.007, 'steel', up=Vector((0, -1, 0)))                 # blade
    beam(b, grip - d * 0.14, grip - d * 0.1, 0.028, 0.028, 'gold', up=Vector((0, -1, 0)))                  # pommel
    sword = b.finish('gae_sword', col, [])
    pieces = [(body, 'body'), (hd, 0), (torc, 0), (shield, 0), (sword, 3)]     # no tunic skirt: trousers
    skirt.hide_set(True); skirt.hide_render = True
    unit = bake('gae', col, pieces)
    for ob, *_ in pieces:
        ob.hide_set(True); ob.hide_render = True
    rig.hide_set(True)
    return unit


UNITS = {'spear': build_spear, 'arch': build_arch, 'cav': build_cav, 'siege': build_siege, 'leg': build_leg, 'legT': build_legT,
         'char': build_char, 'ele': build_ele, 'gae': build_gae}

if __name__ == '__main__':
    for key in [a for a in sys.argv[1:] if a in UNITS] or list(UNITS):
        if bpy.app.background:                    # the bpy module: start from an empty file (never in the editor)
            bpy.ops.wm.read_factory_settings(use_empty=True)
        unit = UNITS[key]()
        print(f'{key}: {triangles(unit)} triangles -> {export(unit, key)}')
