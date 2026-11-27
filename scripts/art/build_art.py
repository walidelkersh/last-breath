"""Draws the art for the board: the water panel, the empty cell wells, the crates, the jackpot medals and the oxygen bottles,
the mark of the game, a bottle with a bubble, which is also written out as the favicon, and the water scene behind the page.

Every symbol is flat and cel shaded. The rules sit in the data below, and the audit at the end of
the script fails the build when a file or a colour breaks them. The sprite holds every symbol once.
The page inlines it, so the colours come from CSS variables and follow the theme. The single files
carry their own palette, so they also work as an image.

The air tank is not drawn here. scripts/art/blender/air_tank.py renders it into two WebP files, one for each theme,
which sit beside the SVG files. This script never writes or removes them. The audit only checks that they are there and small.

    python -I scripts/art/build_art.py           write the files
    python -I scripts/art/build_art.py --check   exit 1 if a file differs from what would be written
"""
import argparse
import math
import random
import re
import sys
import zlib
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SITE = ROOT / "src" / "LastBreath.Web" / "wwwroot"
OUT = SITE / "art"
FAVICON = "../favicon.svg"     # named from the art folder, written beside it

# Style rules. One light from above and a little to the left, one outline weight, one highlight shape.
SEED = 7319
OUTLINE = 1.7                 # visible weight in pixels at the reference tile, on every outlined shape; app.css scales it with the board
GLINT = 0.6                   # the one highlight shape: a round-capped stroke on an edge that faces the light, this share of the outline
GLINT_LENGTH = (6, 18)
LIGHT = (-0.2, -0.98)
WOBBLE = {"warp": 0.45, "wavelength": 36.0, "jitter": 0.2, "step": 7.0}
TILE = (115, 100)             # the aspect of a tile on the board, so a symbol fills it
PANEL = (600, 330)
SCENE = (1600, 900)
# The scene is one picture the size of a screen, so it has a budget of its own, raised from 8 to 10 KB for the wreck and the fish.
# The total counts every file here and both renders, although a page loads the sprite, the scene and only one render. It was
# raised from 150 to 160 KB for the seabed, the hull, the current and the kelp that make the dive cards into places.
BUDGET = {"file_bytes": 6000, "scene_bytes": 10_000, "render_bytes": 20_000, "total_bytes": 160_000}
# The text colours of the page in app.css. The scene sits under text, so the audit keeps every tone of it readable under these.
PAGE = {"dark": {"text": "#e8eff3", "muted": "#a7bbc7"}, "light": {"text": "#18252e", "muted": "#47565f"}}
SCENE_MATERIALS = ("deep", "seabed", "rock", "kelp")
RENDERS = ("air-tank-dark.webp", "air-tank-light.webp")
WELLS = "abc"
VARIANTS = "ab"
BOTTLE = (20, 40)
MARK = (40, 40)

# A ramp is (base, shade, highlight). Shade is always darker than the base and highlight lighter.
# The board is deep water in both themes, so what is drawn on it, from the wells to the coins, has one set of tones in both.
BOARD = {
    "water": ("#12465e", "#0e3b52", "#1c5a76"),
    "well": ("#0f4259", "#0a3045", "#2f7897"),
    "wood-low": ("#b9805e", "#7a4b3a", "#e0a583"),
    "wood-mid": ("#d98a40", "#8d4e20", "#f5b76d"),
    "wood-high": ("#e0645a", "#80322f", "#f79a8a"),
    "steel": ("#8da9be", "#4f677a", "#d2e6f3"),
    "gold": ("#efb82a", "#a96f12", "#ffe070"),
    "tank": ("#52a6e6", "#2a68ab", "#b0e0fa"),
    "verdigris": ("#3fae9f", "#23766f", "#8be0d0"),
    "gem": ("#35c9d6", "#1c8b9c", "#a5f2f7"),
    "amber": ("#f0a63a", "#a2661a", "#ffd27a"),
    "empty": ("#31566d", "#1f3f52", "#4c748c"),
    # The seabed and the wreck of the dive cards: a sand that the water has turned grey-green, and a hull a little darker than the water.
    "sand": ("#3d6670", "#2b505b", "#5b8890"),
    "hull": ("#0c3346", "#082738", "#174a63"),
}

PALETTE = {
    "dark": {
        "ink": "#05121b",
        "plate": "#05121b", "plate-ink": "#e6f4fb",
        "deep": ("#112a38", "#0e222e", "#163446"),
        "seabed": ("#13262f", "#0f1e26", "#1a3340"),
        "rock": ("#1a2f3b", "#13242e", "#244150"),
        "kelp": ("#123a38", "#0e2d2c", "#1a4d48"),
        **BOARD,
        "shaft": "#ffffff0d",
    },
    "light": {
        "ink": "#0a2231",
        "plate": "#f2f9fc", "plate-ink": "#0a2231",
        "deep": ("#d3e3ec", "#c6dbe6", "#e0ecf2"),
        "seabed": ("#c8dbe5", "#bcd3df", "#d6e5ed"),
        "rock": ("#c1d5e0", "#b8cfdb", "#d0e0e9"),
        "kelp": ("#bfd9d8", "#b6d1d2", "#cde3e2"),
        **BOARD,
        "shaft": "#ffffff26",
    },
}
NOT_MATERIALS = {"ink", "plate", "plate-ink", "shaft"}
# New materials go at the end, so that the class names in a file already drawn do not change.
MATERIALS = ("gold", "steel", "tank", "water", "well", "wood-high", "wood-low", "wood-mid", "verdigris", "gem", "amber", "empty",
             *SCENE_MATERIALS, "sand", "hull")
CODES = {name: f"m{index}" for index, name in enumerate(MATERIALS)}


def num(value):
    text = f"{value:.1f}"
    if text.endswith(".0"):
        text = text[:-2]
    if text == "-0":
        text = "0"
    if text.startswith("0."):
        return text[1:]
    return "-" + text[2:] if text.startswith("-0.") else text


def join(tokens):
    text = tokens[0]
    for before, token in zip(tokens, tokens[1:]):
        text += token if token[0] == "-" or (token[0] == "." and "." in before) else " " + token
    return text


