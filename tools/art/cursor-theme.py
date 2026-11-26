#!/usr/bin/env python3
"""Build the CaesarOS cursor theme: standard shapes, cut like Caesar's crystal.

Every shape is drawn on a 24-unit grid, faceted, with a bronze body, an amber rim and a bright
core; the shapes that mean "this reacts" (pointer, grab, move, resize) carry an outer glow, so a
clickable thing lights the cursor up. The result is a real Xcursor theme, so every application on
the machine inherits the set, not only the Atrium.

    python3 tools/art/cursor-theme.py            # writes ~/.local/share/icons/CaesarCrystal
    python3 tools/art/cursor-theme.py --dir DIR  # somewhere else

Needs: python3, rsvg-convert (librsvg). No xcursorgen: the Xcursor container is written here.
"""
import argparse, os, shutil, struct, subprocess, tempfile

ACCENT = "#ffb266"      # the rim
CORE = "#fff0d0"        # the hot centre facet
BODY = "#16110b"        # the dark bronze of the crystal
GLOW = "#ff8a3d"

# name: (svg body, hotspot x, hotspot y, glowing) on a 24x24 grid
SHAPES = {
    # the arrow: a faceted wedge, notched like a cut gem
    "left_ptr": ("""
      <path d="M3 2 L3 19 L8 14.5 L10.6 21 L13.4 19.8 L10.8 13.4 L17 13.4 Z"
            fill="{body}" stroke="{accent}" stroke-width="1.2" stroke-linejoin="miter"/>
      <path d="M4.6 4.2 L4.6 15.6 L8.6 11.8 Z" fill="{core}" opacity=".55"/>
      <path d="M6.4 6 L6.4 12 L9 10.4 Z" fill="{accent}" opacity=".9"/>""", 3, 2, False),
    # over something clickable: the same wedge, lit
    "pointer": ("""
      <path d="M4 2 L20 10 L13 12 L16.6 19.6 L12.8 21.2 L9.2 13.6 L4 17.4 Z"
            fill="{body}" stroke="{accent}" stroke-width="1.2" stroke-linejoin="miter"/>
      <path d="M6 4.4 L16.6 9.6 L11.6 11.2 Z" fill="{core}" opacity=".8"/>
      <circle cx="13.6" cy="10.4" r="1.5" fill="{core}"/>""", 4, 2, True),
    # text: a vertical crystal shard
    "text": ("""
      <path d="M12 3 L14.6 11 L12 21 L9.4 11 Z" fill="{body}" stroke="{accent}" stroke-width="1.1"/>
      <path d="M12 6 L13.2 11 L12 18 L10.8 11 Z" fill="{core}" opacity=".85"/>""", 12, 9, False),
    "vertical-text": ("""
      <path d="M11 3 L21 12 L11 21 L11 15 L3 15 L3 9 L11 9 Z" fill="{body}" stroke="{accent}" stroke-width="1.1"/>
      <path d="M12.4 6 L12.4 9.4 L6 9.4 L6 14.6 L12.4 14.6 L12.4 18 L18 12 Z" fill="{core}" opacity=".7"/>""", 7, 12, False),
    # precision
    "crosshair": ("""
      <path d="M12 2 L14 7 L12 10 L10 7 Z M12 22 L10 17 L12 14 L14 17 Z M2 12 L7 10 L10 12 L7 14 Z M22 12 L17 14 L14 12 L17 10 Z"
            fill="{body}" stroke="{accent}" stroke-width="1"/>
      <path d="M12 9.4 L14 12 L12 14.6 L10 12 Z" fill="{core}"/>""", 12, 12, False),
    "cell": ("""
      <path d="M4 4 L11 4 L11 11 L4 11 Z M13 4 L20 4 L20 11 L13 11 Z M4 13 L11 13 L11 20 L4 20 Z M13 13 L20 13 L20 20 L13 20 Z"
            fill="{body}" stroke="{accent}" stroke-width="1"/>""", 7, 7, False),
    # busy
    "wait": ("""
      <path d="M12 2.5 L19 7 L19 17 L12 21.5 L5 17 L5 7 Z" fill="{body}" stroke="{accent}" stroke-width="1.2"/>
      <path d="M12 6 L12 12 L16 15" fill="none" stroke="{core}" stroke-width="1.6"/>""", 12, 12, False),
    "progress": ("""
      <path d="M12 2.5 L19 7 L19 17 L12 21.5 L5 17 L5 7 Z" fill="{body}" stroke="{accent}" stroke-width="1.2"/>
      <path d="M12 2.5 L19 7 L19 17 L12 21.5 L12 12 Z" fill="{accent}" opacity=".55"/>""", 12, 12, False),
    # hands
    "grab": ("""
      <path d="M7 10 L7 6 L9 6 L9 10 L10.5 10 L10.5 4.4 L12.5 4.4 L12.5 10 L14 10 L14 5.6 L16 5.6 L16 14 C16 18 13.6 20 10.6 20 C7.6 20 6 17.8 6 14.6 L6 11 L4.6 11 L4.6 9 Z"
            fill="{body}" stroke="{accent}" stroke-width="1.1"/>""", 11, 6, True),
    "grabbing": ("""
      <path d="M7.4 12 L7.4 9 L9.2 9 L9.2 12 L10.6 12 L10.6 8 L12.4 8 L12.4 12 L13.8 12 L13.8 8.8 L15.6 8.8 L15.6 14 C15.6 18 13.4 20 10.6 20 C7.8 20 6.4 17.8 6.4 15 L6.4 11.4 L5 11.4 L5 10 Z"
            fill="{body}" stroke="{accent}" stroke-width="1.1"/>
      <path d="M9 14.6 L15 14.6" stroke="{core}" stroke-width="1.1"/>""", 11, 10, True),
    # resizing: a shard that points both ways
    "ns-resize": ("""
      <path d="M12 2 L15 7 L13 7 L13 17 L15 17 L12 22 L9 17 L11 17 L11 7 L9 7 Z" fill="{body}" stroke="{accent}" stroke-width="1.1"/>
      <path d="M12 5 L13.4 8 L13.4 16 L12 19 L10.6 16 L10.6 8 Z" fill="{core}" opacity=".55"/>""", 12, 8, True),
    "ew-resize": ("""
      <path d="M2 12 L7 9 L7 11 L17 11 L17 9 L22 12 L17 15 L17 13 L7 13 L7 15 Z" fill="{body}" stroke="{accent}" stroke-width="1.1"/>
      <path d="M5 12 L8 10.6 L16 10.6 L19 12 L16 13.4 L8 13.4 Z" fill="{core}" opacity=".55"/>""", 8, 12, True),
    "nwse-resize": ("""
      <path d="M3 3 L10 5 L6.6 6.6 L17.4 17.4 L19 14 L21 21 L14 19 L16.6 17.4 L5.6 6.6 Z" fill="{body}" stroke="{accent}" stroke-width="1.1"/>
      <path d="M6 6 L8.4 10.4 L13.6 15.6 L18 18" fill="none" stroke="{core}" stroke-width="1.1" opacity=".6"/>""", 4, 4, True),
    "nesw-resize": ("""
      <path d="M21 3 L19 10 L17.4 6.6 L6.6 17.4 L10 19 L3 21 L5 14 L6.6 16.6 L17.4 5.6 Z" fill="{body}" stroke="{accent}" stroke-width="1.1"/>
      <path d="M18 6 L15.6 10.4 L10.4 15.6 L6 18" fill="none" stroke="{core}" stroke-width="1.1" opacity=".6"/>""", 19, 4, True),
    "not-allowed": ("""
      <path d="M12 2.5 L19 7 L19 17 L12 21.5 L5 17 L5 7 Z" fill="{body}" stroke="{accent}" stroke-width="1.3"/>
      <path d="M7 7 L17 17" stroke="{core}" stroke-width="1.6"/>
      <path d="M17 7 L7 17" stroke="{accent}" stroke-width="1.6" opacity=".8"/>""", 12, 12, False),
    "help": ("""
      <path d="M12 2.5 L19 7 L19 17 L12 21.5 L5 17 L5 7 Z" fill="{body}" stroke="{accent}" stroke-width="1.2"/>
      <path d="M10 9 C10 7.4 14 7.4 14 9.2 C14 10.6 12 10.8 12 12.4" fill="none" stroke="{core}" stroke-width="1.5"/>
      <circle cx="12" cy="15.6" r="1" fill="{core}"/>""", 12, 12, False),
    "zoom-in": ("""
      <circle cx="10.5" cy="10.5" r="6.4" fill="none" stroke="{accent}" stroke-width="1.4"/>
      <path d="M15.4 15.4 L21 21" stroke="{accent}" stroke-width="1.8"/>
      <path d="M8 10.5 L13 10.5 M10.5 8 L10.5 13" stroke="{core}" stroke-width="1.4"/>""", 10, 10, False),
    "zoom-out": ("""
      <circle cx="10.5" cy="10.5" r="6.4" fill="none" stroke="{accent}" stroke-width="1.4"/>
      <path d="M15.4 15.4 L21 21" stroke="{accent}" stroke-width="1.8"/>
      <path d="M8 10.5 L13 10.5" stroke="{core}" stroke-width="1.4"/>""", 10, 10, False),
    "context-menu": ("""
      <path d="M5 4 L5 18 L9 14 L11.4 19.6 L14 18.4 L11.6 12.8 L16.4 12.8 Z" fill="{body}" stroke="{accent}" stroke-width="1.1"/>
      <path d="M14 4 L20 4 M14 7 L20 7 M14 10 L18 10" stroke="{accent}" stroke-width="1.3"/>""", 5, 4, False),
    "move": ("""
      <path d="M12 2 L15 6 L13 6 L13 11 L18 11 L18 9 L22 12 L18 15 L18 13 L13 13 L13 18 L15 18 L12 22 L9 18 L11 18 L11 13 L6 13 L6 15 L2 12 L6 9 L6 11 L11 11 L11 6 L9 6 Z"
            fill="{body}" stroke="{accent}" stroke-width="1"/>""", 12, 12, True),
    "copy": ("""
      <path d="M8 4 L18 4 L18 16 L8 16 Z" fill="{body}" stroke="{accent}" stroke-width="1.2"/>
      <path d="M5 7 L5 20 L15 20" fill="none" stroke="{accent}" stroke-width="1.2"/>
      <path d="M11 7 L15 7 L15 11" fill="none" stroke="{core}" stroke-width="1.2"/>""", 8, 4, False),
    "link": ("""
      <path d="M9 15 L15 9" stroke="{core}" stroke-width="1.8"/>
      <path d="M7 11 L5 13 C3.6 14.4 3.6 16.4 5 17.8 C6.4 19.2 8.4 19.2 9.8 17.8 L12 15.6" fill="none" stroke="{accent}" stroke-width="1.3"/>
      <path d="M17 13 L19 11 C20.4 9.6 20.4 7.6 19 6.2 C17.6 4.8 15.6 4.8 14.2 6.2 L12 8.4" fill="none" stroke="{accent}" stroke-width="1.3"/>""", 12, 12, False),
}

