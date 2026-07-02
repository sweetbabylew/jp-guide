from style import *
import math
w,h=900,600
svg=header(w,h)
svg+=f'<defs><marker id="ah" markerWidth="10" markerHeight="10" refX="6" refY="3" orient="auto"><path d="M0,0 L7,3 L0,6 Z" fill="{INK}"/></marker><marker id="ahr" markerWidth="9" markerHeight="9" refX="6" refY="3" orient="auto"><path d="M0,0 L7,3 L0,6 Z" fill="{RED}"/></marker></defs>'
svg+=f'<text x="{w/2}" y="36" text-anchor="middle" font-size="23" fill="{INK}" font-weight="bold">Drilling the Outer Back Sticks — Seat &amp; Arm Together</text>'
svg+=f'<text x="{w/2}" y="60" text-anchor="middle" font-size="13" fill="{INK2}" font-style="italic">Clamp the arms UNDER the seat, centerlines aligned with the side layout lines, and bore both in one pass</text>'

# ---- LEFT: plan view of the alignment ----
svg+=f'<text x="245" y="92" text-anchor="middle" font-size="13" fill="{INK}" font-weight="bold">Plan — line up the arms</text>'
sx,sy,sw,sh=90,110,300,250
svg+=f'<rect x="{sx}" y="{sy}" width="{sw}" height="{sh}" rx="4" fill="{WOOD_L}" stroke="{INK}" stroke-width="2.2"/>'
off=40
holeY=sy+34   # the back layout line: 1.5" in from the back edge
# arms beneath (ghosted), running front-to-back; back = TOP. Each extends ~1" past the back and well past the front.
armTopOver=14    # ~1" past the back edge (top)
armBotOver=46    # slack past the front edge (bottom)
ay0=sy-armTopOver; ay1=sy+sh+armBotOver
for axx in (sx+off, sx+sw-off):
    svg+=f'<rect x="{axx-20}" y="{ay0}" width="40" height="{ay1-ay0}" rx="3" fill="{WOOD}" fill-opacity="0.55" stroke="{INK2}" stroke-width="1.5" stroke-dasharray="2,3"/>'
    svg+=f'<line x1="{axx}" y1="{ay0+4}" x2="{axx}" y2="{ay1-4}" stroke="{SAGE}" stroke-width="2"/>'
# seat layout lines drawn on top (scribed on the seat's TOP face, so they read over the ghosted arms):
# two side lines 1.5" from the side edges, plus the back line 1.5" from the back edge
svg+=f'<line x1="{sx+off}" y1="{sy}" x2="{sx+off}" y2="{sy+sh}" stroke="{RED}" stroke-width="1.6" stroke-dasharray="5,4"/>'
svg+=f'<line x1="{sx+sw-off}" y1="{sy}" x2="{sx+sw-off}" y2="{sy+sh}" stroke="{RED}" stroke-width="1.6" stroke-dasharray="5,4"/>'
svg+=f'<line x1="{sx}" y1="{holeY}" x2="{sx+sw}" y2="{holeY}" stroke="{RED}" stroke-width="1.6" stroke-dasharray="5,4"/>'
# back/front labels
svg+=f'<text x="{sx+sw+8}" y="{sy+10}" font-size="10.5" fill="{INK}" font-weight="bold">BACK</text>'
svg+=f'<text x="{sx+sw+8}" y="{sy+sh-4}" font-size="10.5" fill="{INK}" font-weight="bold">FRONT</text>'
# rear corner hole centers, sitting where the side lines cross the back line
for axx in (sx+off, sx+sw-off):
    svg+=f'<circle cx="{axx}" cy="{holeY}" r="6" fill="{WOOD_D}" stroke="{INK}" stroke-width="1.6"/>'
svg+=f'<text x="{sx+sw/2}" y="{holeY+40}" text-anchor="middle" font-size="11" fill="{RED}">hole center — where the lines cross</text>'
svg+=f'<line x1="{sx+sw/2-70}" y1="{holeY+28}" x2="{sx+off+8}" y2="{holeY+8}" stroke="{RED}" stroke-width="1" marker-end="url(#ahr)"/>'
svg+=f'<line x1="{sx+sw/2+70}" y1="{holeY+28}" x2="{sx+sw-off-8}" y2="{holeY+8}" stroke="{RED}" stroke-width="1" marker-end="url(#ahr)"/>'
svg+=f'<text x="{sx+sw/2}" y="{ay1+18}" text-anchor="middle" font-size="11.5" fill="{RED}">red dashes = seat layout lines, 1½″ in from each edge</text>'
svg+=f'<text x="{sx+sw/2}" y="{ay1+34}" text-anchor="middle" font-size="11.5" fill="{SAGE}">green = arm centerlines (arms below the seat)</text>'
svg+=f'<text x="{sx+sw/2}" y="{ay1+50}" text-anchor="middle" font-size="11.5" fill="{INK2}">align each arm to the seat&#39;s side line; arms run past front &amp; back</text>'

