from style import *
import math
w,h=980,440
svg=header(w,h)
svg+=f'<text x="{w/2}" y="40" text-anchor="middle" font-size="25" fill="{INK}" font-weight="bold">Section 2b · From Billet to Octagon</text>'
svg+=f'<text x="{w/2}" y="66" text-anchor="middle" font-size="14" fill="{INK2}" font-style="italic">Shave one radial face flat &amp; straight · then an adjacent face square to it · then the last two · then knock off the corners</text>'

cx0=130; cy=230; r=72
def rings_tangential(cx,cy,r):
    # cathedral-ish arcs across (rings parallel to one pair of faces)
    s=''
    for i in range(-2,3):
        yy=cy+i*r*0.5
        s+=f'<path d="M{cx-r} {yy} Q {cx} {yy-14} {cx+r} {yy}" fill="none" stroke="{WOOD_D}" stroke-width="1.2" opacity="0.8"/>'
    return s

import random
def jagged(x1,y1,x2,y2,segs=6,amp=7,seed=0):
    # returns a list of points along the line x1,y1->x2,y2 with random perpendicular jitter
    rnd=random.Random(seed)
    pts=[]
    for i in range(segs+1):
        t=i/segs
        x=x1+(x2-x1)*t; y=y1+(y2-y1)*t
        dx=x2-x1; dy=y2-y1; L=math.hypot(dx,dy) or 1
        px,py=-dy/L,dx/L
        j = 0 if i in (0,segs) else rnd.uniform(-amp,amp)
        pts.append((x+px*j, y+py*j))
    return pts

# Stage 1: rough riven billet — jagged on ALL sides (freshly split, nothing worked)
def stage1(cx):
    tl=(cx-r,cy-r); tr=(cx+r,cy-r); br=(cx+r,cy+r); bl=(cx-r,cy+r)
    top=jagged(*tl,*tr,seed=1); right=jagged(*tr,*br,seed=2)
    bot=jagged(*br,*bl,seed=3); left=jagged(*bl,*tl,seed=4)
    ring=top+right[1:]+bot[1:]+left[1:]
    ps=' '.join(f'{x:.0f},{y:.0f}' for x,y in ring)
    s=f'<polygon points="{ps}" fill="{WOOD}" stroke="{INK}" stroke-width="2.2"/>'
    # bark edge hint on the left (curved, darker)
    s+=f'<path d="M{cx-r} {cy-r} Q {cx-r-10} {cy} {cx-r} {cy+r}" fill="none" stroke="{WOOD_D}" stroke-width="6" opacity="0.7"/>'
    for rr in (24,46):
        s+=f'<path d="M{cx-rr} {cy-rr*0.6} Q {cx} {cy-rr} {cx+rr} {cy-rr*0.6}" fill="none" stroke="{WOOD_D}" stroke-width="1" opacity="0.55"/>'
    return s

# Stage 2: two ADJACENT faces shaved — one radial face (left) flat & straight, then a second
# face (bottom) shaved SQUARE to it. Top & right still JAGGED like stage 1.
# Squareness is established here, so the square-corner symbol lives at the shared corner.
def stage2(cx):
    tl=(cx-r,cy-r); tr=(cx+r,cy-r); br=(cx+r,cy+r); bl=(cx-r,cy+r)
    top=jagged(*tl,*tr,seed=11); right=jagged(*tr,*br,seed=12)
    # left and bottom are now STRAIGHT (worked, adjacent): straight left, jagged top, jagged right, straight bottom
    ring=[bl,tl]+top[1:]+right[1:]   # bl->tl straight left, tl->tr jagged top, tr->br jagged right, br->bl closes straight (bottom)
    ps=' '.join(f'{x:.0f},{y:.0f}' for x,y in ring)
    s=f'<polygon points="{ps}" fill="{WOOD}" stroke="{INK}" stroke-width="2.2"/>'
    s+=f'<g clip-path="url(#clip2)">{rings_tangential(cx,cy,r)}</g>'
    s+=f'<clipPath id="clip2"><polygon points="{ps}"/></clipPath>'
    # mark the two WORKED faces (red): left + bottom — adjacent, square to each other
    s+=f'<line x1="{cx-r}" y1="{cy+r}" x2="{cx-r}" y2="{cy-r}" stroke="{RED}" stroke-width="3"/>'
    s+=f'<line x1="{cx-r}" y1="{cy+r}" x2="{cx+r}" y2="{cy+r}" stroke="{RED}" stroke-width="3"/>'
    # square-corner symbol at the shared corner: the second face is SQUARE to the first
    s+=f'<path d="M{cx-r+16} {cy+r} L {cx-r+16} {cy+r-16} L {cx-r} {cy+r-16}" fill="none" stroke="{RED}" stroke-width="2"/>'
    return s

