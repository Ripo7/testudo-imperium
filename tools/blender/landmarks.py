# Testudo Imperium · landmark models for the cities, exported for the game's city generator (src/render/citygen.js).
#
#   python3 tools/blender/landmarks.py                 (every landmark; or name them: ... roman_temple pylon)
#   or in Blender: Scripting tab > Open > Run Script
#
# Each landmark is one mesh written to src/assets/landmarks/<key>.glb. What the game reads from the file:
#   - one plain colour per material (no textures), drawn as vertex colours;
#   - the shape only: the generator scales it to the ground it is given (uniformly, from the model's width), so the
#     units are free; here 1 m is about a tenth of a game unit;
#   - centred on the origin, standing on z = 0, its front toward -Y (Blender's front view).
# Without these files the cities keep their procedural landmarks (src/render/city/).
import os, sys
import bpy, bmesh
from mathutils import Vector
from math import cos, sin, pi, radians, atan2, hypot

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.normpath(os.path.join(HERE, '..', '..', 'src', 'assets', 'landmarks'))

COLOURS = {
    'marble': '#f2ede2', 'marble2': '#e2d9c6', 'stone': '#e9e2d2', 'stone2': '#d8cfbb', 'tile': '#c86a3e', 'tile2': '#b5532f',
    'dark': '#3b2f27', 'shadow': '#5a4a3c', 'sand': '#d8bf86', 'seat': '#d9ccb0', 'seat2': '#cbbd9f', 'travertine': '#e6dac2',
    'gold': '#d4ad4a', 'bronze': '#a8823c',
    'e_stone': '#e9dbb8', 'e_stone2': '#d6c39a', 'e_blue': '#3f7f8c', 'e_red': '#b5463a', 'e_ochre': '#c9a13b', 'e_wood': '#6e5136',
    'p_stone': '#e6dcc6', 'p_stone2': '#d3c4a3', 'p_white': '#f4efe4', 'p_trim': '#b7653f', 'p_blue': '#4f6788',
    'wood': '#6b4f33', 'wood2': '#57402b', 'thatch': '#b49a5e', 'thatch2': '#a88d55', 'daub': '#d4c09a',
    'plaid1': '#7b3b2e', 'plaid2': '#2f5a4a', 'plaid3': '#c19a3a', 'fire': '#f0b04a',
}


