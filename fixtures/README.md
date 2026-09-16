# Fixtures

Versioned fixtures per `docs/dataset-specification.md`. Layout:

```text
fixtures/<family>/<ID>.json      annotation (schema §2 of the dataset spec)
fixtures/<family>/<ID>.png       synthetic screen render
fixtures/spatial/<ID>-squareN.png  inner square crops (solver input)
```

Families: `reasoning/`, `perceptual/`, `numeric/`, `word/`, `spatial/`.

Every annotation records `source`, provenance `notes`, the full option list
with normalized bboxes, and the ground-truth `answerId`. The current set is
synthetic: deterministic re-renders of the documented observed examples in
`docs/dataset-specification.md` §3. Real captured screenshots (DATA-001) must
land here as immutable files with their own annotations — never overwrite a
canonical fixture; add a new ID instead.

Regenerate with:

```bash
python tools/make_fixtures.py
```

Generation is deterministic (fixed layout + shared glyph renderer); the font
resolved by `gia_ar_solver.synth.resolve_font` is part of the generation
contract, so font changes require regenerating and re-running benchmarks.