def path_data(points, closed):
    """Absolute start, then relative steps between the rounded points, so rounding never drifts."""
    rounded = [(round(x, 1), round(y, 1)) for x, y in points]
    steps = [num(b - a) for p, q in zip(rounded, rounded[1:]) if p != q for a, b in zip(p, q)]
    return f"M{join([num(v) for v in rounded[0]])}l{join(steps)}" + ("z" if closed else "")


def clip(points, normal, depth_from):
    """Keeps the part of a polygon on the far side of a line, which is where a shadow band sits."""
    kept = []
    for index, p in enumerate(points):
        q = points[(index + 1) % len(points)]
        dp = normal[0] * p[0] + normal[1] * p[1] - depth_from
        dq = normal[0] * q[0] + normal[1] * q[1] - depth_from
        if dp >= 0:
            kept.append(p)
        if (dp >= 0) != (dq >= 0):
            t = dp / (dp - dq)
            kept.append((p[0] + t * (q[0] - p[0]), p[1] + t * (q[1] - p[1])))
    return kept


def arc(cx, cy, rx, ry, start, end, steps):
    return [(cx + rx * math.cos(math.radians(a)), cy + ry * math.sin(math.radians(a)))
            for a in (start + (end - start) * k / steps for k in range(steps + 1))]


def rounded_box(x0, y0, x1, y1, radius, steps=4):
    corners = ((x1 - radius, y0 + radius, -90), (x1 - radius, y1 - radius, 0),
               (x0 + radius, y1 - radius, 90), (x0 + radius, y0 + radius, 180))
    return [p for cx, cy, a in corners for p in arc(cx, cy, radius, radius, a, a + 90, steps)]


def box(x0, y0, x1, y1):
    return [(x0, y0), (x1, y0), (x1, y1), (x0, y1)]


class Art:
    def __init__(self, name, size, seed=None, rot=0.0, shift=(0, 0), scale=1.0):
        self.name = name
        self.size = size
        self.rot = rot
        self.shift = shift
        self.scale = scale
        self.seed = f"{SEED}:{seed or name}"
        shape_rng = random.Random(self.seed)
        self.phase = [shape_rng.uniform(0, math.tau) for _ in range(4)]
        self.rng = random.Random(self.seed + ":draw")
        self.items = []

    def at(self, x, y):
        """Turns a point of the drawing into a point on the page: tilt first, then a smooth warp and a small jitter.
        The warp depends only on the position, so two shapes that share an edge keep sharing it."""
        cx, cy = self.size[0] / 2, self.size[1] / 2
        c, s = math.cos(math.radians(self.rot)), math.sin(math.radians(self.rot))
        x, y = cx + (x - cx) * c - (y - cy) * s + self.shift[0], cy + (x - cx) * s + (y - cy) * c + self.shift[1]
        k = math.tau / (WOBBLE["wavelength"] * self.scale)
        w = WOBBLE["warp"] * self.scale
        px, py, qx, qy = self.phase
        wx = x + w * (math.sin(k * y + px) + 0.5 * math.sin(1.9 * k * (x + y) + py))
        wy = y + w * (math.sin(k * x + qx) + 0.5 * math.sin(1.7 * k * (x - y) + qy))
        h = zlib.crc32(f"{self.seed}:{round(x * 3)}:{round(y * 3)}".encode())
        j = WOBBLE["jitter"] * self.scale
        return wx + ((h & 255) / 255 - 0.5) * 2 * j, wy + (((h >> 8) & 255) / 255 - 0.5) * 2 * j

    def edge(self, points):
        step = WOBBLE["step"] * self.scale
        out = []
        for index, p in enumerate(points):
            q = points[(index + 1) % len(points)]
            parts = max(1, round(math.dist(p, q) / step))
            out += [(p[0] + (q[0] - p[0]) * t / parts, p[1] + (q[1] - p[1]) * t / parts) for t in range(parts)]
        return [self.at(*p) for p in out]

    def shape(self, points, material, tone="b", outline=True, extra=""):
        classes = tone + (" o" if outline else "") + (f" {extra}" if extra else "")
        self.items.append((material, f'<path class="{classes}" d="{path_data(self.edge(points), True)}"/>'))

    def shade(self, points, material, depth, toward_light=False):
        """A band of the shade tone on the side away from the light, or on the lit side for a hollow."""
        a = math.radians(-self.rot)
        nx, ny = LIGHT if toward_light else (-LIGHT[0], -LIGHT[1])
        normal = (nx * math.cos(a) - ny * math.sin(a), nx * math.sin(a) + ny * math.cos(a))
        band = clip(points, normal, max(normal[0] * x + normal[1] * y for x, y in points) - depth)
        if len(band) >= 3:
            self.shape(band, material, "s", outline=False)

    def glint(self, start, end, material, via=None):
        assert GLINT_LENGTH[0] <= math.dist(start, end) <= GLINT_LENGTH[1], (self.name, start, end)
        middle = via or ((start[0] + end[0]) / 2, (start[1] + end[1]) / 2)
        points = [self.at(*p) for p in (start, middle, end)]
        self.items.append((material, f'<path class="g" d="{path_data(points, False)}"/>'))

    def flat(self, points, material, cls, warp=False):
        """A shape with no edge subdivision: the light shafts keep straight edges, and a ridge only warps the points it is given."""
        placed = [self.at(*p) for p in points] if warp else points
        self.items.append((material, f'<path class="{cls}" d="{path_data(placed, True)}"/>'))

    def strip(self, start, end, thickness, material, tone, extra=""):
        length = math.dist(start, end)
        nx, ny = (end[1] - start[1]) / length * thickness / 2, (start[0] - end[0]) / length * thickness / 2
        quad = [(start[0] + nx, start[1] + ny), (end[0] + nx, end[1] + ny), (end[0] - nx, end[1] - ny), (start[0] - nx, start[1] - ny)]
        self.shape(quad, material, tone, outline=False, extra=extra)

    def blob(self, cx, cy, rx, ry, material, tone="b", outline=False, corners=8):
        points = []
        for k in range(corners):
            angle = math.tau * (k + self.rng.uniform(-0.15, 0.15)) / corners
            reach = self.rng.uniform(0.9, 1.08)
            points.append((cx + rx * reach * math.cos(angle), cy + ry * reach * math.sin(angle)))
        self.shape(points, material, tone, outline)

    def body(self):
        out, open_material = [], None
        for material, markup in self.items:
            if material != open_material:
                out.append("</g>" if open_material else "")
                out.append(f'<g class="{CODES[material]}">' if material else "")
                open_material = material
            out.append(markup)
        if open_material:
            out.append("</g>")
        return "".join(out)

    def materials(self):
        return {material for material, _ in self.items if material}


