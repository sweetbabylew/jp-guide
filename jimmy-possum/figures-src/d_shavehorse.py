from style import *
import math
w,h=900,560
svg=header(w,h)
svg+=f'<defs><marker id="ahr" markerWidth="10" markerHeight="10" refX="6" refY="3" orient="auto"><path d="M0,0 L7,3 L0,6 Z" fill="{RED}"/></marker><marker id="ah" markerWidth="9" markerHeight="9" refX="6" refY="3" orient="auto"><path d="M0,0 L7,3 L0,6 Z" fill="{INK}"/></marker></defs>'
svg+=f'<text x="{w/2}" y="38" text-anchor="middle" font-size="24" fill="{INK}" font-weight="bold">Shaving Parts: the Shavehorse &amp; Drawknife</text>'
svg+=f'<text x="{w/2}" y="62" text-anchor="middle" font-size="13" fill="{INK2}" font-style="italic">Sit astride, push the treadle to clamp, and draw the knife toward you in long, slicing strokes</text>'

NEAR="#3d3128"   # rider, near side
FAR ="#5a4a3a"   # rider, far side

# ---- ground ----
svg+=f'<line x1="150" y1="472" x2="760" y2="472" stroke="{INK2}" stroke-width="1.5" opacity="0.4"/>'

# ---- rider, far-side limbs (drawn first: they pass behind the bench) ----
svg+=f'<line x1="243" y1="316" x2="363" y2="342" stroke="{FAR}" stroke-width="13" stroke-linecap="round"/>'   # far thigh
svg+=f'<line x1="363" y1="342" x2="490" y2="448" stroke="{FAR}" stroke-width="11" stroke-linecap="round"/>'   # far shin
svg+=f'<ellipse cx="494" cy="450" rx="12" ry="5" fill="{FAR}"/>'                                               # far foot
svg+=f'<line x1="266" y1="180" x2="312" y2="225" stroke="{FAR}" stroke-width="9" stroke-linecap="round"/>'    # far upper arm
svg+=f'<line x1="312" y1="225" x2="354" y2="246" stroke="{FAR}" stroke-width="9" stroke-linecap="round"/>'    # far forearm

# ---- shavehorse legs (splayed pairs at each end) ----
def hleg(xtop,xbot):
    return f'<polygon points="{xtop-6},356 {xtop+6},356 {xbot+7},472 {xbot-7},472" fill="{WOOD_D}" stroke="{INK}" stroke-width="2"/>'
for xt in (270,610):
    svg+=hleg(xt,xt-52)
    svg+=hleg(xt,xt+52)

# ---- bench beam (the plank you sit on), side view ----
bx,by,bw,bh = 195, 328, 490, 30
svg+=f'<rect x="{bx}" y="{by}" width="{bw}" height="{bh}" rx="5" fill="{WOOD}" stroke="{INK}" stroke-width="2.5"/>'

# ---- slot through the bench where the dumbhead passes ----
svg+=f'<rect x="496" y="326" width="18" height="34" fill="{PAPER}" stroke="{INK2}" stroke-width="1"/>'

# ---- dumbhead (swing arm) through the slot: head above, treadle below ----
svg+=f'<line x1="505" y1="348" x2="482" y2="262" stroke="{WOOD_D}" stroke-width="15" stroke-linecap="round"/>'  # upper arm
svg+=f'<line x1="505" y1="348" x2="520" y2="452" stroke="{WOOD_D}" stroke-width="15" stroke-linecap="round"/>'  # lower arm
svg+=f'<rect x="484" y="450" width="76" height="16" rx="4" fill="{WOOD_D}" stroke="{INK}" stroke-width="2"/>'   # foot treadle
svg+=f'<circle cx="505" cy="344" r="4" fill="{INK}"/>'                                                          # pivot pin

# ---- bridge (ledge the stick rests on) ----
svg+=f'<rect x="355" y="300" width="115" height="28" rx="4" fill="{WOOD}" stroke="{INK}" stroke-width="2"/>'

# ---- the stick, clamped between jaw and bridge, protruding through the head ----
svg+=f'<rect x="270" y="286" width="262" height="14" rx="3" fill="{WOOD_L}" stroke="{INK}" stroke-width="2"/>'

# ---- the dumbhead's head (jaw block) pressing the stick down ----
svg+=f'<rect x="444" y="244" width="72" height="42" rx="6" fill="{WOOD_D}" stroke="{INK}" stroke-width="2.5"/>'