def srgb_to_lin(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def material(name):
    hexcol = COLOURS[name]
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    r, g, b = (int(hexcol[i:i + 2], 16) / 255 for i in (1, 3, 5))
    lin = (srgb_to_lin(r), srgb_to_lin(g), srgb_to_lin(b), 1.0)
    m.diffuse_color = lin
    if not m.use_nodes:
        m.use_nodes = True
    bsdf = next((n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'), None)
    if bsdf:
        bsdf.inputs['Base Color'].default_value = lin
        bsdf.inputs['Roughness'].default_value = 0.8
    return m


V = Vector


class Model:
    """A mesh built from simple solids; faces are flat unless a solid asks to be smooth (column shafts)."""

    def __init__(self, name):
        self.name, self.bm, self.mats = name, bmesh.new(), []

    def _mi(self, mat):
        if mat not in self.mats:
            self.mats.append(mat)
        return self.mats.index(mat)

    def face(self, pts, mat, out=None, smooth=False):
        """A polygon from points; out: a direction it should face (else its winding decides)."""
        vs = [self.bm.verts.new(V(p)) for p in pts]
        f = self.bm.faces.new(vs)
        f.material_index = self._mi(mat)
        f.smooth = smooth
        f.normal_update()
        if out is not None and f.normal.dot(V(out)) < 0:
            f.normal_flip()
        return f

    def solid(self, rings, mat, top=True, bottom=False, smooth=False, centre=None):
        """A convex solid from horizontal rings of points (bottom to top), all with the same count."""
        c = V(centre) if centre else sum((V(p) for r in rings for p in r), V()) / sum(len(r) for r in rings)
        n = len(rings[0])
        for a, b in zip(rings, rings[1:]):
            for i in range(n):
                q = [a[i], a[(i + 1) % n], b[(i + 1) % n], b[i]]
                mid = sum((V(p) for p in q), V()) / 4
                self.face(q, mat, out=mid - c, smooth=smooth)
        if top:
            self.face(rings[-1], mat, out=sum((V(p) for p in rings[-1]), V()) / n - c)
        if bottom:
            self.face(rings[0], mat, out=sum((V(p) for p in rings[0]), V()) / n - c)

    def rod(self, p0, p1, r, n, mat, caps=False, smooth=True):
        """A round bar from p0 to p1 at any slant."""
        p0, p1 = V(p0), V(p1)
        ax = (p1 - p0).normalized()
        t = ax.orthogonal().normalized()
        b = ax.cross(t)
        ring = lambda c: [c + (t * cos(2 * pi * i / n) + b * sin(2 * pi * i / n)) * r for i in range(n)]
        self.solid([ring(p0), ring(p1)], mat, top=caps, bottom=caps, smooth=smooth, centre=(p0 + p1) / 2)

    def box(self, c, s, mat, rz=0.0, top=True, bottom=False, taper=(1.0, 1.0)):
        """A box centred at c (x, y) standing on c.z, size s; taper: the top's size relative to the base."""
        cx, cy, cz = c
        sx, sy, sz = s

        def ring(z, kx, ky):
            pts = []
            for ux, uy in ((-1, -1), (1, -1), (1, 1), (-1, 1)):
                x, y = ux * sx / 2 * kx, uy * sy / 2 * ky
                pts.append((cx + x * cos(rz) - y * sin(rz), cy + x * sin(rz) + y * cos(rz), z))
            return pts
        self.solid([ring(cz, 1, 1), ring(cz + sz, *taper)], mat, top=top, bottom=bottom, centre=(cx, cy, cz + sz / 2))

    def cyl(self, c, r0, r1, h, n, mat, top=True, smooth=True, sy=1.0, a0=0.0):
        cx, cy, cz = c
        ring = lambda z, r: [(cx + r * cos(a0 + 2 * pi * i / n), cy + r * sy * sin(a0 + 2 * pi * i / n), z) for i in range(n)]
        self.solid([ring(cz, r0), ring(cz + h, r1)], mat, top=top, smooth=smooth, centre=(cx, cy, cz + h / 2))

    def gable(self, c, w, l, h, mat, ends=None, rz=0.0):
        """A gable roof (ridge along y) on a base w by l centred at c, h high; ends: the gable ends' colour."""
        cx, cy, cz = c
        R = lambda x, y, z: (cx + x * cos(rz) - y * sin(rz), cy + x * sin(rz) + y * cos(rz), z)
        a, b = -l / 2, l / 2
        L0, R0, T0 = R(-w / 2, a, cz), R(w / 2, a, cz), R(0, a, cz + h)
        L1, R1, T1 = R(-w / 2, b, cz), R(w / 2, b, cz), R(0, b, cz + h)
        cen = V(R(0, 0, cz + h / 3))
        for q in ((L0, T0, T1, L1), (R0, R1, T1, T0)):
            mid = sum((V(p) for p in q), V()) / 4
            self.face(q, mat, out=mid - cen)
        for tri in ((L0, R0, T0), (L1, R1, T1)):
            mid = sum((V(p) for p in tri), V()) / 3
            self.face(tri, ends or mat, out=mid - cen)

    def column(self, x, y, z, h, r, shaft, cap, base=None, n=10):
        self.cyl((x, y, z), r * 1.3, r * 1.3, h * 0.04, 8, base or cap, smooth=False)
        self.cyl((x, y, z + h * 0.04), r, r * 0.86, h * 0.86, n, shaft)
        self.cyl((x, y, z + h * 0.9), r * 0.86, r * 1.25, h * 0.05, 8, cap, smooth=False)
        self.box((x, y, z + h * 0.95), (r * 2.7, r * 2.7, h * 0.05), cap)

    def finish(self, sharp=30):
        old = bpy.data.objects.get(self.name)
        if old:
            bpy.data.objects.remove(old, do_unlink=True)
        bm = self.bm
        bmesh.ops.remove_doubles(bm, verts=bm.verts[:], dist=1e-5)
        me = bpy.data.meshes.new(self.name)
        bm.to_mesh(me)
        bm.free()
        for m in self.mats:
            me.materials.append(material(m))
        ob = bpy.data.objects.new(self.name, me)
        bpy.context.scene.collection.objects.link(ob)
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
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True, export_apply=True, export_yup=True,
                              export_normals=True, export_texcoords=False, export_materials='EXPORT', export_vertex_color='NONE',
                              export_animations=False, export_skins=False, export_morph=False, export_cameras=False,
                              export_lights=False, export_extras=False)
    return path


def triangles(ob):
    return sum(len(p.vertices) - 2 for p in ob.data.polygons)


# ---------- Rome: the temple ----------
def roman_temple():
    """A temple on a high podium: stairs up the front, a deep porch of six columns, columns all round, the
    entablature, pediments with their cornices, a tiled roof, gilded acroteria."""
    m = Model('roman_temple')
    W, L, ph = 4.0, 6.4, 0.75
    m.box((0, 0.3, 0), (W + 0.12, L - 0.6 + 0.12, 0.1), 'marble2')                 # the podium's base moulding
    m.box((0, 0.3, 0.1), (W, L - 0.6, ph - 0.2), 'stone')
    m.box((0, 0.3, ph - 0.1), (W + 0.1, L - 0.6 + 0.1, 0.1), 'marble2')             # its cornice
    # stairs up the front, between two cheek walls
    n, sw, y0 = 8, 2.9, -L / 2 + 0.6
    for k in range(n):
        m.box((0, y0 - 0.8 + (k + 0.5) * 0.1, 0), (sw, 0.8 - k * 0.1, ph * (k + 1) / n), 'marble' if k % 2 else 'marble2', top=True)
    for sx in (-1, 1):
        m.box((sx * (sw / 2 + 0.2), y0 - 0.4, 0), (0.4, 0.8, ph), 'stone')
    # columns: six across, nine deep
    ch, cr, z0 = 2.4, 0.15, ph
    xs = [-W / 2 + 0.3 + i * (W - 0.6) / 5 for i in range(6)]
    ys = [-L / 2 + 0.3 + j * (L - 0.6) / 8 for j in range(9)]
    for j, y in enumerate(ys):
        for i, x in enumerate(xs):
            if j > 0 and 0 < i < 5 and j != 1:
                continue
            m.column(x, y, z0, ch, cr, 'marble', 'marble2')
    # the cella behind the porch, its door
    m.box((0, ys[3] + (ys[-1] - ys[3]) / 2 + 0.1, z0), (W - 1.2, ys[-1] - ys[3] + 0.2, ch), 'stone')
    m.face([(-0.45, ys[3] - 0.02 + 0.1 - 0.12, z0), (0.45, ys[3] - 0.02 + 0.1 - 0.12, z0), (0.45, ys[3] - 0.02 + 0.1 - 0.12, z0 + 1.6), (-0.45, ys[3] - 0.02 + 0.1 - 0.12, z0 + 1.6)], 'dark', out=(0, -1, 0))
    # the entablature: architrave, frieze, cornice
    zt = z0 + ch
    m.box((0, 0, zt), (W + 0.05, L - 0.15, 0.22), 'marble2')
    m.box((0, 0, zt + 0.22), (W + 0.05, L - 0.15, 0.2), 'marble')
    m.box((0, 0, zt + 0.42), (W + 0.3, L + 0.1, 0.1), 'marble2')
    # the roof and the pediments: the tympanum set back under the raking cornice
    zr, rh = zt + 0.52, 1.05
    m.gable((0, 0, zr), W + 0.3, L + 0.1, rh, 'tile', ends='marble')
    for sy in (-1, 1):
        y = sy * (L + 0.1) / 2
        for sx in (-1, 1):                                                             # the raking cornices
            a = atan2(rh, (W + 0.3) / 2)
            p0, p1 = V((sx * (W + 0.3) / 2, y, zr)), V((0, y, zr + rh))
            nrm, off = V((sx * sin(a), 0, cos(a))), V((0, sy * 0.06, 0))
            m.face([p0, p1, p1 + nrm * 0.1 + off, p0 + nrm * 0.1 + off], 'marble2', out=nrm + off * 5)
        for x in (-(W + 0.3) / 2, 0, (W + 0.3) / 2):                                  # acroteria
            z = zr + (rh if x == 0 else 0)
            m.box((x, y, z), (0.18, 0.12, 0.28 if x == 0 else 0.2), 'gold')
    for sx in (-1, 1):                                                                 # the tiles' ridges at the eaves
        m.box((sx * (W + 0.3) / 2 * 0.98, 0, zr - 0.02), (0.08, L + 0.12, 0.06), 'tile2')
    return m.finish()


# ---------- Rome: the amphitheatre ----------
def arch_bay(m, P0, P1, z0, h, out, depth, wall, back, frac=0.56, spring=0.58, segs=6):
    """One bay of an arcade: the wall face with an arched opening (a U-shaped polygon), the opening's reveals and
    the dark vault behind, between the points P0 and P1 on the facade, from z0 up h; out: the facade's outward normal."""
    P0, P1, out = V(P0), V(P1), V(out).normalized()
    L = (P1 - P0).length
    u = (P1 - P0) / L
    at = lambda s, z, d=0.0: P0 + u * s - out * d + V((0, 0, z0 + z))
    ow = L * frac
    u0, u1, r = (L - ow) / 2, (L + ow) / 2, ow / 2
    sp = h * spring
    arc = [((u0 + u1) / 2 + r * cos(pi * k / segs), sp + r * sin(pi * k / segs)) for k in range(segs + 1)]   # right to left
    outline = [(0, 0), (0, h), (L, h), (L, 0), (u1, 0)] + arc + [(u0, 0)]
    m.face([at(s, z) for s, z in outline], wall, out=out)
    opening = [(u1, 0)] + arc + [(u0, 0)]
    m.face([at(s, z, depth) for s, z in opening], back, out=out)
    for (sa, za), (sb, zb) in zip(opening, opening[1:]):
        q = [at(sa, za), at(sb, zb), at(sb, zb, depth), at(sa, za, depth)]
        mid = sum(q, V()) / 4
        centre = at((u0 + u1) / 2, sp * 0.6, depth / 2)
        m.face(q, wall, out=centre - mid)


def amphitheatre():
    """An oval of three tiers of arcades and an attic, the seating stepping down inside to the arena's podium wall,
    the sand of the arena, the gates at the ends of the long axis."""
    m = Model('amphitheatre')
    A, B, N = 4.5, 3.6, 44
    tiers = [(0.0, 1.0), (1.0, 0.95), (1.95, 0.9)]
    H = 2.85 + 0.55                                                                   # with the attic
    P = lambda k, a=A, b=B: V((a * cos(2 * pi * k / N), b * sin(2 * pi * k / N), 0))
    for k in range(N):
        p0, p1 = P(k), P(k + 1)
        mid = (p0 + p1) / 2
        out = V((mid.x / A ** 2, mid.y / B ** 2, 0)).normalized()
        gate = k in (0, N - 1, N // 2 - 1, N // 2)                                    # the great gates, wider and taller
        for i, (z0, h) in enumerate(tiers):
            arch_bay(m, p0, p1, z0, h, out, 0.3, 'travertine', 'shadow', frac=0.66 if gate and i == 0 else 0.56)
            # the cornice between the tiers
            m.face([p0 + V((0, 0, z0 + h - 0.06)), p1 + V((0, 0, z0 + h - 0.06)), p1 + out * 0.07 + V((0, 0, z0 + h)), p0 + out * 0.07 + V((0, 0, z0 + h))], 'stone2', out=out + V((0, 0, 1)))
        # the attic, with a window every other bay
        za = 2.85
        m.face([p0 + V((0, 0, za)), p1 + V((0, 0, za)), p1 + V((0, 0, H)), p0 + V((0, 0, H))], 'travertine', out=out)
        if k % 2 == 0:
            c = (p0 + p1) / 2 + out * 0.01
            t = (p1 - p0).normalized()
            m.face([c - t * 0.08 + V((0, 0, za + 0.18)), c + t * 0.08 + V((0, 0, za + 0.18)), c + t * 0.08 + V((0, 0, za + 0.36)), c - t * 0.08 + V((0, 0, za + 0.36))], 'shadow', out=out)
        # the top of the wall, its walk
        q0, q1 = P(k, A - 0.35, B - 0.35), P(k + 1, A - 0.35, B - 0.35)
        m.face([p0 + V((0, 0, H)), p1 + V((0, 0, H)), q1 + V((0, 0, H)), q0 + V((0, 0, H))], 'stone2', out=(0, 0, 1))
        # masts for the awning
        if k % 4 == 0:
            m.cyl((p0.x + out.x * 0.02, p0.y + out.y * 0.02, H), 0.025, 0.02, 0.5, 4, 'wood', smooth=False)
    # the seating: rings stepping down from the wall to the podium round the arena
    rings = [(A - 0.35, B - 0.35, H - 0.15), (A - 0.75, B - 0.75, H - 0.55), (A - 1.0, B - 1.0, H - 0.75), (A - 1.55, B - 1.45, 1.45),
             (A - 1.8, B - 1.7, 1.25), (A - 2.3, B - 2.15, 0.6), (A - 2.35, B - 2.2, 0.6)]
    cols = ['seat', 'stone2', 'seat2', 'stone2', 'seat', 'marble']
    for (a0, b0, z0), (a1, b1, z1), col in zip(rings, rings[1:], cols):
        for k in range(N):
            q = [P(k, a0, b0) + V((0, 0, z0)), P(k + 1, a0, b0) + V((0, 0, z0)), P(k + 1, a1, b1) + V((0, 0, z1)), P(k, a1, b1) + V((0, 0, z1))]
            m.face(q, col, out=(0, 0, 1))
    # the podium wall round the arena, and the sand
    a1, b1, zp = A - 2.35, B - 2.2, 0.6
    for k in range(N):
        q = [P(k, a1, b1), P(k + 1, a1, b1), P(k + 1, a1, b1) + V((0, 0, zp)), P(k, a1, b1) + V((0, 0, zp))]
        mid = sum(q, V()) / 4
        m.face(q, 'marble', out=-V((mid.x, mid.y, 0)))
    m.face([P(k, a1, b1) + V((0, 0, 0.02)) for k in range(N)], 'sand', out=(0, 0, 1))
    return m.finish()


# ---------- Egypt: the pylon ----------
def pylon():
    """The temple's gateway: two battered towers with rolls at their edges and a cavetto cornice, painted reliefs,
    flag masts in their niches, the gate between them under its own cornice and the winged sun."""
    m = Model('pylon')
    tw, td, th, gw = 2.5, 1.3, 3.8, 1.15
    for sx in (-1, 1):
        x = sx * (gw / 2 + tw / 2)
        k = 0.8
        m.box((x, 0, 0), (tw, td, th), 'e_stone', taper=(k, 0.7))
        # the rolls (torus moulding) up the outer edges, the cornice on top
        for ex in (-1, 1):
            for ey in (-1, 1):
                m.rod((x + ex * tw / 2, ey * td / 2, 0), (x + ex * tw / 2 * k, ey * td / 2 * 0.7, th), 0.06, 5, 'e_stone2')
        m.box((x, 0, th), (tw * k + 0.1, td * 0.7 + 0.1, 0.1), 'e_stone2')
        m.box((x, 0, th + 0.1), (tw * k, td * 0.7, 0.32), 'e_stone', taper=(1.16, 1.3))
        m.box((x, 0, th + 0.42), (tw * k * 1.16, td * 0.7 * 1.3, 0.05), 'e_stone2')
        # the reliefs: the king smiting his foes, in colour, on the front face
        fy = lambda z: -(td / 2) * (1 - 0.3 * z / th) - 0.012                       # the battered front face
        zc = th * 0.42
        for (dx, dz, w, h, col) in ((-0.25, 0.0, 0.32, 1.25, 'e_blue'), (-0.25, 0.75, 0.22, 0.28, 'e_red'), (0.1, -0.2, 0.3, 0.8, 'e_ochre'),
                                    (0.42, -0.25, 0.22, 0.65, 'e_ochre'), (0.0, 1.25, tw * 0.62, 0.07, 'e_blue'), (0.0, -0.75, tw * 0.66, 0.07, 'e_blue')):
            cx, z0, z1 = x + dx, zc + dz - h / 2, zc + dz + h / 2
            m.face([(cx - w / 2, fy(z0), z0), (cx + w / 2, fy(z0), z0), (cx + w / 2, fy(z1), z1), (cx - w / 2, fy(z1), z1)], col, out=(0, -1, 0.15))
        # flag masts in their niches
        for o in (-0.38, 0.38):
            mx = x + o * tw * (0.9 if o > 0 else 0.9)
            m.face([(mx - 0.09, fy(0), 0.02), (mx + 0.09, fy(0), 0.02), (mx + 0.09, fy(th * 0.95), th * 0.95), (mx - 0.09, fy(th * 0.95), th * 0.95)], 'shadow', out=(0, -1, 0.15))
            m.cyl((mx, -td / 2 - 0.12, 0), 0.05, 0.035, th * 1.3, 5, 'e_wood', smooth=False)
            m.face([(mx, -td / 2 - 0.12, th * 1.22), (mx + 0.55, -td / 2 - 0.12, th * 1.2), (mx + 0.55, -td / 2 - 0.12, th * 1.28 - 0.1), (mx, -td / 2 - 0.12, th * 1.3)], 'e_red', out=(0, -1, 0))
            m.face([(mx, -td / 2 - 0.12, th * 1.22), (mx + 0.55, -td / 2 - 0.12, th * 1.2), (mx + 0.55, -td / 2 - 0.12, th * 1.28 - 0.1), (mx, -td / 2 - 0.12, th * 1.3)], 'e_red', out=(0, 1, 0))
    # the gate between the towers
    gh = th * 0.7
    m.box((0, 0, 0), (gw + 0.1, td * 0.8, gh), 'e_stone')
    m.box((0, 0, gh), (gw + 0.1, td * 0.8, 0.26), 'e_stone', taper=(1.14, 1.25))
    m.face([(-gw * 0.3, -td * 0.4 - 0.01, 0), (gw * 0.3, -td * 0.4 - 0.01, 0), (gw * 0.3, -td * 0.4 - 0.01, gh * 0.72), (-gw * 0.3, -td * 0.4 - 0.01, gh * 0.72)], 'dark', out=(0, -1, 0))
    # the winged sun over the door
    yd = -td * 0.4 - 0.02
    m.cyl((0, yd, gh * 0.83), 0.11, 0.11, 0.02, 10, 'gold', smooth=False)
    for sx in (-1, 1):
        m.face([(sx * 0.1, yd - 0.01, gh * 0.8), (sx * 0.5, yd - 0.01, gh * 0.84), (sx * 0.5, yd - 0.01, gh * 0.9), (sx * 0.1, yd - 0.01, gh * 0.9)], 'e_blue', out=(0, -1, 0))
    return m.finish()


# ---------- Carthage: the temple ----------
def punic_temple():
    """A temple on its podium: the cella under an Egyptian cornice with a frieze of uraei, the framed doorway with
    the winged sun, two free-standing pillars with voluted capitals before it, stairs up the front."""
    m = Model('punic_temple')
    W, L, ph = 3.0, 4.2, 0.55
    m.box((0, 0, 0), (W + 0.15, L + 0.15, 0.12), 'p_stone2')
    m.box((0, 0, 0.12), (W, L, ph - 0.22), 'p_stone')
    m.box((0, 0, ph - 0.1), (W + 0.1, L + 0.1, 0.1), 'p_stone2')
    for k in range(6):                                                               # stairs
        m.box((0, -L / 2 - 0.7 + (k + 0.5) * 0.1, 0), (1.6, 0.7 - k * 0.1, ph * (k + 1) / 6), 'p_stone' if k % 2 else 'p_stone2')
    cw, cl, chh, cy = 2.3, 2.7, 2.0, 0.45
    m.box((0, cy, ph), (cw, cl, chh), 'p_white')
    m.box((0, cy, ph + chh - 0.18), (cw + 0.04, cl + 0.04, 0.12), 'p_trim')       # the painted band
    m.box((0, cy, ph + chh), (cw, cl, 0.06), 'p_stone2')                          # the roll
    m.box((0, cy, ph + chh + 0.06), (cw, cl, 0.32), 'p_stone', taper=(1.18, 1.2))  # the cavetto
    m.box((0, cy, ph + chh + 0.38), (cw * 1.18, cl * 1.2, 0.05), 'p_stone2')
    # uraei along the front of the cornice
    yf = cy - cl * 1.2 / 2
    for i in range(9):
        x = -cw * 0.55 + i * cw * 1.1 / 8
        m.box((x, yf + 0.04, ph + chh + 0.43), (0.07, 0.06, 0.14), 'gold' if i % 2 else 'p_blue', taper=(0.5, 0.6))
    # the doorway: a frame, the dark opening, the winged sun on the lintel
    yd = cy - cl / 2 - 0.02
    m.box((0, yd - 0.04, ph), (0.95, 0.08, 1.5), 'p_stone2')
    m.face([(-0.33, yd - 0.081, ph), (0.33, yd - 0.081, ph), (0.33, yd - 0.081, ph + 1.25), (-0.33, yd - 0.081, ph + 1.25)], 'dark', out=(0, -1, 0))
    m.cyl((0, yd - 0.09, ph + 1.37), 0.07, 0.07, 0.02, 8, 'gold', smooth=False)
    for sx in (-1, 1):
        m.face([(sx * 0.06, yd - 0.09, ph + 1.33), (sx * 0.42, yd - 0.09, ph + 1.36), (sx * 0.42, yd - 0.09, ph + 1.41), (sx * 0.06, yd - 0.09, ph + 1.41)], 'p_blue', out=(0, -1, 0))
    # the two pillars and their capitals (two volutes on a block)
    for sx in (-1, 1):
        x, y = sx * 0.85, -L / 2 + 0.45
        m.cyl((x, y, ph), 0.2, 0.2, 0.12, 8, 'p_stone2', smooth=False)
        m.cyl((x, y, ph + 0.12), 0.16, 0.15, 1.75, 10, 'p_white')
        m.box((x, y, ph + 1.87), (0.5, 0.3, 0.12), 'p_trim')
        for vx in (-1, 1):
            m.rod((x + vx * 0.2, y - 0.17, ph + 1.98), (x + vx * 0.2, y + 0.17, ph + 1.98), 0.1, 8, 'p_stone2', caps=True)   # a volute
        m.box((x, y, ph + 1.99), (0.56, 0.36, 0.08), 'p_stone2')
    return m.finish()


# ---------- Gaul: the chief's hall ----------
def gaul_hall():
    """A great timber hall: low wattle walls between posts, a steep thatch hipped at the back and gabled at the front,
    crossed gable boards carved as horse heads, a porch on carved posts, painted shields along the walls."""
    m = Model('gaul_hall')
    W, L, wh = 2.2, 3.6, 0.6
    m.box((0, 0, 0), (W, L, wh), 'daub')
    for sx in (-1, 1):
        for j in range(7):
            m.box((sx * (W / 2 + 0.02), -L / 2 + 0.1 + j * (L - 0.2) / 6, 0), (0.1, 0.1, wh + 0.05), 'wood2')
    for j in (-1, 1):
        for i in range(4):
            m.box((-W / 2 + 0.1 + i * (W - 0.2) / 3, j * (L / 2 + 0.02), 0), (0.1, 0.1, wh + 0.05), 'wood2')
    # the roof: eaves out over the walls, the ridge high, hipped at the back
    ew, rh, z = W + 0.7, 2.2, wh - 0.08
    y0, y1, yh = -L / 2 - 0.35, L / 2 + 0.35, L / 2 - 0.6
    pts = {'fl': (-ew / 2, y0, z), 'fr': (ew / 2, y0, z), 'bl': (-ew / 2, y1, z), 'br': (ew / 2, y1, z), 'tf': (0, y0 + 0.15, z + rh), 'tb': (0, yh, z + rh)}
    c = V((0, 0, z + rh * 0.3))
    for name, q in (('l', ('fl', 'tf', 'tb', 'bl')), ('r', ('fr', 'br', 'tb', 'tf')), ('h', ('bl', 'tb', 'br'))):
        poly = [pts[k] for k in q]
        mid = sum((V(p) for p in poly), V()) / len(poly)
        m.face(poly, 'thatch', out=mid - c)
    m.face([pts['fl'], pts['fr'], pts['tf']], 'thatch2', out=(0, -1, 0.2))
    # a smoke louver on the ridge
    m.gable((0, 0.3, z + rh - 0.12), 0.35, 0.6, 0.22, 'thatch2')
    # the crossed boards and their horse heads
    for sx in (-1, 1):
        a = V((sx * 0.75, y0 + 0.1, z + rh - 0.75))
        b = V((-sx * 0.25, y0 + 0.13, z + rh + 0.35))
        d = (b - a).normalized()
        nrm = V((0, -1, 0))
        side = d.cross(nrm).normalized() * 0.05
        m.face([a - side, a + side, b + side, b - side], 'wood', out=nrm)
        m.box((b.x, b.y, b.z - 0.02), (0.1, 0.06, 0.16), 'wood2')
        m.box((b.x - sx * 0.07, b.y, b.z + 0.08), (0.14, 0.06, 0.06), 'wood2')
    # the porch on two carved posts
    for sx in (-1, 1):
        m.cyl((sx * 0.5, -L / 2 - 0.6, 0), 0.07, 0.06, 1.15, 6, 'wood', smooth=False)
        m.box((sx * 0.5, -L / 2 - 0.6, 1.15), (0.16, 0.16, 0.14), 'wood2')
    m.gable((0, -L / 2 - 0.35, 1.25), 1.4, 0.8, 0.45, 'thatch2', ends='wood')
    m.face([(-0.3, -L / 2 - 0.01, 0), (0.3, -L / 2 - 0.01, 0), (0.3, -L / 2 - 0.01, 0.52), (-0.3, -L / 2 - 0.01, 0.52)], 'dark', out=(0, -1, 0))
    # shields along the walls
    for sx in (-1, 1):
        for j, col in enumerate(('plaid1', 'plaid3', 'plaid2', 'plaid1')):
            y = -L / 2 + 0.6 + j * (L - 1.2) / 3
            x = sx * (W / 2 + 0.06)
            ring = [(x, y + 0.17 * cos(2 * pi * i / 8), wh * 0.55 + 0.2 * sin(2 * pi * i / 8)) for i in range(8)]
            m.face(ring, col, out=(sx, 0, 0))
    return m.finish()


# ---------- Egypt: the lighthouse ----------
def pharos():
    """The lighthouse: a square tower with rows of windows on its terrace, an octagon, a round lantern on columns,
    the fire and the god on top."""
    m = Model('pharos')
    m.box((0, 0, 0), (4.0, 4.0, 0.45), 'e_stone2')
    for cx in (-1, 1):
        for cy in (-1, 1):
            m.box((cx * 1.85, cy * 1.85, 0.45), (0.35, 0.35, 0.5), 'e_stone2')
    h1, w1 = 5.4, 2.3
    m.box((0, 0, 0.45), (w1, w1, h1), 'marble', taper=(0.88, 0.88))
    for row in range(5):
        z = 0.45 + 0.7 + row * 0.95
        k = 1 - (z - 0.45) / h1 * 0.12
        for side in range(4):
            a = side * pi / 2
            nx, ny = sin(a), -cos(a)
            tx, ty = cos(a), sin(a)
            for o in (-0.45, 0.45):
                cx0, cy0 = nx * (w1 / 2 * k + 0.01) + tx * o * k, ny * (w1 / 2 * k + 0.01) + ty * o * k
                m.face([(cx0 - tx * 0.1, cy0 - ty * 0.1, z), (cx0 + tx * 0.1, cy0 + ty * 0.1, z), (cx0 + tx * 0.1, cy0 + ty * 0.1, z + 0.32), (cx0 - tx * 0.1, cy0 - ty * 0.1, z + 0.32)], 'shadow', out=(nx, ny, 0))
    z1 = 0.45 + h1
    m.box((0, 0, z1), (w1 * 0.88 + 0.25, w1 * 0.88 + 0.25, 0.14), 'e_stone')
    m.cyl((0, 0, z1 + 0.14), 0.85, 0.75, 2.4, 8, 'marble', smooth=False, a0=pi / 8)
    m.cyl((0, 0, z1 + 2.54), 0.95, 0.95, 0.12, 8, 'e_stone', smooth=False, a0=pi / 8)
    z2 = z1 + 2.66
    for i in range(8):
        a = 2 * pi * i / 8
        m.cyl((0.5 * cos(a), 0.5 * sin(a), z2), 0.06, 0.06, 0.9, 5, 'marble')
    m.cyl((0, 0, z2), 0.32, 0.32, 0.8, 8, 'fire')
    m.cyl((0, 0, z2 + 0.9), 0.62, 0.3, 0.3, 10, 'e_stone', smooth=False)
    m.cyl((0, 0, z2 + 1.2), 0.1, 0.12, 0.9, 6, 'bronze')
    m.cyl((0, 0, z2 + 2.1), 0.11, 0.0, 0.25, 6, 'bronze', top=False)
    return m.finish()


LANDMARKS = {'roman_temple': roman_temple, 'amphitheatre': amphitheatre, 'pylon': pylon, 'punic_temple': punic_temple,
             'gaul_hall': gaul_hall, 'pharos': pharos}

if __name__ == '__main__':
    for key in [a for a in sys.argv[1:] if a in LANDMARKS] or list(LANDMARKS):
        if bpy.app.background:
            bpy.ops.wm.read_factory_settings(use_empty=True)
        ob = LANDMARKS[key]()
        print(f'{key}: {triangles(ob)} triangles -> {export(ob, key)}')