def jitter(rng, spread=0.9):
    return rng.uniform(-spread, spread)


# Where each variant puts its planks, seams and nails, as shares of the front face. The box is the same in both.
CRATE = {
    "a": {"rows": (0.37, 0.69), "seams": (0.36, 0.70), "joints": (0.44, 0.70, 0.27),
          "nails": ((5.5, 11), (-5, 12.5), (4.5, 9), (-6, 7.5))},
    "b": {"rows": (0.31, 0.64), "seams": (0.42, 0.74), "joints": (0.60, 0.33, 0.66),
          "nails": ((6.2, 8), (-6.5, 9.2), (5, 7), (-4.5, 10))},
}


def grain(art, material, tone, x0, x1, y0, y1, count):
    """Long, thin strokes along the planks, in the tone next to the plank's own. They carry the class gr, whose
    opacity is --grain, so a small tile can quiet them without changing the drawing."""
    for _ in range(count):
        x, y = art.rng.uniform(x0 + 3, x1 - 36), art.rng.uniform(y0 + 2.5, y1 - 2.5)
        art.strip((x, y), (x + art.rng.uniform(18, 30), y + art.rng.uniform(-0.6, 0.6)), 0.9, material, tone, extra="gr")


def crate(tier, variant):
    art = Art(f"crate-{tier}-{variant}", TILE, seed="crate", rot=-2.0)
    r = art.rng
    plan = CRATE[variant]
    wood = f"wood-{tier}"
    ax, ay = 10 + jitter(r), 34 + jitter(r)
    bx, by = 86 + jitter(r), 34 + jitter(r)
    cx, cy = 86 + jitter(r), 84 + jitter(r)
    dx, dy = 10 + jitter(r), 84 + jitter(r)
    depth = (17 + jitter(r, 0.5), -14 + jitter(r, 0.5))
    a, b, c, d = (ax, ay), (bx, by), (cx, cy), (dx, dy)
    plus = lambda p: (p[0] + depth[0], p[1] + depth[1])
    front, top, side = [a, b, c, d], [a, plus(a), plus(b), b], [b, plus(b), plus(c), c]
    rows = tuple(ay + share * (dy - ay) for share in plan["rows"])

    art.shape(side, wood, "s")
    art.shape(top, wood, "h")
    art.shape(front, wood, "b")
    art.shade(front, wood, 6)
    art.shape([a, b, (bx, by + 4.5), (ax, ay + 4.5)], wood, "s", outline=False)
    for y in rows:
        art.strip((bx, y), plus((bx, y - 0.6)), 1.4, None, "i")
        art.strip((ax + 1.5, y), (bx - 1, y + 0.5), 1.5, wood, "s")
    for share in plan["seams"]:
        left = (ax + (plus(a)[0] - ax) * share, ay + (plus(a)[1] - ay) * share)
        right = (bx + (plus(b)[0] - bx) * share, by + (plus(b)[1] - by) * share)
        art.strip(left, right, 1.5, wood, "b")
    spans = ((ay + 3, rows[0] - 1.5), (rows[0] + 2, rows[1] - 1.5), (rows[1] + 2, dy - 2))
    for share, (y0, y1) in zip(plan["joints"], spans):
        art.strip((ax + share * (bx - ax), y0), (ax + share * (bx - ax) + 0.4, y1), 1.4, wood, "s")
    grain(art, wood, "s", ax, bx, ay + 5, rows[0], 1)
    grain(art, wood, "s", ax, bx, rows[0], rows[1], 1)
    grain(art, wood, "b", ax + 6, bx + 8, ay - 11, ay - 3, 1)
    for (nx, ny), row in zip(plan["nails"], (ay, ay, rows[0], rows[0])):
        x = ax + nx if nx > 0 else bx + nx
        art.blob(x + jitter(r, 0.6), row + ny + jitter(r, 0.6), 1.3, 1.2, wood, "s", corners=6)
    art.glint((ax + 3.6, ay + 8), (ax + 3.6, ay + 19), wood)

    if tier == "low":
        plain_details(art, a, b, d, rows, variant)
    elif tier == "mid":
        strapped_details(art, a, b, d, variant)
    else:
        gilded_details(art, a, b, c, d, variant)
    return art


def plain_details(art, a, b, d, rows, variant):
    wood = "wood-low"
    x = a[0]
    if variant == "a":
        plank = [(x - 3.4, rows[0] + 1.4), (x + 1.6, rows[0] + 1.2), (x + 1.6, rows[1] - 1.2), (x - 3.0, rows[1] - 1.6)]
        art.shape(plank, wood, "b")
        art.shade(plank, wood, 3)
        return
    brace = [(x + 5, a[1] + 1.5), (x + 15, a[1] + 1.5), (b[0] - 5, d[1] - 1.5), (b[0] - 15, d[1] - 1.5)]
    art.shape(brace, wood, "b")
    art.shade(brace, wood, 5)
    grain(art, wood, "s", x + 12, b[0] - 12, a[1] + 14, d[1] - 14, 1)
    for nx, ny in ((x + 10, a[1] + 6), (b[0] - 10, d[1] - 6)):
        art.blob(nx, ny, 1.4, 1.3, wood, "s", corners=6)


def strapped_details(art, a, b, d, variant):
    top, bottom = a[1] - 0.4, d[1] + 1.8
    straps = ((a[0] + 15.5, 9.4), (a[0] + 50.5, 8.6)) if variant == "a" else ((a[0] + 22, 8.6), (a[0] + 60, 9.8))
    for left, width in straps:
        art.shape([(left, top), (left + width, top), (left + width + 17, top - 14), (left + 17, top - 14)], "steel", "b")
        body = [(left, top), (left + width, top - 0.2), (left + width + 0.5, bottom), (left + 0.3, bottom - 0.3)]
        art.shape(body, "steel", "b")
        art.shade(body, "steel", 4.5)
        art.glint((left + 2.4, top + 7), (left + 2.4, top + 20), "steel")
        for y in (top + 6, top + 28):
            art.blob(left + width / 2 + jitter(art.rng, 0.4), y, 1.2, 1.2, "steel", "h", corners=6)
        for y in (top + art.rng.uniform(17, 24), top + art.rng.uniform(33, 40)):
            x = left + art.rng.choice((1.8, width - 1.8))
            art.blob(x, y, 1.5, 2.2, "wood-mid", "s", corners=6)
            art.strip((x, y + 1), (x + 0.2, y + art.rng.uniform(5, 8)), 1.0, "wood-mid", "s")
    if variant == "b":
        art.shape(box(a[0] - 2.2, top - 2, a[0] + 8.5, top + 9), "steel", "b")
        art.shape(box(b[0] - 8.5, top - 2, b[0] + 2.2, top + 9), "steel", "b")
        art.blob(a[0] + 3.4, top + 3.5, 1.1, 1.1, "steel", "h", corners=6)
        art.blob(b[0] - 3.4, top + 3.5, 1.1, 1.1, "steel", "h", corners=6)


