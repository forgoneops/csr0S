#!/usr/bin/env python3
"""The CaesarOS cursor set, one source for the shell and for the desktop: small dark-glass shapes with a lit ember, gold
and magenta edge, ice hairlines for precision, one magenta crystal (Caesar's). Straight cuts only. Needs rsvg-convert and magick.

  tools/cursors/make-cursors.py              web PNGs, NAME.png (24) and NAME@2x.png (48), into web/atrium/cursors
  tools/cursors/make-cursors.py --theme DIR  an Xcursor theme (24, 32, 48) in DIR, replaced if it holds one already
The shell's hotspots live in kit.css; tests/cursors.test.ts checks they match HOT here."""
import argparse, os, shutil, struct, subprocess

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..")
INK, EMB, GOLD, MAG, ICE, RED = "#080912", "#ff8a3d", "#ffd27a", "#ff38b8", "#f2f4ff", "#ff5266"
# one light across every cursor: ember through gold to magenta, in canvas units so straight lines get it too
DEFS = (f'<defs><linearGradient id="n" gradientUnits="userSpaceOnUse" x1="4" y1="3" x2="19" y2="20"><stop offset="0" stop-color="{GOLD}"/>'
        f'<stop offset=".5" stop-color="{EMB}"/><stop offset="1" stop-color="{MAG}"/></linearGradient>'
        '<linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#262a40"/><stop offset="1" stop-color="#07070f"/></linearGradient>'
        '<filter id="s" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur in="SourceAlpha" stdDeviation=".7"/>'
        '<feOffset dy=".6" result="o"/><feComponentTransfer><feFuncA type="linear" slope=".5"/></feComponentTransfer>'
        '<feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>')
MITER = 'stroke-linejoin="miter" stroke-miterlimit="5" stroke-linecap="butt"'

def line(d, col="url(#n)", w=1.35):
    """A lit hairline over a thin dark keyline, so it reads on dark and on light."""
    return (f'<path d="{d}" fill="none" stroke="{INK}" stroke-opacity="{1 if col == ICE else .85}" stroke-width="{w + (1.9 if col == ICE else 1.5)}" {MITER}/>'
            f'<path d="{d}" fill="none" stroke="{col}" stroke-width="{w}" {MITER}/>')
def glass(d, edge="url(#n)", fill="url(#g)", w=1.15):
    """A dark glass piece with a lit edge."""
    return (f'<path d="{d}" fill="none" stroke="{INK}" stroke-opacity=".8" stroke-width="{w + 1.5}" {MITER}/>'
            f'<path d="{d}" fill="{fill}" stroke="{edge}" stroke-width="{w}" {MITER}/>')
def gem(x, y, r=1.3, col=MAG):
    return (f'<path d="M{x} {y-r-.6}L{x+r+.6} {y}L{x} {y+r+.6}L{x-r-.6} {y}Z" fill="{INK}"/>'
            f'<path d="M{x} {y-r}L{x+r} {y}L{x} {y+r}L{x-r} {y}Z" fill="{col}"/>')

# the delta: a slim swept blade without a tail, tip at (4,3)
DELTA = "M4 3L16.4 10.2L10.7 11.4L7.6 16.6Z"
arrow = glass(DELTA)
# over something that reacts: the same blade, lit from inside
pointer = glass(DELTA, "#fff3dc", "url(#n)", .9)
def chip(mark):  # the small cut tag that says what the arrow is doing
    return glass("M13.8 13.5H19.2L20.5 14.8V20.2H15.1L13.8 18.9Z", w=.9) + mark
def tagged(mark): return arrow + chip(mark)
def mark(d, col=ICE, w=1.1): return f'<path d="{d}" fill="none" stroke="{col}" stroke-width="{w}" {MITER}/>'

# grab: an open reticle of four cut corners; grabbing: the same corners closed on a lit core
grab = line("M5.5 9.5V7L7 5.5H9.5M14.5 5.5H17L18.5 7V9.5M18.5 14.5V17L17 18.5H14.5M9.5 18.5H7L5.5 17V14.5") + gem(12, 12, 1.5)
grabbing = line("M7.5 10.5V8.8L8.8 7.5H10.5M13.5 7.5H15.2L16.5 8.8V10.5M16.5 13.5V15.2L15.2 16.5H13.5M10.5 16.5H8.8L7.5 15.2V13.5") + gem(12, 12, 2.6, "url(#n)")
ibeam = line("M9 5H10.8L12 6.2L13.2 5H15M12 6.2V17.8M9 19H10.8L12 17.8L13.2 19H15", ICE, 1.15) + gem(12, 12, .9)
cross = line("M12 4V9M12 15V20M4 12H9M15 12H20", ICE, 1.1) + gem(12, 12, 1)
cell = line("M12 5V19M5 12H19", ICE, 2.2) + gem(12, 12, 1.2)
RING = "M9.1 5H14.9L19 9.1V14.9L14.9 19H9.1L5 14.9V9.1Z"
wait = line(RING, "#4a4f70", 1.4) + line("M12 5H14.9L19 9.1V12", "url(#n)", 1.8) + gem(12, 12, 1.4)
def double(angle):
    g = line("M7.4 8.8L4.2 12L7.4 15.2M16.6 8.8L19.8 12L16.6 15.2M4.6 12H19.4")
    return f'<g transform="rotate({angle} 12 12)">{g}</g>'
