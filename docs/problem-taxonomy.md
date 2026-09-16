# GIA AR Solver — Problem Taxonomy

## Evidence status

Legend:

- **OBSERVED** — directly established from supplied screenshots/material.
- **DOCUMENTED** — established by the supplied Thomas example material.
- **VERIFY** — plausible implementation/test variant that must not be assumed until observed.

---

## 1. Global module state

All modules observed/documented to use:

```text
MODULE_INSTRUCTIONS
    ↓
READY / "Estoy a punto"
    ↓
QUESTION
    ↓
ANSWER OPTIONS
```

The instruction screen explains the task and should be treated as calibration/state identification, not as a problem.

---

# 2. Reasoning

## OBSERVED

Structure:

```text
STATEMENT
    ↓
"Muestra la pregunta"
    ↓
QUESTION
    ↓
TWO ANSWERS
```

Examples:

```text
Manuel no es tan organizado(-a) como Marcos.
→ Quién es menos caótico(-a)?
→ Manuel / Marcos
```

```text
Carlos es más distraído(-a) que Eva.
→ Quién es menos atento(-a)?
→ Eva / Carlos
```

## Problem families

- R1 Direct comparison — DOCUMENTED/OBSERVED
- R2 Inverse query — OBSERVED
- R3 Negation/polarity — OBSERVED
- R4 Transitive comparison — VERIFY
- R5 Comparative vocabulary variation — OBSERVED
- R6 OCR-sensitive semantic tokens — implementation risk

## Core representation

```json
{
  "subject": "A",
  "dimension": "property",
  "relation": "LT",
  "object": "B"
}
```

The statement context must persist across the UI transition.

---

# 3. Perceptual Speed

## OBSERVED

Question:

```text
¿Cuántas columnas tienen la misma letra?
```

Visual structure:

```text
4 columns × 2 rows

j r l g
J P L J

[0] [1] [2] [3] [4]
```

Second observed example:

```text
C e g o
C E G O
```

Rule:

```text
for i in 0..3:
    compare(top[i].casefold(), bottom[i].casefold())

answer = number of equal columns
```

## Problem families

- P1 Four-column letter equality — OBSERVED
- P2 Case variation — OBSERVED
- P3 Glyph/OCR ambiguity — implementation risk
- P4 Layout variation — VERIFY

Answer range: `0..4`.

---

# 4. Number Speed & Accuracy

## OBSERVED

Question:

```text
¿Qué número está más alejado de la mediana?
```

Three numerical options.

Examples:

```text
17  9  12
→ median = 12
→ distances = 5, 3, 0
→ answer = 17
```

```text
54  24  4
→ median = 24
→ distances = 30, 0, 20
→ answer = 54
```

## Core algorithm

```text
median = middle(sorted(a,b,c))
answer = argmax(abs(a-median), abs(b-median), abs(c-median))
```

Preserve original visual option index.

## Problem families

- N1 Standard three-number median-distance — OBSERVED
- N2 Position permutation — VERIFY
- N3 Close distances — VERIFY
- N4 Duplicate values — VERIFY
- N5 Tie behavior — VERIFY

Do not invent tie behavior.

---

# 5. Word Meaning

## OBSERVED

Question:

```text
¿Qué palabra no es adecuada?
```

Three word options.

Examples:

```text
Tallar | Intruso | Indiscreto
```

```text
Indiscreto | Abrigo | Curioso
→ Abrigo is the observed odd-one-out interpretation.
```

The task is semantic odd-one-out.

## Problem families

- W1 Trait/person semantic relationship — OBSERVED
- W2 Object vs semantic-trait mismatch — OBSERVED
- W3 Synonym relationship — VERIFY
- W4 Antonym relationship — VERIFY
- W5 Category relationship — VERIFY
- W6 General semantic association — VERIFY
- W7 Ambiguous relationship — VERIFY

Do not hard-code synonym-only behavior.

---

# 6. Spatial Visualisation

## OBSERVED

Instructions explicitly state:

- two squares;
- each square contains two letters/glyphs;
- letters are considered equal if they differ only by rotation;
- reflection does not count.

Question:

```text
¿Cuántos cuadrados tienen la misma letra?
```

Answer options:

```text
[0] [1] [2]
```

## Critical interpretation

Evaluate each square independently.

```text
square 1:
    glyph A vs glyph B
    rotation equivalent? → yes/no

square 2:
    glyph C vs glyph D
    rotation equivalent? → yes/no

answer = count(yes)
```

Do NOT compare square 1 against square 2.

## Problem families

- S1 Pure rotation — OBSERVED
- S2 Reflection rejection — OBSERVED
- S3 Reflection + rotation — DOCUMENTED concept / VERIFY exact generator use
- S4 Two-square counting — OBSERVED
- S5 Rotation-angle variation — VERIFY
- S6 Similar-shape discrimination — VERIFY
- S7 Symmetry/ambiguity — VERIFY

## Solver principle

Treat symbols as geometry, not text.

```text
A/B
→ normalize
→ rotation sweep
→ similarity
→ mirror sweep
→ classify
```

---

# 7. Cross-module architecture

```text
ModuleStateDetector
        ↓
QuestionDetector
        ↓
ProblemFamilyClassifier
        ↓
Task-specific Parser
        ↓
Task-specific Solver
        ↓
AnswerIndex
        ↓
AnswerLocaliser
```

Every family must eventually have:

- fixture;
- ground truth;
- parser;
- solver;
- answer localization;
- benchmark;
- adversarial tests.