def gilded_details(art, a, b, c, d, variant):
    gold = "gold"
    band = 8 if variant == "a" else 6
    art.shape([a, b, (b[0], b[1] + band), (a[0], a[1] + band)], gold, "b")
    art.shade([a, b, (b[0], b[1] + band), (a[0], a[1] + band)], gold, 2.5)
    for corner, sx, sy in ((a, -1, -1), (b, 1, -1), (d, -1, 1), (c, 1, 1)):
        x, y = corner
        grow = 1.0 if variant == "a" or sy < 0 else 0.7
        x0, x1 = (x - 2.4, x + 9.6 * grow) if sx < 0 else (x - 9.6 * grow, x + 2.4)
        y0, y1 = (y - 2.2, y + 11.8 * grow) if sy < 0 else (y - 9.8 * grow, y + 2.2)
        art.shape(box(x0, y0, x1, y1), gold, "b")
        art.shade(box(x0, y0, x1, y1), gold, 3)
        art.blob(x - 3.6 * sx, y - 4.4 * sy, 1.1, 1.1, gold, "s", corners=6)
    art.glint((a[0] + 0.8, a[1] + 1), (a[0] + 0.8, a[1] + 9), gold)
    x0 = a[0] + (33 if variant == "a" else 14)
    art.shape(box(x0, a[1] + 2.5, x0 + 13, a[1] + 22), gold, "b")
    art.shade(box(x0, a[1] + 2.5, x0 + 13, a[1] + 22), gold, 4)
    if variant == "a":
        art.blob(x0 + 6.8, a[1] + 11.5, 2.1, 2.1, None, "i", corners=7)
        art.strip((x0 + 6.8, a[1] + 12), (x0 + 6.9, a[1] + 17), 1.8, None, "i")
    else:
        art.blob(x0 + 6.6, a[1] + 11.5, 3.0, 3.4, "gem", "b", outline=True, corners=7)
        for x in (a[0] + 36, a[0] + 49, a[0] + 63):
            art.blob(x + jitter(art.rng, 1.5), a[1] + band / 2 + 0.3, 1.2, 1.2, gold, "h", corners=6)
    for _ in range(3):
        x, y = art.rng.uniform(a[0] + 18, b[0] - 14), a[1] + art.rng.uniform(1.5, band - 1.5)
        art.strip((x, y), (x + art.rng.uniform(3, 6), y - 0.8), 0.9, gold, "h")
        art.strip((x - 7, y + 0.6), (x - 3, y + 0.9), 0.9, gold, "s")


def well(variant):
    """A quiet recess in the water, set in about 6% from the edge of the tile: a darker rim and a floor, and nothing else."""
    art = Art(f"well-{variant}", TILE)
    inset = 5.4 + 0.7 * WELLS.index(variant)
    art.shape(rounded_box(inset + 1.1, inset, TILE[0] - inset - 1.1, TILE[1] - inset, 9), "well", "s", outline=False)
    floor = rounded_box(inset + 3.1, inset + 2, TILE[0] - inset - 3.1, TILE[1] - inset - 2, 7.5)
    art.shape(floor, "well", "b", outline=False)
    art.shade(floor, "well", 7, toward_light=True)
    return art


def disc(cx, cy, radius, steps=24):
    return arc(cx, cy, radius, radius, 0, 360, steps)[:-1]


def burst(cx, cy, outer, inner, spikes):
    def at(k):
        angle = math.tau * k / (spikes * 2) - math.pi / 2
        reach = outer if k % 2 == 0 else inner
        return cx + reach * math.cos(angle), cy + reach * math.sin(angle)
    return [at(k) for k in range(spikes * 2)]


def scallop(cx, cy, radius, depth, bumps, per=5):
    points = []
    for k in range(bumps * per):
        t = math.tau * k / (bumps * per)
        r = radius - depth + depth * abs(math.sin(bumps * t / 2))
        points.append((cx + r * math.cos(t), cy + r * math.sin(t)))
    return points


def rim_glint(art, cx, cy, radius, material):
    """The glint of a round piece sits on its upper left and bends along the rim."""
    def at(degrees):
        return cx + radius * math.cos(math.radians(degrees)), cy + radius * math.sin(math.radians(degrees))
    art.glint(at(205), at(240), material, via=at(222.5))


# How a feather swells and narrows along its length: (share of the length, share of the width).
FEATHER = ((0.0, 0.35), (0.18, 0.8), (0.4, 1.0), (0.65, 0.85), (0.88, 0.5), (1.0, 0.0))


def feather(art, base, side, degrees, length, width, material, tone):
    """One leaf of a wing, pointed, widest a third of the way out, with a quill down it and a glint on its upper edge."""
    angle = math.radians(degrees)
    ux, uy = side * math.cos(angle), -math.sin(angle)
    nx, ny = -uy, ux
    edge = lambda sign: [(base[0] + ux * length * t + sign * nx * width / 2 * w, base[1] + uy * length * t + sign * ny * width / 2 * w) for t, w in FEATHER]
    left, right = edge(1), edge(-1)
    leaf = left + right[::-1]
    art.shape(leaf, material, tone)
    art.shade(leaf, material, width * 0.3)
    art.strip((base[0] + ux * length * 0.12, base[1] + uy * length * 0.12), (base[0] + ux * length * 0.82, base[1] + uy * length * 0.82), 0.9, material, "s")
    upper = min((left, right), key=lambda line: line[3][1])
    if tone == "b" and GLINT_LENGTH[0] <= math.dist(upper[2], upper[3]) <= GLINT_LENGTH[1]:
        art.glint(upper[2], upper[3], material)


