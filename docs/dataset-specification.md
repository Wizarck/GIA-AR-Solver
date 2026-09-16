# GIA AR Solver — Dataset & Fixture Specification

## 1. Purpose

Create reproducible, versioned fixtures for:

- state detection;
- OCR/glyph recognition;
- solver correctness;
- answer localization;
- perspective robustness;
- AR overlay;
- regression;
- SOAK.

Use only authorized practice material, supplied project screenshots, or synthetic/generated fixtures.

---

# 2. Fixture schema

Recommended JSON:

```json
{
  "id": "PS-001",
  "taskType": "perceptual_speed",
  "problemFamily": "P1",
  "state": "QUESTION",
  "source": "authorized-practice",
  "image": "fixtures/perceptual/PS-001.png",
  "answerId": 2,
  "answerValue": 2,
  "answerBBox": [0,0,0,0],
  "stimulusBBoxes": [],
  "difficulty": "baseline",
  "notes": ""
}
```

Reasoning fixtures may include:

```json
{
  "statementImage": "...",
  "statementText": "...",
  "questionImage": "...",
  "questionText": "...",
  "answerId": 0
}
```

---

# 3. Initial observed fixtures

## Reasoning

```text
R-001
Statement:
Manuel no es tan organizado(-a) como Marcos.
Question:
Quién es menos caótico(-a)?
Options:
Manuel | Marcos
```

```text
R-002
Statement:
Carlos es más distraído(-a) que Eva.
Question:
Quién es menos atento(-a)?
Options:
Eva | Carlos
```

## Perceptual

```text
PS-001
Top:
j r l g
Bottom:
J P L J
Answer:
2
```

```text
PS-002
Top:
C e g o
Bottom:
C E G O
Answer:
4
```

## Numeric

```text
N-001
Options:
17 | 9 | 12
Answer:
17
```

```text
N-002
Options:
54 | 24 | 4
Answer:
54
```

## Word Meaning

```text
W-001
Options:
Tallar | Intruso | Indiscreto
Observed answer:
Tallar
```

```text
W-002
Options:
Indiscreto | Abrigo | Curioso
Observed answer:
Abrigo
```

## Spatial

```text
S-001
Two squares, two glyphs per square.
Observed result:
2
```

```text
S-002
Two squares, two glyphs per square.
Observed result:
1
```

The actual supplied screenshots should be stored as immutable visual fixtures where licensing/authorization permits.

---

# 4. Dataset augmentation

For visual robustness create controlled variants:

- scale;
- slight perspective;
- rotation of camera;
- brightness;
- contrast;
- blur;
- compression;
- subpixel rendering;
- screen glare simulation;
- crop offset;
- monitor distance.

Do not change the semantic ground truth.

---

# 5. Adversarial sets

Every solver needs:

```text
baseline
OCR-noise
low-contrast
perspective
blur
near-boundary
ambiguous
state-transition
```

Spatial additionally:

```text
rotation
mirror
mirror+rotation
similar glyph
different angle
```

---

# 6. Data hygiene

Never:

- overwrite canonical fixtures;
- delete failures to improve scores;
- mix generated and canonical fixtures without labels;
- store private real-test content;
- commit raw personal camera footage.

Every fixture must be traceable to a source or generation procedure.
