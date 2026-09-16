# Complete test run — all five modules (gia.steciuk.dev)

2026-09-16. Full practice test driven end-to-end from the browser:
answers came from the project's solver logic operating on the live DOM
(reasoning parser + trait lexicon in JS, perceptual casefold counter,
numeric through the POC web solver — rectification → option detection →
Tesseract.js OCR → NumericSolver, word-meaning lexical/POS heuristic with
LLM-in-the-loop fallback, spatial chirality rule on the CSS transform
determinant signs).

## Official scores from the site

| Module | Correct | Wrong | Accuracy | Answerer |
|---|---:|---:|---:|---|
| Razonamiento | 1 | 0 | 100 % | JS parser + lexicon (2 manual LLM calls on unseen traits) |
| Velocidad perceptiva | 146 | 0 | 100 % | automatic (casefold counter) |
| Velocidad y precisión numérica | 17 | 6 | 74 % | **POC web solver** (rectify → detect boxes → OCR → solve) |
| Significado de palabras | 12 | 0 | 100 % | lexical/POS heuristic + LLM fallback (5 manual) |
| Visualización espacial | 150 | 0 | 100 % | automatic (chirality/det-sign rule) |
| **Total** | **326** | **6** | **98.2 %** | |

## The 6 numeric misses

All in the numeric module and none of them logic errors: the numeric
module runs against a **per-question timer**, while the solver cycle
(rectification + 3 Tesseract OCR calls) takes ~2–4 s in a throttled
background tab, plus orchestration gaps between benchmark cells. Six
questions timed out before the answer was clicked. Evidence:
- the previous untimed numeric benchmark scored **11/11** with the same
  pipeline (`live-benchmark-numeric.md`);
- every OCR reading in this run was exact wherever the cycle completed.

Fix path (roadmap GIA-018, end-to-end latency): bring the solve cycle
under the ~300 ms budget (cached worker + single rectified grab +
event-driven solving on question change instead of interval polling) and
run the tab in the foreground.

## New verified facts

- Spatial generator produces arbitrary per-glyph mixes of rotations and
  mirrors; the det-sign chirality rule scored **150/0** on it (VERIFY-010/011).
- Perceptual module length this run: 149 scored (variable per run).
- Numeric module has a per-question timer; the other modules do not appear
  to (or are long enough not to matter at this pace).
