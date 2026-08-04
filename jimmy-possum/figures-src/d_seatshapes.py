from style import *
import math
w,h=980,565
svg=header(w,h)
svg+=f'<text x="{w/2}" y="38" text-anchor="middle" font-size="23" fill="{INK}" font-weight="bold">Laying Out the Seat — Any Shape Works</text>'
svg+=f'<text x="{w/2}" y="62" text-anchor="middle" font-size="13" fill="{INK2}" font-style="italic">Scribe a line 1½″ in from every edge; a hole sits where two lines cross at a corner</text>'

OFF=22       # visual 1.5" inset (scaled)
# back leg band: from 2" to 5 1/2" out from the back hole, along the front-back layout line.
# scale: the rear-to-front hole span on a 16"-deep seat with 1.5" insets is 13" — size the band
# from each panel's actual hole span (2/13 to 5.5/13 of the span).
HOLE_SPAN_IN=13.0
def seat(cx, cy, outline_fn, layout_fn, title, sub, arc_note=None):
    s=f'<text x="{cx}" y="{cy-110}" text-anchor="middle" font-size="13" fill="{INK}" font-weight="bold">{title}</text>'
    s+=f'<text x="{cx}" y="{cy-94}" text-anchor="middle" font-size="10.5" fill="{INK2}">{sub}</text>'
    s+=outline_fn(cx,cy)
    s+=layout_fn(cx,cy)
    return s

# helper: draw rear + front holes, and a back-leg band that lies ALONG the side layout line
# rear[] and front[] are lists of (x,y) for the two sides; band runs 2"->5.5" from the rear hole toward the front hole.
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
        a=L*(2.0/HOLE_SPAN_IN); b=L*(5.5/HOLE_SPAN_IN); hw=5  # band half-width; 2"-5½" from the back hole
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
    # x on the LEFT side LAYOUT line at a given y (the line the holes must sit on)
    def sideLayX(y):
        t=(y-yfE)/(ybE-yfE)
        return xf1+(xb1-xf1)*t
    s=''
    # two SIDE layout lines (run full length, hole to hole, extended to edges)
    s+=dline(xf1,yfE,xb1,ybE)+dline(xf2,yfE,xb2,ybE)
    # FRONT layout line: straight, full width edge-to-edge at yf
    s+=dline(sideX(-1,yf),yf, sideX(1,yf),yf)
    # front holes: exactly ON the side-layout-line / front-layout-line intersection
    fx=sideLayX(yf)
    front=[(fx,yf),(2*cx-fx,yf)]
    # BACK layout line: arced if backarc else straight, edge-to-edge at yb
    if backarc:
        # back EDGE bows up 22 above ybE; inset layout arc sits OFF below and bows up the same 22.
        x_l=sideX(-1,yb); x_r=sideX(1,yb)
        s+=f'<path d="M{x_l:.0f} {yb:.0f} Q {cx:.0f} {yb-22:.0f} {x_r:.0f} {yb:.0f}" fill="none" stroke="{RED}" stroke-width="1.5" {RED_DASH}/>'
        # rear holes: exactly ON the intersection of the arced back line and the side layout lines.
        # arc point (x linear in u since the control sits midway; y quadratic)
        def arc_pt(u):
            return x_l+(x_r-x_l)*u, yb-2*22*u*(1-u)
        u=0.2
        for _ in range(60):   # fixed-point iteration: converges in a few steps
            _,ay=arc_pt(u)
            u=(sideLayX(ay)-x_l)/(x_r-x_l)
        rx,ry=arc_pt(u)
        rear=[(rx,ry),(2*cx-rx,ry)]
    else:
        s+=dline(sideX(-1,yb),yb, sideX(1,yb),yb)
        rx=sideLayX(yb)
        rear=[(rx,yb),(2*cx-rx,yb)]
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
    # front holes: exactly ON the intersection of the arced front line and the vertical side lines.
    # x(u) is linear (control at mid-span), so u at x1 is exact; y(u) is the quadratic bezier value.
    y0=yf-10-OFF; yc=yf+20-OFF
    u=(x1-L)/(R-L)
    yfront_at_side = y0 + 2*u*(1-u)*(yc-y0)
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

svg+='</svg>'
open('11_seat_layout.svg','w').write(svg)
print("seat shapes ok")
