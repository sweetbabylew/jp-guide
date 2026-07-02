from style import *
import math
w,h=980,640
svg=header(w,h)
svg+=f'<text x="{w/2}" y="38" text-anchor="middle" font-size="23" fill="{INK}" font-weight="bold">Laying Out the Seat — Any Shape Works</text>'
svg+=f'<text x="{w/2}" y="62" text-anchor="middle" font-size="13" fill="{INK2}" font-style="italic">Scribe a line 1½″ in from every edge; a hole sits where two lines cross at a corner</text>'

OFF=22       # visual 1.5" inset (scaled)
# back leg band: from 2" to 3 3/4" out from the back hole, along the front-back layout line.
# scale: the rear-to-front hole span on a 16"-deep seat with 1.5" insets is 13" — size the band
# from each panel's actual hole span so it visibly hugs the back hole (2/13 to 3.75/13 of the span).
HOLE_SPAN_IN=13.0
def seat(cx, cy, outline_fn, layout_fn, title, sub, arc_note=None):
    s=f'<text x="{cx}" y="{cy-110}" text-anchor="middle" font-size="13" fill="{INK}" font-weight="bold">{title}</text>'
    s+=f'<text x="{cx}" y="{cy-94}" text-anchor="middle" font-size="10.5" fill="{INK2}">{sub}</text>'
    s+=outline_fn(cx,cy)
    s+=layout_fn(cx,cy)
    return s

# helper: draw rear + front holes, and a back-leg band that lies ALONG the side layout line
# rear[] and front[] are lists of (x,y) for the two sides; band runs 2"->3.75" from the rear hole toward the front hole.
def holes_and_band(rear, front):
    s=''
    # front holes
    for (fx,fy) in front:
        s+=f'<circle cx="{fx:.0f}" cy="{fy:.0f}" r="5" fill="{WOOD_D}" stroke="{INK}" stroke-width="1.4"/>'
    # rear holes + band along the line toward the matching front hole
    for (rx,ry),(fx,fy) in zip(rear, front):
        s+=f'<circle cx="{rx:.0f}" cy="{ry:.0f}" r="5" fill="{WOOD_D}" stroke="{INK}" stroke-width="1.4"/>'
        dx=fx-rx; dy=fy-ry; L=(dx*dx+dy*dy)**0.5
        ux,uy=dx/L,dy/L              # unit vector rear->front (along the layout line)
        px,py=-uy,ux                 # perpendicular
        a=L*(2.0/HOLE_SPAN_IN); b=L*(3.75/HOLE_SPAN_IN); hw=5  # band half-width; 2"-3¾" from the back hole
        p1=(rx+ux*a+px*hw, ry+uy*a+py*hw); p2=(rx+ux*b+px*hw, ry+uy*b+py*hw)
        p3=(rx+ux*b-px*hw, ry+uy*b-py*hw); p4=(rx+ux*a-px*hw, ry+uy*a-py*hw)
        pts=' '.join(f'{x:.0f},{y:.0f}' for x,y in (p1,p2,p3,p4))
        s+=f'<polygon points="{pts}" fill="{GREEN}" fill-opacity="0.32" stroke="{GREEN}" stroke-width="1" stroke-dasharray="2,2"/>'
    return s

RED_DASH='stroke-dasharray="5,4"'
def dline(x1,y1,x2,y2):
    return f'<line x1="{x1:.0f}" y1="{y1:.0f}" x2="{x2:.0f}" y2="{y2:.0f}" stroke="{RED}" stroke-width="1.5" {RED_DASH}/>'

# ---- Shape 1: rectangle ----
def rect_out(cx,cy):
    W,H=150,120
    return f'<rect x="{cx-W/2}" y="{cy-H/2}" width="{W}" height="{H}" rx="3" fill="{WOOD_L}" stroke="{INK}" stroke-width="2.2"/>'