# Stage 3: full square — the last two faces brought down to a true square.
def stage3(cx):
    s=f'<rect x="{cx-r}" y="{cy-r}" width="{2*r}" height="{2*r}" fill="{WOOD}" stroke="{INK}" stroke-width="2.5"/>'
    s+=f'<g clip-path="url(#clip3)">{rings_tangential(cx,cy,r)}</g>'
    s+=f'<clipPath id="clip3"><rect x="{cx-r}" y="{cy-r}" width="{2*r}" height="{2*r}"/></clipPath>'
    return s

# Stage 4: octagon
def stage4(cx):
    c=r*(2-2**0.5)  # corner cut for a REGULAR octagon (all 8 sides equal)
    pts=[(cx-r+c,cy-r),(cx+r-c,cy-r),(cx+r,cy-r+c),(cx+r,cy+r-c),(cx+r-c,cy+r),(cx-r+c,cy+r),(cx-r,cy+r-c),(cx-r,cy-r+c)]
    ps=' '.join(f'{x:.0f},{y:.0f}' for x,y in pts)
    s=f'<polygon points="{ps}" fill="{WOOD}" stroke="{INK}" stroke-width="2.5"/>'
    s+=f'<g clip-path="url(#clip4)">{rings_tangential(cx,cy,r)}</g>'
    s+=f'<clipPath id="clip4"><polygon points="{ps}"/></clipPath>'
    # show the four removed corners as faint triangles
    corners=[((cx-r,cy-r),(cx-r+c,cy-r),(cx-r,cy-r+c)),
             ((cx+r,cy-r),(cx+r-c,cy-r),(cx+r,cy-r+c)),
             ((cx+r,cy+r),(cx+r-c,cy+r),(cx+r,cy+r-c)),
             ((cx-r,cy+r),(cx-r+c,cy+r),(cx-r,cy+r-c))]
    for tri in corners:
        ps2=' '.join(f'{x:.0f},{y:.0f}' for x,y in tri)
        s+=f'<polygon points="{ps2}" fill="none" stroke="{RED}" stroke-width="1.4" stroke-dasharray="3,3"/>'
    return s

xs=[140,370,600,830]
labels=["1 · Rough riven billet","2 · Two adjacent faces","3 · Four-square","4 · Octagonal"]
subs=[["bark &amp; round, oversize"],
      ["one radial face flat &amp; straight,","a second face square to it"],
      ["the last two faces — a true square"],
      ["equal facets — never bell-bottomed"]]
fns=[stage1,stage2,stage3,stage4]
for x,lab,sub,fn in zip(xs,labels,subs,fns):
    svg+=fn(x)
    svg+=f'<text x="{x}" y="{cy+r+38}" text-anchor="middle" font-size="15" fill="{INK}" font-weight="bold">{lab}</text>'
    for i,line in enumerate(sub):
        svg+=f'<text x="{x}" y="{cy+r+58+i*15}" text-anchor="middle" font-size="11.5" fill="{INK2}">{line}</text>'
# arrows between
for i in range(3):
    x1=xs[i]+r+8; x2=xs[i+1]-r-8
    svg+=f'<line x1="{x1}" y1="{cy}" x2="{x2}" y2="{cy}" stroke="{INK}" stroke-width="2.5" marker-end="url(#ah)"/>'
svg+=f'<defs><marker id="ah" markerWidth="10" markerHeight="10" refX="6" refY="3" orient="auto"><path d="M0,0 L7,3 L0,6 Z" fill="{INK}"/></marker></defs>'
svg+=f'<text x="{w/2}" y="{h-16}" text-anchor="middle" font-size="12" fill="{INK2}" font-style="italic">Taper the legs/back-sticks while still square (it&#39;s faster), then octagonalize. Eight facets read as “round” to the eye and hand. (Buchanan; Alexander)</text>'
svg+='</svg>'
open('05_stages.svg','w').write(svg)
print("05 ok")
