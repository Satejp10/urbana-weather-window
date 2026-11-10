# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

An interactive, year-round weather calendar for Urbana, Illinois. Its centerpiece is a code-drawn risograph "window" that shows a typical day at any date and hour. Everything is driven by climate records (1991–2020 normals plus station history). It is not a forecast, and nothing is fetched at runtime.

Current status is in the newest entry of `.claude/context/LOG.md`. In short: the renderer reproduces three approved frames, the app page is not built, and nothing reads `data/urbana_climate.json` yet. `HANDOFF.md` is an older bridge document and is partly out of date.

## Commands

Python needs `numpy` and `pillow` for the pipeline and tools, plus Playwright for the render checks (see the version note below). There is no requirements file, and no linter, formatter, or type checker is configured.

```bash
# Rebuild data/urbana_climate.json from data/raw/ (git diff should show only meta.built)
python3 pipeline/build_data.py

# Wet-day and hourly stats, read straight from data/raw/ (not yet in the JSON)
python3 pipeline/wet_day_stats.py monthly
python3 pipeline/wet_day_stats.py date 06-10 --hour 17

# Render every frame in tools/frames.json and diff against reference/frames/
python3 tools/check_frames.py
# Also check the WebGL print against the CPU print, with timings (writes tools/out/webgl-check.json)
python3 tools/check_frames.py --webgl

# Render one frame to PNG. Params are the URL-encoded JSON that goes in renderer/test.html's hash.
# tools/out/ is created by check_frames.py.
python3 tools/render.py renderer/test.html tools/out/one.png '<url-encoded JSON>'

# Warm vs cool hue share (the January frame measures 49/49)
python3 tools/huebal.py tools/out/jan15-0740.png

# Speed-test page at tools/out/bench.html (run check_frames.py --webgl first to include results)
python3 tools/bench.py
```

- There is no test suite. `check_frames.py` has no per-frame option; it always renders every frame in `tools/frames.json`.
- Expected output: each frame differs from its reference by about 0.01/255 in this sandbox (pass is under 1.0). WebGL vs CPU must be at most 2.0. The exit code covers pixel checks only; timings are reported, not enforced.
- Playwright must match the browser build. The cloud sandbox has Chromium build 1243 in `/opt/pw-browsers`, which Playwright 1.63.0 uses: `pip install "playwright==1.63.0"`. Playwright 1.56.0 looks for `chromium_headless_shell-1194` and fails. Don't run `playwright install` there.

## Architecture

**Data.** `data/raw/` holds the inputs: NOAA 1991–2020 normals and the ACIS daily record (1888–present) for Champaign 3S (USC00118740), KCMI airport hourly observations for wind, dew point, and gusts (2006–2025), and NASA POWER daily cloud cover (2001–2025). `pipeline/build_data.py` writes `data/urbana_climate.json`: `d` holds 366-value arrays, `months` holds 12 rows, and `events` holds freeze and snow dates and extremes. Arrays use a leap-year index (0 = Jan 1, 59 = Feb 29). Derived climatologies pool ±7 days.

**Renderer.** `renderer/riso-window.js` exposes one function, `RisoWindow.renderWindow(canvas, params)`. `params` is a plain object (examples in `tools/frames.json`): `season` (`winter` or `summer`; no other scenes exist), `wet`, sun and moon azimuth and altitude (computed outside and passed in), `cloud` cover fraction, `snowGround` and `snowFall`, wind, temperature now/low/high, year-to-date and annual rain, and `seed`. Inside `renderWindow`:

1. **Scene to plates.** Each shape is painted as ink coverage onto one of 8 plates, one per riso ink (`KEYS`: Y, O, P, V, A, B, F, G). Ink mixes come from the `C`, `WINTER`, and `SUMMER` palette objects.
2. **Data fitted to the scene.** Cloud cover is fit by bisection, so the rasterized cover matches the input. In winter, ground snow adds patches until the measured cover reaches `snowGround`.
3. **Print.** `Plates.print` is the CPU reference: one round-dot halftone per ink, each with its own angle, offset and seed, blended with continuous tone (`texture`, default 0.45) onto paper. `Plates.printGL` runs the same math as a WebGL2 fragment shader. It is used when `params.print === 'webgl'` and falls back to CPU if WebGL2 is missing. Paper-white marks (moon, snowflakes, rain, drops on the glass) are drawn after the print.

**Harness.** `renderer/test.html` reads params from the URL hash and sets `window.__DONE` and `window.__INFO` for Playwright. `tools/check_frames.py` and `tools/render.py` drive it. `tools/bench.html` is a template that `tools/bench.py` fills with the renderer, the frames, and the latest WebGL results.

## Constraints

- **The look is frozen.** `reference/frames/` holds the approved targets. Never regenerate them, or change a frame's output, just to make a check pass. Any look change needs a style tile and the owner's sign-off first.
- **Every mark encodes data.** The window is a chart. Don't add ornament that looks like data.
- **Page target (not built yet):** one self-contained HTML file with inline CSS and JS. The only runtime network call allowed is Google Fonts. No libraries, frameworks, or bundler without asking the owner. Page UI follows Plainchart; `reference/plainchart/` holds read-only copies, so never edit them. Dark mode follows the OS setting only. Sound is Web Audio synthesis, off by default.
- **Out of scope:** live weather, forecasts, runtime API calls, UV index, recorded audio or text-to-speech.
- **Project log:** at the end of every working session, append one entry to `.claude/context/LOG.md` in the format given in that file. Never edit past entries; put corrections in a new entry. `/project-status` builds reports from this file.

## Pitfalls

- **Random draws are order-sensitive.** Most scene marks come from one RNG seeded by `params.seed`. Adding or removing a draw early in the scene shifts every later mark and breaks the reference frames.
- **Two rain numbers.** The JSON `rain` field is the displayed daily chance (39% on Jun 10). `pipeline/wet_day_stats.py` pools ±7 days and gets 37% for the same date. Never mix them in one label.
- **Fonts.** Google Fonts don't load in this sandbox, so thermometer digits fall back to sans-serif. That is why the baseline diff is small but not zero.
- **Timing.** `printMs` covers the print only. Canvas 2D draws lazily, so `renderWindow` flushes the plates before starting the timer; keep that flush. Headless Chromium's `gl.finish()` doesn't wait for the GPU, so the WebGL path syncs with a 1-pixel `readPixels`.
- **Sandbox speed numbers don't decide the speed target.** WebGL runs on SwiftShader (software) here, so `--webgl` shows about 1.1x. The 10× target is judged on real hardware. In this sandbox, scene drawing (about 3 s for January) costs far more than the print (about 0.2 s).
- **`HANDOFF.md` is partly stale.** It says the WebGL print is still to do and that the CPU print takes 1–4.5 s. Both are out of date. Trust `LOG.md` where they disagree.
