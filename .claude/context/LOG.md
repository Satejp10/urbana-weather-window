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

## 2026-11-10 | session 2 | web
- did: added CLAUDE.md and ran each command in it. `build_data.py` reproduces the committed JSON except `meta.built`. `check_frames.py` passes at 0.007/255 per frame. `--webgl` passes: WebGL vs CPU 0.001/255 (max 1), 1.1x on SwiftShader.
- decided: CLAUDE.md pins Playwright 1.63.0, because this sandbox's Chromium is build 1243, which 1.63.0 uses. Installed in a scratch venv; the global Python was restored to its original state.
- rejected: `playwright install`, because the sandbox already has the browser.
- broke/fixed: Playwright 1.56.0 failed with "Executable doesn't exist at /opt/pw-browsers/chromium_headless_shell-1194". Fixed by using 1.63.0.
- correction: the 2026-09-27 entry pins playwright==1.56.0. On this image, use 1.63.0.
- open: the 10x WebGL target still needs a run on real hardware, as in the 2026-09-27 entry.
- next: unchanged from 2026-09-27.

## 2026-11-26 | session 3 | web
- did: read Satej's laptop run of the speed test page (Brave on Windows, Chromium 158; Brave hides the GPU name). WebGL print 48-53 ms vs CPU 314-320 ms, so 6.1-6.6x. The wet frame read 14.2x, but its CPU median jumped to 752 ms (first render 480), so treat that one as noise. WebGL parts: upload 42-45 ms, shader 1-4 ms, copy about 0 ms. Prints differ by 0.032/255 (max 15), well under the 2.0 limit. Scene: January 4281 ms, June dry 451, June wet 943.
- did: timed each part of the scene here. Snow patches took 83% of January (11,300 patches, 2 paints each, every paint clipping all 8 plates). Then trees 5%, the snow fit 4%, clouds 4%. In June, the cloud fit takes about 40% and grass blades about 33% of about 0.3 s.
- did: added `Plates.paintMany` (one setup and clip per plate for a list of marks). Snow patches and winter twigs use it. January scene went from 2.7 s to 0.87 s here. All 8 plates and the output are byte-identical on all three frames, for both prints.
- did: turned on UNPACK_PREMULTIPLY_ALPHA_WEBGL around the plate uploads. Upload went from 29-35 ms to 11-15 ms here, with the same output. Updated CLAUDE.md (paintMany, the upload flag, the new scene times, and byte-for-byte checks for speed work).
- decided: kept one texture array for the plates, because 8 separate textures saved only about 4 ms more here and would need 8 samplers in the shader.
- broke/fixed: with the flag on for the whole context, WebGL 2 refused the mottle grid upload (INVALID_OPERATION), and the WebGL print came out 46-61/255 off the CPU print. Fixed by turning the flag on only during the plate uploads. `--webgl` caught it.
- open: does the WebGL print reach 10x on the laptop now? Scaling the upload gain here onto the laptop parts gives about 12x for the worst frame. Only a laptop run can show it.
- open: why the laptop prints differ more (0.032, max 15) than here (0.001, max 1). Not known; Brave's anti-fingerprinting noise on canvas reads is one possible cause.
- open: play-the-year will still not be smooth at full size. Scaled from here, a January frame should take about 1.4 s on the laptop, and June 0.3-0.9 s. Pre-rendering frames ahead of playback is one option; this is a design call.
- next: Satej re-runs the speed test page (same link); then pick the next scene speed-up or a play-the-year approach.

## 2026-11-26 | session 3, continued | web
- did: rewrote README.md, which held only the title. It now has the three approved frames up top, a link row, a links table (speed test page, frames, data, log, dev guide, renderer, harness, params, handoff), the check commands with their pass limits, and the four data sources. Each source link was opened and checked.
- decided: link the speed test page even though it is a private claude.ai page, because Satej asked for the link; the README says it is private.
- open: no public demo until Satej decides where the page ships (HANDOFF section 8).
- next: unchanged; Satej re-runs the speed test page.

## 2026-11-26 | session 3, laptop re-run | web
- did: Satej re-ran the speed test page at build cdb8f8c (Brave on Windows, Chromium 158). WebGL print 20-25 ms vs CPU 286-319 ms, so 12.9-14.2x. WebGL parts: upload 18-19 ms (was 42-45), shader 0.6-2 ms, copy under 1 ms. Prints still differ by 0.032/255 (max 15), the same as before the speed work.
- did: scene times on the laptop: January 1377 ms (was 4281), June dry 444 (was 451), June wet 478. The earlier 943 ms for June wet was most likely noise: no June scene code changed, and that run's CPU print was also slow (752 ms).
- decided: the WebGL print milestone in HANDOFF section 8 is done. WebGL vs CPU stays under 2/255, the print is at least 10x faster on the laptop, and there are no scene changes or new dependencies. The estimates from this sandbox held (about 12x, and about 1.4 s for January).
- open: the scene is now about 95% of a frame (January about 1.4 s, June about 0.45 s, print 20-25 ms). That is fine for stills but too slow to draw play-the-year live, and scene tuning alone won't close a 14x gap. Play-the-year needs a design (frame rate, display size, rendering ahead) once the page exists.
- open: why the laptop's print diff is larger (max 15 vs 1 here) is still not known.
- next: recommended to Satej: the data-to-window step. Turn a date, hour and wet/dry choice into renderer params from the JSON, with sun and moon computed in JS, and check it against tools/frames.json. The page and play-the-year both need it.
