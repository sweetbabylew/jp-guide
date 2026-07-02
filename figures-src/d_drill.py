from style import *
import math
w,h=900,580
svg=header(w,h)
svg+=f'<defs><marker id="ah" markerWidth="10" markerHeight="10" refX="6" refY="3" orient="auto"><path d="M0,0 L7,3 L0,6 Z" fill="{INK}"/></marker><marker id="ahr" markerWidth="9" markerHeight="9" refX="6" refY="3" orient="auto"><path d="M0,0 L7,3 L0,6 Z" fill="{RED}"/></marker></defs>'
svg+=f'<text x="{w/2}" y="38" text-anchor="middle" font-size="24" fill="{INK}" font-weight="bold">Section 3 · Drilling Seat Mortises: Brace, Bit &amp; Bevel Gauge</text>'

# LEFT: plan view of seat with sightlines (the X) for a leg
sx,sy,sw,sh=80,110,330,250
svg+=f'<rect x="{sx}" y="{sy}" width="{sw}" height="{sh}" rx="16" fill="{WOOD_L}" stroke="{INK}" stroke-width="2.5"/>'
svg+=f'<text x="{sx+sw/2}" y="{sy-10}" text-anchor="middle" font-size="13" fill="{INK}" font-weight="bold">Plan view — seat from above</text>'
# centerline front-back
svg+=f'<line x1="{sx+sw/2}" y1="{sy}" x2="{sx+sw/2}" y2="{sy+sh}" stroke="{INK2}" stroke-width="1" stroke-dasharray="4,4"/>'
svg+=f'<text x="{sx+sw/2+4}" y="{sy+16}" font-size="10.5" fill="{INK2}">center</text>'
# four leg mortises
legs=[(sx+70,sy+70),(sx+sw-70,sy+70),(sx+70,sy+sh-70),(sx+sw-70,sy+sh-70)]
for i,(lx,ly) in enumerate(legs):
    svg+=f'<circle cx="{lx}" cy="{ly}" r="9" fill="{WOOD_D}" stroke="{INK}" stroke-width="2"/>'
# sightline for front-left leg: a line aiming toward a point, with bevel resting on it
lx,ly=legs[0]
# sightline direction (toward center-rear)
ex,ey=sx+sw/2, sy+sh+10
svg+=f'<line x1="{lx}" y1="{ly}" x2="{ex}" y2="{ey}" stroke="{RED}" stroke-width="2" stroke-dasharray="3,4"/>'
svg+=f'<text x="{lx-6}" y="{ly-14}" font-size="11.5" fill="{RED}" font-weight="bold">sightline</text>'
# the bevel gauge sitting on sightline near the mortise (a small L)
svg+=f'<line x1="{lx}" y1="{ly}" x2="{lx+40}" y2="{ly+46}" stroke="{INK}" stroke-width="5"/>'  # stock
svg+=f'<line x1="{lx}" y1="{ly}" x2="{lx+58}" y2="{ly+24}" stroke="#9aa0a6" stroke-width="4"/>' # blade along sightline-ish
svg+=f'<text x="{sx+sw/2}" y="{sy+sh+30}" text-anchor="middle" font-size="11.5" fill="{INK2}">Sight the brace along the line; tilt to the bevel&#39;s blade.</text>'

