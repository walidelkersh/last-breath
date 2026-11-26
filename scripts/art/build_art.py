"""Draws the pilot art for the board: the water panel, the empty cell wells, three crate tiers and the air tank.

Every symbol is flat and cel shaded. The rules sit in the data below, and the audit at the end of
the script fails the build when a file or a colour breaks them. The sprite holds every symbol once.
The page inlines it, so the colours come from CSS variables and follow the theme. The single files
carry their own palette, so they also work as an image.

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
OUT = ROOT / "src" / "LastBreath.Web" / "wwwroot" / "art"

# Style rules. One light from above and a little to the left, one outline weight, one highlight shape.
SEED = 7319
OUTLINE = 2.2                 # visible weight in view box units, on every outlined shape
GLINT = 2.6                   # the one highlight shape: a round-capped stroke on an edge that faces the light
GLINT_LENGTH = (6, 18)
LIGHT = (-0.2, -0.98)
WOBBLE = {"warp": 0.45, "wavelength": 36.0, "jitter": 0.2, "step": 7.0}
TILE = (115, 100)             # the aspect of a tile on the board, so a symbol fills it
PANEL = (600, 330)
BUDGET = {"file_bytes": 6000, "total_bytes": 150_000}
WELLS = "abc"

# A ramp is (base, shade, highlight). Shade is always darker than the base and highlight lighter.
PALETTE = {
    "dark": {
        "ink": "#05121b",
        "plate": "#05121b", "plate-ink": "#e6f4fb",
        "water": ("#12465e", "#0c3449", "#226a89"),
        "well": ("#0a2f42", "#05202e", "#2a7794"),
        "wood-low": ("#b9805e", "#7a4b3a", "#e0a583"),
        "wood-mid": ("#d98a40", "#8d4e20", "#f5b76d"),
        "wood-high": ("#e0645a", "#80322f", "#f79a8a"),
        "steel": ("#8da9be", "#4f677a", "#d2e6f3"),
        "gold": ("#efb82a", "#a96f12", "#ffe070"),
        "tank": ("#52a6e6", "#2a68ab", "#b0e0fa"),
    },
    "light": {
        "ink": "#0a2231",
        "plate": "#f2f9fc", "plate-ink": "#0a2231",
        "water": ("#a3d5e5", "#7dbbd0", "#d2edf5"),
        "well": ("#74b0c5", "#4a8aa4", "#b4dfeb"),
        "wood-low": ("#a1664a", "#6a4033", "#cb8a6b"),
        "wood-mid": ("#b96d2a", "#7a421a", "#e69f58"),
        "wood-high": ("#a8453f", "#68292a", "#d6766a"),
        "steel": ("#7f9db3", "#4a6276", "#c6dcea"),
        "gold": ("#e8aa14", "#9f650c", "#fcd95a"),
        "tank": ("#2b78c0", "#1d5192", "#8cc7ee"),
    },
}
NOT_MATERIALS = {"ink", "plate", "plate-ink"}
MATERIALS = sorted(set(PALETTE["dark"]) - NOT_MATERIALS)
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

    def shape(self, points, material, tone="b", outline=True):
        classes = tone + (" o" if outline else "")
        self.items.append((material, f'<path class="{classes}" d="{path_data(self.edge(points), True)}"/>'))

    def shade(self, points, material, depth, toward_light=False):
        """A band of the shade tone on the side away from the light, or on the lit side for a hollow."""
        a = math.radians(-self.rot)
        nx, ny = LIGHT if toward_light else (-LIGHT[0], -LIGHT[1])
        normal = (nx * math.cos(a) - ny * math.sin(a), nx * math.sin(a) + ny * math.cos(a))
        band = clip(points, normal, max(normal[0] * x + normal[1] * y for x, y in points) - depth)
        if len(band) >= 3:
            self.shape(band, material, "s", outline=False)

    def glint(self, start, end, material):
        assert GLINT_LENGTH[0] <= math.dist(start, end) <= GLINT_LENGTH[1], (self.name, start, end)
        middle = ((start[0] + end[0]) / 2, (start[1] + end[1]) / 2)
        points = [self.at(*p) for p in (start, middle, end)]
        self.items.append((material, f'<path class="g" d="{path_data(points, False)}"/>'))

    def strip(self, start, end, thickness, material, tone):
        length = math.dist(start, end)
        nx, ny = (end[1] - start[1]) / length * thickness / 2, (start[0] - end[0]) / length * thickness / 2
        quad = [(start[0] + nx, start[1] + ny), (end[0] + nx, end[1] + ny), (end[0] - nx, end[1] - ny), (start[0] - nx, start[1] - ny)]
        self.shape(quad, material, tone, outline=False)

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


def crate(tier):
    art = Art(f"crate-{tier}", TILE, seed="crate", rot=-2.0)
    r = art.rng
    wood = f"wood-{tier}"
    ax, ay = 10 + jitter(r), 34 + jitter(r)
    bx, by = 86 + jitter(r), 34 + jitter(r)
    cx, cy = 86 + jitter(r), 84 + jitter(r)
    dx, dy = 10 + jitter(r), 84 + jitter(r)
    depth = (17 + jitter(r, 0.5), -14 + jitter(r, 0.5))
    a, b, c, d = (ax, ay), (bx, by), (cx, cy), (dx, dy)
    plus = lambda p: (p[0] + depth[0], p[1] + depth[1])
    front, top, side = [a, b, c, d], [a, plus(a), plus(b), b], [b, plus(b), plus(c), c]
    rows = (ay + 0.37 * (dy - ay), ay + 0.69 * (dy - ay))

    art.shape(side, wood, "s")
    art.shape(top, wood, "h")
    art.shape(front, wood, "b")
    art.shade(front, wood, 6)
    art.shape([a, b, (bx, by + 4.5), (ax, ay + 4.5)], wood, "s", outline=False)
    for y in rows:
        art.strip((bx, y), plus((bx, y - 0.6)), 1.4, None, "i")
        art.strip((ax + 1.5, y), (bx - 1, y + 0.5), 1.5, wood, "s")
    for fraction in (0.36, 0.7):
        left = (ax + (plus(a)[0] - ax) * fraction, ay + (plus(a)[1] - ay) * fraction)
        right = (bx + (plus(b)[0] - bx) * fraction, by + (plus(b)[1] - by) * fraction)
        art.strip(left, right, 1.5, wood, "b")
    joints = ((ax + 0.44 * (bx - ax), ay + 3, rows[0] - 1.5), (ax + 0.7 * (bx - ax), rows[0] + 2, rows[1] - 1.5), (ax + 0.27 * (bx - ax), rows[1] + 2, dy - 2))
    for x, y0, y1 in joints:
        art.strip((x, y0), (x + 0.4, y1), 1.4, wood, "s")
    for nx, ny in ((ax + 5.5, ay + 11), (bx - 5, ay + 12.5), (ax + 4.5, rows[0] + 9), (bx - 6, rows[0] + 7.5)):
        art.blob(nx + jitter(r, 0.6), ny + jitter(r, 0.6), 1.3, 1.2, wood, "s", corners=6)
    art.glint((ax + 3.6, ay + 8), (ax + 3.6, ay + 19), wood)

    DETAILS[tier](art, a, b, c, d, rows)
    return art


def plain_details(art, a, b, c, d, rows):
    wood = "wood-low"
    x = a[0]
    art.shape([(x - 3.4, rows[0] + 1.4), (x + 1.6, rows[0] + 1.2), (x + 1.6, rows[1] - 1.2), (x - 3.0, rows[1] - 1.6)], wood, "b")
    art.shade([(x - 3.4, rows[0] + 1.4), (x + 1.6, rows[0] + 1.2), (x + 1.6, rows[1] - 1.2), (x - 3.0, rows[1] - 1.6)], wood, 3)


def strapped_details(art, a, b, c, d, rows):
    for left, width in ((a[0] + 15.5, 9.4), (a[0] + 50.5, 8.6)):
        top, bottom = a[1] - 0.4, d[1] + 1.8
        art.shape([(left, top), (left + width, top), (left + width + 17, top - 14), (left + 17, top - 14)], "steel", "b")
        art.shape([(left, top), (left + width, top - 0.2), (left + width + 0.5, bottom), (left + 0.3, bottom - 0.3)], "steel", "b")
        art.shade([(left, top), (left + width, top - 0.2), (left + width + 0.5, bottom), (left + 0.3, bottom - 0.3)], "steel", 4.5)
        art.glint((left + 2.4, top + 7), (left + 2.4, top + 20), "steel")
        for y in (top + 6, top + 28):
            art.blob(left + width / 2 + jitter(art.rng, 0.4), y, 1.2, 1.2, "steel", "h", corners=6)


def gilded_details(art, a, b, c, d, rows):
    gold = "gold"
    art.shape([a, b, (b[0], b[1] + 8), (a[0], a[1] + 8)], gold, "b")
    art.shade([a, b, (b[0], b[1] + 8), (a[0], a[1] + 8)], gold, 2.5)
    for corner, sx, sy in ((a, -1, -1), (b, 1, -1), (d, -1, 1), (c, 1, 1)):
        x, y = corner
        x0, x1 = (x - 2.4, x + 9.6) if sx < 0 else (x - 9.6, x + 2.4)
        y0, y1 = (y - 2.2, y + 11.8) if sy < 0 else (y - 9.8, y + 2.2)
        art.shape(box(x0, y0, x1, y1), gold, "b")
        art.shade(box(x0, y0, x1, y1), gold, 3)
    art.glint((a[0] + 0.8, a[1] + 1), (a[0] + 0.8, a[1] + 9), gold)
    x0 = a[0] + 33
    art.shape(box(x0, a[1] + 2.5, x0 + 13, a[1] + 22), gold, "b")
    art.shade(box(x0, a[1] + 2.5, x0 + 13, a[1] + 22), gold, 4)
    art.blob(x0 + 6.8, a[1] + 11.5, 2.1, 2.1, None, "i", corners=7)
    art.strip((x0 + 6.8, a[1] + 12), (x0 + 6.9, a[1] + 17), 1.8, None, "i")


DETAILS = {"low": plain_details, "mid": strapped_details, "high": gilded_details}


def air_tank():
    art = Art("air-tank", TILE, rot=48.0, shift=(-2, -6))
    cx, oy = 57.5, 5.0
    gold, steel, tank = "gold", "steel", "tank"
    body = arc(cx, 38 + oy, 15.2, 11, 180, 360, 9) + arc(cx, 72 + oy, 15.6, 9, 0, 180, 9)
    art.shape(body, tank, "b")
    art.shade(body, tank, 9)
    band = box(cx - 15.6, 52 + oy, cx + 15.8, 59.5 + oy)
    art.shape(band, steel, "b")
    art.shade(band, steel, 2.5)
    art.shape(box(cx - 8.8, 24 + oy, cx + 8.6, 29.5 + oy), steel, "b")
    art.shape(box(cx - 5, 15 + oy, cx + 5, 25 + oy), steel, "b")
    art.shape(box(cx - 15.5, 7.5 + oy, cx - 7.5, 12.5 + oy), gold, "b")
    valve = rounded_box(cx - 9, 5 + oy, cx + 9, 16.5 + oy, 2.5)
    art.shape(valve, gold, "b")
    art.shade(valve, gold, 3)
    art.blob(cx + 14.5, 10.5 + oy, 6, 6, gold, "b", outline=True, corners=11)
    art.blob(cx + 14.5, 10.5 + oy, 1.4, 1.4, None, "i", corners=6)
    art.glint((cx - 11, 35 + oy), (cx - 11, 49 + oy), tank)
    return art


def well(variant):
    art = Art(f"well-{variant}", TILE)
    art.shape(rounded_box(1.5, 1.5, TILE[0] - 1.5, TILE[1] - 1.5, 9), "well", "h")
    floor = rounded_box(7, 7, TILE[0] - 7, TILE[1] - 7, 6)
    art.shape(floor, "well", "b")
    art.shade(floor, "well", 11, toward_light=True)
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


def contrast(a, b):
    def luminance(hex_colour):
        channels = [int(hex_colour[i:i + 2], 16) / 255 for i in (1, 3, 5)]
        r, g, b_ = [c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4 for c in channels]
        return 0.2126 * r + 0.7152 * g + 0.0722 * b_
    hi, lo = sorted((luminance(a), luminance(b)), reverse=True)
    return (hi + 0.05) / (lo + 0.05)


def style(materials, with_plate):
    def tokens(theme):
        p = PALETTE[theme]
        parts = [f"--art-ink:{p['ink']}"]
        if with_plate:
            parts += [f"--art-plate:{p['plate']}", f"--art-plate-ink:{p['plate-ink']}"]
        for material in sorted(materials):
            parts += [f"--art-{material}-{tone}:{colour}" for tone, colour in zip("bsh", p[material])]
        return ";".join(parts)

    rules = (f".o{{stroke:var(--art-ink);stroke-width:{num(2 * OUTLINE)};paint-order:stroke;stroke-linejoin:round}}"
             ".b{fill:var(--b)}.s{fill:var(--s)}.h{fill:var(--h)}.i{fill:var(--art-ink)}"
             f".g{{fill:none;stroke:var(--h);stroke-width:{num(GLINT)};stroke-linecap:round}}")
    uses = "".join(f".{CODES[m]}{{--b:var(--art-{m}-b);--s:var(--art-{m}-s);--h:var(--art-{m}-h)}}" for m in sorted(materials))
    return f":root{{{tokens('dark')}}}@media (prefers-color-scheme:light){{:root{{{tokens('light')}}}}}{rules}{uses}"


def symbols():
    drawn = {f"crate-{tier}": crate(tier) for tier in ("low", "mid", "high")}
    drawn["air-tank"] = air_tank()
    drawn.update({f"well-{v}": well(v) for v in WELLS})
    drawn["panel"] = panel()
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
    return files


def audit(files):
    problems = []
    classes = {"b", "s", "h", "o", "i", "g", *CODES.values()}
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
        if name != "sprite.svg" and len(text.encode()) > BUDGET["file_bytes"]:
            problems.append(f"{name}: {len(text.encode())} bytes is over the file budget")
    if sum(len(t.encode()) for t in files.values()) > BUDGET["total_bytes"]:
        problems.append("the art is over the total budget")

    for theme, colours in PALETTE.items():
        for material in MATERIALS:
            base, shade, light = colours[material]
            if not contrast(shade, "#ffffff") > contrast(base, "#ffffff") > contrast(light, "#ffffff"):
                problems.append(f"{theme} {material}: tones are not in the order shade, base, highlight")
        if contrast(colours["plate"], colours["plate-ink"]) < 4.5:
            problems.append(f"{theme}: plate text is under 4.5 to 1")
        for material in MATERIALS:
            if material.startswith(("wood", "tank")) and contrast(colours[material][0], colours["water"][0]) < 2.4:
                problems.append(f"{theme} {material}: the silhouette does not stand out from the water")
        for token in (colours["plate"], colours["plate-ink"], *colours["water"], *colours["well"]):
            red, blue = int(token[1:3], 16), int(token[5:7], 16)
            if contrast(token, "#000000") > 12 and blue < red:
                problems.append(f"{theme} {token}: a light colour with a warm cast")
    return problems


def main():
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--check", action="store_true")
    check = parser.parse_args().check

    files = build()
    problems = audit(files)
    if problems:
        sys.exit("\n".join(problems))
    stale = [name for name, text in files.items() if not (OUT / name).is_file() or (OUT / name).read_text(encoding="utf-8") != text]
    if check:
        sys.exit(f"stale art: {', '.join(stale)}" if stale else 0)
    OUT.mkdir(parents=True, exist_ok=True)
    for name, text in files.items():
        (OUT / name).write_text(text, encoding="utf-8", newline="\n")
        print(f"{name:18}{len(text.encode()):>7} bytes")
    print(f"{'total':18}{sum(len(t.encode()) for t in files.values()):>7} bytes")


if __name__ == "__main__":
    main()
