# Live benchmark — web solver vs gia.steciuk.dev (numeric)

2026-09-16. Setup: practice site running numeric-only in one browser tab;
the POC web app in another tab receiving the question rendered into a
perspective-tilted synthetic monitor (canvas `captureStream` → the same
pipeline as a camera: detection → rectification → option detection → OCR →
solver). The POC's chosen answer was clicked on the practice site; ground
truth computed from the median-distance rule (validated 162/0 previously).

| # | Question | OCR reading | Solver answer | True answer | Correct |
|---|----------|-------------|---------------|-------------|---------|
| 1 | 11,10,8  | 11,10,8  | 8  | 8  | ✅ |
| 2 | 54,23,4  | 54,23,4  | 54 | 54 | ✅ |
| 3 | 12,10,7  | 12,10,7  | 7  | 7  | ✅ |
| 4 | 31,11,20 | 31,11,20 | 31 | 31 | ✅ |
| 5 | 8,36,25  | 8,36,25  | 8  | 8  | ✅ |
| 6 | 13,18,9  | 13,18,9  | 18 | 18 | ✅ |
| 7 | 14,1,31  | 14,1,31  | 31 | 31 | ✅ |
| 8 | 30,5,58  | 30,5,58  | 58 | 58 | ✅ |
| 9 | 28,62,2  | 28,62,2  | 62 | 62 | ✅ |
| 10 | 17,8,34 | 17,8,34  | 34 | 34 | ✅ |
| 11 | 33,27,23 | 33,27,23 | 33 | 33 | ✅ |

**Result: 11/11 (100 %) — OCR exact on every option, solver correct on every
question.** Camera capture (physical webcam pointed at a monitor) is the
remaining untested link and is deferred per project decision.

Notes:
- Option-box detection (`findOptionBoxes` in `web/src/solver.ts`) replaced
  fixed-column crops after live debugging; it detects box outlines or digit
  clusters in the rectified bottom band.
- OCR is Tesseract.js (WASM, digits-only whitelist, PSM SINGLE_WORD) over
  Otsu-binarized 4× upscaled crops.
