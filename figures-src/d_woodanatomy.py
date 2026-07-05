from style import *
import math

# ---- DIAGRAM 20: How oak is built (anatomy) and how it moves (shrinkage) ----
# Based closely on Peter Galbert's Fig 1.1 (master wood-orientation plate) and
# Fig 1.12 (a check opens along the radial plane). COMPLEMENTS 03_grain.svg,
# which already covers radial-vs-tangential FACES + shave direction; this plate
# covers wood ANATOMY (pith / rays / earlywood-latewood / sapwood-heartwood) and
# SHRINKAGE (tangential shrinks ~2x radial).

w, h = 1200, 800
svg = header(w, h)
svg += (f'<defs>'
        f'<marker id="ah" markerWidth="10" markerHeight="10" refX="6" refY="3" orient="auto">'
        f'<path d="M0,0 L7,3 L0,6 Z" fill="{INK2}"/></marker>'
        f'<marker id="ahr" markerWidth="10" markerHeight="10" refX="6" refY="3" orient="auto">'
        f'<path d="M0,0 L7,3 L0,6 Z" fill="{RED}"/></marker>'
        f'<marker id="ahs" markerWidth="10" markerHeight="10" refX="6" refY="3" orient="auto">'
        f'<path d="M0,0 L7,3 L0,6 Z" fill="{SAGE}"/></marker>'
        f'<marker id="ahk" markerWidth="10" markerHeight="10" refX="6" refY="3" orient="auto">'
        f'<path d="M0,0 L7,3 L0,6 Z" fill="{INK}"/></marker>'
        f'</defs>')

svg += f'<text x="{w/2}" y="42" text-anchor="middle" font-size="26" fill="{INK}" font-weight="bold">How Oak Is Built (and How It Moves)</text>'
svg += f'<text x="{w/2}" y="68" text-anchor="middle" font-size="14" fill="{INK2}" font-style="italic">The end-grain view names every part of the wood &#8212; and explains why a drying board pulls oblong and checks along a ray</text>'

# ============================================================================
# LEFT: the end-grain cross-section (Galbert Fig 1.1 master plate)
# ============================================================================
cx, cy, R = 268, 405, 172          # bark radius
def pol(r, a): return (cx + r*math.cos(a), cy + r*math.sin(a))

# bark ring, sapwood band, heartwood
svg += f'<circle cx="{cx}" cy="{cy}" r="{R}" fill="#6b4f33" stroke="{INK}" stroke-width="3"/>'          # bark
svg += f'<circle cx="{cx}" cy="{cy}" r="{R-12}" fill="{WOOD_L}" stroke="{WOOD_D}" stroke-width="1.2"/>'  # sapwood (paler)
svg += f'<circle cx="{cx}" cy="{cy}" r="{R-50}" fill="{WOOD}" stroke="{WOOD_D}" stroke-width="1.4"/>'    # heartwood (warmer)

# growth rings across the heartwood
for rr in (26, 50, 74, 98, 120):
    svg += f'<circle cx="{cx}" cy="{cy}" r="{rr}" fill="none" stroke="{WOOD_D}" stroke-width="1.6" opacity="0.9"/>'

# medullary rays: fine spokes from the pith to the bark
for k in range(36):
    a = math.radians(k*10 + 5)
    x1, y1 = pol(9, a); x2, y2 = pol(R-12, a)
    svg += f'<line x1="{x1:.1f}" y1="{y1:.1f}" x2="{x2:.1f}" y2="{y2:.1f}" stroke="{RAY}" stroke-width="0.8" opacity="0.45"/>'

# pith
svg += f'<circle cx="{cx}" cy="{cy}" r="5" fill="{INK}"/>'