# ---- RIGHT: section view. BACK at left (bore + 1" arm overhang), FRONT at right (arm slack runs past) ----
svg+=f'<text x="650" y="96" text-anchor="middle" font-size="13" fill="{INK}" font-weight="bold">Section — bore through both</text>'
ox,oy=470,150
# seat slab: back edge at ox, front edge at ox+seatW
seatW=300; seatTh=30
sb=ox          # seat BACK edge (left)
sf=ox+seatW    # seat FRONT edge (right)
svg+=f'<rect x="{sb}" y="{oy+70}" width="{seatW}" height="{seatTh}" rx="3" fill="{WOOD}" stroke="{INK}" stroke-width="2.2"/>'
svg+=f'<text x="{sf-70}" y="{oy+90}" text-anchor="middle" font-size="11.5" fill="{INK2}">seat</text>'
svg+=f'<text x="{sb-30}" y="{oy+58}" text-anchor="middle" font-size="11.5" fill="{INK}" font-weight="bold">BACK</text>'
svg+=f'<text x="{sf}" y="{oy+58}" text-anchor="middle" font-size="11.5" fill="{INK}" font-weight="bold">FRONT</text>'
# arm UNDER seat, clamped face-to-face (no gap): 1" past the BACK (left), slack past the FRONT (right)
armBackOver=26     # ~1" past back (left)
armFrontOver=92   # slack past front (right)
ax0=sb-armBackOver
ax1=sf+armFrontOver
armY=oy+70+seatTh
armTh=24
svg+=f'<rect x="{ax0}" y="{armY}" width="{ax1-ax0}" height="{armTh}" rx="3" fill="{WOOD_L}" stroke="{INK}" stroke-width="2.2"/>'
svg+=f'<text x="{ax1}" y="{armY+armTh+18}" text-anchor="end" font-size="10.5" fill="{INK2}">overlong — slack runs past the front</text>'
svg+=f'<text x="{ax0-4}" y="{armY+armTh/2+4}" text-anchor="end" font-size="11.5" fill="{INK}">arm</text>'
# 1" overhang dim at back
svg+=f'<line x1="{ax0}" y1="{armY-8}" x2="{sb}" y2="{armY-8}" stroke="{RED}" stroke-width="1" marker-start="url(#ahr)" marker-end="url(#ahr)"/>'
svg+=f'<text x="{(ax0+sb)/2}" y="{armY-12}" text-anchor="middle" font-size="10" fill="{RED}">1″</text>'
# bore at the rear corner (near back/left), rake angle
mx=sb+34; ang=math.radians(13)
boty=armY+armTh
topy=oy+30
topx=mx- math.tan(ang)*(boty-topy)
# scrap plywood UNDER the arm at the drill zone (to stop blow-out)
svg+=f'<rect x="{mx-46}" y="{armY+armTh}" width="92" height="14" rx="2" fill="#e7d9bf" stroke="{INK2}" stroke-width="1.4" stroke-dasharray="3,2"/>'
svg+=f'<text x="{mx}" y="{armY+armTh+27}" text-anchor="middle" font-size="10.5" fill="{INK2}">scrap plywood (stops blow-out)</text>'
# the bit
svg+=f'<line x1="{mx}" y1="{boty}" x2="{topx:.0f}" y2="{topy}" stroke="#8a8f94" stroke-width="6"/>'
svg+=f'<circle cx="{mx}" cy="{boty}" r="3.5" fill="{INK}"/>'
# clamp hugging seat+arm just front of the bore
clx=mx+120
svg+=f'<rect x="{clx}" y="{oy+62}" width="13" height="{(armY+armTh)-(oy+62)+8}" rx="3" fill="none" stroke="{INK}" stroke-width="2.4"/>'
svg+=f'<rect x="{clx-6}" y="{oy+62}" width="25" height="7" fill="{INK2}"/>'
svg+=f'<rect x="{clx-6}" y="{armY+armTh+1}" width="25" height="7" fill="{INK2}"/>'
svg+=f'<text x="{clx+6}" y="{oy+54}" text-anchor="middle" font-size="10.5" fill="{INK2}">clamp</text>'
# vertical ref + angle arc
svg+=f'<line x1="{mx}" y1="{boty}" x2="{mx}" y2="{topy-12}" stroke="{INK2}" stroke-width="1" stroke-dasharray="2,3"/>'
svg+=f'<path d="M{mx} {topy+34} A 40 40 0 0 0 {mx-math.sin(ang)*40:.0f} {topy+34}" fill="none" stroke="{RED}" stroke-width="1.3"/>'
svg+=f'<text x="{mx+6}" y="{topy+12}" font-size="12.5" fill="{RED}" font-weight="bold">rake 9–17°</text>'
svg+=f'<text x="{topx-2:.0f}" y="{topy-8}" text-anchor="middle" font-size="11.5" fill="{INK}">1″ bit, sighted along the line</text>'

# bottom explainer
svg+=f'<text x="{w/2}" y="{h-86}" text-anchor="middle" font-size="14" fill="{INK}" font-weight="bold">One bore, two parts — they line up forever</text>'
svg+=f'<text x="{w/2}" y="{h-64}" text-anchor="middle" font-size="12.5" fill="{INK2}">Hole center = the rear-corner intersection of the layout lines. Sight the rake ALONG the side line (no splay).</text>'
svg+=f'<text x="{w/2}" y="{h-46}" text-anchor="middle" font-size="12.5" fill="{INK2}">Choose the rake for the chair&#39;s use: 9° upright and dining, toward 17° for a relaxed, reclined sitter.</text>'
svg+=f'<text x="{w/2}" y="{h-22}" text-anchor="middle" font-size="11.5" fill="{INK2}" font-style="italic">Always clamp scrap under the exit face to stop blow-out.</text>'
svg+='</svg>'
open('12_drill_setup.svg','w').write(svg)
print("12 ok")
