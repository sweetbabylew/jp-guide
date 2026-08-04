from style import *
w,h=900,470
svg=header(w,h)
svg+=f'<defs><marker id="ah" markerWidth="11" markerHeight="11" refX="6" refY="3" orient="auto"><path d="M0,0 L7,3 L0,6 Z" fill="{RUST}"/></marker></defs>'
svg+=f'<text x="{w/2}" y="42" text-anchor="middle" font-size="24" fill="{INK}" font-weight="bold">Order of Assembly (and Disassembly)</text>'
svg+=f'<text x="{w/2}" y="68" text-anchor="middle" font-size="13.5" fill="{INK2}" font-style="italic">Always put the chair together — and take it apart — in the order it was built</text>'

steps=[("1","Outer\nback sticks"),("2","Arm"),("3","Front leg"),("4","Back leg"),("5","Remaining\nback sticks"),("6","Comb")]
n=len(steps)
boxW=118; gap=18
totalW=n*boxW+(n-1)*gap
startX=(w-totalW)/2
y=170; boxH=86
for i,(num,label) in enumerate(steps):
    x=startX+i*(boxW+gap)
    svg+=f'<rect x="{x}" y="{y}" width="{boxW}" height="{boxH}" rx="12" fill="{WOOD_L}" stroke="{INK}" stroke-width="2.2"/>'
    svg+=f'<circle cx="{x+22}" cy="{y+22}" r="14" fill="{RUST}"/>'
    svg+=f'<text x="{x+22}" y="{y+27}" text-anchor="middle" font-size="15" fill="#fff" font-weight="bold">{num}</text>'
    lines=label.split("\n")
    for j,ln in enumerate(lines):
        svg+=f'<text x="{x+boxW/2}" y="{y+54+j*18}" text-anchor="middle" font-size="14" fill="{INK}">{ln}</text>'
    if i<n-1:
        ax=x+boxW; ax2=x+boxW+gap
        svg+=f'<line x1="{ax+2}" y1="{y+boxH/2}" x2="{ax2-2}" y2="{y+boxH/2}" stroke="{RUST}" stroke-width="3" marker-end="url(#ah)"/>'

# disassembly note (reverse)
svg+=f'<text x="{w/2}" y="{y+boxH+50}" text-anchor="middle" font-size="13.5" fill="{INK}" font-weight="bold">To take it apart, reverse the order: comb first, then sticks, back leg, front leg, arm, outer sticks last.</text>'

# pinning/wedging rules box
ry=y+boxH+80
svg+=f'<text x="{w/2}" y="{ry}" text-anchor="middle" font-size="14" fill="{SAGE}" font-weight="bold">Pinning &amp; wedging</text>'
rules=[
 "Loose leg-to-seat joint? Pin with a trenail or dowel on the long-grain side.",
 "Leg-to-arm joints: pin, wedge, or both.   ·   Comb: wedge only if its tenons aren\'t already tight.",
 "Do NOT pin the arm to the back stick.   ·   Tenons may be cut flush or left proud and stylized.",
]
for i,r in enumerate(rules):
    svg+=f'<text x="{w/2}" y="{ry+24+i*20}" text-anchor="middle" font-size="12.5" fill="{INK2}">{r}</text>'
svg+='</svg>'
open('14_order.svg','w').write(svg)
print("14 ok")