# shape -> aliases the freedesktop/X11 world asks for
ALIASES = {
    "left_ptr": ["default", "arrow", "top_left_arrow", "left_ptr_watch"],
    "pointer": ["hand", "hand1", "hand2", "pointing_hand", "link_cursor"],
    "text": ["xterm", "ibeam", "text_cursor"],
    "crosshair": ["cross", "tcross", "crossed_circle", "crosshair_cursor"],
    "wait": ["watch", "left_ptr_watch_start"],
    "progress": ["half-busy", "left_ptr_watch_end"],
    "grab": ["openhand", "fleur", "hand_open"],
    "grabbing": ["closedhand", "hand_closed"],
    "ns-resize": ["sb_v_double_arrow", "size_ver", "n-resize", "s-resize", "top_side", "bottom_side", "row-resize"],
    "ew-resize": ["sb_h_double_arrow", "size_hor", "e-resize", "w-resize", "left_side", "right_side", "col-resize"],
    "nwse-resize": ["size_fdiag", "nw-resize", "se-resize", "top_left_corner", "bottom_right_corner"],
    "nesw-resize": ["size_bdiag", "ne-resize", "sw-resize", "top_right_corner", "bottom_left_corner"],
    "not-allowed": ["forbidden", "no-drop", "crossed_circle_x"],
    "help": ["question_arrow", "whats_this"],
    "move": ["size_all", "fleur_move"],
    "copy": ["dnd-copy"],
}