def medal(kind):
    art = Art(f"medal-{kind}", TILE)
    cx = 57.5
    if kind == "mini":
        cy, m = 42, "steel"
        edge = scallop(cx, cy, 31, 1.8, 30, per=3)
        art.shape(edge, m, "b")
        art.shade(edge, m, 8)
        art.shape(disc(cx, cy, 25), m, "s")
        face = disc(cx, cy, 21)
        art.shape(face, m, "b")
        art.shade(face, m, 5)
        art.shape([(cx, cy - 11), (cx + 9.5, cy + 6.5), (cx - 9.5, cy + 6.5)], m, "h")
        art.glint((cx - 17, cy - 3), (cx - 12, cy - 13), m, via=(cx - 16, cy - 8))
        rim_glint(art, cx, cy, 28, m)
    elif kind == "minor":
        cy, m = 43, "verdigris"
        face = scallop(cx, cy, 36, 3.0, 14)
        art.shape(face, m, "b")
        art.shade(face, m, 8)
        art.shape(disc(cx, cy, 23.5), m, "s", outline=False)
        art.shape([(cx, cy - 14), (cx + 9.5, cy - 1), (cx, cy + 13), (cx - 9.5, cy - 1)], m, "h", outline=False)
        rim_glint(art, cx, cy, 29, m)
    elif kind == "major":
        cy, m = 44, "gold"
        face = burst(cx, cy, 41, 33, 12)
        art.shape(face, m, "b")
        art.shade(face, m, 8)
        inner = disc(cx, cy, 25)
        art.shape(inner, m, "b")
        art.shade(inner, m, 6)
        art.shape(burst(cx, cy - 1, 14, 6, 5), m, "h", outline=False)
        rim_glint(art, cx, cy, 20, m)
    else:
        cy, m = 56, "gold"
        for side in (-1, 1):
            for degrees, length, width, tone, lift in ((44, 31, 12, "s", 6), (24, 36, 13, "s", 3), (6, 37, 13, "b", 0), (-13, 32, 12, "b", -3)):
                feather(art, (cx + side * 18, cy - 2 - lift), side, degrees + art.rng.uniform(-2, 2), length, width, m, tone)
        face = disc(cx, cy, 28)
        art.shape(face, m, "b")
        art.shade(face, m, 8)
        art.shape(disc(cx, cy, 20), m, "s", outline=False)
        art.shape([(cx, cy - 15), (cx + 10, cy), (cx, cy + 15), (cx - 10, cy)], "gem", "b")
        crown = [(cx - 22, cy - 18), (cx - 22, cy - 41), (cx - 11, cy - 31), (cx, cy - 50), (cx + 11, cy - 31), (cx + 22, cy - 41), (cx + 22, cy - 18)]
        art.shape(crown, m, "b")
        art.shade(crown, m, 6)
        for gx, gy in ((cx - 22, cy - 42), (cx, cy - 51), (cx + 22, cy - 42)):
            art.blob(gx, gy, 3.6, 3.6, "gem", "b", outline=True, corners=8)
        art.glint((cx - 18, cy - 28), (cx - 18, cy - 20), m)
    return art


def draw_bottle(art, state, left=0.0, top=0.0, size=1.0):
    body_material, cap = {"full": ("tank", "gold"), "empty": ("empty", "steel"), "low": ("amber", "gold")}[state]
    put = lambda points: [(left + size * x, top + size * y) for x, y in points]
    body = put(arc(10, 18, 7.5, 6, 180, 360, 6) + arc(10, 31, 7.5, 6, 0, 180, 6))
    art.shape(body, body_material, "b")
    art.shade(body, body_material, 5)
    art.shape(put(box(7, 6, 13, 13.5)), "steel", "b")
    art.shape(put(rounded_box(4.5, 1.5, 15.5, 7.5, 1.5)), cap, "b")
    if state != "empty":
        art.glint(*put([(5.4, 19), (5.4, 27)]), body_material)


def bottle(state):
    art = Art(f"bottle-{state}", BOTTLE, seed="bottle")
    draw_bottle(art, state)
    return art


def mark():
    """A full bottle and three bubbles rising beside it, on a tile of water: the mark in the header and the favicon."""
    art = Art("mark", MARK, seed="bottle", scale=0.5)
    art.shape(rounded_box(1.5, 1.5, MARK[0] - 1.5, MARK[1] - 1.5, 8, steps=8), "water", "b")
    draw_bottle(art, "full", left=6, top=4.8, size=0.78)
    for cx, cy, radius in ((28, 31, 1.9), (31, 22.5, 2.6), (27.5, 12.5, 3.4)):
        art.shape(disc(cx, cy, radius, 14), "steel", "h")
    return art


def panel():
    art = Art("panel", PANEL, scale=4.0)
    w, h = PANEL
    art.shape(box(-12, -12, w + 12, h + 12), "water", "b", outline=False)
    rng = art.rng
    for base, lift, tone in ((72, 20, "h"), (212, 24, "s")):
        phases = [rng.uniform(0, math.tau) for _ in range(2)]
        line = [(x, base + lift * math.sin(x / 95 + phases[0]) + 9 * math.sin(x / 41 + phases[1])) for x in range(-12, w + 53, 40)]
        floor = [(w + 12, h + 12), (-12, h + 12)] if tone == "s" else [(w + 12, -12), (-12, -12)]
        art.shape(line + floor, "water", tone, outline=False)
    return art


# The dive cards are small scenes: the water panel, a strip of seabed along the bottom, and on it what the dive is about. They are
# drawn on a card 300 by 150, and these pieces are sized for it.
CARD = (300, 150)


def seabed():
    """A strip of sand with a lighter crest, two stones and a few tufts of weed, laid along the bottom of a card."""
    art = Art("seabed", (300, 40), scale=1.6)
    wave = lambda base, lift, phase: [(x, base + lift * math.sin(x / 34 + phase) + lift * 0.4 * math.sin(x / 13 + phase * 2)) for x in range(-10, 321, 30)]
    art.shape(wave(12, 3.5, 0.6) + [(320, 50), (-10, 50)], "sand", "h", outline=False)
    art.shape(wave(17, 3.0, 2.1) + [(320, 50), (-10, 50)], "sand", "b", outline=False)
    art.shape(wave(29, 2.0, 4.0) + [(320, 50), (-10, 50)], "sand", "s", outline=False)
    for cx, cy, rx, ry in ((92, 22, 13, 7), (238, 27, 10, 5.5)):
        art.blob(cx, cy, rx, ry, "hull", "h", corners=7)
        art.blob(cx - rx * 0.2, cy - ry * 0.35, rx * 0.5, ry * 0.4, "sand", "h", corners=6)
    for x, lean in ((22, -4), (30, 3), (160, 4), (282, -3), (289, 4)):
        art.strip((x, 18), (x + lean, 6), 2.2, "verdigris", "b")
    return art


