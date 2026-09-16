# GIA AR Solver — Benchmark Specification

## 1. Metrics

### State detection

- accuracy;
- confusion matrix;
- false QUESTION detection;
- missed QUESTION detection.

### Perception

- OCR/glyph accuracy;
- bounding-box IoU;
- screen-corner error;
- perspective error.

### Solver

- accuracy;
- family accuracy;
- confidence calibration;
- median latency;
- p95 latency.

### AR

- answer localization error;
- overlay alignment error;
- stale-answer rate;
- overlay persistence;
- question-change detection latency.

### End-to-end

```text
question visible
→ question recognized
→ solved
→ localized
→ overlay rendered
```

Track:

- success rate;
- median latency;
- p95 latency;
- frame drops;
- stale answer incidents.

---

# 2. Solver acceptance

Each family needs a labelled benchmark.

Minimum gates:

- deterministic unit tests pass;
- adversarial suite passes;
- benchmark regression does not degrade;
- latency remains within the current project target;
- no unresolved high-confidence false positives.

Exact numerical thresholds should be established empirically and stored in versioned benchmark configuration rather than invented upfront.

---

# 3. Regression policy

Every discovered failure becomes:

```text
fixture
+
test
+
root-cause note
```

A bug is not complete until the regression test exists.

Never fix a benchmark by removing the failing sample.

---

# 4. SOAK

Run:

```text
camera
screen detection
state detection
all solvers
answer localization
coordinate mapping
tracking
overlay
```

Measure drift over long runs:

- memory;
- CPU/GPU;
- latency;
- frame rate;
- stale answers;
- false transitions;
- localization drift.
