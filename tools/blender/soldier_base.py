# Testudo Imperium · the base soldier, the body every infantry, archer and rider unit starts from (units.py poses it).
# Run in Blender (Scripting tab > Open > Run Script) or with the bpy module (pip install bpy): builds `soldier_base`,
# the tunic's skirt and the skeleton `soldier_rig` in a `Soldier` collection.
# Scale: 1 m here = 0.2 game units. Feet at 0, facing -Y (Blender's front view). The soldier's left is +X.
# Topology: all quads, one closed piece for the body (arms joined at the shoulders), the tunic skirt a second piece.
# Half is modelled and a Mirror modifier makes the other; the Armature modifier after it poses the whole.
import bpy, bmesh
from mathutils import Vector, Matrix
from math import cos, sin, radians, degrees

COLOURS = {'skin': '#e9c9a6', 'tint': '#ffffff', 'leather': '#6b4f37', 'dark': '#3d3128', 'hair': '#4a3526',
           'steel': '#9aa2ab', 'bronze': '#c8a560', 'wood': '#7a5434'}


def srgb_to_lin(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def material(name):
    hexcol = COLOURS[name]
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    r, g, b = (int(hexcol[i:i + 2], 16) / 255 for i in (1, 3, 5))
    lin = (srgb_to_lin(r), srgb_to_lin(g), srgb_to_lin(b), 1.0)
    m.diffuse_color = lin
    m.roughness = 0.7
    if not m.use_nodes:
        m.use_nodes = True
    bsdf = next((n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'), None)
    if bsdf:
        bsdf.inputs['Base Color'].default_value = lin
        bsdf.inputs['Roughness'].default_value = 0.7
    return m


class Builder:
    def __init__(self, mats):
        self.bm, self.mats, self.w = bmesh.new(), list(mats), {}

    def v(self, p, **weights):
        vert = self.bm.verts.new(p)
        self.weigh([vert], **weights)
        return vert

    def weigh(self, verts, **weights):
        for g, x in weights.items():
            g = g.replace('_L', '.L')
            for vert in verts:
                self.w.setdefault(g, {})[vert] = x

    def face(self, vs, mat):
        f = self.bm.faces.new(vs)
        f.material_index = self.mats.index(mat)
        return f

    def half_ring(self, z, pts, **weights):
        return [self.v((x, y, z), **weights) for x, y in pts]

    def bridge(self, a, b, mats, closed=True):
        n = len(a) if closed else len(a) - 1
        mats = mats if isinstance(mats, (list, tuple)) else [mats] * n
        return [self.face((a[i], a[(i + 1) % len(a)], b[(i + 1) % len(b)], b[i]), mats[i]) for i in range(n)]

    def half_cap(self, r, centre, mat, **weights):
        c = self.v(centre, **weights)
        self.face((r[0], r[1], r[2], c), mat)
        self.face((c, r[2], r[3], r[4]), mat)

    def cap6(self, r, mat):
        self.face((r[0], r[1], r[2], r[3]), mat)
        self.face((r[3], r[4], r[5], r[0]), mat)

    def finish(self, name, col, groups, sharp_angle=80):
        old = bpy.data.objects.get(name)
        if old:
            bpy.data.objects.remove(old, do_unlink=True)
        bm = self.bm
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
        for e in bm.edges:                                   # smooth shading, crisp only at real creases
            e.smooth = not (len(e.link_faces) == 2 and degrees(e.calc_face_angle(0)) > sharp_angle)
        bm.verts.index_update()
        wt = {g: [(v.index, x) for v, x in d.items()] for g, d in self.w.items()}
        me = bpy.data.meshes.new(name)
        bm.to_mesh(me)
        bm.free()
        for m in self.mats:
            me.materials.append(material(m))
        for p in me.polygons:
            p.use_smooth = True
        ob = bpy.data.objects.new(name, me)
        col.objects.link(ob)
        for g in groups:
            vg = ob.vertex_groups.new(name=g)
            for i, x in wt.get(g, []):
                vg.add([i], x, 'REPLACE')
        return ob


def collection(name):
    col = bpy.data.collections.get(name) or bpy.data.collections.new(name)
    if col.name not in bpy.context.scene.collection.children:
        bpy.context.scene.collection.children.link(col)
    return col


# ---------- the skeleton's joints (left side; the right mirrors them) ----------
ARM1 = Vector((cos(radians(45)), 0, -sin(radians(45))))           # upper arm: 45 degrees down (A pose)
ARM2 = Vector((0.622, -0.181, -0.762)).normalized()                  # forearm: a little forward
SHOULDER = Vector((0.22, 0.0, 1.05))
ELBOW = SHOULDER + 0.29 * ARM1
WRIST = ELBOW + 0.21 * ARM2
HAND_END = WRIST + 0.115 * ARM2
HIP, KNEE, ANKLE, TOE = Vector((0.105, 0, 0.58)), Vector((0.11, -0.008, 0.29)), Vector((0.114, 0.012, 0.09)), Vector((0.114, -0.17, 0.03))
BONES = [  # name, head, tail, parent, connected
    ('hips', (0, 0, 0.56), (0, 0, 0.78), None, False),
    ('spine', (0, 0, 0.78), (0, 0, 0.97), 'hips', True),
    ('chest', (0, 0, 0.97), (0, 0, 1.165), 'spine', True),
    ('neck', (0, 0, 1.165), (0, 0, 1.27), 'chest', True),
    ('head', (0, 0, 1.27), (0, 0, 1.62), 'neck', True),
    ('upper_arm.L', SHOULDER, ELBOW, 'chest', False),
    ('forearm.L', ELBOW, WRIST, 'upper_arm.L', True),
    ('hand.L', WRIST, HAND_END, 'forearm.L', True),
    ('thigh.L', HIP, KNEE, 'hips', False),
    ('shin.L', KNEE, ANKLE, 'thigh.L', True),
    ('foot.L', ANKLE, TOE, 'shin.L', True),
]
GROUPS = ['hips', 'spine', 'chest', 'neck', 'head'] + [n + s for n in ('upper_arm', 'forearm', 'hand', 'thigh', 'shin', 'foot') for s in ('.L', '.R')]


def build_body(col):
    b = Builder(['skin', 'tint', 'leather', 'dark', 'hair'])
    # torso: half rings front centre (y<0) -> front-side -> side -> back-side -> back centre, x >= 0
    P = b.half_ring(0.62, [(0, -0.135), (0.15, -0.115), (0.20, 0.0), (0.15, 0.115), (0, 0.14)], hips=1)
    W = b.half_ring(0.78, [(0, -0.132), (0.133, -0.108), (0.172, 0.0), (0.133, 0.103), (0, 0.124)], hips=0.5, spine=0.5)
    W2 = b.half_ring(0.845, [(0, -0.142), (0.142, -0.116), (0.183, 0.0), (0.142, 0.11), (0, 0.132)], spine=1)
    C = b.half_ring(0.97, [(0, -0.168), (0.158, -0.138), (0.212, 0.0), (0.152, 0.122), (0, 0.145)], spine=0.35, chest=0.65)
    S = b.half_ring(1.105, [(0, -0.14), (0.15, -0.112), (0.212, 0.0), (0.15, 0.112), (0, 0.142)], chest=1)
    N0 = b.half_ring(1.165, [(0, -0.08), (0.06, -0.06), (0.085, 0.0), (0.06, 0.06), (0, 0.08)], chest=0.5, neck=0.5)
    S[0].co.z = 1.12; S[4].co.z = 1.125                      # collarbone and nape a touch higher than the shoulder
    b.weigh(C[1:4] + S[1:4], upper_arm_L=0.3)                # the shoulder follows the arm a little
    b.bridge(P, W, 'tint', closed=False)
    b.bridge(W, W2, 'leather', closed=False)                  # belt
    b.bridge(W2, C, 'tint', closed=False)
    b.face((C[0], C[1], S[1], S[0]), 'tint')                 # chest; the side is the arm's
    b.face((C[3], C[4], S[4], S[3]), 'tint')                 # back
    b.bridge(S, N0, 'tint', closed=False)                     # top of the shoulders, up to the neckline

    # head: neck, jaw, nose and mouth, eyes, brow, crown
    N1 = b.half_ring(1.235, [(0, -0.072), (0.055, -0.055), (0.077, 0.0), (0.055, 0.058), (0, 0.078)], neck=0.5, head=0.5)
    J = b.half_ring(1.272, [(0, -0.15), (0.117, -0.113), (0.152, 0.0), (0.113, 0.093), (0, 0.112)], head=1)
    Ns = b.half_ring(1.34, [(0, -0.2), (0.136, -0.13), (0.184, 0.0), (0.142, 0.122), (0, 0.158)], head=1)
    E = b.half_ring(1.415, [(0, -0.182), (0.142, -0.118), (0.194, 0.0), (0.15, 0.13), (0, 0.175)], head=1)   # eye sockets set back
    B = b.half_ring(1.49, [(0, -0.19), (0.14, -0.142), (0.183, 0.0), (0.146, 0.13), (0, 0.172)], head=1)     # brow forward
    R = b.half_ring(1.562, [(0, -0.128), (0.113, -0.097), (0.145, 0.0), (0.113, 0.102), (0, 0.133)], head=1)
    J[0].co.z = 1.265; J[3].co.z = 1.285; J[4].co.z = 1.295  # chin lower, skull base higher at the back
    Ns[0].co.z = 1.35                                          # nose tip
    b.bridge(N0, N1, 'skin', closed=False)
    b.bridge(N1, J, 'skin', closed=False)
    b.bridge(J, Ns, ['skin', 'skin', 'skin', 'hair'], closed=False)
    b.bridge(Ns, E, ['skin', 'skin', 'hair', 'hair'], closed=False)
    b.bridge(E, B, ['skin', 'skin', 'hair', 'hair'], closed=False)
    b.bridge(B, R, 'hair', closed=False)
    b.half_cap(R, (0, 0, 1.605), 'hair', head=1)
    # eyes: two small dark blocks under the brow (one here, the mirror makes the other)
    ex, ey, ez = 0.062, -0.163, 1.437
    eye = [b.v((ex + dx, ey + dy, ez + dz), head=1) for dz in (-0.017, 0.017) for dy in (-0.007, 0.009) for dx in (-0.016, 0.016)]
    for f in ((0, 1, 3, 2), (4, 6, 7, 5), (0, 2, 6, 4), (1, 5, 7, 3), (0, 4, 5, 1), (2, 3, 7, 6)):
        b.face([eye[i] for i in f], 'dark')

    # arm, joined through the side of the chest and the top of the shoulder (the hole's six edges)
    hole = [S[2], S[1], C[1], C[2], C[3], S[3]]               # top, top-front, bottom-front, bottom, bottom-back, top-back
    def arm_ring(centre, axis, up, r_up, r_side, **weights):
        u = (up - up.dot(axis) * axis).normalized()
        w = axis.cross(u)
        if w.y > 0:
            w = -w                                            # w points forward (-Y)
        return [b.v(centre + r_up * cos(radians(a)) * u + r_side * sin(radians(a)) * w, **weights) for a in range(0, 360, 60)], u
    up = Vector((0, 0, 1))
    D, u = arm_ring(SHOULDER + 0.10 * ARM1, ARM1, up, 0.086, 0.078, upper_arm_L=0.85, chest=0.15)   # deltoid
    Sl, u = arm_ring(SHOULDER + 0.205 * ARM1, ARM1, u, 0.068, 0.066, upper_arm_L=1)                # sleeve hem
    bend = (ARM1 + ARM2).normalized()
    El, u = arm_ring(ELBOW, bend, u, 0.052, 0.054, upper_arm_L=0.5, forearm_L=0.5)
    Wr, u = arm_ring(WRIST, ARM2, u, 0.04, 0.045, forearm_L=0.5, hand_L=0.5)
    Pm, u = arm_ring(WRIST + 0.045 * ARM2, ARM2, u, 0.04, 0.06, hand_L=1)                        # palm, facing the thigh
    Hd, u = arm_ring(HAND_END, ARM2, u, 0.036, 0.05, hand_L=1)                                    # finger ends
    b.bridge(hole, D, 'tint')
    b.bridge(D, Sl, 'tint')
    b.bridge(Sl, El, 'skin')
    b.bridge(El, Wr, 'skin')
    b.bridge(Wr, Pm, 'skin')
    b.bridge(Pm, Hd, 'skin')
    b.cap6(list(reversed(Hd)), 'skin')

    # leg: its top ring is the pelvis half ring plus the crotch, shared with the other leg on the seam
    crotch = b.v((0, 0, 0.53), hips=1)
    top = [P[0], P[1], P[2], P[3], P[4], crotch]            # front-in, front-out, out, back-out, back-in, in
    b.weigh(P[1:4], thigh_L=0.3)
    ANG = [-120, -60, 0, 60, 120, 180]
    def leg_ring(c, z, rx, ry, dy=(0,) * 6, **weights):
        return [b.v((c[0] + rx * cos(radians(a)), c[1] + ry * sin(radians(a)) + dy[k], z), **weights) for k, a in enumerate(ANG)]
    T = leg_ring((0.105, 0.0), 0.44, 0.09, 0.094, hips=0.15, thigh_L=0.85)
    K = leg_ring((0.11, -0.006), 0.29, 0.063, 0.063, dy=(-0.008, -0.01, 0, 0, 0, 0), thigh_L=0.5, shin_L=0.5)   # knee cap
    Cf = leg_ring((0.112, 0.008), 0.20, 0.063, 0.066, dy=(0, 0, 0, 0.012, 0.012, 0), shin_L=1)             # calf
    A = leg_ring((0.114, 0.012), 0.09, 0.043, 0.047, shin_L=0.5, foot_L=0.5)
    shoe = [(-0.042, -0.158), (0.05, -0.158), (0.06, -0.03), (0.044, 0.066), (-0.038, 0.066), (-0.05, -0.03)]
    F = [b.v((0.114 + x, y, 0.042), foot_L=1) for x, y in shoe]
    Sb = [b.v((0.114 + x * 1.06, y * 1.04, 0.0), foot_L=1) for x, y in shoe]
    b.bridge(top, T, 'skin')
    b.bridge(T, K, 'skin')
    b.bridge(K, Cf, 'skin')
    b.bridge(Cf, A, 'leather')                                # leg wraps
    b.bridge(A, F, 'leather')                                 # shoe
    b.bridge(F, Sb, 'dark')                                   # sole
    b.cap6(list(reversed(Sb)), 'dark')
    ob = b.finish('soldier_base', col, GROUPS)
    return ob


def build_skirt(col):
    """The tunic's skirt, a separate closed piece over the hips; its top is hidden in the body."""
    b = Builder(['tint'])
    Kt = b.half_ring(0.70, [(0, -0.115), (0.125, -0.095), (0.165, 0.0), (0.125, 0.095), (0, 0.12)], hips=1)
    Km = b.half_ring(0.60, [(0, -0.152), (0.165, -0.13), (0.218, 0.0), (0.165, 0.13), (0, 0.158)], hips=1)
    Kh = b.half_ring(0.445, [(0, -0.165), (0.182, -0.145), (0.238, 0.0), (0.182, 0.145), (0, 0.172)], hips=0.6)
    b.weigh(Kh[1:4], thigh_L=0.4)
    b.bridge(Kt, Km, 'tint', closed=False)
    b.bridge(Km, Kh, 'tint', closed=False)
    b.half_cap(list(reversed(Kt)), (0, 0, 0.72), 'tint', hips=1)
    b.half_cap(Kh, (0, 0, 0.465), 'tint', hips=1)
    return b.finish('soldier_skirt', col, GROUPS)


def build_rig(col):
    old = bpy.data.objects.get('soldier_rig')
    if old:
        bpy.data.objects.remove(old, do_unlink=True)
    arm = bpy.data.armatures.new('soldier_rig')
    rig = bpy.data.objects.new('soldier_rig', arm)
    col.objects.link(rig)
    rig.show_in_front = True
    arm.display_type = 'STICK'
    for o in bpy.context.view_layer.objects:
        o.select_set(False)
    bpy.context.view_layer.objects.active = rig
    rig.select_set(True)
    bpy.ops.object.mode_set(mode='EDIT')
    eb = arm.edit_bones
    def add(n, h, t, p, c):
        e = eb.new(n); e.head = h; e.tail = t; e.roll = 0
        if p:
            e.parent = eb[p]; e.use_connect = c
    for n, h, t, p, c in BONES:
        add(n, h, t, p, c)
        if n.endswith('.L'):
            mh, mt = Vector(h), Vector(t)
            mh.x, mt.x = -mh.x, -mt.x
            add(n[:-2] + '.R', mh, mt, (p[:-2] + '.R') if p and p.endswith('.L') else p, c)
    bpy.ops.object.mode_set(mode='OBJECT')
    return rig


def build_base():
    col = collection('Soldier')
    rig = build_rig(col)
    pieces = [build_body(col), build_skirt(col)]
    for ob in pieces:
        ob.parent = rig
        m = ob.modifiers.new('Mirror', 'MIRROR')
        m.use_axis[0] = True; m.use_clip = True; m.use_mirror_merge = True; m.merge_threshold = 0.001
        m.use_mirror_vertex_groups = True
        a = ob.modifiers.new('Armature', 'ARMATURE')
        a.object = rig
        ob['game_scale'] = 0.2
    pieces[0]['note'] = 'Base soldier. Facing -Y, feet at 0, 1 m here = 0.2 game units. Flat colours; tint = the power colour.'
    return rig, pieces


def stats(objs):
    dg = bpy.context.evaluated_depsgraph_get()
    out = {}
    for ob in objs:
        ev = ob.evaluated_get(dg)
        m = ev.to_mesh()
        sizes = [len(p.vertices) for p in m.polygons]
        bm = bmesh.new(); bm.from_mesh(m)
        val = {}
        for v in bm.verts:
            val[len(v.link_edges)] = val.get(len(v.link_edges), 0) + 1
        out[ob.name] = {'triangles': sum(s - 2 for s in sizes), 'quads': sizes.count(4), 'other_faces': sum(1 for s in sizes if s != 4),
                        'non_manifold_edges': sum(1 for e in bm.edges if not e.is_manifold), 'valence': val}
        bm.free(); ev.to_mesh_clear()
    out['total_triangles'] = sum(v['triangles'] for v in out.values())
    return out


def rotate(rig, bone, axis, angle):
    """Turn a pose bone about its head by an angle around a world axis (for test poses)."""
    pb = rig.pose.bones[bone]
    h = rig.matrix_world @ pb.head
    R = Matrix.Translation(h) @ Matrix.Rotation(radians(angle), 4, axis) @ Matrix.Translation(-h)
    pb.matrix = rig.matrix_world.inverted() @ R @ rig.matrix_world @ pb.matrix
    bpy.context.view_layer.update()


if __name__ == "__main__":
    build_base()