def hull():
    """The wreck behind the Classic card: a hull lying bow up, a cabin with dark windows and a broken mast, all a shade off the water."""
    art = Art("hull", (200, 110), scale=1.4)
    art.shape([(4, 108), (10, 52), (70, 48), (150, 38), (196, 22), (192, 50), (176, 80), (150, 102), (90, 112)], "hull", "b", outline=False)
    art.shape([(4, 108), (8, 78), (100, 70), (184, 58), (176, 80), (150, 102), (90, 112)], "hull", "s", outline=False)
    art.strip((10, 52), (194, 23), 4, "hull", "h")
    art.shape([(40, 50), (42, 26), (92, 21), (94, 44)], "hull", "b", outline=False)
    art.strip((42, 27), (92, 22), 3.5, "hull", "h")
    for x in (50, 64, 78):
        art.shape(box(x, 31 - (x - 50) * 0.1, x + 8, 39 - (x - 50) * 0.1), "hull", "s", outline=False)
    art.strip((124, 42), (134, -4), 5, "hull", "b")
    art.strip((133, -2), (160, -14), 4, "hull", "b")
    for cx in (60, 88, 116, 144):
        art.shape(disc(cx, 64 - (cx - 60) * 0.17, 4, 10), "hull", "s", outline=False)
    return art


def current():
    """The Drift card: long, thin streaks of lighter water running across it, as a current that carries the crates along."""
    art = Art("current", CARD, scale=2.0)
    for y, x0, x1, thickness, phase in ((22, -10, 210, 3.0, 0.2), (40, 150, 312, 2.4, 1.4), (62, -10, 130, 2.0, 2.2), (78, 90, 312, 3.2, 3.1), (100, -10, 190, 2.4, 4.0)):
        line = [(x, y + 5 * math.sin(x / 40 + phase)) for x in range(x0, x1 + 1, 20)]
        top = [(x, yy - thickness / 2) for x, yy in line]
        bottom = [(x, yy + thickness / 2) for x, yy in reversed(line)]
        art.shape(top + bottom, "water", "h", outline=False)
    return art


def frond():
    """Two kelp fronds for the edge of a card, the same stalks as the scene in the colours of the board."""
    art = Art("frond", (40, 110), scale=1.2)
    for x, height, sway, foot in ((14, 104, 6, 9), (28, 76, -5, 7)):
        centre = [(x + sway * math.sin(t / 6 * math.pi * 1.5), 110 - height * t / 6) for t in range(7)]
        widths = [foot - (foot - 2) * t / 6 for t in range(7)]
        left = [(cx - w / 2, cy) for (cx, cy), w in zip(centre, widths)]
        art.shape(left + [(cx + w / 2, cy) for (cx, cy), w in reversed(list(zip(centre, widths)))], "verdigris", "s", outline=False)
        art.shape(left + [(cx - w / 2 + w * 0.35, cy) for (cx, cy), w in reversed(list(zip(centre, widths)))], "verdigris", "b", outline=False)
    return art


def kelp(art, x, base, height, sway, foot=15):
    """A stalk that leans one way and back, thick at the foot and thin at the tip, with a lighter strip down its left."""
    steps = 7
    centre = [(x + sway * math.sin(t / steps * math.pi * 1.5), base - height * t / steps) for t in range(steps + 1)]
    widths = [foot - (foot - 3) * t / steps for t in range(steps + 1)]
    art.shape([(cx - w / 2, cy) for (cx, cy), w in zip(centre, widths)] + [(cx + w / 2, cy) for (cx, cy), w in reversed(list(zip(centre, widths)))], "kelp", "b", outline=False)
    art.shape([(cx - w / 2, cy) for (cx, cy), w in zip(centre, widths)] + [(cx - w / 2 + w * 0.3, cy) for (cx, cy), w in reversed(list(zip(centre, widths)))], "kelp", "h", outline=False)


def wreck(art):
    """The hull of a sunken boat at the left of the seabed, bow up and keel buried, with a cabin, a broken mast, portholes and
    a thread of air still rising from the bow. It is drawn in the tones of the rocks, so the audit keeps it quiet like the rest.
    Its long edges are not cut into steps, which keeps the file small, and they only bend with the warp."""
    def plank(start, end, thickness, tone):
        length = math.dist(start, end)
        nx, ny = (end[1] - start[1]) / length * thickness / 2, (start[0] - end[0]) / length * thickness / 2
        art.flat([(start[0] + nx, start[1] + ny), (end[0] + nx, end[1] + ny), (end[0] - nx, end[1] - ny), (start[0] - nx, start[1] - ny)], "rock", tone, warp=True)

    art.flat([(20, 830), (32, 662), (150, 650), (300, 631), (430, 608), (480, 586), (472, 642), (440, 702), (380, 760), (250, 806), (120, 836)], "rock", "b", warp=True)
    art.flat([(20, 830), (28, 720), (200, 712), (440, 690), (440, 702), (380, 760), (250, 806), (120, 836)], "rock", "s", warp=True)
    plank((34, 662), (478, 590), 7, "h")
    plank((40, 700), (430, 650), 3, "s")
    art.flat([(118, 653), (124, 590), (236, 580), (240, 643)], "rock", "b", warp=True)
    plank((122, 592), (238, 582), 6, "h")
    for x in (140, 176, 212):
        art.flat(box(x, 602 - (x - 140) * 0.09, x + 16, 620 - (x - 140) * 0.09), "deep", "s")
    plank((300, 634), (324, 462), 10, "b")
    plank((322, 466), (388, 436), 8, "b")
    for cx, cy in ((176, 690), (236, 682), (296, 672), (356, 660)):
        art.flat(disc(cx, cy, 9, 10), "deep", "s")
    for cx, cy, radius in ((470, 556, 5), (482, 520, 8), (466, 474, 5), (486, 430, 10), (470, 372, 7), (490, 318, 5)):
        art.flat(disc(cx, cy, radius, 10), "deep", "h")


