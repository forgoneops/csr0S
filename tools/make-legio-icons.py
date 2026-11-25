#!/usr/bin/env python3
"""Legio icons: one hand-built angular icon family for CaesarOS (ancient Neo-Roma meets cyberpunk).
Rules (so the set stays one family): 24 px grid, 2 px live-area padding, 1.75 stroke, miter joins and square caps,
no curves (every turn is 90 or 45 degrees, the same cut as the UI corners), one small square "node" accent per icon
that takes --icon-accent, Roman motifs where they fit (laurel, column, crown, helmet, shield, meander).
Craft rules from public icon-design guidance (keyline shapes, one stroke weight, optical padding); all shapes drawn here.
Run: python3 tools/make-legio-icons.py  ->  packs/icons/legio/legio-icons.svg and manifest.json"""
import json, os

def rc(x, y, w, h, c=2.5):  # rectangle with the UI's cut: top-right and bottom-left
    return f"M{x} {y} H{x+w-c} L{x+w} {y+c} V{y+h} H{x+c} L{x} {y+h-c} Z"
def oct_(cx, cy, r, c=None):
    c = c or r * 0.42
    return f"M{cx-r+c} {cy-r} H{cx+r-c} L{cx+r} {cy-r+c} V{cy+r-c} L{cx+r-c} {cy+r} H{cx-r+c} L{cx-r} {cy+r-c} V{cy-r+c} Z"

I = {}
def icon(name, d, nodes=()): I[name] = (d, list(nodes))

