"""Makes the diver's air tank of Last Breath: a toon-shaded model rendered to a transparent square tile, once for each theme.

Run it headless, with the output folder after the double dash:

    blender --background --factory-startup --python scripts/art/blender/air_tank.py -- <output folder>

It writes air-tank-dark-<size>.png and air-tank-light-<size>.png at 512 and 256 px, a WebP of each 256 px tile, and
air-tank.blend, a copy of the scene. The two 256 px WebP files are the ones the page loads: they are copied into
src/LastBreath.Web/wwwroot/art/ as air-tank-dark.webp and air-tank-light.webp.

Made with Blender 5.2.1. In that version every material and world already has a node tree, so the script never switches nodes on.
"""
import math
import os
import sys

import bmesh
import bpy
from mathutils import Matrix, Vector, noise

# Ramps are (base, shade, highlight), copied from PALETTE in scripts/art/build_art.py.
# The flat symbols follow the page theme through CSS. A bitmap cannot, so each theme gets its own render.
THEMES = {
    "dark": {"ink": "#05121b",
             "tank": ("#52a6e6", "#2a68ab", "#b0e0fa"), "steel": ("#8da9be", "#4f677a", "#d2e6f3"),
             "gold": ("#efb82a", "#a96f12", "#ffe070")},
    "light": {"ink": "#0a2231",
              "tank": ("#2b78c0", "#1d5192", "#8cc7ee"), "steel": ("#7f9db3", "#4a6276", "#c6dcea"),
              "gold": ("#e8aa14", "#9f650c", "#fcd95a")},
}
SIZES = (512, 256)
WEBP_BUDGET = 40_000

TILT = 48.0                    # degrees clockwise on screen
VIEW = {"azimuth": 25.0, "elevation": 36.0}
SUN = Vector((-0.45, 0.72, 0.55))   # toward the sun in camera space: left, up, toward the viewer
SHADE_BELOW, GLOSS_ABOVE = 0.20, 0.76   # ramp cuts on the diffuse value, which tops out near 0.86 for a sun of strength pi
OUTLINE_SHARE = 0.019         # mean visible outline as a share of the tile width; about 2 px on a 128 px tile
HULL_MIN = 0.45               # the thinnest the noise lets the outline get, as a share of its full thickness
FILL = 0.74                    # share of the tile the tank covers, like the flat symbols
SEED = 7319