# --- RADIAL direction: pith-to-bark, along a ray (down-left, into open space) ---
ar = math.radians(150)
r1 = pol(R-14, ar)
svg += f'<line x1="{cx:.1f}" y1="{cy:.1f}" x2="{r1[0]:.1f}" y2="{r1[1]:.1f}" stroke="{RED}" stroke-width="3" marker-end="url(#ahr)"/>'
mrx, mry = (cx + r1[0])/2, (cy + r1[1])/2
svg += f'<text x="{mrx-4:.0f}" y="{mry-16:.0f}" text-anchor="middle" font-size="14" fill="{RED}" font-weight="bold">RADIAL</text>'
svg += f'<text x="{mrx-4:.0f}" y="{mry-2:.0f}" text-anchor="middle" font-size="10.5" fill="{RED}" font-style="italic">pith &#8594; bark, along a ray</text>'

# --- TANGENTIAL direction: along a ring, tangent to it (up-right, into open space) ---
at = math.radians(-60)
pt = pol(118, at)
tx, ty = -math.sin(at), math.cos(at)   # tangent = perpendicular to radius
ta = (pt[0] - tx*46, pt[1] - ty*46); tb = (pt[0] + tx*46, pt[1] + ty*46)
svg += f'<line x1="{ta[0]:.1f}" y1="{ta[1]:.1f}" x2="{tb[0]:.1f}" y2="{tb[1]:.1f}" stroke="{SAGE}" stroke-width="3" marker-start="url(#ahs)" marker-end="url(#ahs)"/>'
# label sits ABOVE the upper arrowhead, clear of the arrow line
svg += f'<text x="{ta[0]+6:.0f}" y="{ta[1]-16:.0f}" font-size="14" fill="{SAGE}" font-weight="bold">TANGENTIAL</text>'
svg += f'<text x="{ta[0]+6:.0f}" y="{ta[1]-2:.0f}" font-size="10.5" fill="{SAGE}" font-style="italic">along the ring</text>'

# --- labels around the log. Leaders point in; text sits well clear of the disc ---
def leader(tx, ty, px, py, marker="url(#ah)", stroke=INK2):
    return f'<line x1="{tx}" y1="{ty}" x2="{px}" y2="{py}" stroke="{stroke}" stroke-width="1" marker-end="{marker}"/>'

# pith (below-left)
svg += f'<text x="70" y="592" font-size="13.5" fill="{INK}" font-weight="bold">pith</text>'
svg += f'<text x="70" y="608" font-size="11" fill="{INK2}">the soft center</text>'
svg += leader(105, 585, cx-5, cy+5)

# growth rings (straight below)
svg += f'<text x="{cx}" y="640" text-anchor="middle" font-size="13.5" fill="{INK}" font-weight="bold">growth rings</text>'
svg += leader(cx, 628, cx, cy+120)

# medullary rays (upper-left, clear of the disc and the RADIAL arrow)
svg += f'<text x="60" y="196" font-size="13.5" fill="{RAY}" font-weight="bold">medullary rays</text>'
svg += f'<text x="60" y="212" font-size="11" fill="{INK2}">radiate like spokes;</text>'
svg += f'<text x="60" y="226" font-size="11" fill="{INK2}">splits love to follow them</text>'
rp = pol(105, math.radians(-142))
svg += leader(150, 214, rp[0], rp[1])

# sapwood band (right of disc, upper)
svg += f'<text x="468" y="352" font-size="13.5" fill="{INK}" font-weight="bold">sapwood</text>'
svg += f'<text x="468" y="368" font-size="11" fill="{INK2}">pale outer band,</text>'
svg += f'<text x="468" y="382" font-size="11" fill="{INK2}">still living when cut</text>'
sp = pol(R-6, math.radians(8))
svg += leader(460, 356, sp[0], sp[1])

# heartwood (right of disc, lower)
svg += f'<text x="468" y="470" font-size="13.5" fill="{INK}" font-weight="bold">heartwood</text>'
svg += f'<text x="468" y="486" font-size="11" fill="{INK2}">the dark, strong,</text>'
svg += f'<text x="468" y="500" font-size="11" fill="{INK2}">rot-resistant core</text>'
hp = pol(80, math.radians(30))
svg += leader(460, 476, hp[0], hp[1])