icon("chat", rc(3,4,18,12,3) + " M8 16 V20 L12 16 M7 9 H14 M7 12 H11", [(16,8.8)])
icon("send", "M3 11 L21 3 L15 21 L11 13 Z M11 13 L21 3", [(5.5,17.5)])
icon("search", oct_(10,10,6.5,2.6) + " M15 15 L21 21", [(10,10)])
icon("alert", "M12 3 L22 20 H2 Z M12 9 V14", [(12,16.8)])
icon("lock", rc(5,10,14,10,3) + " M8 10 V7 L10 4 H14 L16 7 V10", [(12,14.5)])
icon("home", "M3 11 L12 3 L21 11 M5 10 V20 H19 V10 M10 20 V14 H14 V20", [(12,7.5)])
icon("expand", "M4 9 V4 H9 M15 4 H20 V9 M20 15 V20 H15 M9 20 H4 V15", [(12,12)])
icon("edit", "M4 20 L5 15 L16 4 L20 8 L9 19 Z M13 7 L17 11", [(6.2,17.8)])
icon("crown", "M3 18 L4 8 L9 12 L12 5 L15 12 L20 8 L21 18 Z M3 21 H21", [(12,9.5)])
icon("crossroads", "M12 3 V21 M3 12 H21 M12 3 L9 6 M12 3 L15 6 M12 21 L9 18 M12 21 L15 18 M3 12 L6 9 M3 12 L6 15 M21 12 L18 9 M21 12 L18 15", [])
icon("check", "M4 12 L10 18 L20 6", [])
icon("arrow", "M4 12 H19 M13 6 L19 12 L13 18", [])
icon("terminal", rc(3,4,18,16,3) + " M7 9 L11 12 L7 15 M13 16 H17", [(17,8.5)])
icon("system", rc(6,6,12,12,2.5) + " M9 3 V6 M15 3 V6 M9 18 V21 M15 18 V21 M3 9 H6 M3 15 H6 M18 9 H21 M18 15 H21", [(12,12)])
icon("settings", "M4 7 H20 M4 12 H20 M4 17 H20 M8 5.2 V8.8 H11 V5.2 Z M14 10.2 V13.8 H17 V10.2 Z M9 15.2 V18.8 H12 V15.2 Z", [])
icon("plus", "M12 5 V19 M5 12 H19", [])
icon("minus", "M5 12 H19", [])
icon("close", "M6 6 L18 18 M18 6 L6 18", [])
icon("mic", "M9 3 H14 L15 4 V12 L14 14 H10 L9 12 Z M5 11 V12 L8 16 H16 L19 12 V11 M12 16 V21 M9 21 H15", [(12,8)])
icon("flame", "M12 2 L16 8 L18 13 L16 19 L12 22 L8 19 L6 14 L9 10 L10 13 L12 9 Z", [(12,17)])
icon("engine", "M12 2 L21 7 V17 L12 22 L3 17 V7 Z M13 7 L9 13 H14 L11 18", [])
icon("archive", "M3 5 H21 V9 H3 Z M5 9 V20 H19 V9 M10 13 H14", [(12,16.5)])
icon("book", "M4 4 H11 L12 5 L13 4 H20 V19 H13 L12 20 L11 19 H4 Z M12 5 V20 M7 9 H9 M15 9 H17", [(16,13)])
icon("brain", "M12 4 H8 L5 7 V10 L4 12 L5 14 V17 L8 20 H12 Z M12 4 H16 L19 7 V10 L20 12 L19 14 V17 L16 20 H12 M8 9 H12 M12 14 H16", [(8,14),(16,9)])
icon("calendar", rc(3,5,18,16,3) + " M3 10 H21 M8 3 V7 M16 3 V7", [(15.5,15)])
icon("crew", "M9 4 H13 L15 6 V9 L13 11 H9 L7 9 V6 Z M3 20 V17 L7 13 H15 L19 17 V20 M18 5 L20 7 V10 M22 20 V17 L20 14", [(11,7.6)])
icon("design", "M12 3 L19 12 L12 21 L5 12 Z M12 3 V13", [(12,16)])
icon("dream", "M17 3 L11 5 L7 10 V14 L11 19 L17 21 L13 17 L12 12 L13 7 Z", [(18,8)])
icon("folder", "M3 6 H9 L11 8 H21 V19 H3 Z M3 11 H21", [(17,15)])
icon("forge", "M4 9 H20 L18 13 H14 V17 H17 V20 H7 V17 H10 V13 H6 Z", [(17,6)])
icon("health", rc(3,4,18,16,3) + " M5 12 H9 L11 8 L13 16 L15 12 H19", [])
icon("image", rc(3,4,18,16,3) + " M3 17 L9 11 L13 15 L16 12 L21 17", [(16,8)])
icon("inbox", "M3 13 L6 5 H18 L21 13 V19 H3 Z M3 13 H8 L9 16 H15 L16 13 H21", [(12,9)])
icon("key", "M3 12 L6 8 H11 L14 12 L11 16 H6 Z M14 12 H22 M19 12 V16 M22 12 V15", [(8.5,12)])
icon("library", "M3 20 H21 M4 9 H20 L12 4 Z M7 9 V20 M12 9 V20 M17 9 V20", [(12,7)])
icon("missions", "M5 21 V4 M5 5 H18 L16 9 L18 13 H5", [(10,9)])
icon("news", rc(3,4,18,16,3) + " M7 9 H17 M7 13 H17 M7 17 H11", [(16,17)])
icon("pause", "M8 5 V19 M16 5 V19", [])
icon("pending", oct_(12,12,9,3.5) + " M12 7 V12 L16 14", [])
icon("planner", rc(3,4,18,16,3) + " M9 4 V20 M15 4 V20 M6 9 H7 M12 9 H13 M18 9 H19", [(12,14)])
icon("play", "M7 4 L20 12 L7 20 Z", [])
icon("plugin", "M9 3 V8 M15 3 V8 M6 8 H18 V13 L15 17 H9 L6 13 Z M12 17 V21", [(12,12.5)])
icon("queue", "M9 6 H21 M9 12 H21 M9 18 H21 M3.5 4.5 H6 V7 H3.5 Z M3.5 10.5 H6 V13 H3.5 Z M3.5 16.5 H6 V19 H3.5 Z", [])
icon("skills", "M12 21 V12 M12 12 L6 6 M12 12 L18 6 M6 6 V3 M18 6 V3 M12 12 V7", [(12,4.2)])
icon("sparkle", "M12 3 L14 10 L21 12 L14 14 L12 21 L10 14 L3 12 L10 10 Z", [])
icon("speak", "M4 9 V15 H8 L13 19 V5 L8 9 Z M16 9 L18 12 L16 15 M19 6 L22 12 L19 18", [])
icon("star", "M12 3 L14.5 9 L21 9.5 L16 14 L17.5 21 L12 17.5 L6.5 21 L8 14 L3 9.5 L9.5 9 Z", [])
icon("stop", rc(6,6,12,12,3), [])
icon("tools", "M4 17 L7 20 L14 13 L17 13 L21 9 L21 6 L18 9 L16 7 L19 4 L16 3 L12 7 L12 10 Z", [(6,18)])
icon("trash", "M5 7 H19 M9 7 V4 H15 V7 M7 7 L8 21 H16 L17 7 M10 11 V17 M14 11 V17", [])
icon("usage", "M3 21 H21 M5 20 V12 M10 20 V6 M15 20 V10 M20 20 V4", [])
icon("video", rc(3,5,13,14,2.5) + " M16 10 L21 7 V17 L16 14", [(9.5,12)])
icon("claude", "M12 3 V21 M4 7 L20 17 M20 7 L4 17", [])
icon("codex", "M9 6 L3 12 L9 18 M15 6 L21 12 L15 18", [(12,12)])
icon("background", "M12 3 L21 8 L12 13 L3 8 Z M3 12 L12 17 L21 12 M3 16 L12 21 L21 16", [])
# roles the packs system asks for, and the rest of the interface
icon("motion", "M3 12 H8 L10 7 L14 17 L16 12 H21", [])
icon("board", rc(3,4,18,16,3) + " M3 9 H21 M9 9 V20", [(15,14)])
icon("memory", "M12 4 H8 L5 7 V10 L4 12 L5 14 V17 L8 20 H12 Z M12 4 H16 L19 7 V10 L20 12 L19 14 V17 L16 20 H12 M8 9 H12 M12 14 H16", [(8,14),(16,9)])
icon("media", rc(3,4,18,16,3) + " M3 17 L9 11 L13 15 L16 12 L21 17", [(16,8)])
icon("mail", rc(3,5,18,14,3) + " M3 7 L12 13 L21 7", [])
icon("agent", "M9 4 H15 L18 7 V11 L15 14 H9 L6 11 V7 Z M5 20 V17 L8 15 M19 20 V17 L16 15 M9 8 H11 M13 8 H15", [(12,17.5)])
icon("command", "M9 3 H15 L21 9 V15 L15 21 H9 L3 15 V9 Z M9 9 H15 V15 H9 Z", [])
icon("add", "M12 5 V19 M5 12 H19", [])
icon("remove", "M5 12 H19", [])
icon("chevron-down", "M5 9 L12 16 L19 9", [])
icon("chevron-up", "M5 15 L12 8 L19 15", [])
icon("chevron-right", "M9 5 L16 12 L9 19", [])
icon("more", "M4 10.8 H6.4 V13.2 H4 Z M10.8 10.8 H13.2 V13.2 H10.8 Z M17.6 10.8 H20 V13.2 H17.6 Z", [])
icon("menu", "M4 7 H20 M4 12 H14 M4 17 H20", [(18,12)])
icon("pane", rc(3,4,18,16,3) + " M14 4 V20", [])
icon("split", rc(3,4,18,16,3) + " M12 4 V20", [])
icon("attach", "M9 9 V17 L11 19 H14 L16 17 V6 L14 4 H11 L9 6 V15 L10.5 16.5 H12.5 L13.5 15.5 V8", [])
icon("copy", rc(8,8,13,13,3) + " M16 8 V3 H3 V16 H8", [])
icon("delete", "M5 7 H19 M9 7 V4 H15 V7 M7 7 L8 21 H16 L17 7 M10 11 V17 M14 11 V17", [])
icon("refresh", "M19 8 L16 4 H8 L4 8 V12 M5 16 L8 20 H16 L20 16 V12 M19 3 V8 H14 M5 21 V16 H10", [])
icon("power", "M12 3 V12 M7 6 L5 9 V15 L9 20 H15 L19 15 V9 L17 6", [])
icon("eye", "M2 12 L7 6 H17 L22 12 L17 18 H7 Z", [(12,12)])
icon("link", "M10 14 L14 10 M8 12 L5 15 V18 L8 20 H11 L13 18 M16 12 L19 9 V6 L16 4 H13 L11 6", [])
icon("external", "M14 3 H21 V10 M21 3 L11 13 M18 14 V20 H4 V6 H10", [])
icon("filter", "M3 4 H21 L14 12 V20 L10 18 V12 Z", [])
icon("info", oct_(12,12,9,3.5) + " M12 11 V17", [(12,7.6)])
icon("clock", oct_(12,12,9,3.5) + " M12 7 V12 L16 14", [])
icon("download", "M12 4 V15 M7 11 L12 16 L17 11 M4 20 H20", [])
icon("upload", "M12 16 V5 M7 9 L12 4 L17 9 M4 20 H20", [])
icon("tag", "M3 3 H12 L21 12 L12 21 L3 12 Z", [(8,8)])
icon("sort", "M7 4 V20 M3 8 L7 4 L11 8 M17 20 V4 M13 16 L17 20 L21 16", [])
icon("pin", "M8 3 H16 L15 10 L19 14 H5 L9 10 Z M12 14 V21", [])
icon("globe", oct_(12,12,9,3.5) + " M3 12 H21 M12 3 V21 M7 4.5 L9 12 L7 19.5 M17 4.5 L15 12 L17 19.5", [])
icon("theme", oct_(12,12,9,3.5) + " M12 3 V21 M12 3 L21 12 L12 21", [])
icon("wave", "M3 12 L6 6 L9 18 L12 6 L15 18 L18 8 L21 12", [])
icon("laurel", "M12 21 V10 M12 18 L7 15 M12 14 L6 11 M12 10 L7 7 M12 18 L17 15 M12 14 L18 11 M12 10 L17 7 M12 6 L12 3", [(12,3)])

