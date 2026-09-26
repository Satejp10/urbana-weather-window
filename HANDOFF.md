# HANDOFF: Urbana Weather Window

**ID:** HO-urbana-window-001 · **Date:** 2026-09-26 · **Stage:** existing repo, files exist (data, pipeline, prototype renderer; the app page is not built)
**Chain:** none

---

## Section 0: STOP, audit before you act

You are picking up a project that was designed or partially built in a different environment (a chat thread). This document is that environment's best understanding of the work. **Treat every claim in it as a hypothesis, not fact.** Your first job is to verify it against the actual repository before you write or change a single line.

**Do the audit in plan mode if your surface supports it** (CLI: Shift+Tab cycles modes; VS Code, Desktop, and web: the mode selector). The audit is read-only by definition.

Run these steps in order:

1. **Read this entire document first**, top to bottom, before touching anything.
2. **Read the project's persistent instructions.** Load `CLAUDE.md` if it exists. If the repo instead has an `AGENTS.md` (or `.cursorrules`, `.windsurfrules`), note it: Claude Code reads `CLAUDE.md`, not `AGENTS.md`, so those instructions are not in your context unless a `CLAUDE.md` imports them. Also check `.claude/rules/*.md` and this repo's auto-memory `MEMORY.md`. This handoff supplements all of them; where they state a convention, they win.
3. **Read the project log if one exists.** `.claude/context/LOG.md` and the newest file in `.claude/context/reports/` are the recorded history of this project and outrank this document wherever they disagree, because they were written with the repo in front of them.
4. **Open every file this document lists.** Do not trust the one-line summaries. If a referenced path does not exist, that is drift: record it.
5. **Confirm the toolchain is real.** Check that the stated language, framework, and versions are actually installed (`node --version`, `python --version`, the lockfile, whatever applies). A handoff written against Node 20 is a landmine on a machine running Node 16.
6. **Confirm the stated state is real.** Run the build. Run the tests. Run `git status` and `git log --oneline -15`. Compare what happens to what this doc claims works, is broken, or is stubbed.
7. **Report drift, then stop.** Before doing any work, tell the user plainly where document and reality diverge ("doc says X, repo actually does Y") and where they matched. Then **wait for the go-ahead.** Do not silently start coding off the back of the audit.

**Greenfield shortcut:** if the Stage above says no code exists yet, steps 3 to 6 collapse into one check: confirm the working directory is the one intended and the toolchain named below is installed. Surface any mismatch and wait for go-ahead.

---

## Section 1: What this is

**In one sentence:** an interactive year-round weather calendar for Urbana, Illinois, built around a code-drawn risograph "window" that shows a typical day at any date and hour, driven entirely by climate data.

The page pairs a Plainchart data UI (year grid by metric, day panel, annual charts, sortable month table, milestones) with the riso window, a time-of-day slider, a "play the year" animation, and optional generated sound. It shows typical weather from long records and 1991-2020 normals. It is not a forecast.

---

## Section 2: Why (motivation and constraints)

- **Motivation:** make Urbana's climate felt, not just read. Every mark in the window encodes data. Inspired by the "Window Seat" riso film (github.com/sevenevesai/riso-windowseat, MIT) and Addy Osmani's code-drawn explainer animation.
- **Constraints:** one self-contained HTML file with no runtime network calls except Google Fonts, because that is the claude-works gallery convention (inline CSS/JS, no JS libraries without asking Satej). Page UI in the Plainchart lane. Dark mode follows the OS preference only. Any visual change goes through a style tile and Satej's sign-off first.
- **Definition of success:** any date and hour renders from data; a wet-day switch works; play-the-year runs smoothly on a laptop at display size; the sound toggle works; the window matches `reference/frames/`.
- **What it must NOT become:** a forecast or live-weather app, a framework or multi-file build, liquid-glass or editorial-brutalist styling (Satej dislikes both), or decoration that looks like data but isn't.

---

## Section 3: Decisions, dead ends, open questions