# ============================================================================
# CENTRE-TOP: magnified single-ring inset — porous earlywood vs dense latewood
# (Galbert's magnified circle in Fig 1.1)
# ============================================================================
ix, iy, iw, ih = 590, 128, 300, 176       # inset panel box
# dashed leader from a ring on the disc up to the inset
src = pol(98, math.radians(-70))
svg += f'<line x1="{src[0]:.1f}" y1="{src[1]:.1f}" x2="{ix+30}" y2="{iy+ih-6}" stroke="{INK2}" stroke-width="1" stroke-dasharray="3,3"/>'
svg += f'<rect x="{ix}" y="{iy}" width="{iw}" height="{ih}" rx="8" fill="#f4ead2" stroke="{INK2}" stroke-width="1.6"/>'
svg += f'<text x="{ix+iw/2}" y="{iy-10}" text-anchor="middle" font-size="13.5" fill="{INK}" font-weight="bold">One growth ring, magnified</text>'

# three stacked bands: pale porous earlywood + a dense dark latewood line
by = iy + 26
band_h = 32
gap = 16
for row in range(3):
    y0 = by + row*(band_h+gap)
    svg += f'<rect x="{ix+16}" y="{y0}" width="{iw-32}" height="{band_h}" fill="{WOOD_L}" stroke="{WOOD_D}" stroke-width="0.8"/>'
    for pxx in range(ix+32, ix+iw-24, 24):
        svg += f'<circle cx="{pxx}" cy="{y0+band_h*0.5:.0f}" r="4.6" fill="none" stroke="{RAY}" stroke-width="1.2"/>'
    svg += f'<rect x="{ix+16}" y="{y0+band_h}" width="{iw-32}" height="9" fill="{WOOD_D}"/>'
    svg += f'<line x1="{ix+16}" y1="{y0+band_h+4.5:.0f}" x2="{ix+iw-16}" y2="{y0+band_h+4.5:.0f}" stroke="{INK}" stroke-width="1.6"/>'

# inset labels sit to the RIGHT of the panel, vertically separated (top vs bottom band)
svg += f'<text x="{ix+iw+16}" y="{by+2}" font-size="12.5" fill="{RAY}" font-weight="bold">porous earlywood</text>'
svg += f'<text x="{ix+iw+16}" y="{by+18}" font-size="10.5" fill="{INK2}">open pores &#8212; laid</text>'
svg += f'<text x="{ix+iw+16}" y="{by+31}" font-size="10.5" fill="{INK2}">down fast &amp; soft</text>'
svg += f'<line x1="{ix+iw+12}" y1="{by-2}" x2="{ix+iw-28}" y2="{by+band_h*0.5:.0f}" stroke="{INK2}" stroke-width="1" marker-end="url(#ah)"/>'

lby = by + 2*(band_h+gap) + band_h        # the dense line in the bottom band
svg += f'<text x="{ix+iw+16}" y="{lby-6:.0f}" font-size="12.5" fill="{INK}" font-weight="bold">dense latewood</text>'
svg += f'<text x="{ix+iw+16}" y="{lby+10:.0f}" font-size="10.5" fill="{INK2}">the strong stuff &#8212;</text>'
svg += f'<text x="{ix+iw+16}" y="{lby+23:.0f}" font-size="10.5" fill="{INK2}">grown slow &amp; hard</text>'
svg += f'<line x1="{ix+iw+12}" y1="{lby-10:.0f}" x2="{ix+iw-28}" y2="{lby+4.5:.0f}" stroke="{INK2}" stroke-width="1" marker-end="url(#ah)"/>'

# ============================================================================
# RIGHT: SHRINKAGE panel — tangential shrinks ~2x radial
# ============================================================================
scx = 895                                  # center-x of the shrinkage column
svg += f'<text x="{scx}" y="360" text-anchor="middle" font-size="17" fill="{RED}" font-weight="bold">When it dries, it moves &#8212; unevenly</text>'
svg += f'<text x="{scx}" y="382" text-anchor="middle" font-size="12.5" fill="{INK2}" font-style="italic">tangential (along the ring) shrinks about <tspan fill="{RED}" font-weight="bold">2&#215;</tspan> as much as radial (along a ray)</text>'