def linear(hex_colour):
    channels = [int(hex_colour[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    return [c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4 for c in channels] + [1.0]


def arc(cx, cz, rx, rz, start, end, steps):
    return [(cx + rx * math.cos(math.radians(a)), cz + rz * math.sin(math.radians(a)))
            for a in (start + (end - start) * k / steps for k in range(steps + 1))]


def line(a, b, steps):
    return [(a[0] + (b[0] - a[0]) * k / steps, a[1] + (b[1] - a[1]) * k / steps) for k in range(steps + 1)]


def lathe(profile, closed=False, steps=48):
    bm = bmesh.new()
    verts = [bm.verts.new((r, 0.0, z)) for r, z in profile]
    edges = [bm.edges.new(pair) for pair in zip(verts, verts[1:])]
    if closed:
        edges.append(bm.edges.new((verts[-1], verts[0])))
    bmesh.ops.spin(bm, geom=verts + edges, axis=(0, 0, 1), cent=(0, 0, 0), angle=math.tau, steps=steps, use_merge=True)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    return bm


def box(size, bevel, segments=2):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=size, verts=bm.verts)
    bmesh.ops.bevel(bm, geom=bm.edges[:], offset=bevel, segments=segments, profile=0.5, affect="EDGES")
    return bm


def slab(outline, thickness, bevel):
    """An outline in the XY plane, pushed up into a thick plate with softened edges."""
    bm = bmesh.new()
    face = bm.faces.new([bm.verts.new((x, y, 0.0)) for x, y in outline])
    top = bmesh.ops.extrude_face_region(bm, geom=[face])
    bmesh.ops.translate(bm, vec=(0, 0, thickness), verts=[v for v in top["geom"] if isinstance(v, bmesh.types.BMVert)])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    rims = [e for e in bm.edges if abs(e.verts[0].co.z - e.verts[1].co.z) < 1e-6]
    bmesh.ops.bevel(bm, geom=rims, offset=bevel, segments=2, profile=0.5, affect="EDGES", clamp_overlap=True)
    return bm


def join_into(into, part):
    """Copies one bmesh into another through a scratch mesh, so several boxes become one part."""
    scratch = bpy.data.meshes.new("scratch")
    part.to_mesh(scratch)
    part.free()
    into.from_mesh(scratch)
    bpy.data.meshes.remove(scratch)


def place(bm, origin, axis=None, spin=0.0):
    """Moves a part built along +Z so that its axis points along `axis`, then to `origin`."""
    turn = Matrix.Rotation(math.radians(spin), 4, "Z")
    if axis is not None:
        turn = Vector((0, 0, 1)).rotation_difference(Vector(axis).normalized()).to_matrix().to_4x4() @ turn
    bmesh.ops.transform(bm, matrix=Matrix.Translation(origin) @ turn, verts=bm.verts)
    return bm


def shade(bm, sharp_above):
    """Smooth faces, with a hard edge wherever two faces meet at a steeper angle."""
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    for face in bm.faces:
        face.smooth = True
    for edge in bm.edges:
        if len(edge.link_faces) == 2 and edge.calc_face_angle(0) > math.radians(sharp_above):
            edge.smooth = False


def dent(bm, centre, radius, depth):
    """Pushes the surface toward the axis around a point: a dent in the body, a chip in the boot."""
    for v in bm.verts:
        d = (v.co - Vector(centre)).length
        if d < radius:
            pull = depth * math.cos(d / radius * math.pi / 2) ** 2
            flat = Vector((v.co.x, v.co.y, 0.0))
            v.co -= flat.normalized() * pull


def wobble(bm, amount, scale, offset):
    for v in bm.verts:
        k = 1 + amount * noise.noise(v.co * scale + offset)
        v.co.x *= k
        v.co.y *= k


def toon_material(name):
    """Diffuse -> Shader to RGB -> constant colour ramp -> emission: three flat bands, no gradients."""
    mat = bpy.data.materials.new(name)
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    nodes.clear()
    diffuse, to_rgb = nodes.new("ShaderNodeBsdfDiffuse"), nodes.new("ShaderNodeShaderToRGB")
    ramp, emit, out = nodes.new("ShaderNodeValToRGB"), nodes.new("ShaderNodeEmission"), nodes.new("ShaderNodeOutputMaterial")
    ramp.color_ramp.interpolation = "CONSTANT"
    ramp.color_ramp.elements.new(0.5)
    for element, position in zip(ramp.color_ramp.elements, (0.0, SHADE_BELOW, GLOSS_ABOVE)):
        element.position = position
    links.new(diffuse.outputs[0], to_rgb.inputs[0])
    links.new(to_rgb.outputs[0], ramp.inputs[0])
    links.new(ramp.outputs[0], emit.inputs[0])
    links.new(emit.outputs[0], out.inputs[0])
    return mat


def flat_material(name):
    mat = bpy.data.materials.new(name)
    nodes = mat.node_tree.nodes
    nodes.clear()
    emit, out = nodes.new("ShaderNodeEmission"), nodes.new("ShaderNodeOutputMaterial")
    mat.node_tree.links.new(emit.outputs[0], out.inputs[0])
    return mat


def set_ramp(mat, ramp):
    base, shade_tone, light = ramp
    node = next(n for n in mat.node_tree.nodes if n.type == "VALTORGB")
    for element, colour in zip(node.color_ramp.elements, (shade_tone, base, light)):
        element.color = linear(colour)


def set_flat(mat, colour):
    next(n for n in mat.node_tree.nodes if n.type == "EMISSION").inputs["Color"].default_value = linear(colour)


def reset_scene():
    for obj in list(bpy.data.objects):
        bpy.data.objects.remove(obj)
    for block in (bpy.data.meshes, bpy.data.materials, bpy.data.lights, bpy.data.cameras):
        for item in list(block):
            block.remove(item)


def build():
    """Returns the parts, the materials by name, and the rig the parts hang from."""
    mats = {name: toon_material(name) for name in ("tank", "steel", "gold")}
    mats.update({name: flat_material(name) for name in ("ink", "glint", "face")})
    ink_mat = mats["ink"]
    ink_mat.use_backface_culling = True
    rig = bpy.data.objects.new("tank-rig", None)
    bpy.context.scene.collection.objects.link(rig)
    parts = []

    def add(name, bm, material, outline=True, hard=50):
        if hard is not None:
            shade(bm, hard)
        mesh = bpy.data.meshes.new(name)
        bm.to_mesh(mesh)
        bm.free()
        obj = bpy.data.objects.new(name, mesh)
        obj.parent = rig
        obj.data.materials.append(mats[material])
        bpy.context.scene.collection.objects.link(obj)
        if outline:
            obj.data.materials.append(ink_mat)
            group = obj.vertex_groups.new(name="ink")
            for v in mesh.vertices:
                group.add([v.index], max(0.0, min(1.0, 0.5 + 1.2 * noise.noise(v.co * 2.2 + Vector((SEED, 3.1, 7.7))))), "REPLACE")
            hull = obj.modifiers.new("outline", "SOLIDIFY")
            hull.offset = 1.0
            hull.use_flip_normals = True
            hull.use_even_offset = False   # even offset spikes the shell at the hard edges of the valve block
            hull.material_offset = 1
            hull.vertex_group = "ink"
            hull.thickness_vertex_group = HULL_MIN
            parts.append(hull)
        return obj

    offset = Vector((SEED, 11.0, 5.0))
    radius, wall = 1.0, 2.8
    body = lathe([(0.0, 0.1), (radius - 0.31, 0.1)] + arc(radius - 0.31, 0.5, 0.31, 0.4, -90, 0, 6)[1:] + line((radius, 0.5), (radius, wall), 14)[1:]
                 + arc(0.0, wall, radius, 0.62, 0, 72, 12)[1:] + [(0.28, wall + 0.7), (0.0, wall + 0.7)])
    wobble(body, 0.03, 1.4, offset)
    dent(body, (0.74, -0.65, 2.15), 0.4, 0.07)
    add("body", body, "tank")

    boot_edge = arc(radius - 0.1, 0.16, 0.17, 0.16, -90, 0, 5) + line((radius + 0.07, 0.16), (radius + 0.07, 0.32), 3)[1:] + arc(radius, 0.32, 0.07, 0.12, 0, 90, 5)[1:]
    boot = lathe([(0.0, 0.0)] + boot_edge + [(0.0, 0.44)])
    wobble(boot, 0.025, 1.6, offset)
    dent(boot, (0.95, 0.52, 0.34), 0.28, 0.11)
    add("boot", boot, "steel")

    strap = lathe([(radius - 0.03, 1.52), (radius + 0.03, 1.52), (radius + 0.05, 1.54), (radius + 0.05, 1.76), (radius + 0.03, 1.78), (radius - 0.03, 1.78)], closed=True)
    bmesh.ops.transform(strap, matrix=Matrix.Rotation(math.radians(1.5), 4, "X"), verts=strap.verts)
    add("strap", strap, "steel")

    # everything above the body hangs from the neck, so one drop shortens the whole valve assembly
    def top(bm):
        bmesh.ops.translate(bm, vec=(0, 0, -0.3), verts=bm.verts)
        return bm

    add("collar", top(lathe([(0.0, 3.65), (0.34, 3.65), (0.34, 3.77), (0.43, 3.79), (0.43, 3.87), (0.34, 3.89), (0.34, 4.07), (0.0, 4.07)])), "steel")
    valve = box((1.0, 0.8, 0.7), 0.1)
    bmesh.ops.transform(valve, matrix=Matrix.Translation((0.02, 0.0, 4.4)) @ Matrix.Rotation(math.radians(4), 4, "Z"), verts=valve.verts)
    add("valve", top(valve), "gold")
    rim = lathe([(0.56, -0.1), (0.74, -0.1), (0.78, -0.06), (0.78, 0.06), (0.74, 0.1), (0.56, 0.1)], closed=True, steps=36)
    wobble(rim, 0.03, 1.8, offset)
    add("wheel-rim", top(place(rim, (0.0, 0.0, 5.3), spin=17)), "gold")
    spokes = bmesh.new()
    for k in range(3):
        arm = box((0.66, 0.26, 0.15), 0.03, 1)
        bmesh.ops.transform(arm, matrix=Matrix.Rotation(math.radians(17 + 120 * k), 4, "Z") @ Matrix.Translation((0.34, 0.0, 0.0)), verts=arm.verts)
        join_into(spokes, arm)
    add("wheel-spokes", top(place(spokes, (0.0, 0.0, 5.3))), "gold", outline=False)
    add("stem", top(lathe([(0.0, 4.7), (0.13, 4.7), (0.13, 5.33), (0.0, 5.33)])), "steel")
    add("hub", top(lathe([(0.0, 5.18), (0.2, 5.18), (0.24, 5.22), (0.24, 5.38), (0.2, 5.42), (0.0, 5.42)])), "steel", outline=False)
    add("port", top(place(lathe([(0.0, 0.0), (0.17, 0.0), (0.17, 0.4), (0.0, 0.4)]), (-0.4, 0.0, 4.4), axis=(-1, 0, 0))), "gold")
    add("port-cap", top(place(lathe([(0.0, 0.0), (0.23, 0.0), (0.23, 0.1), (0.0, 0.1)]), (-0.8, 0.0, 4.4), axis=(-1, 0, 0))), "steel")

    aim = Vector((math.cos(math.radians(-35)), math.sin(math.radians(-35)), 0.0))
    at = lambda d: Vector((0.0, 0.0, 4.4)) + aim * d
    add("gauge-stub", top(place(lathe([(0.0, 0.0), (0.13, 0.0), (0.13, 0.8), (0.0, 0.8)]), at(0.4), axis=aim)), "steel", outline=False)
    add("gauge", top(place(lathe([(0.0, 0.0), (0.37, 0.0), (0.43, 0.05), (0.43, 0.17), (0.37, 0.22), (0.0, 0.22)]), at(1.2), axis=aim)), "gold")
    add("gauge-face", top(place(lathe([(0.0, 0.0), (0.32, 0.0), (0.32, 0.01), (0.0, 0.01)]), at(1.2 + 0.225), axis=aim)), "face", outline=False, hard=None)
    needle = box((0.05, 0.3, 0.012), 0.004, 1)
    bmesh.ops.transform(needle, matrix=Matrix.Rotation(math.radians(38), 4, "Z") @ Matrix.Translation((0, 0.06, 0.0)), verts=needle.verts)
    add("gauge-needle", top(place(needle, at(1.2 + 0.235), axis=aim)), "ink", outline=False, hard=None)
    return parts, mats, rig


def glint(rig, mats, cam_matrix, tilt):
    """A round-ended streak on the lit flank of the body, like the SVG glint."""
    right, up, back = (cam_matrix @ Vector(a) for a in ((1, 0, 0), (0, 1, 0), (0, 0, 1)))
    axis = tilt @ Vector((0, 0, 1))
    a_screen = Vector((right.dot(axis), up.dot(axis))).normalized()
    light = Vector((right.dot(sun_world(cam_matrix)), up.dot(sun_world(cam_matrix))))
    lit = (light - a_screen * light.dot(a_screen)).normalized()
    best, phi = 9.0, 0.0
    for k in range(720):
        a = math.tau * k / 720
        n = tilt @ Vector((math.cos(a), math.sin(a), 0))
        if n.dot(back) < 0.15:
            continue
        side = Vector((right.dot(n), up.dot(n))).dot(lit)
        if abs(side - 0.66) < best:
            best, phi = abs(side - 0.66), a
    half, length, r = 0.065, 0.62, 1.04
    pts = [(half * math.cos(t), half * math.sin(t)) for t in (math.pi * k / 8 for k in range(9))]
    bottom = [(-x, -y) for x, y in pts]
    outline = bottom + [(x, y + length) for x, y in pts]
    bm = bmesh.new()
    verts = [bm.verts.new((r * math.cos(phi + u / r), r * math.sin(phi + u / r), 2.0 + v)) for u, v in outline]
    bm.faces.new(verts)
    bmesh.ops.triangulate(bm, faces=bm.faces)
    mesh = bpy.data.meshes.new("glint")
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new("glint", mesh)
    obj.parent = rig
    obj.data.materials.append(mats["glint"])
    bpy.context.scene.collection.objects.link(obj)


def sun_world(cam_matrix):
    return cam_matrix @ SUN.normalized()


def main(out_dir):
    scene = bpy.context.scene
    reset_scene()
    az, el = math.radians(VIEW["azimuth"] - 90), math.radians(VIEW["elevation"])
    toward_cam = Vector((math.cos(az) * math.cos(el), math.sin(az) * math.cos(el), math.sin(el)))
    cam_matrix = (-toward_cam).to_track_quat("-Z", "Y").to_matrix()
    tilt = Matrix.Rotation(math.radians(-TILT), 3, cam_matrix @ Vector((0, 0, 1)))

    parts, mats, rig = build()
    rig.rotation_euler = tilt.to_euler()
    glint(rig, mats, cam_matrix, tilt)
    bpy.context.view_layer.update()

    # ortho scale and centring from the real vertices, so the tank fills the tile whatever its proportions
    spots = [(cam_matrix.inverted() @ (o.matrix_world @ v.co)) for o in bpy.data.objects if o.type == "MESH" for v in o.data.vertices]
    lo = Vector((min(p.x for p in spots), min(p.y for p in spots), 0))
    hi = Vector((max(p.x for p in spots), max(p.y for p in spots), 0))
    scale = max(hi.x - lo.x, hi.y - lo.y) / FILL
    centre = cam_matrix @ Vector(((lo.x + hi.x) / 2, (lo.y + hi.y) / 2, 0))
    for hull in parts:
        hull.thickness = OUTLINE_SHARE * scale / (HULL_MIN + (1 - HULL_MIN) / 2)   # the weights average one half

    cam = bpy.data.objects.new("camera", bpy.data.cameras.new("camera"))
    cam.data.type = "ORTHO"
    cam.data.ortho_scale = scale
    cam.data.clip_end = 200
    cam.location = centre + toward_cam * 40
    cam.rotation_euler = cam_matrix.to_euler()
    sun = bpy.data.objects.new("sun", bpy.data.lights.new("sun", "SUN"))
    sun.data.use_shadow = False
    sun.data.energy = math.pi
    sun.rotation_euler = (-sun_world(cam_matrix)).to_track_quat("-Z", "Y").to_euler()
    for obj in (cam, sun):
        scene.collection.objects.link(obj)
    scene.camera = cam

    scene.render.engine = "BLENDER_EEVEE"
    scene.eevee.use_raytracing = False
    scene.eevee.use_shadows = False
    scene.eevee.taa_render_samples = 64
    scene.render.film_transparent = True
    scene.render.filter_size = 1.0
    scene.view_settings.view_transform = "Standard"
    scene.view_settings.look = "None"
    scene.render.dither_intensity = 0.0
    scene.world = scene.world or bpy.data.worlds.new("world")
    scene.world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.0
    scene.render.resolution_percentage = 100
    scene.render.use_freestyle = False
    bpy.context.view_layer.use_freestyle = False
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.image_settings.color_depth = "8"

    formats = {i.identifier for i in bpy.types.ImageFormatSettings.bl_rna.properties["file_format"].enum_items}
    sizes = {}
    for theme, colours in THEMES.items():
        for name in ("tank", "steel", "gold"):
            set_ramp(mats[name], colours[name])
        set_flat(mats["ink"], colours["ink"])
        set_flat(mats["glint"], colours["tank"][2])
        set_flat(mats["face"], colours["tank"][2])
        for size in SIZES:
            scene.render.resolution_x = scene.render.resolution_y = size
            bpy.ops.render.render()
            shot = bpy.data.images["Render Result"]
            scene.render.image_settings.file_format = "PNG"
            scene.render.image_settings.compression = 100
            shot.save_render(f"{out_dir}/air-tank-{theme}-{size}.png", scene=scene)
            if size == 256 and "WEBP" in formats:
                scene.render.image_settings.file_format = "WEBP"
                for quality in range(100, 0, -5):
                    scene.render.image_settings.quality = quality
                    shot.save_render(f"{out_dir}/air-tank-{theme}-{size}.webp", scene=scene)
                    if os.path.getsize(f"{out_dir}/air-tank-{theme}-{size}.webp") <= WEBP_BUDGET:
                        sizes[theme] = quality
                        break
    print("webp quality per theme", sizes)
    bpy.ops.wm.save_as_mainfile(filepath=f"{out_dir}/air-tank.blend", copy=True)


def _out_dir():
    rest = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    if not rest:
        sys.exit("usage: blender --background --factory-startup --python air_tank.py -- <output folder>")
    os.makedirs(rest[0], exist_ok=True)
    return rest[0]


main(_out_dir())