**Decided:**
- Data: CHAMPAIGN 3S (USC00118740) normals and the record since 1888; KCMI airport hourly 2006-2025 for wind, dew point and hourly temperature; NASA POWER 2001-2025 for clouds, because these are the long local records. UV dropped because POWER's UV is a 24-hour mean, not the midday peak.
- The window faces south and spans azimuth 90-270° (east to west), horizon at 60% height; sun and moon sit at their real positions.
- Encodings in `renderer/riso-window.js`: cloud shapes are solved so cover equals the day's mean cloud %; snow patches cover the odds of 1"+ snow on the ground; flurries scale with the odds of measurable snow; the windsock points downwind, is fully out at 15 kt, and is projected along the real line of sight; the thermometer needle is the mean temperature at that hour (airport) and the band is the normal low to high; the glass on the sill fills to normal year-to-date precipitation (brim = 40.92 in).
- Print: 8 riso inks (yellow, orange, fluorescent pink, violet, aqua, blue, federal blue, green), round-dot screens blended 45% with continuous tone (`texture`), because 3 inks read as "6-bit" to Satej.
- Palette balance: the January frame is 49% warm / 49% cool by `tools/huebal.py`. Room: mint wall, teal casing, butter sill.
- Rain is a daily chance, not a season: 26% (mid-Sep) to 43% (late Apr) by date, 8-13 wet days every month, and wet days cluster (next day wet 41-54% after a wet day vs 21-35% after a dry one). The day view shows the likelier state (always dry) plus a wet-day switch built from that date's wet days. Play-the-year samples wet days with a two-state Markov chain by month; Dec-Feb wet days turn to snow at the monthly snow share (36-49%).
- Displayed rain odds come from the JSON `rain` field (39% on Jun 10). `pipeline/wet_day_stats.py` uses a plain ±7-day pool (37%), so never mix the two in one label.
- Green follows the growing season: last freeze median Apr 13, first freeze median Oct 17, crop stages from USDA Illinois crop-progress 5-year averages. Evergreens at the farm keep some green all year.
- Sound: Web Audio synthesis only, off by default: filtered noise for wind, noise plus random clicks for rain, pulsed tone for crickets (paced by temperature), a weekly piano note on a five-note scale in play-the-year. Rejected ElevenLabs and recorded audio because they need network, keys and files.

**Dead ends (do not retry without new information):**
- Snow from thresholded noise in perspective produced radial streaks toward the vanishing point. Replaced by explicit patches on the ground plane.
- Sun rays drawn over the sky tinted it green.
- The CPU print step takes 1-4.5 s per 1080² frame in headless Chromium: fine for stills, unusable for animation.
- Building in chat: per-message output cap, 1 CPU core, 5-minute commands.

**Still open:**
- [USER] Where it ships: a claude-works gallery page, its own repo with GitHub Pages, or a claude.ai artifact. Per the docs checked 2026-09-26, artifacts publish from the Claude Code CLI or desktop app, not from cloud sessions.
- [USER] One or two rainy-season frames: deferred by Satej.
- [CLAUDE CODE] Hourly temperature curves and wet-day stats for all 366 days are not in the JSON yet; `pipeline/wet_day_stats.py` has the method.
- [CLAUDE CODE] Crop stages and thunder frequency need data not in `data/raw/` (USDA NASS weekly reports; ISD present-weather fields).

---

## Section 4: Current state

**Stack:** vanilla JS with Canvas 2D plates and a CPU halftone; Python 3 with numpy for the pipeline; Playwright (Python) with headless Chromium for renders.
**Entry point:** `renderer/test.html#<URL-encoded JSON params>`; params for the approved frames are in `tools/frames.json`.

**File inventory:**
- `data/urbana_climate.json` (132 KB): 366-day arrays on a leap-year index, plus `months` and `events`.
- `data/raw/`: NOAA 1991-2020 normals (daily, monthly), ACIS record 1888-2026, NASA POWER clouds, KCMI ISD hourly 2006-2025.
- `pipeline/build_data.py` (~345 lines): rebuilds the JSON from `data/raw/`. Verified to reproduce it exactly apart from the `meta.built` timestamp.
- `pipeline/wet_day_stats.py` (~110 lines): monthly wet days and persistence, wet-vs-dry stats for a date, mean temperature at an hour. Reproduces the numbers above.
- `renderer/riso-window.js` (~540 lines): `RisoWindow.renderWindow(canvas, params)` draws 8 ink plates, prints them, then paper-white marks (moon, snow, rain, window drops). Seasons `winter` and `summer` only; crop stages hardcoded for June; daytime only; sun and moon positions are passed in (computed with PyEphem in chat).
- `renderer/test.html`: harness reading params from the URL hash.
- `tools/render.py`: Playwright to PNG. `tools/check_frames.py`: renders `tools/frames.json` and diffs against `reference/frames/` (passed at 0.000/255). `tools/huebal.py`: warm vs cool hue share.
- `reference/frames/`: the three approved frames and a side-by-side. `reference/plainchart/`: copies of the Plainchart skill files.

**What works right now:** the three reference frames render deterministically and match; the pipeline reproduces the JSON.
**What is broken or incomplete:** no app page; CPU print too slow to animate; no JS sun/moon ephemeris; spring, fall and night scenes missing; JSON lacks hourly and wet-day stats; no sound code.

---

## Section 5: Non-goals

- No live weather, forecasts, or runtime API calls.
- No framework, bundler, or JS library without asking Satej.
- No UV index.
- No recorded audio or text-to-speech.
- No look changes without a style tile and sign-off.
- No rainy-season frames yet.

