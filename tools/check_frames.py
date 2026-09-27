"""Render every frame in tools/frames.json with renderer/test.html and compare to reference/frames/<name>.png.

--webgl also prints each frame on the GPU in the same browser and compares it to the CPU print (pass: mean abs
diff <= 2/255). It reports print-only timings for both: the first print in a fresh page, then the median of --runs
repeat renders in that page (steady state, as in an animation). Results also go to tools/out/webgl-check.json.
The exit status covers the pixel checks only; timings depend on the machine, so they are reported, not enforced."""
import argparse, asyncio, json, pathlib, statistics, sys, urllib.parse
from PIL import Image, ImageChops, ImageStat
from playwright.async_api import async_playwright
ROOT = pathlib.Path(__file__).resolve().parent.parent
TEST = (ROOT / "renderer" / "test.html").as_uri()
frames = json.load(open(ROOT / "tools" / "frames.json"))
out = ROOT / "tools" / "out"; out.mkdir(exist_ok=True)
REPEAT = "(() => { const t = performance.now(), i = RisoWindow.renderWindow(document.getElementById('out'), S); return [performance.now() - t, i.printMs]; })()"
GPU = "(() => { const g = document.createElement('canvas').getContext('webgl2'), x = g && g.getExtension('WEBGL_debug_renderer_info'); return g ? g.getParameter(x ? x.UNMASKED_RENDERER_WEBGL : g.RENDERER) : 'none'; })()"

def diff(a, b):
    d = ImageChops.difference(Image.open(a).convert("RGB"), Image.open(b).convert("RGB"))
    return sum(ImageStat.Stat(d).mean) / 3, max(hi for lo, hi in d.getextrema())

async def render(browser, params, png, runs):
    """Render once, screenshot, then repeat the render `runs` times; returns the info and [(total ms, print ms)] per repeat."""
    pg = await browser.new_page(viewport={"width": 1080, "height": 1080}, device_scale_factor=1)
    msgs = []
    pg.on("console", lambda m: msgs.append(m.text))
    pg.on("pageerror", lambda e: msgs.append("PAGEERROR " + str(e)))
    await pg.goto(TEST + "#" + urllib.parse.quote(json.dumps(params)))
    await pg.wait_for_function("window.__DONE === true", timeout=180000)
    info = await pg.evaluate("window.__INFO")
    for m in msgs: print("console:", m)
    if not info: sys.exit(f"render failed: {params}")
    await (await pg.query_selector("#out")).screenshot(path=png)
    reps = [await pg.evaluate(REPEAT) for _ in range(runs)]
    if runs: info["gpu"] = await pg.evaluate(GPU)
    await pg.close()
    return info, reps

async def main(webgl, runs):
    ok, results = True, []
    async with async_playwright() as p:
        browser = await p.chromium.launch(args=["--enable-unsafe-swiftshader"])   # opt in to software WebGL on GPU-less machines
        for name, params in frames.items():
            png = out / f"{name}.png"
            cpu, cpu_reps = await render(browser, params, png, runs if webgl else 0)
            m, _ = diff(png, ROOT / "reference" / "frames" / f"{name}.png"); ok &= m < 1.0
            print(f"{name}: mean abs diff vs reference {m:.3f} / 255")
            if not webgl: continue
            gpng = out / f"{name}-webgl.png"
            gl, gl_reps = await render(browser, {**params, "print": "webgl"}, gpng, runs)
            if gl["print"] != "webgl": print(f"{name}: WebGL print unavailable, fell back to {gl['print']}"); ok = False; continue
            m, mx = diff(gpng, png); ok &= m <= 2.0
            c, g = statistics.median(r[1] for r in cpu_reps), statistics.median(r[1] for r in gl_reps)
            scene = statistics.median(r[0] - r[1] for r in cpu_reps + gl_reps)
            results.append({"frame": name, "diff": round(m, 3), "maxDiff": mx, "sceneMs": round(scene), "cpuFirst": cpu["printMs"], "cpuMs": c,
                            "webglFirst": gl["printMs"], "webglMs": g, "speedup": round(c / g, 1)})
            print(f"{name}: WebGL vs CPU print {m:.3f} / 255 (max {mx}) | print ms, first / median of {runs}: "
                  f"CPU {cpu['printMs']:.0f} / {c:.0f}, WebGL {gl['printMs']:.0f} / {g:.0f} | {c / g:.1f}x | scene {scene:.0f} ms")
        version = browser.version; print("browser:", version)
        await browser.close()
    if results:
        worst = min(r["speedup"] for r in results)
        print(f"speed-up, median repeat: {worst:.1f}x worst, 10x target {'met' if worst >= 10 else 'missed'} | GPU: {gl['gpu']}")
        json.dump({"browser": f"Chromium {version} headless", "gpu": gl["gpu"], "runs": runs, "frames": results}, open(out / "webgl-check.json", "w"), indent=1)
    return ok

ap = argparse.ArgumentParser()
ap.add_argument("--webgl", action="store_true", help="also check the WebGL print against the CPU print, with timings")
ap.add_argument("--runs", type=int, default=3, help="repeat renders per page for the median print time (--webgl)")
a = ap.parse_args()
sys.exit(0 if asyncio.run(main(a.webgl, max(a.runs, 1))) else 1)