# ---- (a) SQUARE -> OBLONG ----
sqx, sqy, sq = 640, 430, 92
svg += f'<rect x="{sqx}" y="{sqy}" width="{sq}" height="{sq}" fill="none" stroke="{INK2}" stroke-width="1.6" stroke-dasharray="5,4"/>'
for i in range(1, 5):
    yy = sqy + i*sq/5
    svg += f'<path d="M{sqx+2} {yy:.1f} Q {sqx+sq/2} {yy-9:.1f} {sqx+sq-2} {yy:.1f}" fill="none" stroke="{WOOD_D}" stroke-width="1.1" opacity="0.7"/>'
svg += f'<text x="{sqx+sq/2}" y="{sqy-12}" text-anchor="middle" font-size="12.5" fill="{INK}" font-weight="bold">green: square</text>'

svg += f'<line x1="{sqx+sq+16}" y1="{sqy+sq/2}" x2="{sqx+sq+60}" y2="{sqy+sq/2}" stroke="{INK}" stroke-width="2.4" marker-end="url(#ahk)"/>'
svg += f'<text x="{sqx+sq+38}" y="{sqy+sq/2-10}" text-anchor="middle" font-size="10.5" fill="{INK2}" font-style="italic">dries</text>'

# dried oblong: shrunk more vertically (tangential across the rings), a touch less across
dsx, dsy = sqx+sq+78, sqy
dw, dh = sq*0.9, sq*0.62
offy = (sq-dh)/2
svg += f'<rect x="{dsx}" y="{dsy+offy}" width="{dw}" height="{dh}" fill="{WOOD}" stroke="{INK}" stroke-width="2.4"/>'
for i in range(1, 5):
    yy = dsy+offy + i*dh/5
    svg += f'<path d="M{dsx+2} {yy:.1f} Q {dsx+dw/2} {yy-7:.1f} {dsx+dw-2} {yy:.1f}" fill="none" stroke="{WOOD_D}" stroke-width="1.1" opacity="0.8"/>'
svg += f'<text x="{dsx+dw/2:.0f}" y="{dsy-12}" text-anchor="middle" font-size="12.5" fill="{RED}" font-weight="bold">dry: oblong</text>'
# shrink arrows: big vertical (tangential) on the right, small horizontal (radial) below
svg += f'<line x1="{dsx+dw+16}" y1="{dsy+offy+3}" x2="{dsx+dw+16}" y2="{dsy+offy+dh-3}" stroke="{RED}" stroke-width="2" marker-start="url(#ahr)" marker-end="url(#ahr)"/>'
svg += f'<text x="{dsx+dw+24}" y="{dsy+offy+dh/2-3:.0f}" font-size="10.5" fill="{RED}" font-weight="bold">tangential</text>'
svg += f'<text x="{dsx+dw+24}" y="{dsy+offy+dh/2+10:.0f}" font-size="10.5" fill="{RED}">shrinks most</text>'
svg += f'<line x1="{dsx+3}" y1="{dsy+offy+dh+16}" x2="{dsx+dw-3}" y2="{dsy+offy+dh+16}" stroke="{SAGE}" stroke-width="2" marker-start="url(#ahs)" marker-end="url(#ahs)"/>'
svg += f'<text x="{dsx+dw/2:.0f}" y="{dsy+offy+dh+30:.0f}" text-anchor="middle" font-size="10.5" fill="{SAGE}" font-weight="bold">radial: barely half</text>'

# ---- (b) ROUND LOG CHECKS ON THE RADIAL PLANE (Galbert Fig 1.12) ----
lcx, lcy, lR = 720, 640, 78
svg += f'<circle cx="{lcx}" cy="{lcy}" r="{lR}" fill="{WOOD}" stroke="{INK}" stroke-width="2.6"/>'
svg += f'<circle cx="{lcx}" cy="{lcy}" r="{lR-8}" fill="none" stroke="{WOOD_D}" stroke-width="1"/>'
for rr in (20, 40, 58):
    svg += f'<circle cx="{lcx}" cy="{lcy}" r="{rr}" fill="none" stroke="{WOOD_D}" stroke-width="1.3" opacity="0.85"/>'
