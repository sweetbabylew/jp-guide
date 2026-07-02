from style import *
import math
w,h=920,620
svg=header(w,h)
svg+=f'<defs><marker id="ah" markerWidth="10" markerHeight="10" refX="6" refY="3" orient="auto"><path d="M0,0 L7,3 L0,6 Z" fill="{INK2}"/></marker></defs>'
svg+=f'<text x="{w/2}" y="40" text-anchor="middle" font-size="24" fill="{INK}" font-weight="bold">Reading a Riven Face: Radial vs. Tangential</text>'
svg+=f'<text x="{w/2}" y="64" text-anchor="middle" font-size="13" fill="{INK2}" font-style="italic">Where a billet sat in the log decides what each of its faces will show</text>'

# ================= LEFT: log end view, one wedge riven out =================
cx,cy,R=240,320,150
A0,A1=math.radians(-58),math.radians(-24)          # the removed sector
def pol(r,a): return (cx+r*math.cos(a), cy+r*math.sin(a))

svg+=f'<circle cx="{cx}" cy="{cy}" r="{R}" fill="{WOOD_D}" stroke="{INK}" stroke-width="3"/>'   # bark
svg+=f'<circle cx="{cx}" cy="{cy}" r="{R-10}" fill="{WOOD}" stroke="{INK2}" stroke-width="1"/>'
for rr in (22,44,66,88,110,132):                   # growth rings
    svg+=f'<circle cx="{cx}" cy="{cy}" r="{rr}" fill="none" stroke="{WOOD_D}" stroke-width="1.4" opacity="0.9"/>'
for k in range(24):                                # medullary rays: spokes from the pith
    a=math.radians(k*15)
    x1,y1=pol(8,a); x2,y2=pol(138,a)
    svg+=f'<line x1="{x1:.1f}" y1="{y1:.1f}" x2="{x2:.1f}" y2="{y2:.1f}" stroke="{RAY}" stroke-width="1" opacity="0.5"/>'
svg+=f'<circle cx="{cx}" cy="{cy}" r="4.5" fill="{INK}"/>'

# the sector, split out (papered over on the log; split faces follow the rays)
p0=pol(R,A0); p1=pol(R,A1)
svg+=f'<path d="M{cx} {cy} L{p0[0]:.1f} {p0[1]:.1f} A {R} {R} 0 0 1 {p1[0]:.1f} {p1[1]:.1f} Z" fill="{PAPER}" stroke="{INK}" stroke-width="2"/>'

# the riven wedge, pulled out along the sector's bisector
mid=(A0+A1)/2; tx,ty=150*math.cos(mid),150*math.sin(mid)
def polT(r,a): return (cx+tx+r*math.cos(a), cy+ty+r*math.sin(a))
q0=polT(R,A0); q1=polT(R,A1); qt=polT(0,0)
svg+=f'<path d="M{qt[0]:.1f} {qt[1]:.1f} L{q0[0]:.1f} {q0[1]:.1f} A {R} {R} 0 0 1 {q1[0]:.1f} {q1[1]:.1f} Z" fill="{WOOD}" stroke="{INK}" stroke-width="2.2"/>'
for rr in (44,66,88,110,132):                      # ring arcs carried by the wedge
    a=polT(rr,A0); b=polT(rr,A1)
    svg+=f'<path d="M{a[0]:.1f} {a[1]:.1f} A {rr} {rr} 0 0 1 {b[0]:.1f} {b[1]:.1f}" fill="none" stroke="{WOOD_D}" stroke-width="1.3"/>'
# its two split faces lie ON rays -- highlight them red
for a in (A0,A1):
    e=polT(R-4,a)
    svg+=f'<line x1="{qt[0]:.1f}" y1="{qt[1]:.1f}" x2="{e[0]:.1f}" y2="{e[1]:.1f}" stroke="{RED}" stroke-width="2.6"/>'

# log labels
svg+=f'<text x="{cx+12}" y="{cy+22}" font-size="11.5" fill="{INK}">pith</text>'
svg+=f'<line x1="196" y1="500" x2="216" y2="446" stroke="{INK2}" stroke-width="1" marker-end="url(#ah)"/>'
svg+=f'<text x="196" y="518" text-anchor="middle" font-size="12.5" fill="{INK}">growth rings</text>'
svg+=f'<line x1="342" y1="470" x2="316" y2="416" stroke="{INK2}" stroke-width="1" marker-end="url(#ah)"/>'
svg+=f'<text x="352" y="488" text-anchor="middle" font-size="12.5" fill="{INK}">medullary rays &#8212;</text>'
svg+=f'<text x="352" y="504" text-anchor="middle" font-size="12.5" fill="{INK}">splits follow them</text>'
svg+=f'<text x="290" y="102" text-anchor="end" font-size="12.5" fill="{INK}">a riven wedge &#8212; its split faces</text>'
svg+=f'<text x="290" y="118" text-anchor="end" font-size="12.5" fill="{INK}">(<tspan fill="{RED}" font-weight="bold">red</tspan>) lie along the rays</text>'
svg+=f'<line x1="296" y1="110" x2="385" y2="158" stroke="{INK2}" stroke-width="1" marker-end="url(#ah)"/>'

