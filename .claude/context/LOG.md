# Project log: Urbana Weather Window

Append-only. Newest entries at the bottom. Never edit or delete a past entry;
corrections go in a new entry as `- correction: ...`.
One entry per working session. `/project-status` builds its reports from this file
plus live git facts, so anything not written here is likely to be lost.

Entry format:

## YYYY-MM-DD | session N | <cli | web | desktop>
- did: <what actually changed>
- decided: <decision> because <reason>
- rejected: <alternative> because <reason>
- broke/fixed: <symptom, and resolution if any>
- open: <unresolved question>
- next: <intended next action>

---

## 2026-09-26 | session 0 | chat
- did: project defined in Claude.ai; data pipeline, 8-ink riso renderer prototype, three approved reference frames; HANDOFF.md written (HO-urbana-window-001)
- decided: every window mark encodes data because the art is the chart; rain shown by daily odds because Urbana has no rainy season; 8 inks with a 45% tone blend because 3 inks read as "6-bit"
- open: where it ships; rainy-season frames; hourly and wet-day stats not yet in the JSON
- next: port the print step to WebGL with parity to the CPU path

## 2026-09-27 | session 1 | web
- did: audited the repo against HANDOFF.md. Drift: the repo exists (section 8 says not created); frames diff 0.022/255, not 0.000 (Inter can't load through the session proxy, only the thermometer digits differ); `gh` is missing (use the GitHub MCP tools); artifacts do publish from cloud sessions (section 3 says they don't); `playwright install` is not needed (Chromium is preinstalled; pin playwright==1.56.0). Pipeline rebuild is identical apart from meta.built.
- did: seeded this log; .gitignore for tools/out/
- did: WebGL2 print in renderer/riso-window.js: params.print = 'webgl' runs the print as a fragment shader; the CPU print stays the default and the reference, and its output is byte-identical to before. renderWindow returns print and printMs.
- did: tools/check_frames.py --webgl (parity and print timings, results in tools/out/webgl-check.json); tools/bench.html + tools/bench.py build a speed test page, published privately at https://claude.ai/artifact/Cy1hdQT8K4y1F9PBB9qkdp
- decided: printMs starts after flushing the plates' deferred canvas drawing, because Canvas2D draws lazily and the old timer counted ~0.8 s of January scene drawing as print
- decided: wait for the GPU with a 1-pixel readPixels, because gl.finish() did not wait in headless Chromium and the WebGL print looked faster than it was
- decided: judge the 10x speed target on Satej's laptop, because this cloud machine has no GPU (WebGL runs on SwiftShader, which draws on the CPU)
- rejected: GPU-backed plate canvases to cut the upload, because GPU canvas drawing can change anti-aliasing, which is a scene change
- broke/fixed: HANDOFF says the CPU print takes 1-4.5 s. Measured here, the print alone takes 0.21-0.30 s; the rest was scene drawing (June ~0.4 s, January ~3.3 s per frame)
- open: 10x target unproven. Here WebGL vs CPU diff is 0.001/255 (max 1) but speed is 1.0-1.3x; WebGL parts on SwiftShader: upload ~43 ms, shader 120-160 ms, copy ~12 ms
- open: scene drawing, not the print, limits play-the-year (January ~3.3 s per frame here)
- open: the approved frames mix rules: January uses all-day values, June dry uses dry-day values (band 60.1-83.3, needle 83.3, cloud 47%) instead of the normals (61.0-81.7, 54%); the JSON has no year-to-date precipitation for the glass
- next: Satej runs the speed test page on a laptop and pastes the results; then decide whether to speed up the plate upload or the scene drawing