svg += f'<circle cx="{lcx}" cy="{lcy}" r="3.5" fill="{INK}"/>'
# the CHECK: a wedge crack opening from bark toward pith, ALONG A RAY (radial plane)
cka = math.radians(-58); cw2 = math.radians(6.5)
def lp(r, a): return (lcx + r*math.cos(a), lcy + r*math.sin(a))
o1 = lp(lR-2, cka-cw2); o2 = lp(lR-2, cka+cw2); inn = lp(11, cka)
svg += f'<path d="M{inn[0]:.1f} {inn[1]:.1f} L{o1[0]:.1f} {o1[1]:.1f} A {lR-2} {lR-2} 0 0 1 {o2[0]:.1f} {o2[1]:.1f} Z" fill="{PAPER}" stroke="{RED}" stroke-width="2.4"/>'
# check label (upper-left of the small log, clear of everything)
svg += f'<text x="{lcx-lR-14}" y="{lcy-58}" text-anchor="end" font-size="12.5" fill="{RED}" font-weight="bold">the check opens</text>'
svg += f'<text x="{lcx-lR-14}" y="{lcy-42}" text-anchor="end" font-size="12.5" fill="{RED}" font-weight="bold">along a ray</text>'
svg += f'<text x="{lcx-lR-14}" y="{lcy-26}" text-anchor="end" font-size="10.5" fill="{INK2}" font-style="italic">(the radial plane)</text>'
svg += f'<line x1="{lcx-lR-10}" y1="{lcy-52}" x2="{lp(lR-16, cka)[0]:.1f}" y2="{lp(lR-16, cka)[1]:.1f}" stroke="{INK2}" stroke-width="1" marker-end="url(#ahr)"/>'
# explanatory note to the RIGHT of the small log
svg += f'<text x="{lcx+lR+16}" y="{lcy-18}" font-size="11" fill="{INK2}" font-style="italic">rings pull apart</text>'
svg += f'<text x="{lcx+lR+16}" y="{lcy-4}" font-size="11" fill="{INK2}" font-style="italic">the long way</text>'
svg += f'<text x="{lcx+lR+16}" y="{lcy+10}" font-size="11" fill="{INK2}" font-style="italic">(around), so the</text>'
svg += f'<text x="{lcx+lR+16}" y="{lcy+24}" font-size="11" fill="{INK2}" font-style="italic">wood splits out</text>'
svg += f'<text x="{lcx+lR+16}" y="{lcy+38}" font-size="11" fill="{INK2}" font-style="italic">toward the bark.</text>'

# ============================================================================
# BOTTOM: chair note — tenon/mortise lock, explained by the shrinkage anatomy
# ============================================================================
bx, byy, bw2, bh2 = 300, 720, 600, 46
svg += f'<rect x="{bx}" y="{byy}" width="{bw2}" height="{bh2}" rx="10" fill="none" stroke="{RED}" stroke-width="1.5" stroke-dasharray="5,4"/>'
svg += f'<text x="{bx+18}" y="{byy+21}" font-size="13" fill="{RED}" font-weight="bold">On the chair:</text>'
svg += f'<text x="{bx+112}" y="{byy+21}" font-size="12" fill="{INK2}">a <tspan font-style="italic">drier</tspan> tenon set into a <tspan font-style="italic">wetter</tspan> mortise locks tight as the mortise</text>'
svg += f'<text x="{bx+18}" y="{byy+38}" font-size="12" fill="{INK2}">shrinks around it &#8212; the same wood movement that cracks a log is what makes the joint.</text>'

svg += f'<text x="{w/2}" y="{h-8}" text-anchor="middle" font-size="11.5" fill="{INK2}" font-style="italic">After Peter Galbert, &#8220;Chairmaker&#8217;s Notebook,&#8221; Fig. 1.1 &amp; 1.12.</text>'
svg += '</svg>'
open('20_woodanatomy.svg', 'w').write(svg)
print("20 ok")
