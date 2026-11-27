#!/usr/bin/env python3
"""The CaesarOS cursor set: 24x24 pixel art, cut corners only, ember body, crystal accent, dark outline.
Own drawing, standard library only.

  tools/cursors/make-cursors.py [outdir]        web PNGs: NAME.png (24x24) and NAME@2x.png (48x48), default web/atrium/cursors
Every enlargement is nearest-neighbour: pixels stay hard squares, never blurred. The web mapping (hotspots) lives in kit.css."""
import struct, sys, zlib, os

S = 24
OUT, EMB, EMB_D = (5, 6, 13), (255, 138, 61), (176, 62, 18)   # outline = --bg-deep, ember = --p1 of the Neo Roma pack
PALE, CRY, RED = (232, 236, 255), (255, 56, 184), (255, 90, 90)   # --ink, --tint-magenta, --danger

def lift(c, k): return tuple(max(0, min(255, int(v + (255 - v) * k if k > 0 else v * (1 + k)))) for v in c)

class Cur:
    def __init__(self, hot): self.px, self.hot = {}, hot
    def put(self, x, y, c):
        if 0 <= x < S and 0 <= y < S: self.px[(x, y)] = c
    def rect(self, x0, y0, x1, y1, c):
        for y in range(y0, y1 + 1):
            for x in range(x0, x1 + 1): self.put(x, y, c)
    def rows(self, ox, oy, spans, c):
        for i, row in enumerate(spans):
            for a, b in row: self.rect(ox + a, oy + i, ox + b, oy + i, c)
    def pixels(self):
        m = set(self.px)
        ring = {(x + dx, y + dy) for (x, y) in m for dx in (-1, 0, 1) for dy in (-1, 0, 1)} - m
        img = {}
        for p in ring:
            if 0 <= p[0] < S and 0 <= p[1] < S: img[p] = OUT
        for (x, y), c in self.px.items():
            if (x - 1, y) not in m or (x, y - 1) not in m: img[(x, y)] = lift(c, .45)       # lit edge: the facet catches light
            elif (x + 1, y) not in m or (x, y + 1) not in m: img[(x, y)] = lift(c, -.3)     # shaded edge
            else: img[(x, y)] = c
        return img
    def rgba(self, n=S):
        """n x n RGBA rows, nearest-neighbour from the 24 grid (exact squares at 24 and 48, even steps elsewhere)."""
        img = self.pixels()
        return [[img.get(((2 * x + 1) * S // (2 * n), (2 * y + 1) * S // (2 * n)), None) for x in range(n)] for y in range(n)]
    def png(self, n=S):
        rows = self.rgba(n)
        raw = b""
        for r in rows:
            raw += b"\0" + b"".join(bytes(c + (255,)) if c else b"\0\0\0\0" for c in r)
        chunk = lambda t, d: struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xffffffff)
        return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", n, n, 8, 6, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b"")
    def flip(self, h=False, t=False):
        n = Cur(self.hot)
        for (x, y), c in self.px.items():
            if h: x = S - 1 - x
            if t: x, y = y, x
            n.px[(x, y)] = c
        return n

def arrow(c, ox, oy, col, small=False):
    """A cut arrow: a right-triangle head (straight edges, no curve) and a short slanted tail."""
    h = 11 if small else 14
    for y in range(h + 1): c.rect(ox, oy + y, ox + int(y * .72), oy + y, col)
    for i in range(4 if small else 5): c.rect(ox + 3 + i, oy + h - 2 + i, ox + 4 + i, oy + h - 2 + i, col)

def hand(c, fist):
    P = (255, 214, 168)
    if fist:
        c.rect(6, 10, 17, 19, P)
        for i in range(4): c.rect(6 + i * 3, 8, 7 + i * 3, 9, P)
        c.rect(3, 12, 5, 15, P)
    else:
        c.rect(6, 11, 17, 19, P)
        for i, top in enumerate((5, 3, 4, 6)): c.rect(6 + i * 3, top, 7 + i * 3, 11, P)
        c.rect(3, 12, 5, 16, P)
    c.rect(8, 15, 15, 16, EMB)  # the crystal band across the knuckles

def hourglass(c, sand):
    c.rect(6, 3, 17, 4, PALE); c.rect(6, 19, 17, 20, PALE)
    top = [(7, 16), (8, 15), (9, 14), (10, 13), (11, 12)]
    for i, (a, b) in enumerate(top): c.rect(a, 5 + i, b, 5 + i, PALE)
    for i, (a, b) in enumerate(top[::-1]): c.rect(a, 13 + i, b, 13 + i, CRY if sand else PALE)
    c.rect(11, 10, 12, 12, CRY if sand else PALE)

def arrows(c, v, h, n=5):
    """Double arrows: n rows of cut head at each end, a shaft between. The four-way move uses short heads (n=3)."""
    if v:
        for i in range(n): c.rect(11 - i, 2 + i, 12 + i, 2 + i, EMB); c.rect(11 - i, 21 - i, 12 + i, 21 - i, EMB)
        c.rect(11, 2 + n, 12, 21 - n, EMB)
    if h:
        for i in range(n): c.rect(2 + i, 11 - i, 2 + i, 12 + i, EMB); c.rect(21 - i, 11 - i, 21 - i, 12 + i, EMB)
        c.rect(2 + n, 11, 21 - n, 12, EMB)

def diag(c, flip):
    for i in range(7):
        for j in range(7 - i): c.put(3 + i, 3 + j, EMB); c.put(3 + j, 3 + i, EMB); c.put(20 - i, 20 - j, EMB); c.put(20 - j, 20 - i, EMB)
    for i in range(7, 17): c.put(i, i, EMB); c.put(i + 1, i, EMB)
    return c.flip(h=True) if flip else c

def lens(c, sign):
    c.rect(4, 4, 15, 15, PALE)
    for y in range(6, 14):
        for x in range(6, 14): c.px.pop((x, y), None)
    for i in range(5): c.rect(16 + i, 16 + i, 17 + i, 17 + i, EMB)
    c.rect(7, 9, 12, 10, CRY)
    if sign: c.rect(9, 7, 10, 12, CRY)
    for p in [(4, 4), (15, 4), (4, 15), (15, 15)]: c.px.pop(p, None)  # cut corners

def mk():
    out = {}
    c = Cur((3, 2)); arrow(c, 3, 2, EMB); out["left_ptr"] = c
    c = Cur((4, 2)); arrow(c, 4, 2, CRY); c.rect(4, 2, 5, 3, PALE); out["pointer"] = c
    c = Cur((12, 12)); c.rect(11, 5, 12, 18, PALE); c.rect(8, 4, 15, 5, PALE); c.rect(8, 18, 15, 19, PALE); c.rect(11, 11, 12, 12, CRY); out["text"] = c
    out["vertical-text"] = out["text"].flip(t=True)
    c = Cur((12, 12))
    for a, b in ((3, 8), (15, 20)):
        c.rect(11, a, 12, b, PALE); c.rect(a, 11, b, 12, PALE)
    c.rect(11, 11, 12, 12, CRY); out["crosshair"] = c
    c = Cur((12, 12)); c.rect(10, 5, 13, 18, PALE); c.rect(5, 10, 18, 13, PALE); c.rect(11, 11, 12, 12, CRY); out["cell"] = c
    c = Cur((12, 12)); hourglass(c, True); out["wait"] = c
    c = Cur((3, 2)); arrow(c, 3, 2, EMB, True); c.rect(14, 14, 20, 15, PALE); c.rect(14, 21, 20, 22, PALE); c.rect(15, 16, 19, 16, CRY); c.rect(16, 17, 18, 17, CRY); c.rect(17, 18, 17, 20, CRY); out["progress"] = c
    c = Cur((12, 10)); hand(c, False); out["grab"] = c
    c = Cur((12, 12)); hand(c, True); out["grabbing"] = c
    c = Cur((12, 12)); arrows(c, True, False); out["ns-resize"] = c
    c = Cur((12, 12)); arrows(c, False, True); out["ew-resize"] = c
    c = Cur((12, 12)); out["nwse-resize"] = diag(c, False)
    c = Cur((12, 12)); out["nesw-resize"] = diag(c, True)
    c = Cur((12, 12))
    for y in range(3, 21):
        for x in range(3, 21):
            ring = (x < 6 or x > 17 or y < 6 or y > 17)
            cut = (x + y < 9) or (x + y > 36) or (x - y > 14) or (y - x > 14)
            if ring and not cut: c.put(x, y, RED)
    for i in range(14): c.rect(5 + i, 17 - i, 6 + i, 18 - i, RED)
    out["not-allowed"] = c
    c = Cur((3, 2)); arrow(c, 3, 2, EMB, True)
    c.rect(13, 12, 19, 13, CRY); c.rect(18, 14, 19, 15, CRY); c.rect(16, 16, 17, 17, CRY); c.rect(16, 19, 17, 20, CRY); out["help"] = c
    c = Cur((10, 10)); lens(c, True); out["zoom-in"] = c
    c = Cur((10, 10)); lens(c, False); out["zoom-out"] = c
    c = Cur((3, 2)); arrow(c, 3, 2, EMB, True); c.rect(13, 11, 21, 20, PALE)
    for y in (13, 15, 17): c.rect(15, y, 19, y, CRY)
    out["context-menu"] = c
    c = Cur((12, 12)); arrows(c, True, True, 3); c.rect(11, 11, 12, 12, CRY); out["move"] = c
    c = Cur((3, 2)); arrow(c, 3, 2, EMB, True); c.rect(15, 14, 21, 20, PALE); c.rect(17, 16, 19, 18, CRY); out["copy"] = c
    c = Cur((3, 2)); arrow(c, 3, 2, EMB, True)
    c.rect(13, 15, 17, 19, PALE)
    for p in [(14, 16), (15, 16), (16, 16), (14, 17), (16, 17), (14, 18), (15, 18), (16, 18)]: c.px.pop(p, None)
    c.rect(17, 17, 21, 21, CRY); out["link"] = c
    return out

if __name__ == "__main__":
    a = [x for x in sys.argv[1:] if not x.startswith("--")]
    root = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..")
    d = a[0] if a else os.path.join(root, "web", "atrium", "cursors")
    os.makedirs(d, exist_ok=True)
    for k, c in mk().items():
        open(os.path.join(d, k + ".png"), "wb").write(c.png()); open(os.path.join(d, k + "@2x.png"), "wb").write(c.png(2 * S)); print(f"{k} {c.hot[0]} {c.hot[1]}")