def svg_for(name, body, glowing, size):
    """BreezeX's recipe: the shape filled, the same shape stroked, and a soft drop shadow so the
    cursor stays legible on a light page as well as a dark one."""
    body = body.format(accent=ACCENT, core=CORE, body=BODY)
    glow = ""
    if glowing:
        glow = (f'<g filter="url(#gl)">{body}</g>'
                f'<circle cx="12" cy="12" r="13" fill="{GLOW}" opacity=".10"/>')
    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="{size}" height="{size}" viewBox="0 0 24 24">
  <defs>
    <filter id="sh" x="-50%" y="-50%" width="200%" height="200%" color-interpolation-filters="sRGB">
      <feGaussianBlur in="SourceAlpha" stdDeviation="0.55" result="b"/>
      <feOffset in="b" dy="0.55" result="o"/>
      <feFlood flood-color="#000" flood-opacity="0.55" result="c"/>
      <feComposite in="c" in2="o" operator="in" result="s"/>
      <feMerge><feMergeNode in="s"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
    <filter id="gl" x="-70%" y="-70%" width="240%" height="240%" color-interpolation-filters="sRGB">
      <feGaussianBlur in="SourceAlpha" stdDeviation="1.2" result="b"/>
      <feFlood flood-color="{GLOW}" flood-opacity="0.85" result="c"/>
      <feComposite in="c" in2="b" operator="in" result="g"/>
      <feMerge><feMergeNode in="g"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>
  <g filter="url(#sh)">{body}</g>
  {glow}