# RIGHT: section view, brace & bit drilling at resultant angle, bevel gauge standing beside
ox,oy=470,130
# seat slab in section
svg+=f'<rect x="{ox}" y="{oy+150}" width="350" height="40" rx="6" fill="{WOOD}" stroke="{INK}" stroke-width="2.5"/>'
svg+=f'<text x="{ox+175}" y="{oy+210}" text-anchor="middle" font-size="12" fill="{INK2}">seat (section)</text>'
# resultant angle line through seat
mx=ox+150
ang=math.radians(22)  # from vertical
topx=mx- math.sin(ang)*150; topy=oy+150-math.cos(ang)*150
botx=mx+ math.sin(ang)*40; boty=oy+190+math.cos(ang)*40
svg+=f'<line x1="{topx:.0f}" y1="{topy:.0f}" x2="{botx:.0f}" y2="{boty:.0f}" stroke="{RED}" stroke-width="2" stroke-dasharray="4,4"/>'
# vertical reference + angle arc
svg+=f'<line x1="{mx}" y1="{oy+150}" x2="{mx}" y2="{oy+40}" stroke="{INK2}" stroke-width="1" stroke-dasharray="2,3"/>'
svg+=f'<path d="M{mx} {oy+95} A 55 55 0 0 0 {mx-math.sin(ang)*55:.0f} {oy+150-math.cos(ang)*55:.0f}" fill="none" stroke="{INK}" stroke-width="1.4"/>'
svg+=f'<text x="{mx-20}" y="{oy+86}" font-size="13" fill="{RED}" font-weight="bold">resultant°</text>'
# brace & bit (sweep)
# bit
svg+=f'<line x1="{mx}" y1="{oy+150}" x2="{topx:.0f}" y2="{topy:.0f}" stroke="#8a8f94" stroke-width="6"/>'
# auger lead screw tip
svg+=f'<circle cx="{mx}" cy="{oy+150}" r="4" fill="{INK}"/>'
# brace crank (a U shape) at top of bit
hx,hy=topx,topy
svg+=f'<path d="M{hx-2} {hy} q -34 -10 -20 -40 q 14 -26 44 -14" fill="none" stroke="{INK}" stroke-width="5"/>'
svg+=f'<circle cx="{hx-40}" cy="{hy-30}" r="9" fill="{WOOD_D}" stroke="{INK}" stroke-width="2"/>'  # head knob
svg+=f'<text x="{hx-70}" y="{hy-44}" font-size="12.5" fill="{INK}">brace &amp; auger bit</text>'
# bevel gauge standing on seat showing the same angle
gx=ox+300
svg+=f'<line x1="{gx}" y1="{oy+150}" x2="{gx}" y2="{oy+150-90}" stroke="{INK}" stroke-width="5"/>'  # stock vertical
gtx=gx- math.sin(ang)*95; gty=oy+150-math.cos(ang)*95
svg+=f'<line x1="{gx}" y1="{oy+150}" x2="{gtx:.0f}" y2="{gty:.0f}" stroke="#9aa0a6" stroke-width="4"/>'
svg+=f'<text x="{gx+8}" y="{oy+90}" font-size="12" fill="{INK}">bevel gauge</text>'
svg+=f'<text x="{gx-4}" y="{oy+168}" font-size="11" fill="{INK2}">set to resultant</text>'

# bottom explainer
svg+=f'<text x="{w/2}" y="{h-66}" text-anchor="middle" font-size="14" fill="{INK}" font-weight="bold">Two angles, one move</text>'
svg+=f'<text x="{w/2}" y="{h-44}" text-anchor="middle" font-size="12.5" fill="{INK2}"><tspan font-weight="bold">Rake</tspan> (front/back lean) and <tspan font-weight="bold">splay</tspan> (side lean) combine into one <tspan fill="{RED}" font-weight="bold">resultant</tspan> tilt,</text>'
svg+=f'<text x="{w/2}" y="{h-26}" text-anchor="middle" font-size="12.5" fill="{INK2}">aimed along a <tspan fill="{RED}">sightline</tspan>. Set the bevel to the resultant, sight down the line, and bore.</text>'
svg+=f'<text x="{w/2}" y="{h-8}" text-anchor="middle" font-size="11" fill="{INK2}" font-style="italic">JP back legs rake ~20–30°. You don&#39;t need to hit a degree exactly — the comb pulls strays into line. (Lewis&#39;s notes; Schwarz)</text>'
svg+='</svg>'
open('06_drill_mortise.svg','w').write(svg)
print("06 ok")