# ---- drawknife: blade biting the stick, TWO handles back toward the rider ----
svg+=f'<polygon points="346,287 400,276 400,284 346,295" fill="#9aa0a6" stroke="{INK}" stroke-width="1.5"/>'    # blade
svg+=f'<line x1="398" y1="278" x2="358" y2="248" stroke="#8a6b4a" stroke-width="9" stroke-linecap="round"/>'    # far handle
svg+=f'<line x1="348" y1="291" x2="306" y2="288" stroke="#6b4f33" stroke-width="11" stroke-linecap="round"/>'   # near handle

# ---- rider: torso, head, near limbs (astride the bench, pulling the knife) ----
svg+=f'<line x1="250" y1="318" x2="263" y2="185" stroke="{NEAR}" stroke-width="26" stroke-linecap="round"/>'    # torso
svg+=f'<circle cx="272" cy="152" r="15" fill="{NEAR}"/>'                                                        # head
svg+=f'<line x1="258" y1="190" x2="298" y2="248" stroke="{NEAR}" stroke-width="10" stroke-linecap="round"/>'    # near upper arm
svg+=f'<line x1="298" y1="248" x2="303" y2="283" stroke="{NEAR}" stroke-width="10" stroke-linecap="round"/>'    # near forearm
svg+=f'<circle cx="304" cy="287" r="7.5" fill="{NEAR}"/>'                                                       # near hand
svg+=f'<circle cx="356" cy="247" r="7" fill="{FAR}"/>'                                                          # far hand
svg+=f'<line x1="255" y1="318" x2="378" y2="348" stroke="{NEAR}" stroke-width="14" stroke-linecap="round"/>'    # near thigh
svg+=f'<line x1="378" y1="348" x2="502" y2="443" stroke="{NEAR}" stroke-width="12" stroke-linecap="round"/>'    # near shin
svg+=f'<ellipse cx="507" cy="446" rx="13" ry="6" fill="{NEAR}"/>'                                               # near foot, on the treadle

# ---- labels, all clear of the artwork, with leader lines ----
# pull direction + drawknife
svg+=f'<line x1="430" y1="138" x2="362" y2="138" stroke="{RED}" stroke-width="3" marker-end="url(#ahr)"/>'
svg+=f'<text x="438" y="143" font-size="12.5" fill="{RED}" font-weight="bold">pull toward you</text>'
svg+=f'<text x="378" y="164" font-size="12" fill="{INK}">drawknife (two handles)</text>'
svg+=f'<line x1="390" y1="170" x2="380" y2="256" stroke="{INK2}" stroke-width="1"/>'
# dumbhead
svg+=f'<text x="560" y="190" font-size="12" fill="{INK}">dumbhead — swing arm,</text>'
svg+=f'<text x="560" y="206" font-size="12" fill="{INK}">pivots through the bench</text>'
svg+=f'<line x1="556" y1="198" x2="518" y2="248" stroke="{INK2}" stroke-width="1"/>'
# stick
svg+=f'<text x="566" y="282" font-size="10.5" fill="{INK2}">stick protrudes</text>'
svg+=f'<text x="566" y="298" font-size="10.5" fill="{INK2}">through the head</text>'
svg+=f'<line x1="562" y1="290" x2="536" y2="292" stroke="{INK2}" stroke-width="1"/>'
# pivot pin
svg+=f'<text x="546" y="380" font-size="10.5" fill="{INK2}">pivot pin</text>'
svg+=f'<line x1="544" y1="375" x2="511" y2="350" stroke="{INK2}" stroke-width="1"/>'
# treadle labels, beside the treadle with leaders
svg+=f'<line x1="548" y1="420" x2="548" y2="444" stroke="{RED}" stroke-width="2.5" marker-end="url(#ahr)"/>'
svg+=f'<text x="470" y="500" font-size="12" fill="{INK}">foot treadle</text>'
svg+=f'<line x1="500" y1="490" x2="512" y2="468" stroke="{INK2}" stroke-width="1"/>'
svg+=f'<text x="470" y="520" font-size="12" fill="{RED}">push down = jaw grips harder</text>'

svg+=f'<text x="{w/2}" y="{h-14}" text-anchor="middle" font-size="11" fill="{INK2}" font-style="italic">“Why not keep on going and shave the entire chair?” — Joyce Alexander to Jennie Alexander, 1978</text>'
svg+='</svg>'
open('04_shavehorse.svg','w').write(svg)
print("04 redrawn")