def rect_lay(cx,cy):
    W,H=150,120
    L,R,T,B=cx-W/2,cx+W/2,cy-H/2,cy+H/2          # seat edges
    x1,y1,x2,y2=L+OFF,T+OFF,R-OFF,B-OFF           # layout-line positions
    s=''
    # vertical layout lines, extended edge-to-edge (through the holes)
    s+=dline(x1,T,x1,B)+dline(x2,T,x2,B)
    # horizontal layout lines, extended edge-to-edge
    s+=dline(L,y1,R,y1)+dline(L,y2,R,y2)
    rear=[(x1,y1),(x2,y1)]; front=[(x1,y2),(x2,y2)]
    s+=holes_and_band(rear, front)
    return s

# ---- Shape 2: trapezoid 24 front / 18 back ----
def trap_out(cx,cy,backarc=False):
    Wf,Wb,H=150,112,120
    yf=cy+H/2; yb=cy-H/2
    if not backarc:
        return f'<polygon points="{cx-Wf/2},{yf} {cx+Wf/2},{yf} {cx+Wb/2},{yb} {cx-Wb/2},{yb}" fill="{WOOD_L}" stroke="{INK}" stroke-width="2.2"/>'
    return (f'<path d="M{cx-Wf/2} {yf} L {cx+Wf/2} {yf} L {cx+Wb/2} {yb} '
            f'Q {cx} {yb-22} {cx-Wb/2} {yb} Z" fill="{WOOD_L}" stroke="{INK}" stroke-width="2.2"/>')
def trap_lay(cx,cy,backarc=False):
    Wf,Wb,H=150,112,120
    yfE,ybE=cy+H/2, cy-H/2                         # front/back edge y
    yf,yb=yfE-OFF, ybE+OFF                          # front/back layout y
    xf1,xf2=cx-Wf/2+OFF, cx+Wf/2-OFF
    xb1,xb2=cx-Wb/2+OFF, cx+Wb/2-OFF
    # side edge x at a given y (linear interp from front corner to back corner)
    def sideX(sgn,y):
        t=(y-yfE)/(ybE-yfE)
        xF=cx+sgn*Wf/2; xB=cx+sgn*Wb/2
        return xF+(xB-xF)*t
    s=''
    # two SIDE layout lines (run full length, hole to hole, extended to edges)
    s+=dline(xf1,yfE,xb1,ybE)+dline(xf2,yfE,xb2,ybE)
    # FRONT layout line: straight, full width edge-to-edge at yf
    s+=dline(sideX(-1,yf),yf, sideX(1,yf),yf)
    # BACK layout line: arced if backarc else straight, edge-to-edge at yb
    if backarc:
        # back EDGE bows up 22 above ybE; inset layout arc sits OFF below and bows up the same 22.
        x_l=sideX(-1,yb); x_r=sideX(1,yb)
        s+=f'<path d="M{x_l:.0f} {yb:.0f} Q {cx:.0f} {yb-22:.0f} {x_r:.0f} {yb:.0f}" fill="none" stroke="{RED}" stroke-width="1.5" {RED_DASH}/>'
    else:
        s+=dline(sideX(-1,yb),yb, sideX(1,yb),yb)
    rear=[(xb1,yb),(xb2,yb)]; front=[(xf1,yf),(xf2,yf)]
    s+=holes_and_band(rear, front)
    return s

# ---- Shape 3: rectangle + front arc ----
def rectarc_out(cx,cy):
    W,H=150,120; yf=cy+H/2; yb=cy-H/2
    return (f'<path d="M{cx-W/2} {yb} L {cx+W/2} {yb} L {cx+W/2} {yf-10} '
            f'Q {cx} {yf+20} {cx-W/2} {yf-10} Z" fill="{WOOD_L}" stroke="{INK}" stroke-width="2.2"/>')
