"""Render every frame in tools/frames.json with renderer/test.html and compare to reference/frames/<name>.png."""
import json, pathlib, subprocess, sys, urllib.parse
from PIL import Image, ImageChops, ImageStat
ROOT = pathlib.Path(__file__).resolve().parent.parent
frames = json.load(open(ROOT / "tools" / "frames.json"))
out = ROOT / "tools" / "out"; out.mkdir(exist_ok=True)
worst = 0
for name, params in frames.items():
    png = out / f"{name}.png"
    r = subprocess.run([sys.executable, str(ROOT / "tools" / "render.py"), str(ROOT / "renderer" / "test.html"), str(png), urllib.parse.quote(json.dumps(params))], capture_output=True, text=True)
    print(r.stdout.strip())
    ref = Image.open(ROOT / "reference" / "frames" / f"{name}.png").convert("RGB")
    diff = ImageStat.Stat(ImageChops.difference(Image.open(png).convert("RGB"), ref)).mean
    m = sum(diff) / 3; worst = max(worst, m)
    print(f"{name}: mean abs diff vs reference {m:.3f} / 255")
sys.exit(0 if worst < 1.0 else 1)
