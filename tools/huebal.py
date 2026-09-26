import sys, colorsys
from PIL import Image
def balance(p, box=None):
    im=Image.open(p).convert('RGB')
    if box: im=im.crop(box)
    im=im.resize((270,270),Image.LANCZOS)
    warm=cool=other=0.0
    for r,g,b in im.getdata():
        h,l,s=colorsys.rgb_to_hls(r/255,g/255,b/255)
        c=(max(r,g,b)-min(r,g,b))/255          # chroma weight
        if c<0.08: continue
        hd=h*360
        if hd<75 or hd>=330: warm+=c
        elif 150<=hd<300: cool+=c
        else: other+=c
    t=warm+cool+other
    return round(100*warm/t), round(100*cool/t), round(100*other/t)
for p in sys.argv[1:]:
    print(p, 'whole  warm/cool/other %:', balance(p), ' view only:', balance(p,(120,158,960,806)))
