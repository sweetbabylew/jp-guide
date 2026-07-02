# Shared style constants for all diagrams
INK   = "#2b2118"     # dark brown-black ink
INK2  = "#5a4a3a"     # lighter ink for secondary
WOOD  = "#d9b98a"     # wood fill
WOOD_D= "#c39f6f"     # darker wood/endgrain
RULE  = "#c39f6f"
WOOD_L= "#ead8b8"     # light wood face
RAY   = "#8a5a2b"     # medullary ray / accent
RED   = "#a8442a"     # callout red
RUST  = "#a8442a"
PAPER = "#faf4e8"     # cream paper bg
GRID  = "#efe6d2"     # faint grid
GREEN = "#5b6e4f"
SAGE  = "#5b6e4f"     # sage accent
FONT  = "Georgia, 'Times New Roman', serif"
HAND  = "font-family:'Georgia',serif;"
def header(w,h):
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" font-family="{FONT}">
<rect x="0" y="0" width="{w}" height="{h}" fill="{PAPER}"/>'''
