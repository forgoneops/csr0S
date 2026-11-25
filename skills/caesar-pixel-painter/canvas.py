#!/usr/bin/env python3
"""Pixel painter: a palette-indexed canvas painted by a list of operations in a JSON file. Standard library only.
An agent paints with tools on an exact palette and looks at the grid; code written for CaesarOS.

  python3 canvas.py paint.json out.png [--scale 16]     paint, write the PNG (nearest-neighbour upscale), print the grid and the colour use
  python3 canvas.py paint.json --view                   only print the grid (an agent without vision "sees" the canvas this way)

paint.json: {"size": [32, 32], "palette": ["#0d0e10", "#ff38b8", ...], "ops": [["rect", 0, 0, 31, 31, 0], ["circle", 16, 16, 8, 1, true]]}
A colour is an index into the palette, -1 is transparent. Every op is deterministic (noise and voronoi take a seed), so a script replays to the same pixels.
ops: px x y c | rect x1 y1 x2 y2 c | line x1 y1 x2 y2 c | circle cx cy r c [fill] | ellipse cx cy rx ry c [fill] | tri x1 y1 x2 y2 x3 y3 c
     noise x1 y1 x2 y2 [colors] seed | voronoi x1 y1 x2 y2 [colors] cells seed | mirror h|v (copy the left half over the right, or the top over the bottom)
"""
import json, random, struct, sys, zlib

CHARS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ"


class Canvas:
    def __init__(self, w, h, palette):
        self.w, self.h, self.palette = w, h, palette
        self.p = [[-1] * w for _ in range(h)]

    def px(self, x, y, c):
        if 0 <= x < self.w and 0 <= y < self.h and -1 <= c < len(self.palette): self.p[y][x] = c

    def rect(self, x1, y1, x2, y2, c):
        for y in range(min(y1, y2), max(y1, y2) + 1):
            for x in range(min(x1, x2), max(x1, x2) + 1): self.px(x, y, c)

    def line(self, x1, y1, x2, y2, c):  # Bresenham
        dx, dy, sx, sy = abs(x2 - x1), -abs(y2 - y1), 1 if x1 < x2 else -1, 1 if y1 < y2 else -1
        err = dx + dy
        while True:
            self.px(x1, y1, c)
            if x1 == x2 and y1 == y2: return
            e2 = 2 * err
            if e2 >= dy: err += dy; x1 += sx
            if e2 <= dx: err += dx; y1 += sy

    def ellipse(self, cx, cy, rx, ry, c, fill=True):
        for y in range(cy - ry, cy + ry + 1):
            for x in range(cx - rx, cx + rx + 1):
                d = ((x - cx) / max(rx, 0.5)) ** 2 + ((y - cy) / max(ry, 0.5)) ** 2
                if d <= 1 and (fill or d >= 1 - 1.6 / max(rx, ry, 1)): self.px(x, y, c)

    def circle(self, cx, cy, r, c, fill=True): self.ellipse(cx, cy, r, r, c, fill)

    def tri(self, x1, y1, x2, y2, x3, y3, c):
        sign = lambda ax, ay, bx, by, px, py: (px - bx) * (ay - by) - (ax - bx) * (py - by)
        for y in range(min(y1, y2, y3), max(y1, y2, y3) + 1):
            for x in range(min(x1, x2, x3), max(x1, x2, x3) + 1):
                d = (sign(x, y, x1, y1, x2, y2), sign(x, y, x2, y2, x3, y3), sign(x, y, x3, y3, x1, y1))
                if not (any(v < 0 for v in d) and any(v > 0 for v in d)): self.px(x, y, c)

    def noise(self, x1, y1, x2, y2, colors, seed):
        r = random.Random(seed)
        for y in range(min(y1, y2), max(y1, y2) + 1):
            for x in range(min(x1, x2), max(x1, x2) + 1): self.px(x, y, r.choice(colors))

    def voronoi(self, x1, y1, x2, y2, colors, cells, seed):
        r = random.Random(seed); xa, xb, ya, yb = min(x1, x2), max(x1, x2), min(y1, y2), max(y1, y2)
        pts = [(r.randint(xa, xb), r.randint(ya, yb)) for _ in range(max(cells, 1))]
        for y in range(ya, yb + 1):
            for x in range(xa, xb + 1):
                i = min(range(len(pts)), key=lambda k: (pts[k][0] - x) ** 2 + (pts[k][1] - y) ** 2)
                self.px(x, y, colors[i % len(colors)])

    def mirror(self, axis):
        if axis == "h":
            for row in self.p:
                for x in range(self.w // 2): row[self.w - 1 - x] = row[x]
        else:
            for y in range(self.h // 2): self.p[self.h - 1 - y] = list(self.p[y])

    def grid(self):
        return "\n".join("".join("." if v < 0 else CHARS[v] for v in row) for row in self.p)

    def use(self):
        n = {}
        for row in self.p:
            for v in row: n[v] = n.get(v, 0) + 1
        return ", ".join(f"{'.' if v < 0 else CHARS[v]}={self.palette[v] if v >= 0 else 'transparent'}:{k}px" for v, k in sorted(n.items(), key=lambda t: -t[1]))

    def png(self, scale=1):
        rgb = [None if v < 0 else tuple(int(self.palette[v].lstrip("#")[i:i + 2], 16) for i in (0, 2, 4)) for row in self.p for v in row]
        raw = bytearray()
        for y in range(self.h):
            line = bytearray()
            for x in range(self.w):
                c = rgb[y * self.w + x]; line += bytes((*c, 255) if c else (0, 0, 0, 0)) * scale
            raw += (b"\x00" + bytes(line)) * scale
        chunk = lambda t, d: struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d))
        return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", self.w * scale, self.h * scale, 8, 6, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(bytes(raw), 9)) + chunk(b"IEND", b"")


def paint(spec):
    w, h = spec["size"]; c = Canvas(w, h, spec["palette"])
    for op in spec.get("ops", []):
        name, a = op[0], op[1:]
        if name not in ("px", "rect", "line", "circle", "ellipse", "tri", "noise", "voronoi", "mirror"): raise ValueError(f"unknown op: {name}")
        getattr(c, name)(*a)
    return c


if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    if not args: sys.exit(__doc__)
    scale = int(sys.argv[sys.argv.index("--scale") + 1]) if "--scale" in sys.argv else 16
    if "--scale" in sys.argv: args.remove(str(scale))
    cv = paint(json.load(open(args[0])))
    if len(args) > 1 and "--view" not in sys.argv: open(args[1], "wb").write(cv.png(scale))
    print(cv.grid()); print(cv.use())
