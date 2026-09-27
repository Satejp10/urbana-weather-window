"""Build tools/out/bench.html: the print speed test page (tools/bench.html) with the renderer, tools/frames.json and the
latest `tools/check_frames.py --webgl` results inlined, as one self-contained file to open in a browser or publish."""
import datetime, json, pathlib, re, subprocess
ROOT = pathlib.Path(__file__).resolve().parent.parent
page = (ROOT / "tools" / "bench.html").read_text()
check = ROOT / "tools" / "out" / "webgl-check.json"
rev = subprocess.run(["git", "describe", "--always", "--dirty"], cwd=ROOT, capture_output=True, text=True).stdout.strip()
parts = {
    '<script src="../renderer/riso-window.js"></script>': "<script>\n" + (ROOT / "renderer" / "riso-window.js").read_text() + "</script>",
    "/*FRAMES*/null": json.dumps(json.load(open(ROOT / "tools" / "frames.json"))),
    "/*CLOUD*/null": check.read_text() if check.exists() else "null",
    "/*BUILD*/''": json.dumps(f"{datetime.date.today()} · {rev}"),
}
for k, v in parts.items():
    assert page.count(k) == 1, f"placeholder missing from tools/bench.html: {k}"
    page = page.replace(k, v)
page = re.sub(r"<!-- Template .*?-->\n", "", page, count=1)
(ROOT / "tools" / "out").mkdir(exist_ok=True)
(ROOT / "tools" / "out" / "bench.html").write_text(page)
print("wrote tools/out/bench.html,", len(page.encode()), "bytes,", "with" if check.exists() else "without", "cloud results")
