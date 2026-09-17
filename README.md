# GIA AR Solver

Real-time camera application that observes an authorized GIA-style aptitude test on a
monitor, detects the active question, solves it with a specialized deterministic solver,
localizes the correct answer option, and renders an AR overlay anchored to that answer
while the camera feed stays live.

```text
LIVE CAMERA → SCREEN DETECTION → PERSPECTIVE CORRECTION → STATE DETECTION
→ QUESTION EXTRACTION → FAMILY CLASSIFICATION → SPECIALIZED SOLVER
→ ANSWER LOCALIZATION → COORDINATE MAPPING → AR OVERLAY
```

## Documentation map (source-of-truth hierarchy)

1. [`GIA_AR_Solver_Roadmap.md`](GIA_AR_Solver_Roadmap.md) — architecture and strategy.
2. [`GIA_AR_Solver_Master_Prompt.md`](GIA_AR_Solver_Master_Prompt.md) — execution rules.
3. [`docs/problem-taxonomy.md`](docs/problem-taxonomy.md) — observed test structure (OBSERVED / DOCUMENTED / VERIFY).
4. [`docs/solver-specification.md`](docs/solver-specification.md) — solver contracts and algorithms.
5. [`docs/dataset-specification.md`](docs/dataset-specification.md) — fixture and ground-truth rules.
6. [`docs/benchmark-specification.md`](docs/benchmark-specification.md) — quality and latency gates.
7. [`TODO.md`](TODO.md) — operational backlog (claim before implementing).

## Repository layout

```text
src/gia_ar_solver/       Python package (POC stack: Python + OpenCV + NumPy)
├── contracts.py         Common solver contract (SolverResult, states, task types)
├── registry.py          Solver registry / family dispatch
├── fixtures.py          Fixture schema + loader (dataset-specification.md §2)
├── localisation.py      AnswerLocalizer: option index → bbox
├── bench.py             Benchmark harness (accuracy, median/p95 latency)
├── cli.py               `python -m gia_ar_solver solve|bench`
└── solvers/             One deterministic solver per problem family
tools/make_fixtures.py   Synthetic fixture generator (documented examples → images + JSON)
fixtures/                Versioned fixtures: images + JSON annotations
tests/                   pytest suite
```

The roadmap's component map (§24) maps onto the package: `solvers/` is the solver
library, `vision/` (screen detection, perspective, state detection) and `overlay/`
arrive with the camera phases (GIA-010+); solver contracts are screen-space based so
solver work proceeds in parallel.

## Quickstart

```bash
pip install -e ".[dev]"
python tools/make_fixtures.py        # regenerate synthetic fixtures
pytest                               # unit tests
python -m gia_ar_solver bench        # run every solver benchmark
python -m gia_ar_solver solve --fixture fixtures/numeric/N-001.json
```

## Status (2026-09-17)

- **Solvers deterministas**: implementados y validados — numeric 162/0 y
  word 20/0 contra el generador real de práctica; perceptual 146/0 y
  spatial 150/0 sobre el DOM del sitio.
- **Webapp** (`web/`): cámara → detección de pantalla → rectificación →
  clasificación de módulo → solución → AR. Dos rutas de percepción:
  - **VLM (primaria, en curso)**: `src/llm.ts` — compatible con cualquier
    endpoint OpenAI-style (OpenRouter, Ollama local, LM Studio). La base,
    el modelo y la key se configuran en localStorage del navegador.
  - **OCR (fallback local)**: `src/ocr.ts` + `solveFromTokens` en
    `src/solver.ts`.
- **Batería**: 406 capturas reales etiquetadas (`captures/battery/raw/`).
  Headless OCR: `web/battery-node.mjs`. VLM: `web/llm-battery.mjs`.
- **Deploy**: `deploy/` (Docker + Caddy auto-HTTPS) — getUserMedia exige
  HTTPS.

## Usage boundary## Usage boundary

Development uses authorized practice material and synthetic fixtures only. Do not use
this tool during any real evaluation; check provider and process rules first.
