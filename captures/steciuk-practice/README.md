# Captures — gia.steciuk.dev practice test (authorized public practice material)

Captured 2026-09-16 by driving the public practice app at
`https://gia.steciuk.dev/es/test/` in a controlled browser session.
Source credit: Adam Steciuk (site author). These are practice-site captures,
NOT private/production GIA content — consistent with the project's evidence
boundary (master prompt §2).

## Contents

| File | What it shows |
|---|---|
| `00-module-selection.png` | Module selection screen (all 5 GIA modules) |
| `reasoning-00-instructions.png` | Reasoning MODULE_INSTRUCTIONS screen |
| `reasoning-01-statement.png` | Reasoning statement screen + progress bar |
| `reasoning-02/03-question*.png` | Reasoning question screens (2 name options) |
| `perceptual-00-instructions.png` | Perceptual Speed instructions |
| `perceptual-01-question.png` | Perceptual 4-column letter grid + [0..4] options |
| `numeric-00-instructions.png` | Number Speed & Accuracy instructions |
| `numeric-01-question.png` | Numeric 3-number question |
| `word-00-instructions.png` | Word Meaning instructions |
| `word-01-question.png` | Word Meaning 3-word question |
| `spatial-00-instructions.png` | Spatial Visualisation instructions |
| `spatial-01-question.png` | Spatial two-square question (see chirality note) |
| `99-results-top/lower.png` | Per-module score screens after finishing |
| `*-log*.json` | DOM-text harvest of every question answered, per module |

## Ground-truth validation (scores from the site itself)

| Module | Correct/Wrong | Method |
|---|---|---|
| Number Speed & Accuracy | **162 / 0** | median-distance argmax (NumericSolver algorithm) — 100 % |
| Word Meaning | **20 / 0** | LLM semantic fallback (odd-one-out reasoning) — 100 % |
| Perceptual Speed | 41 / 51 | first pass had a column-pairing bug; corrected pass was perfect |
| Reasoning | 10 / 19 | half the module answered at random while harvesting text |
| Spatial Visualisation | 0 / 0 | site generated no scored spatial items this run |

## Verified generator facts (updates VERIFY items)

- Numeric: **no ties/duplicates observed across 162 generated questions**
  (VERIFY-006 evidence: tie behaviour never triggered).
- Reasoning: full statement/question pattern inventory + trait vocabulary
  harvested in `reasoning-*-log.json` (VERIFY-002/005 evidence).
- Spatial: question letters are DOM text with CSS `matrix()` transforms.
  **Chirality rule discovered (VERIFY-010/011):** two glyphs are the same
  letter iff the letters match and both transforms have the SAME determinant
  sign — det < 0 means mirrored (never equal), det > 0 means pure rotation
  (equal). Rotation angle is irrelevant to equality.
- Site lifecycle matches problem-taxonomy.md §1:
  MODULE_INSTRUCTIONS → "Estoy a punto" → QUESTION (progress bar) → next.

## Usage

Reference material for fixture annotation and parser/lexicon work only.
Do not commit derived fixtures without their `source` field pointing here.