</svg>'''


def render(name, body, glowing, size, out_png):
    with tempfile.NamedTemporaryFile("w", suffix=".svg", delete=False) as f:
        f.write(svg_for(name, body, glowing, size)); path = f.name
    try:
        subprocess.run(["rsvg-convert", "-w", str(size), "-h", str(size), "-o", out_png, path], check=True)
    finally:
        os.unlink(path)


def read_png_argb(path):
    """PNG -> (w, h, [ARGB ints]); rsvg writes RGBA."""
    from PIL import Image
    im = Image.open(path).convert("RGBA")
    w, h = im.size
    raw = im.tobytes()   # RGBA, row major
    px = [((raw[i + 3] << 24) | (raw[i] << 16) | (raw[i + 1] << 8) | raw[i + 2]) for i in range(0, len(raw), 4)]
    return w, h, px


def xcursor(names_entries):
    """names_entries: list of (nominal_size, w, h, xhot, yhot, pixels)."""
    toc = b""
    images = b""
    base = 16 + 12 * len(names_entries)
    for size, w, h, xh, yh, px in names_entries:
        toc += struct.pack("<III", 0xFFFD0002, size, base + len(images))
        header = struct.pack("<IIIIIIIII", 36, 0xFFFD0002, size, 1, w, h, xh, yh, 0)
        body = b"".join(struct.pack("<I", p) for p in px)
        images += header + body
    return struct.pack("<4sIII", b"Xcur", 16, 0x00010000, len(names_entries)) + toc + images


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dir", default=os.path.expanduser("~/.local/share/icons/CaesarCrystal"))
    ap.add_argument("--sizes", default="24,32,48")
    ap.add_argument("--preview", default="")
    ap.add_argument("--web", default="", help="also write PNGs for the Atrium CSS")
    args = ap.parse_args()
    sizes = [int(s) for s in args.sizes.split(",")]
    outdir = args.dir
    curdir = os.path.join(outdir, "cursors")
    if os.path.isdir(outdir):
        shutil.rmtree(outdir)
    os.makedirs(curdir, exist_ok=True)

    tmp = tempfile.mkdtemp()
    built = {}
    for name, (body, hx, hy, glowing) in SHAPES.items():
        entries = []
        for s in sizes:
            png = os.path.join(tmp, f"{name}-{s}.png")
            render(name, body, glowing, s, png)
            w, h, px = read_png_argb(png)
            k = s / 24.0
            entries.append((s, w, h, round(hx * k), round(hy * k), px))
        blob = xcursor(entries)
        with open(os.path.join(curdir, name), "wb") as f:
            f.write(blob)
        built[name] = blob

    for name, alts in ALIASES.items():
        src = os.path.join(curdir, name)
        for alt in alts:
            dst = os.path.join(curdir, alt)
            if os.path.exists(dst):
                os.unlink(dst)
            os.symlink(name, dst)

    with open(os.path.join(outdir, "index.theme"), "w") as f:
        f.write("[Icon Theme]\nName=CaesarCrystal\nComment=Standard cursors cut like Caesar's crystal\n"
                "Example=left_ptr\nInherits=Adwaita\nDirectories=cursors\n\n[cursors]\nSize=24\n"
                "MinSize=16\nMaxSize=48\nContext=Cursors\nType=Fixed\n")

    if args.web:
        os.makedirs(args.web, exist_ok=True)
        for name, (body, hx, hy, glowing) in SHAPES.items():
            png = os.path.join(args.web, f"{name}.png")
            render(name, body, glowing, 24, png)
        print(f"web cursors -> {args.web}")

    if args.preview:
        pngs = []
        for name, (body, hx, hy, glowing) in SHAPES.items():
            png = os.path.join(tmp, f"pv-{name}.png")
            render(name, body, glowing, 96, png)
            pngs.append((name, png))
        tiles = []
        for name, png in pngs:
            lab = os.path.join(tmp, f"lab-{name}.png")
            subprocess.run(["magick", png, "-background", "#111418", "-gravity", "center",
                            "-extent", "128x128", lab], check=True)
            subprocess.run(["magick", lab, "-gravity", "south", "-fill", "#9aa4b2", "-pointsize", "13",
                            "-annotate", "+0+6", name, lab], check=True)
            tiles.append(lab)
        dark = os.path.join(tmp, "sheet-dark.png")
        subprocess.run(["magick", "montage", *tiles, "-tile", "6x", "-geometry", "+4+4",
                        "-background", "#111418", dark], check=True)
        light_tiles = []
        for name, png in pngs:
            lab = os.path.join(tmp, f"labL-{name}.png")
            subprocess.run(["magick", png, "-background", "#e8e4dc", "-gravity", "center",
                            "-extent", "128x128", lab], check=True)
            light_tiles.append(lab)
        light = os.path.join(tmp, "sheet-light.png")
        subprocess.run(["magick", "montage", *light_tiles, "-tile", "6x", "-geometry", "+4+4",
                        "-background", "#e8e4dc", light], check=True)
        shutil.copy(dark, args.preview)
        shutil.copy(light, args.preview.replace(".png", "-light.png"))
        print(f"preview -> {args.preview}")

    print(f"{len(built)} shapes, sizes {sizes}, aliases {sum(len(v) for v in ALIASES.values())} -> {outdir}")


if __name__ == "__main__":
    main()
