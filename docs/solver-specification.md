# GIA AR Solver — Solver Specification

## 1. Common contract

```typescript
interface SolverResult {
  solved: boolean;
  answerId: string | number;
  confidence: number;
  latencyMs: number;
  answerBBox?: BoundingBox;
  taskType: TaskType;
  problemFamily: string;
  parserConfidence?: number;
  solverConfidence?: number;
  fallbackUsed?: boolean;
  diagnostics?: Record<string, unknown>;
}
```

`answerId` must identify the actual visible answer option.

---

# 2. Reasoning Solver

## Input

```typescript
interface ReasoningContext {
  statementText: string;
  relations: Relation[];
}

interface Relation {
  subject: string;
  dimension: string;
  relation: "LT" | "GT" | "EQ";
  object: string;
}
```

## Pipeline

```text
statement image
→ OCR
→ normalization
→ relation extraction
→ persist context
→ question image
→ OCR
→ question normalization
→ query construction
→ graph traversal
→ answer index
```

## Critical rules

- Preserve context between screens.
- Explicitly model negation.
- Preserve semantic dimension.
- Support inverse questions.
- Never rely on an LLM if graph reasoning resolves the answer.

## Fallback

Use semantic/VLM assistance only when:

- OCR is ambiguous;
- relation vocabulary is unresolved;
- question polarity is ambiguous.

Fallback output must be constrained to the visible answer options.

---

# 3. Perceptual Speed Solver

## Input

Four columns, each containing two glyphs.

```typescript
interface PerceptualInput {
  columns: Array<{
    top: Glyph;
    bottom: Glyph;
  }>;
}
```

## Pipeline

```text
grid
→ 4 columns
→ glyph extraction
→ glyph classification
→ canonical case-insensitive ID
→ equality
→ count
```

## Output

```text
0,1,2,3,4
```

## Preferred recognition

Use constrained glyph recognition before generic OCR.

No semantic model required.

---

# 4. Numeric Solver

## Input

Exactly three recognized numbers.

```typescript
interface NumericInput {
  options: Array<{
    value: number;
    optionIndex: number;
  }>;
}
```

## Algorithm

```python
ordered = sorted(values)
median = ordered[1]

distance_i = abs(value_i - median)

answer = option with maximum distance
```

Preserve `optionIndex`.

## Edge cases

Duplicate/tie behavior remains `VERIFY`.

---

# 5. Word Meaning Solver

## Input

Three normalized words.

```typescript
interface WordInput {
  words: string[];
}
```

## Pairwise evaluation

For each pair:

```text
lexical relation
semantic embedding similarity
relation classifier
```

Possible relation labels:

```text
SYNONYM
ANTONYM
CATEGORY
ASSOCIATION
OTHER
UNRELATED
```

## Decision

Find the pair with the strongest coherent relationship and select the remaining word.

Do not assume that the relationship must be synonymy.

## Fallback

VLM/LLM only when deterministic/semantic scoring is ambiguous.

Force structured output:

```json
{
  "relatedPair": [0,2],
  "oddIndex": 1
}
```

Validate that returned indices exist in the visible options.

---

# 6. Spatial Solver

## Input

Two squares, each containing two visual glyphs.

```typescript
interface SpatialSquare {
  topGlyph: GlyphImage;
  bottomGlyph: GlyphImage;
}

interface SpatialInput {
  squares: [SpatialSquare, SpatialSquare];
}
```

## Normalization

For each glyph:

```text
background removal
→ binarization
→ connected component isolation
→ crop
→ scale normalization
→ centering
```

Preserve geometry.

## Rotation equivalence

For angle set `Θ`:

```text
rotationScore = max(
  similarity(rotate(top, θ), bottom)
  for θ in Θ
)
```

Separately:

```text
mirrorScore = max(
  similarity(rotate(mirror(top), θ), bottom)
  for θ in Θ
)
```

Classification:

```text
rotationScore high
AND rotationScore sufficiently exceeds mirrorScore
→ ROTATION_MATCH

mirrorScore high
AND rotationScore low
→ MIRROR_ONLY

otherwise
→ AMBIGUOUS / NO_MATCH according to calibrated thresholds
```

The exact threshold and angle resolution must be benchmark-derived.

## Output

```text
0 / 1 / 2
```

No OCR or LLM required.

---

# 7. Answer localization

The solver should not own screen-wide detection.

Use a shared `AnswerLocalizer`.

Responsibilities:

```text
detect answer option regions
→ assign optionIndex
→ return bounding boxes
```

Solver returns the logical answer index.

Localization maps:

```text
logical answer
→ visible option
→ bbox
```

---

# 8. Confidence

Confidence must be calibrated from benchmark outcomes.

Never fabricate confidence values.

Maintain separate:

```text
parserConfidence
solverConfidence
localizationConfidence
```

End-to-end confidence should account for all three.
