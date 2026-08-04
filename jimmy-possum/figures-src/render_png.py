#!/usr/bin/env python3
"""Render an SVG diagram to PNG via WebKit (qlmanage), cropping the square letterbox.

Usage: render.py input.svg output.png [width]

cairosvg on this machine currently mis-measures italic glyph advances through
cairo's quartz font backend (every italic 'f' gets an ink-width advance), so we
use QuickLook/WebKit which lays text out with proper CoreText metrics and real
Georgia — matching the original figure renders.
"""
import re, subprocess, sys, tempfile, pathlib
from PIL import Image

svg = pathlib.Path(sys.argv[1]).resolve()
out = pathlib.Path(sys.argv[2]).resolve()
W = int(sys.argv[3]) if len(sys.argv) > 3 else 1600

vb = re.search(r'viewBox="([\d.\s]+)"', svg.read_text())
_, _, vw, vh = (float(v) for v in vb.group(1).split())
if vw >= vh:
    side = W
    cw, ch = W, round(W * vh / vw)
else:
    ch = W  # tall drawings: honor requested width, thumbnail side is height
    cw = W
    side = round(W * vh / vw)
    ch = side
    cw = W

with tempfile.TemporaryDirectory() as td:
    subprocess.run(["qlmanage", "-t", "-s", str(side), "-o", td, str(svg)],
                   check=True, capture_output=True)
    thumb = pathlib.Path(td) / (svg.name + ".png")
    im = Image.open(thumb)
    tw, th = im.size
    left = (tw - cw) // 2
    top = (th - ch) // 2
    im.crop((left, top, left + cw, top + ch)).save(out)
print(f"rendered {out.name}: {cw}x{ch}")