# arrow: wedge -> squared billet
svg+=f'<line x1="500" y1="212" x2="575" y2="238" stroke="{INK}" stroke-width="2.2" marker-end="url(#ah)"/>'
svg+=f'<text x="516" y="262" text-anchor="middle" font-size="11.5" fill="{INK2}" font-style="italic">hewn &amp; shaved square</text>'

# ================= RIGHT: the squared billet, faces named =================
ox,oy,bw,bh,d=590,250,190,125,48
# top face = TANGENTIAL (lies along a growth ring): cathedral arches
svg+=f'<polygon points="{ox},{oy} {ox+d},{oy-d} {ox+bw+d},{oy-d} {ox+bw},{oy}" fill="{WOOD}" stroke="{INK}" stroke-width="2.5"/>'
for i in range(1,4):
    yy=oy-d+i*d/4
    svg+=f'<path d="M{ox+d*(1-i*0.25/1):.1f} {yy+6:.1f} Q {ox+d+bw/2} {yy-11:.1f} {ox+bw+d*(0.75+i*0.08):.1f} {yy+6:.1f}" fill="none" stroke="{WOOD_D}" stroke-width="1.3"/>'
# front face = RADIAL (the split face, on a ray): straight, even lines
svg+=f'<polygon points="{ox},{oy} {ox+bw},{oy} {ox+bw},{oy+bh} {ox},{oy+bh}" fill="{WOOD_L}" stroke="{RED}" stroke-width="2.6"/>'
for i in range(1,7):
    yy=oy+i*bh/7
    svg+=f'<line x1="{ox+3}" y1="{yy:.1f}" x2="{ox+bw-3}" y2="{yy:.1f}" stroke="{WOOD_D}" stroke-width="1.5"/>'
# right end = end grain: the rings cross it in layers parallel to the tangential face
svg+=f'<polygon points="{ox+bw},{oy} {ox+bw+d},{oy-d} {ox+bw+d},{oy+bh-d} {ox+bw},{oy+bh}" fill="{WOOD_D}" stroke="{INK}" stroke-width="2.5"/>'
for i in range(1,4):
    svg+=f'<line x1="{ox+bw+3}" y1="{oy+i*bh/4:.1f}" x2="{ox+bw+d-3}" y2="{oy+i*bh/4-d+6:.1f}" stroke="{INK2}" stroke-width="1" opacity="0.7"/>'

svg+=f'<text x="{ox+bw/2+d}" y="{oy-d-30}" text-anchor="middle" font-size="14.5" fill="{INK}" font-weight="bold">TANGENTIAL face</text>'
svg+=f'<text x="{ox+bw/2+d}" y="{oy-d-12}" text-anchor="middle" font-size="12" fill="{INK2}" font-style="italic">lies along a growth ring &#8212; nested cathedral arches</text>'
svg+=f'<text x="{ox+bw/2}" y="{oy+bh+26}" text-anchor="middle" font-size="14.5" fill="{RED}" font-weight="bold">RADIAL face &#8212; lies on a ray, square to the rings</text>'
svg+=f'<text x="{ox+bw/2}" y="{oy+bh+44}" text-anchor="middle" font-size="12" fill="{INK2}" font-style="italic">the split face: grain reads as straight, even lines</text>'

# ============== the figure each face shows (small swatches) ==============
sy=468
svg+=f'<text x="727" y="{sy-10}" text-anchor="middle" font-size="12" fill="{INK2}" font-style="italic">the figure each face shows:</text>'
# radial swatch: straight lines
svg+=f'<rect x="575" y="{sy}" width="130" height="58" rx="6" fill="{WOOD_L}" stroke="{INK}" stroke-width="1.8"/>'
for i in range(1,5):
    svg+=f'<line x1="580" y1="{sy+i*58/5:.1f}" x2="700" y2="{sy+i*58/5:.1f}" stroke="{WOOD_D}" stroke-width="1.6"/>'
svg+=f'<text x="640" y="{sy+76}" text-anchor="middle" font-size="11.5" fill="{RED}" font-weight="bold">radial: straight lines</text>'
# tangential swatch: cathedral arches
svg+=f'<rect x="750" y="{sy}" width="130" height="58" rx="6" fill="{WOOD_L}" stroke="{INK}" stroke-width="1.8"/>'
for i in range(4):
    yy=sy+50-i*9
    svg+=f'<path d="M{762+i*4} {yy} Q 815 {yy-30-i*4} {868-i*4} {yy}" fill="none" stroke="{WOOD_D}" stroke-width="1.5"/>'
svg+=f'<text x="815" y="{sy+76}" text-anchor="middle" font-size="11.5" fill="{INK}" font-weight="bold">tangential: arches</text>'

svg+=f'<text x="{w/2}" y="{h-18}" text-anchor="middle" font-size="14" fill="{RED}" font-weight="bold">arms &amp; crest: put the wide face on the ray (radial)</text>'
svg+='</svg>'
open('03_grain.svg','w').write(svg)
print("03 ok")
