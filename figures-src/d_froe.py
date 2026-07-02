from style import *
import math
w,h=900,600
svg=header(w,h)
svg+=f'<defs><marker id="ah" markerWidth="10" markerHeight="10" refX="6" refY="3" orient="auto"><path d="M0,0 L7,3 L0,6 Z" fill="{INK}"/></marker><marker id="ahr" markerWidth="9" markerHeight="9" refX="6" refY="3" orient="auto"><path d="M0,0 L7,3 L0,6 Z" fill="{RED}"/></marker></defs>'
svg+=f'<text x="{w/2}" y="40" text-anchor="middle" font-size="24" fill="{INK}" font-weight="bold">Riving Chair Parts with a Froe</text>'
svg+=f'<text x="{w/2}" y="64" text-anchor="middle" font-size="13" fill="{INK2}" font-style="italic">Side view: seat the froe across the end of the bolt with the club, then lever the handle to open the split</text>'

# ---- riving brake: two crossed stakes, the bolt threaded THROUGH the X ----
# far stake first (the bolt passes in front of it)
svg+=f'<line x1="830" y1="448" x2="715" y2="172" stroke="#6b4f33" stroke-width="14" stroke-linecap="round"/>'

# ---- the BOLT lying horizontally, end grain (where the froe enters) at the LEFT ----
bx,by,bw,bh = 250, 250, 540, 90      # bolt body; right end threads through the brake
midy=by+bh*0.42
svg+=f'<rect x="{bx}" y="{by}" width="{bw}" height="{bh}" rx="4" fill="{WOOD}" stroke="{INK}" stroke-width="2.5"/>'
# end-grain face at the LEFT end
svg+=f'<rect x="{bx}" y="{by}" width="14" height="{bh}" fill="{WOOD_D}" stroke="{INK2}" stroke-width="1"/>'
for yy in range(by+10,by+bh,12):
    svg+=f'<line x1="{bx+2}" y1="{yy}" x2="{bx+12}" y2="{yy}" stroke="{INK2}" stroke-width="0.7"/>'
svg+=f'<text x="{bx+bw/2-40}" y="{by+bh+26}" text-anchor="middle" font-size="12" fill="{INK2}">bolt (chair-part length), end grain at left</text>'

# near stake of the brake, crossing IN FRONT of the bolt
svg+=f'<line x1="700" y1="448" x2="815" y2="172" stroke="#8a6b4a" stroke-width="14" stroke-linecap="round"/>'
svg+=f'<text x="765" y="467" text-anchor="middle" font-size="13" fill="{INK}">riving brake</text>'
svg+=f'<text x="765" y="484" text-anchor="middle" font-size="11" fill="{INK2}">(holds the bolt; self-binds as you lever)</text>'
svg+=f'<line x1="765" y1="455" x2="765" y2="348" stroke="{INK2}" stroke-width="1"/>'

# ---- ONE split, pried OPEN at the froe and running right along the grain ----
# open wedge-shaped gap at the entry end (widest at the froe), tapering to the running split
svg+=f'<polygon points="{bx},{midy-17:.0f} {bx+195},{midy:.0f} {bx},{midy+9:.0f}" fill="{PAPER}" stroke="{INK}" stroke-width="2" stroke-linejoin="round"/>'
svg+=f'<path d="M{bx+195},{midy} C 505,{midy-5} 560,{midy+3} 620,{midy-1} S 650,{midy+1} 665,{midy}" fill="none" stroke="{RED}" stroke-width="2.5"/>'
svg+=f'<text x="462" y="{midy-15}" font-size="11.5" fill="{RED}">split opens along the grain →</text>'

# ---- the FROE: blade lying in the split ACROSS the bolt (seen end-on), EDGE DOWN,
# eye at the near end of the blade, handle rising VERTICALLY from the eye ----
fx=268                                   # blade centerline (just inside the end grain)
# handle first (rises from the eye, near-vertical: it is the lever)
svg+=f'<line x1="{fx}" y1="252" x2="{fx-8}" y2="118" stroke="#8a6b4a" stroke-width="12" stroke-linecap="round"/>'
# blade seen end-on: buried in the split, edge (blunt point) biting DOWN into the lower half
svg+=f'<polygon points="{fx-7},256 {fx+7},256 {fx+7},296 {fx},303 {fx-7},296" fill="#9aa0a6" stroke="{INK}" stroke-width="1.8"/>'
# eye at the top of the spine, the handle socketed through it
svg+=f'<rect x="{fx-10}" y="248" width="20" height="12" rx="3" fill="#7d7f84" stroke="{INK}" stroke-width="1.8"/>'
svg+=f'<text x="{fx-28}" y="108" text-anchor="end" font-size="14" fill="{INK}">froe handle (lever)</text>'
svg+=f'<text x="{fx-28}" y="126" text-anchor="end" font-size="12" fill="{RED}">lever to pry &amp; steer</text>'
# lever motion arc: pry the handle over, away from the bolt — same side as the opening split
svg+=f'<path d="M{fx-16},132 Q 212,150 196,198" fill="none" stroke="{RED}" stroke-width="2" marker-end="url(#ahr)"/>'
svg+=f'<text x="30" y="382" font-size="11" fill="{INK2}">froe blade in the split, edge down</text>'
svg+=f'<line x1="185" y1="374" x2="{fx-5}" y2="306" stroke="{INK2}" stroke-width="1"/>'

# ---- the CLUB: a proper mallet, striking the exposed spine at the eye end ----
club_x=307
svg+=f'<rect x="{club_x-15}" y="178" width="30" height="54" rx="8" fill="{WOOD_D}" stroke="{INK}" stroke-width="2"/>'          # head
svg+=f'<line x1="{club_x}" y1="184" x2="{club_x+33}" y2="120" stroke="#8a6b4a" stroke-width="9" stroke-linecap="round"/>'      # handle
# impact marks where the head meets the spine/eye
for (x1,y1,x2,y2) in [(283,242,273,232),(292,238,296,226),(300,240,308,230),(287,234,283,222)]:
    svg+=f'<line x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}" stroke="{INK}" stroke-width="1.5"/>'
svg+=f'<text x="360" y="140" font-size="13" fill="{INK}">club seats the blade</text>'
svg+=f'<text x="360" y="158" font-size="11" fill="{INK2}">(strike the exposed spine)</text>'

# ---- principle band ----
svg+=f'<text x="{w/2}" y="{h-92}" text-anchor="middle" font-size="15" fill="{INK}" font-weight="bold">Riving = controlled splitting</text>'
svg+=f'<text x="{w/2}" y="{h-70}" text-anchor="middle" font-size="13" fill="{INK2}">Keep equal mass on both sides and the split runs straight. If it wanders toward the thin side,</text>'
svg+=f'<text x="{w/2}" y="{h-52}" text-anchor="middle" font-size="13" fill="{INK2}">lever the froe toward the thick side to pull it back. “Tic-tic-tic… and you’re back on track.”</text>'
svg+=f'<text x="{w/2}" y="{h-22}" text-anchor="middle" font-size="11.5" fill="{INK2}" font-style="italic">An errant blow leaves an irreparable plane of weakness. Good, straight, long-fibered stock is a precious gift. (Alexander, MACFAT)</text>'
svg+='</svg>'
open('02_froe_riving.svg','w').write(svg)
print("02 redrawn")
