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