---

## Section 6: Setup

**Working directory:** the GitHub repo the user creates. Suggested name `Satejp10/urbana-weather-window`. [NEEDS USER INPUT if named differently.]

**USER DOES (needs your hands, credentials, or a browser):**
1. Create the repo and commit this package's contents at its root on `main`. Cloud sessions clone from GitHub, so nothing uncommitted reaches them.
2. Make the repo reachable from Claude Code on the web (Claude GitHub App on the repo, or `/web-setup`).
3. Only if a session must fetch new data: set the environment's network to Custom and add `www.ncei.noaa.gov`, `data.rcc-acis.org`, `power.larc.nasa.gov`, `www.nass.usda.gov`. They are not on the default Trusted list. Not needed for the next action.

**CLAUDE CODE DOES (exact commands):**
```bash
python3 -m pip install numpy pillow playwright
python3 -m playwright install chromium
python3 pipeline/build_data.py && git diff --stat   # expect only meta.built to change
python3 tools/check_frames.py                       # expect 0.000/255 on all three frames
```
If the browser download is blocked, use any available headless Chromium and point `tools/render.py` at it. Renders can't load Google Fonts through the session proxy, so thermometer digits fall back to sans-serif; harmless for diffs.

**Do not touch:** `reference/frames/` (approved targets; replace only after Satej signs off a look change) and `reference/plainchart/` (read-only copies; the originals live in Satej's Plainchart skill and must never be edited).

---

## Section 7: Tooling the next session needs

- **Skills:** `project-status` (reporting back to chat) and Plainchart (page UI). Cloud sessions load skills enabled on claude.ai; if either is missing, [USER] adds it under `.claude/skills/`.
- **MCP servers:** none.
- **CLIs and tools:** python3, git, gh, a headless Chromium.
- **Secrets (names only):** none.

---

## Section 8: Pick up here

**Next action:** [CLAUDE CODE] port the print step (halftone screens, misregistration, mottle, multiply, 45% texture blend) of `renderer/riso-window.js` to a WebGL fragment shader, keeping the CPU path as the reference.

**Acceptance criteria:**
- `tools/check_frames.py --webgl` renders all three frames through WebGL with mean absolute difference ≤ 2/255 against the CPU output.
- The WebGL print of a 1080² frame is at least 10× faster than the CPU print in the same headless browser; report both timings.
- No scene changes and no new dependencies.

> Tip: hand these acceptance criteria to `/goal` so the session keeps working until they hold.

**[USER] pending (Claude Code must not do these):**
- Create the repo and commit this package: NOT DONE. Blocks everything.
- Decide where it ships: NOT DONE. Does not block the next action.
- Rainy-season frames: deferred by Satej.

---

## Section 9: Close the loop (set this up before you finish the first session)

This project reports progress back to the chat thread that started it. Set the scaffold up now, in this first session, before doing feature work.

**1. Create the context directory:**
```bash
mkdir -p .claude/context/reports
```

**2. Confirm it will actually be committed.** Cloud sessions (Claude Code web, routines, Cowork) clone from GitHub and see only what is tracked, so an ignored `.claude/` makes this whole mechanism invisible there.
```bash
git check-ignore -q .claude && echo "PROBLEM: .claude is gitignored" || echo "ok"
```
If it reports a problem, replace the blanket `.claude/` rule in `.gitignore` with:
```
.claude/*
!.claude/context/
!.claude/skills/
```
A negation cannot re-include anything under an excluded directory, so ignoring `.claude/*` (the contents) rather than `.claude/` (the directory) is what makes the un-ignore work.

**3. Seed the log** at `.claude/context/LOG.md`:
```markdown
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
```

**4. Append one entry at the end of every working session.** Cheap while the work is fresh, impossible to reconstruct later.

**5. When the user asks for a status update for chat, they run `/project-status`.** Do not hand-write a status report; the skill derives dates and iteration counts from git so they cannot be misremembered.

---

## Section 10: When this doc dies

This file is a bridge, not a permanent doc. After the first successful working session:

- Fold durable rules and conventions into `CLAUDE.md` (or a path-scoped `.claude/rules/*.md`). If the repo uses `AGENTS.md`, put them there and make sure `CLAUDE.md` imports it via `@AGENTS.md`.
- Durable learnings (build quirks, gotchas) need no manual copying: Claude Code's auto memory accumulates them into this repo's `MEMORY.md`.
- Then delete or archive `HANDOFF.md`. The project log in `.claude/context/` is the permanent record; this file is not.

---

## Resume prompt

```
Read HANDOFF.md in the repo root and follow its Section 0 before doing anything
else. Audit the project against the doc in plan mode, report where the document
and the actual repo diverge, then stop and wait for my go-ahead. Do not start
coding until I confirm.
```