def school(art, x, y, size, count, rng):
    """A few small fish heading the same way, as flat silhouettes a shade darker than the water."""
    fish = [(-10, -6), (-2, -1), (8, -6), (22, -5), (30, 0), (22, 5), (8, 6), (-2, 1), (-10, 6)]
    for _ in range(count):
        fx, fy, k = x + rng.uniform(0, 260), y + rng.uniform(0, 110), size * rng.uniform(0.75, 1.15)
        art.flat([(fx + px * k, fy + py * k) for px, py in fish], "deep", "s")


def scene():
    """The water behind the whole page: bands of tone with wavy edges, a few light shafts, a school of fish, and a seabed with a
    wreck, rocks and kelp. It sits under text, so it is quiet by rule: no outlines, and the audit keeps every tone readable under the page text."""
    art = Art("scene", SCENE, scale=4.0)
    w, h = SCENE
    rng = art.rng

    def ridge(base, lift):
        phases = [rng.uniform(0, math.tau) for _ in range(2)]
        line = [(x, base + lift * math.sin(x / 170 + phases[0]) + lift * 0.5 * math.sin(x / 66 + phases[1])) for x in range(-40, w + 81, 80)]
        return line + [(w + 40, h + 40), (-40, h + 40)]

    art.flat(box(-40, -40, w + 40, h + 40), "deep", "h")
    art.flat(ridge(250, 26), "deep", "b", warp=True)
    art.flat(ridge(520, 26), "deep", "s", warp=True)
    for x, width, lean in ((140, 70, 120), (520, 110, 160), (880, 60, 100), (1240, 120, 170), (1500, 70, 110)):
        art.flat([(x, -20), (x + width, -20), (x + width + lean + 90, 780), (x + lean, 780)], None, "v")
    school(art, 1110, 300, 1.3, 7, rng)
    art.flat(ridge(715, 34), "seabed", "h", warp=True)
    wreck(art)
    art.flat(ridge(790, 28), "seabed", "b", warp=True)
    for x, base, height, sway, foot in ((540, 805, 260, 16, 18), (576, 812, 190, -14, 14), (1400, 800, 330, -20, 22), (1450, 805, 280, -16, 18),
                                       (1488, 810, 220, 14, 15), (1534, 800, 300, -18, 20), (1574, 812, 180, 12, 14), (840, 815, 150, 12, 15)):
        kelp(art, x, base, height, sway, foot)
    art.flat(ridge(852, 18), "seabed", "s", warp=True)
    for cx, cy, rx, ry in ((250, 800, 70, 34), (620, 838, 54, 26), (1090, 826, 84, 38), (1330, 790, 46, 24), (1560, 848, 60, 30), (420, 862, 38, 18)):
        art.blob(cx, cy, rx, ry, "rock", "b", corners=7)
        art.blob(cx - rx * 0.18, cy - ry * 0.3, rx * 0.55, ry * 0.45, "rock", "h", corners=6)
    return art


def contrast(a, b):
    def luminance(hex_colour):
        channels = [int(hex_colour[i:i + 2], 16) / 255 for i in (1, 3, 5)]
        r, g, b_ = [c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4 for c in channels]
        return 0.2126 * r + 0.7152 * g + 0.0722 * b_
    hi, lo = sorted((luminance(a), luminance(b)), reverse=True)
    return (hi + 0.05) / (lo + 0.05)


def style(materials, with_plate, shaft=False):
    def tokens(theme):
        p = PALETTE[theme]
        parts = [f"--art-ink:{p['ink']}"]
        if with_plate:
            parts += [f"--art-plate:{p['plate']}", f"--art-plate-ink:{p['plate-ink']}"]
        if shaft:
            parts.append(f"--art-shaft:{p['shaft']}")
        for material in sorted(materials):
            parts += [f"--art-{material}-{tone}:{colour}" for tone, colour in zip("bsh", p[material])]
        return ";".join(parts)

    # Only the outer half of a stroke shows, so the stroke is twice the weight. The weight is in pixels so that it does not shrink with a small tile.
    weight = f"var(--ow,{num(2 * OUTLINE)}px)"
    rules = (f".o{{stroke:var(--art-ink);stroke-width:{weight};vector-effect:non-scaling-stroke;paint-order:stroke;stroke-linejoin:round}}"
             ".b{fill:var(--b)}.s{fill:var(--s)}.h{fill:var(--h)}.i{fill:var(--art-ink)}.gr{opacity:var(--grain,1)}"
             f".g{{fill:none;stroke:var(--h);stroke-width:calc({weight}*{GLINT});vector-effect:non-scaling-stroke;stroke-linecap:round}}"
             + (".v{fill:var(--art-shaft)}" if shaft else ""))
    uses = "".join(f".{CODES[m]}{{--b:var(--art-{m}-b);--s:var(--art-{m}-s);--h:var(--art-{m}-h)}}" for m in sorted(materials))
    return f":root{{{tokens('dark')}}}@media (prefers-color-scheme:light){{:root{{{tokens('light')}}}}}{rules}{uses}"


def symbols():
    drawn = {f"crate-{tier}-{v}": crate(tier, v) for tier in ("low", "mid", "high") for v in VARIANTS}
    drawn.update({f"well-{v}": well(v) for v in WELLS})
    drawn.update({f"medal-{kind}": medal(kind) for kind in ("mini", "minor", "major", "grand")})
    drawn.update({f"bottle-{state}": bottle(state) for state in ("full", "empty", "low")})
    drawn["mark"] = mark()
    drawn["panel"] = panel()
    drawn.update(seabed=seabed(), hull=hull(), current=current(), frond=frond())
    return drawn


def view_box(art):
    return f"0 0 {art.size[0]} {art.size[1]}"