def rectarc_lay(cx,cy):
    W,H=150,120
    L,R,T,B=cx-W/2,cx+W/2,cy-H/2,cy+H/2
    x1,x2=L+OFF,R-OFF
    y_back=T+OFF
    s=''
    # vertical side lines edge-to-edge (top edge to the arced front — approx run to B)
    s+=dline(x1,T,x1,B)+dline(x2,T,x2,B)
    # back (straight) layout line edge-to-edge
    s+=dline(L,y_back,R,y_back)
    # FRONT arced layout line: 1.5" inside the front arc. Front edge arcs from (L,yf-10) Q (cx,yf+20) (R,yf-10).
    yf=B
    # inset arc: shift the whole front arc up by OFF
    s+=f'<path d="M{L:.0f} {yf-10-OFF:.0f} Q {cx:.0f} {yf+20-OFF:.0f} {R:.0f} {yf-10-OFF:.0f}" fill="none" stroke="{RED}" stroke-width="1.5" {RED_DASH}/>'
    # front holes sit where the side lines cross the front arc layout line (approx near corners)
    # compute arc y at x1/x2 (quadratic bezier): use param; approximate with the corner endpoints region
    yfront_at_side = yf-10-OFF + ( (yf+20-OFF) - (yf-10-OFF) ) * 0.10  # near the ends the arc is close to endpoints
    rear=[(x1,y_back),(x2,y_back)]; front=[(x1,yfront_at_side),(x2,yfront_at_side)]
    s+=holes_and_band(rear, front)
    return s

# ---- Shape 5: oval-ish rectangle ----
def oval_out(cx,cy):
    W,H=152,120
    return f'<rect x="{cx-W/2}" y="{cy-H/2}" width="{W}" height="{H}" rx="46" fill="{WOOD_L}" stroke="{INK}" stroke-width="2.2"/>'
def oval_lay(cx,cy):
    W,H=152,120
    L,R,T,B=cx-W/2,cx+W/2,cy-H/2,cy+H/2
    x1,y1,x2,y2=L+OFF,T+OFF,R-OFF,B-OFF
    s=''
    # all four edges are softened: draw the layout outline as a rounded rect 1.5" in, with smaller corner radius
    s+=f'<rect x="{x1:.0f}" y="{y1:.0f}" width="{x2-x1:.0f}" height="{y2-y1:.0f}" rx="28" fill="none" stroke="{RED}" stroke-width="1.5" {RED_DASH}/>'
    # extend straight portions of the side/front/back lines out toward the edges (through the holes)
    s+=dline(x1,y1+10,x1,y2-10)+dline(x2,y1+10,x2,y2-10)
    s+=dline(x1+10,y1,x2-10,y1)+dline(x1+10,y2,x2-10,y2)
    rear=[(x1,y1),(x2,y1)]; front=[(x1,y2),(x2,y2)]
    s+=holes_and_band(rear, front)
    return s

# layout positions (2 rows)
r1y=210; r2y=470
svg+=seat(170,r1y, rect_out, rect_lay, "1 · Rectangle", "traditional")
svg+=seat(490,r1y, trap_out, trap_lay, "2 · Trapezoid", "~24″ front, 18″ back")
svg+=seat(810,r1y, rectarc_out, rectarc_lay, "3 · Rectangle + front arc", "arced front layout line")
svg+=seat(330,r2y, lambda c,y: trap_out(c,y,backarc=True), lambda c,y: trap_lay(c,y,backarc=True), "4 · Trapezoid + back arc", "arced back layout line")
svg+=seat(650,r2y, oval_out, oval_lay, "5 · Oval-ish", "softened all around")

# legend
ly=590
svg+=f'<rect x="120" y="{ly-10}" width="14" height="14" fill="{WOOD_D}" stroke="{INK}" stroke-width="1.2"/>'
svg+=f'<text x="142" y="{ly+2}" font-size="11.5" fill="{INK2}">leg / stick hole (at a layout-line corner)</text>'
svg+=f'<rect x="430" y="{ly-10}" width="14" height="14" fill="none" stroke="{RED}" stroke-width="1.5" stroke-dasharray="4,3"/>'
svg+=f'<text x="452" y="{ly+2}" font-size="11.5" fill="{INK2}">layout line, 1½″ in from each edge</text>'
svg+=f'<rect x="690" y="{ly-10}" width="14" height="14" fill="{GREEN}" fill-opacity="0.30" stroke="{GREEN}" stroke-width="1" stroke-dasharray="2,2"/>'
svg+=f'<text x="712" y="{ly+2}" font-size="11" fill="{INK2}">back-leg zone: 2″–3¾″ from back hole</text>'
svg+='</svg>'
open('11_seat_layout.svg','w').write(svg)
print("seat shapes ok")