move = line("M9 7L12 4L15 7M17 9L20 12L17 15M15 17L12 20L9 17M7 15L4 12L7 9M12 4.6V19.4M4.6 12H19.4", w=1.25) + gem(12, 12, 1.5)
no = line(RING, RED, 1.5) + line("M7.8 7.8L16.2 16.2", RED, 1.5)
def lens(plus):
    return (glass("M7.8 4.5H12.2L15.5 7.8V12.2L12.2 15.5H7.8L4.5 12.2V7.8Z", fill="#0b0c16", w=1.35) +
            line("M14.4 14.4L19.4 19.4", w=1.7) + mark("M7.3 10H12.7" + ("M10 7.3V12.7" if plus else "")))

ART = {
    "left_ptr": arrow, "pointer": pointer, "grab": grab, "grabbing": grabbing,
    "progress": tagged(mark("M15.5 15.4H18.8L15.5 18.7H18.8Z", MAG, .9)),
    "help": tagged(mark("M15.6 16V15.3H18.7V16.9H17.2V18", GOLD) + mark("M17.2 18.7V19.6", GOLD)),
    "copy": tagged(mark("M17.15 15V19.4M14.95 17.2H19.35", GOLD)),
    "link": tagged(mark("M15.3 19L18.7 15.6M16 15.5H18.8V18.3", GOLD)),
    "context-menu": tagged(mark("M15.1 15.4H19.2M15.1 17.1H19.2M15.1 18.8H19.2", GOLD, .8)),
    "text": ibeam, "vertical-text": f'<g transform="rotate(-90 12 12)">{ibeam}</g>', "crosshair": cross, "cell": cell,
    "wait": wait, "ns-resize": double(90), "ew-resize": double(0), "nwse-resize": double(45), "nesw-resize": double(-45),
    "move": move, "not-allowed": no, "zoom-in": lens(True), "zoom-out": lens(False),
}
HOT = {n: (12, 12) for n in ART}
HOT.update({n: (4, 3) for n in ("left_ptr", "pointer", "progress", "help", "copy", "link", "context-menu")})
HOT.update({"zoom-in": (10, 10), "zoom-out": (10, 10)})

# desktop only: the other names X11 and freedesktop programs ask for
ALIASES = {
    "left_ptr": ["default", "arrow", "top_left_arrow"], "pointer": ["hand1", "hand2", "hand", "pointing_hand"],
    "text": ["xterm", "ibeam"], "crosshair": ["cross", "tcross"], "wait": ["watch"], "progress": ["left_ptr_watch", "half-busy"],
    "grab": ["openhand"], "grabbing": ["closedhand", "dnd-none", "dnd-move"], "help": ["question_arrow", "whats_this"],
    "ns-resize": ["sb_v_double_arrow", "size_ver", "n-resize", "s-resize", "top_side", "bottom_side", "row-resize"],
    "ew-resize": ["sb_h_double_arrow", "size_hor", "e-resize", "w-resize", "left_side", "right_side", "col-resize"],
    "nwse-resize": ["size_fdiag", "nw-resize", "se-resize", "top_left_corner", "bottom_right_corner"],
    "nesw-resize": ["size_bdiag", "ne-resize", "sw-resize", "top_right_corner", "bottom_left_corner"],
    "not-allowed": ["forbidden", "no-drop", "crossed_circle"], "move": ["fleur", "size_all", "all-scroll"],
    "copy": ["dnd-copy"], "link": ["alias", "dnd-link"],
}

def svg(name):
    return f'<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">{DEFS}<g filter="url(#s)">{ART[name]}</g></svg>'

def render(name, px, fmt="png"):
    png = subprocess.run(["rsvg-convert", "-w", str(px), "-h", str(px)], input=svg(name).encode(), check=True, capture_output=True).stdout
    return png if fmt == "png" else subprocess.run(["magick", "png:-", "-depth", "8", "rgba:-"], input=png, check=True, capture_output=True).stdout

def xcursor(name, sizes=(24, 32, 48)):
    """The Xcursor container, written here so xcursorgen is not needed. Its pixels are ARGB with premultiplied alpha."""
    toc, images, base = b"", b"", 16 + 12 * len(sizes)
    for s in sizes:
        raw = render(name, s, "rgba")
        px = b"".join(struct.pack("<BBBB", b * a // 255, g * a // 255, r * a // 255, a) for r, g, b, a in zip(*[iter(raw)] * 4))
        hx, hy = (round(v * s / 24) for v in HOT[name])
        toc += struct.pack("<III", 0xFFFD0002, s, base + len(images))
        images += struct.pack("<9I", 36, 0xFFFD0002, s, 1, s, s, hx, hy, 0) + px
    return struct.pack("<4sIII", b"Xcur", 16, 0x00010000, len(sizes)) + toc + images

def theme(out):
    cur = os.path.join(out, "cursors")
    if os.path.exists(cur): shutil.rmtree(cur)   # only our own subfolder; anything else in DIR stays
    os.makedirs(cur)
    for name in ART:
        with open(os.path.join(cur, name), "wb") as f: f.write(xcursor(name))
    for name, others in ALIASES.items():
        for other in others: os.symlink(name, os.path.join(cur, other))
    with open(os.path.join(out, "index.theme"), "w") as f:
        f.write("[Icon Theme]\nName=CaesarCrystal\nComment=CaesarOS cursors: dark glass, a lit edge and Caesar's crystal\nInherits=Adwaita\n")
    print(f"{len(ART)} cursors, {sum(map(len, ALIASES.values()))} aliases -> {out}")

if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--theme", metavar="DIR")
    args = ap.parse_args()
    if args.theme:
        theme(args.theme)
    else:
        out = os.path.join(ROOT, "web", "atrium", "cursors")
        for name in ART:
            for px, suffix in ((24, ""), (48, "@2x")):
                with open(os.path.join(out, f"{name}{suffix}.png"), "wb") as f: f.write(render(name, px))
        print(f"{len(ART)} cursors -> {os.path.normpath(out)}")