def build():
    drawn = symbols()
    files = {}
    for name, art in drawn.items():
        files[f"{name}.svg"] = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{view_box(art)}">'
                                f"<style>{style(art.materials(), False)}</style>{art.body()}</svg>\n")
    used = set().union(*(art.materials() for art in drawn.values()))
    parts = ['<svg xmlns="http://www.w3.org/2000/svg" width="0" height="0" style="position:absolute" aria-hidden="true" focusable="false">',
             f"<style>{style(used, True)}</style>"]
    for name, art in drawn.items():
        slice_ = ' preserveAspectRatio="xMidYMid slice"' if name == "panel" else ""
        parts.append(f'<symbol id="{name}" viewBox="{view_box(art)}"{slice_}>{art.body()}</symbol>')
    files["sprite.svg"] = "\n".join(parts) + "\n</svg>\n"
    files[FAVICON] = files["mark.svg"].replace("</style>", ":root{--ow:2px}</style>")
    behind = scene()
    files["scene.svg"] = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{view_box(behind)}">'
                          f"<style>{style(behind.materials(), False, shaft=True)}</style>{behind.body()}</svg>\n")
    return files


def audit(files):
    problems = []
    classes = {"b", "s", "h", "o", "i", "g", "v", "gr", *CODES.values()}
    for name, text in files.items():
        body = re.sub(r"<style>.*?</style>", "", text, flags=re.S)
        if re.search(r"#[0-9a-fA-F]{3,8}\b|rgb|hsl", body):
            problems.append(f"{name}: a colour outside the palette")
        if re.search(r"<image|<script|href=\"http|url\(|stroke-width=|fill=|stroke=", body):
            problems.append(f"{name}: a raster, a script, an external link or a style attribute that bypasses the rules")
        if re.search(r"\d\.\d\d", body):
            problems.append(f"{name}: a number with more than one decimal")
        for found in re.findall(r'class="([^"]+)"', body):
            if not set(found.split()) <= classes:
                problems.append(f"{name}: unknown class {found}")
        for glint in re.findall(r'<path class="g" d="([^"]+)"', body):
            steps = [float(v) for v in re.findall(r"-?\d*\.?\d+", glint.split("l")[1])]
            length = sum(math.dist((0, 0), steps[i:i + 2]) for i in range(0, len(steps), 2))
            if not GLINT_LENGTH[0] - 1.5 <= length <= GLINT_LENGTH[1] + 1.5:
                problems.append(f"{name}: a glint of length {length:.1f}")
        if name.startswith("medal-") and '<path class="g"' not in body:
            problems.append(f"{name}: a medal needs its highlight")
        if name != "sprite.svg" and len(text.encode()) > BUDGET["scene_bytes" if name == "scene.svg" else "file_bytes"]:
            problems.append(f"{name}: {len(text.encode())} bytes is over the file budget")

    for theme, colours in PALETTE.items():
        if set(colours) - NOT_MATERIALS != set(MATERIALS):
            problems.append(f"{theme}: the palette and the material list disagree")
            continue
        for material in MATERIALS:
            base, shade, light = colours[material]
            if not contrast(shade, "#ffffff") > contrast(base, "#ffffff") > contrast(light, "#ffffff"):
                problems.append(f"{theme} {material}: tones are not in the order shade, base, highlight")
        if contrast(colours["plate"], colours["plate-ink"]) < 4.5:
            problems.append(f"{theme}: plate text is under 4.5 to 1")
        for material in MATERIALS:
            if material.startswith(("wood", "tank")) and contrast(colours[material][0], colours["water"][0]) < 2.4:
                problems.append(f"{theme} {material}: the silhouette does not stand out from the water")
        shaft, alpha = colours["shaft"][:7], int(colours["shaft"][7:], 16) / 255
        for material in SCENE_MATERIALS:
            for tone in colours[material]:
                for ink, ink_colour in PAGE[theme].items():
                    if contrast(tone, ink_colour) < 4.5:
                        problems.append(f"{theme} {material} {tone}: the page {ink} text is under 4.5 to 1 on it")
        for tone in colours["deep"]:
            lifted = "#" + "".join(f"{round(int(tone[i:i + 2], 16) * (1 - alpha) + int(shaft[i:i + 2], 16) * alpha):02x}" for i in (1, 3, 5))
            if contrast(lifted, PAGE[theme]["muted"]) < 4.5:
                problems.append(f"{theme} deep {tone}: a light shaft over it leaves the muted text under 4.5 to 1")
        for token in (colours["plate"], colours["plate-ink"], *colours["water"], *colours["well"]):
            red, blue = int(token[1:3], 16), int(token[5:7], 16)
            if contrast(token, "#000000") > 12 and blue < red:
                problems.append(f"{theme} {token}: a light colour with a warm cast")
    return problems


def render_sizes(problems):
    """Byte size of each shipped render. A missing file, a file that is not a WebP and a file over the budget are problems."""
    sizes = []
    for name in RENDERS:
        path = OUT / name
        if not path.is_file():
            problems.append(f"{name}: missing, it comes from scripts/art/blender/air_tank.py")
            continue
        with path.open("rb") as handle:
            head = handle.read(12)
        size = path.stat().st_size
        sizes.append((name, size))
        if head[:4] != b"RIFF" or head[8:12] != b"WEBP":
            problems.append(f"{name}: not a WebP file")
        if size > BUDGET["render_bytes"]:
            problems.append(f"{name}: {size} bytes is over the render budget")
    return sizes


def main():
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--check", action="store_true")
    check = parser.parse_args().check

    files = build()
    problems = audit(files)
    renders = render_sizes(problems)
    if sum(len(t.encode()) for t in files.values()) + sum(size for _, size in renders) > BUDGET["total_bytes"]:
        problems.append("the art and the renders are over the total budget")
    if problems:
        sys.exit("\n".join(problems))
    # Everything in the art folder is stale unless the script writes it or it is one of the two renders.
    gone = [path for path in OUT.glob("*") if path.is_file() and path.name not in files and path.name not in RENDERS]
    stale = [name for name, text in files.items() if not (OUT / name).is_file() or (OUT / name).read_text(encoding="utf-8") != text]
    if check:
        sys.exit(f"stale art: {', '.join(stale + [path.name for path in gone])}" if stale or gone else 0)
    OUT.mkdir(parents=True, exist_ok=True)
    for path in gone:
        path.unlink()
    for name, text in files.items():
        (OUT / name).write_text(text, encoding="utf-8", newline="\n")
        print(f"{name:18}{len(text.encode()):>7} bytes")
    for name, size in renders:
        print(f"{name:18}{size:>7} bytes")
    print(f"{'total':18}{sum(len(t.encode()) for t in files.values()) + sum(size for _, size in renders):>7} bytes")


if __name__ == "__main__":
    main()
