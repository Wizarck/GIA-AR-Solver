# GIA AR Solver — Master Execution Backlog

## Current Phase

Phase 1 complete on synthetic fixtures — all five deterministic solvers
implemented, benchmarked (100% accuracy on the documented fixture set) and
unit-tested. Next: camera infrastructure (GIA-010+) and real fixture capture
(VERIFY-001.., DATA-001..).

---

## Critical Path

- [x] GIA-001 Project setup
- [x] GIA-002 Module/state framework
- [x] GIA-003 Fixture repository
- [x] GIA-004 Benchmark harness
- [x] GIA-005 Spatial solver POC
- [x] GIA-006 Perceptual solver
- [x] GIA-007 Numeric solver
- [x] GIA-008 Reasoning solver
- [x] GIA-009 Word Meaning solver
- [ ] GIA-010 Camera engine
- [ ] GIA-011 Screen detection
- [ ] GIA-012 Perspective correction
- [ ] GIA-013 Question/state detection
- [ ] GIA-014 Answer localization
- [ ] GIA-015 Coordinate mapping
- [ ] GIA-016 AR overlay
- [ ] GIA-017 Real-time tracking
- [ ] GIA-018 End-to-end latency optimization
- [ ] GIA-019 Full SOAK
- [ ] GIA-020 Regression hardening

---

# Reverse Engineering / VERIFY

- [x] VERIFY-001 Capture all available instruction screens (2026-09-16: all 5 captured from gia.steciuk.dev practice site — captures/steciuk-practice/)
- [x] VERIFY-002 Capture additional Reasoning statement/question transitions (22 pairs harvested with full trait vocabulary)
- [ ] VERIFY-003 Verify Reasoning transition timing (progress bar observed; timing not yet measured)
- [ ] VERIFY-004 Verify Perceptual layout variability (all 92 observed questions were 4-column; variation unobserved)
- [x] VERIFY-005 Verify Numeric position permutations (162 questions observed: values appear in arbitrary positions)
- [x] VERIFY-006 Verify Numeric duplicate/tie behavior (162 questions: zero ties/duplicates observed — argmax safe on this generator)
- [x] VERIFY-007 Capture additional Word Meaning relationship types (20 triplets: category-based, synonym-pair + intruder; logged)
- [x] VERIFY-008 Verify Word Meaning semantic relationship taxonomy (observed: noun-class pairs, verb pairs, adjective-pair + semantically-odd intruder; synonym-only rule disproved)
- [ ] VERIFY-009 Capture additional Spatial glyph families (site generated no scored spatial items; 1 sample captured)
- [x] VERIFY-010 Spatial rotation-angle distribution: arbitrary angles via CSS matrix() — rotation angle is IRRELEVANT to equality
- [x] VERIFY-011 Spatial mirror+rotation cases: chirality rule proven — same letter + same determinant sign = equal; det<0 = mirrored = never equal
- [ ] VERIFY-012 Verify answer-layout variability across all modules (options always bottom-row boxes in this generator)
- [ ] VERIFY-013 Verify timer/progress UI behavior (progress bar present; per-question timer not yet measured)
- [x] VERIFY-014 Inspect authorized/public practice source (gia.steciuk.dev practiced end-to-end; scores validate solver algorithms)

---

# Dataset

- [ ] DATA-001 Store immutable baseline screenshots (real authorized captures; synthetic set done)
- [x] DATA-002 Label answer indices (done for the 10 synthetic/documented fixtures)
- [x] DATA-003 Label answer bounding boxes (normalized, in every fixture annotation)
- [ ] DATA-004 Build synthetic visual augmentations
- [ ] DATA-005 Build adversarial fixtures
- [x] DATA-006 Establish fixture naming/versioning (fixtures/README.md; add-only policy)

---

# Benchmarks

- [ ] BENCH-001 State detector benchmark (needs GIA-013)
- [ ] BENCH-002 OCR/glyph benchmark (needs real captures)
- [x] BENCH-003 Reasoning benchmark (harness live; 2 fixtures — grow with VERIFY-002)
- [x] BENCH-004 Perceptual benchmark (harness live; 2 fixtures)
- [x] BENCH-005 Numeric benchmark (harness live; 2 fixtures)
- [x] BENCH-006 Word benchmark (harness live; 2 fixtures)
- [x] BENCH-007 Spatial benchmark (harness live; 2 fixtures + threshold calibration on synthetic bands)
- [ ] BENCH-008 Answer localization benchmark
- [ ] BENCH-009 Coordinate mapping benchmark
- [ ] BENCH-010 End-to-end latency benchmark

---

# Testing

- [x] TEST-001 Unit test framework (pytest; 50 tests green)
- [ ] TEST-002 Integration test framework
- [ ] TEST-003 Visual regression framework
- [ ] TEST-004 Question-change regression
- [ ] TEST-005 Stale-answer regression
- [ ] TEST-006 Perspective robustness
- [ ] TEST-007 Low-light/blur/compression robustness

---

# SOAK