def sprite():
    out = ['<svg xmlns="http://www.w3.org/2000/svg" style="display:none">',
           '<!-- Legio icons. One family: 24px grid, 1.75 stroke, miter joins, 45/90 degree turns, one square node accent, colour from the icon-accent variable. Generated by tools/make-legio-icons.py -->']
    for name, (d, nodes) in I.items():
        n = "".join(f'<rect x="{x-1.2}" y="{y-1.2}" width="2.4" height="2.4" fill="var(--icon-accent,currentColor)" stroke="none"/>' for x, y in nodes)
        out.append(f'<symbol id="i-{name}" viewBox="0 0 24 24"><g fill="none" stroke="currentColor" stroke-width="1.75" stroke-linejoin="miter" stroke-linecap="square" stroke-miterlimit="10"><path d="{d}"/></g>{n}</symbol>')
    out.append("</svg>")
    return "\n".join(out)

if __name__ == "__main__":
    here = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "packs", "icons", "legio")
    os.makedirs(here, exist_ok=True)
    open(os.path.join(here, "legio-icons.svg"), "w").write(sprite())
    roles = ["chat","terminal","motion","board","memory","skills","media","folder","mail","calendar","crew","agent","settings","search","command","add","remove","close","check","chevron-down","chevron-right","chevron-up","more","menu","pane","split","send","mic","attach","copy","edit","delete","refresh","play","pause","power","lock","eye","link","external","filter","alert","info","clock","download","upload","tag","sort","pin","globe","theme","engine","wave","laurel"]
    missing = [r for r in roles if r not in I]
    assert not missing, missing
    json.dump({"id": "legio", "name": "Legio", "version": "1.0.0", "license": "Own work, CaesarOS", "file": "legio-icons.svg", "roles": roles}, open(os.path.join(here, "manifest.json"), "w"), indent=2)
    print(len(I), "icons written")