- [ ] SOAK-001 Camera
- [ ] SOAK-002 Screen detection
- [ ] SOAK-003 State detection
- [ ] SOAK-004 All solvers
- [ ] SOAK-005 Answer localization
- [ ] SOAK-006 Coordinate mapping
- [ ] SOAK-007 Tracking
- [ ] SOAK-008 Overlay
- [ ] SOAK-009 Cross-module transitions
- [ ] SOAK-010 End-to-end long run

---

# Human Decisions

Format:

```text
HD-XXX
Question:
Context:
Evidence:
Options:
Impact:
Experiment:
Decision:
```

---

# Bugs

Every discovered bug must become:

```text
bug
→ root cause
→ regression fixture
→ regression test
→ fix
→ benchmark
```

---

# Completed

- **2026-09-16 — GIA-001 Project setup.** `pyproject.toml` (src layout,
  numpy/opencv-python/pillow), spec docs moved from repo root to `docs/`
  (aligning with the master prompt's source-of-truth hierarchy), README with
  documentation map, AGENTS.md consumer sections filled.
- **2026-09-16 — GIA-002 Module/state framework (contracts).**
  `contracts.py`: `SolverResult` (solver-specification.md §1), `ModuleState`
  vocabulary (master prompt §6), `TaskType`, `BoundingBox`, `Option`,
  `Relation`; `registry.py` family dispatch; `localisation.py`
  `AnswerLocalizer`. Vision-side state detection arrives with GIA-013.
- **2026-09-16 — GIA-003 Fixture repository.** `fixtures.py` schema loader +
  validation; `tools/make_fixtures.py` deterministic synthetic generator;
  10 annotated fixtures covering all 5 families (traceable to
  docs/dataset-specification.md §3; spatial glyph content is synthetic with
  recorded generation parameters).
- **2026-09-16 — GIA-004 Benchmark harness.** `bench.py` + `cli.py bench`:
  per-family accuracy, solve rate, median/p95 latency, failure listing,
  JSON output. Current: 100% accuracy / 100% solve rate on all 5 families;
  spatial median ≈ 79 ms (budget 300 ms).
- **2026-09-16 — GIA-005 Spatial solver.** Geometry-only pipeline
  (extract glyphs from square regions → normalize → rotation/mirror sweeps →
  blur-cosine similarity + translation refinement). Explicit mirror
  rejection with a self-symmetry exception for mirror-symmetric letters
  (taxonomy S7). Thresholds calibrated on synthetic bands; re-calibration on
  real captures tracked in VERIFY-010/011.
- **2026-09-16 — GIA-006 Perceptual solver.** Case-insensitive column
  equality count (P1/P2). Text-level: glyph-ID input from the constrained
  classifier planned in GIA-013; layout variation refuses to guess
  (VERIFY-004).
- **2026-09-16 — GIA-007 Numeric solver.** Median-distance argmax with
  option-index preservation; ties/duplicates refuse to answer (VERIFY-006).
- **2026-09-16 — GIA-008 Reasoning solver.** Spanish comparative parser
  (no-es-tan / más / menos / tan-como), canonical trait lexicon with
  polarity, transitive chain composition (R4), inverse + negated questions;
  unknown vocabulary → fallback flag, never a guess.
- **2026-09-16 — GIA-009 Word Meaning solver.** Lexical category relation
  layer (person-trait / object / action) with auditable pair scoring;
  embedding layer + VLM fallback remain advisory hand-offs (VERIFY-007/008).
- **2026-09-16 — TEST-001 Unit test framework.** 50 tests green
  (`python -m pytest`, <30 s).

Move completed items here with:

- completion date;
- implementation summary;
- tests;
- benchmark result.

---

# Deferred

Every deferred item requires a reason.

---

# Lessons Learned

- 2026-09-16 — Raw IoU on thin-stroke glyph rasters is brittle under
  rotation: a 1-2 px rasterization offset halves it and true matches score
  ~0.5-0.75. Blur-cosine similarity (Gaussian σ=2 + cosine) plus translation
  refinement at the best angle separates cleanly (true 0.93-0.98 vs
  impostors ≤0.86).
- 2026-09-16 — Scale-normalizing both bbox dimensions breaks rotation
  invariance for glyphs whose bbox aspect changes with rotation (e.g. L).
  Scale by the longest side only.
- 2026-09-16 — If text is accent-stripped before parsing, the regex
  patterns must match the stripped forms (más → mas), or the branch silently
  never fires while its sibling (menos) keeps tests green.
- 2026-09-16 — The rot-vs-mir margin is the discriminator that rejects
  round glyphs (mirrored G) whose raw rotation score stays high; plain
  absolute thresholds cannot separate them.
- 2026-09-16 — A discriminative detail: mirror-symmetric letters (A, H, O…)
  make mirror(top) ≅ rotation(top), so a mirror match IS a rotation match
  for them; measure self-symmetry with a full rotation sweep, not a single
  un-rotated IoU.

Record reusable engineering lessons here.
