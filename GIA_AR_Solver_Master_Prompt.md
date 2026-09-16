# GIA AR Solver — Autonomous Development & Execution Master Prompt

## 0. Mission

Build the **GIA AR Solver**: a real-time camera application that observes an authorized GIA-style aptitude test displayed on a monitor, detects the active test question, solves it with the appropriate specialized solver, localizes the correct answer option, and renders an AR overlay/stroke anchored to that answer while the camera feed remains live.

The system must be engineered as a production-quality computer-vision application, not as a generic LLM question-answering system.

Primary objective:

```text
LIVE CAMERA
→ SCREEN DETECTION
→ PERSPECTIVE CORRECTION
→ TEST/MODULE STATE DETECTION
→ QUESTION EXTRACTION
→ PROBLEM-FAMILY CLASSIFICATION
→ SPECIALIZED SOLVER
→ ANSWER OPTION LOCALIZATION
→ CAMERA-SPACE COORDINATE MAPPING
→ AR OVERLAY
```

The solver may run asynchronously at a lower frequency than the camera/overlay pipeline.

---

# 1. Source-of-truth hierarchy

Use these files in this order:

1. `GIA_AR_Solver_Roadmap.md`
   - architectural and strategic source of truth.
2. `docs/problem-taxonomy.md`
   - observed/verified problem structure and test-state taxonomy.
3. `docs/solver-specification.md`
   - concrete solver contracts and algorithms.
4. `docs/dataset-specification.md`
   - fixture and ground-truth rules.
5. `docs/benchmark-specification.md`
   - measurable quality and latency gates.
6. `TODO.md`
   - persistent operational execution backlog.
7. Repository code/tests/data
   - implementation truth.
8. Test and benchmark results
   - measurable correctness truth.

Never silently overwrite an authoritative source with an assumption.

When sources disagree:
- identify the discrepancy;
- preserve the documented evidence;
- create a TODO item;
- do not guess.

---

# 2. Evidence boundary

The project currently has concrete visual evidence for the five test modules from authorized project material/screenshots and the Thomas International example material.

Known modules:

- Reasoning
- Perceptual Speed
- Number Speed & Accuracy
- Word Meaning
- Spatial Visualisation

The public practice implementation is independent and must not be treated as proof of private/production GIA internals.

Do not claim that an undocumented generator rule, timing, question pool, symbol set, or tie behavior exists until observed or verified.

Use `VERIFY` for unresolved behavior.

Do not use or acquire restricted/private real-test content. Use authorized practice material, generated synthetic fixtures, or material supplied for development.

---

# 3. Mandatory initialization

Before writing or modifying implementation code, every autonomous run/agent MUST:

1. Read `GIA_AR_Solver_Roadmap.md`.
2. Read `docs/problem-taxonomy.md`.
3. Read `docs/solver-specification.md`.
4. Read `docs/dataset-specification.md`.
5. Read `docs/benchmark-specification.md`.
6. Read `TODO.md`.
7. Inspect repository structure.
8. Inspect Git status, branches and recent history.
9. Inspect existing tests.
10. Inspect benchmark fixtures/results.
11. Inspect visual-validation fixtures.
12. Reconcile TODO status with actual repository state.
13. Identify the current critical-path item.
14. Check whether another agent owns/conflicts with the intended work.
15. Only then begin implementation.

Never start coding from the user prompt alone.

---

# 4. Persistent execution backlog

`TODO.md` is the operational source of truth.

Required statuses:

- `PENDING`
- `READY`
- `IN PROGRESS`
- `BLOCKED`
- `COMPLETED`
- `DEFERRED`
- `REMOVED_WITH_REASON`

Every implementation unit must have:

- unique ID;
- objective;
- owner/agent;
- dependencies;
- acceptance criteria;
- tests required;
- benchmark impact;
- files/components affected.

No implementation before claiming the TODO item.

When work is completed, update TODO immediately.

---

# 5. Mandatory reverse-engineering principle

The solver specification is already substantially reverse-engineered.

Agents MUST NOT restart discovery from zero.

Instead:

```text
DOCUMENTED KNOWLEDGE
        ↓
VERIFY AGAINST AUTHORIZED MATERIAL
        ↓
IDENTIFY GAPS
        ↓
IMPLEMENT
```

The remaining discovery work is to verify:

- exact layouts across additional questions;
- all observed problem variants;
- timing/transition details;
- answer-box positioning variability;
- symbol/glyph variations;
- edge cases;
- generator behavior where observable.

Do not invent additional problem families.

---

# 6. Common module lifecycle

All five modules follow the observed high-level pattern:

```text
MODULE INSTRUCTIONS
        ↓
"Estoy a punto"
        ↓
LIVE QUESTION(S)
        ↓
ANSWER OPTIONS
        ↓
NEXT QUESTION
```

The instruction screen is a **module calibration/state-identification screen**, not a problem to solve.

The common state detector should recognize:

```text
UNKNOWN
MODULE_INSTRUCTIONS
READY
QUESTION
TRANSITION
ANSWER_STATE
COMPLETED
```

The exact state machine may have module-specific states.

---

# 7. Reasoning — known specification

Observed structure:

```text
INSTRUCTIONS
    ↓
STATEMENT
    ↓
"Muestra la pregunta"
    ↓
QUESTION
    ↓
TWO ANSWERS
```

Example pattern:

```text
Manuel no es tan organizado como Marcos.
```

followed by:

```text
Quién es menos caótico?
[Manuel] [Marcos]
```

Another observed pattern:

```text
Carlos es más distraído que Eva.
```

followed by:

```text
Quién es menos atento?
[Eva] [Carlos]
```

## Required architecture

```text
Statement OCR
→ semantic normalization
→ persistent StatementContext
→ detect statement/question transition
→ question OCR
→ query normalization
→ relation graph
→ answer selection
→ answer localization
```

The statement MUST survive the visual transition.

## Representation

```json
{
  "subject": "Manuel",
  "dimension": "organization",
  "relation": "LT",
  "object": "Marcos"
}
```

Normalize comparative language and polarity.

Explicitly test:

- direct comparison;
- inverse question;
- negation;
- transitive chains;
- vocabulary variation;
- OCR errors;
- statement/question transition.

Do not send the whole task to an LLM by default.

Use deterministic symbolic reasoning first. Use a semantic/VLM fallback only when evidence is genuinely ambiguous.

---

# 8. Perceptual Speed — known specification

Observed structure:

```text
QUESTION
"Cuántas columnas tienen la misma letra?"

4 columns × 2 rows

j   r   l   g
J   P   L   J

[0] [1] [2] [3] [4]
```

Another observed example:

```text
C   e   g   o
C   E   G   O
```

The operation is:

```text
for each of 4 columns:
    normalize case
    compare top glyph and bottom glyph
count matches
```

Output range:

```text
0..4
```

Preferred architecture:

```text
grid detection
→ 4 column regions
→ glyph extraction
→ constrained glyph classifier/OCR
→ case normalization
→ equality
→ count
→ answer localization
```

Generic OCR is only a baseline. A constrained glyph classifier is preferred if it improves speed/accuracy.

No LLM.

---

# 9. Number Speed & Accuracy — known specification

Observed structure:

```text
QUESTION
"Qué número está más alejado de la mediana?"

[17] [9] [12]
```

and:

```text
[54] [24] [4]
```

Algorithm:

```text
read a,b,c
median = middle(sorted(a,b,c))
d(a) = abs(a - median)
d(b) = abs(b - median)
d(c) = abs(c - median)
answer = argmax(d(a), d(b), d(c))
```

The original visual order must be preserved for answer localization.

Do not assume tie/duplicate behavior until verified.

Preferred architecture:

```text
3 option-region detection
→ number recognition
→ deterministic arithmetic
→ answer option index
→ answer localization
```

No LLM.

---

# 10. Word Meaning — known specification

Observed structure:

```text
INSTRUCTIONS
    ↓
QUESTION
"Qué palabra no es adecuada?"
    ↓
THREE WORDS
```

Observed examples include:

```text
Tallar | Intruso | Indiscreto
```

and:

```text
Indiscreto | Abrigo | Curioso
```

The task is an odd-one-out semantic problem: identify the word that does not form a coherent semantic relationship with the other two.

Do NOT hard-code a single relationship such as synonym.

Potential relationship classes must be verified against additional authorized examples:

- synonym;
- antonym;
- same category;
- semantic association;
- other coherent relationship.

Preferred cascade:

```text
OCR
→ lexical normalization
→ lexical relation checks
→ embedding/pairwise semantic scoring
→ relation classifier if needed
→ VLM/LLM fallback only for ambiguity
→ odd-one-out
→ answer localization
```

Every decision should be auditable:

```json
{
  "relatedPair": [0,2],
  "oddIndex": 1,
  "confidence": 0.97
}
```

No invented confidence values in production; confidence must be calibrated from benchmarks.

---

# 11. Spatial Visualisation — known specification

Observed instructions:

```text
Se presentan dos cuadrados con dos letras.
Debes identificar cuántos cuadrados tienen la misma letra.

Las letras se consideran iguales si sólo difieren
en la rotación pero no si una es el reflejo de la otra.
```

Observed question structure:

```text
QUESTION
"Cuántos cuadrados tienen la misma letra?"

square 1: glyph A + glyph B
square 2: glyph C + glyph D

[0] [1] [2]
```

Important correction:

**Do not compare the two squares to each other.**

Evaluate each square independently:

```text
square_i:
    glyph_top
    glyph_bottom
        ↓
    rotation equivalence?
        ↓
    MATCH / NO MATCH
```

Then:

```text
answer = count(MATCH)
```

The solver must operate on glyph geometry, not OCR character identity.

## Required geometric test

For glyphs `A` and `B`:

```text
R = max similarity(rotate(A, θ), B)
M = max similarity(rotate(mirror(A), θ), B)
```

Classify internally:

```text
ROTATION_MATCH
MIRROR_ONLY
AMBIGUOUS
```

A mirror match is NOT a valid match.

Preferred initial implementation:

```text
square detection
→ glyph extraction
→ background removal/binarization
→ crop
→ scale normalization
→ centering
→ rotation sweep
→ similarity
→ explicit mirror comparison
→ match count
→ answer localization
```

Do not use OCR or an LLM as the primary solver.

Calibrate thresholds on labelled fixtures.

---

# 12. Common solver contract

Every solver MUST expose a common contract equivalent to:

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

A solver must return the **answer option identity/index**, not merely its semantic value.

This is essential for AR localization.

---

# 13. Screen and coordinate architecture

Separate coordinate spaces:

```text
CAMERA FRAME
      ↕
DETECTED SCREEN QUADRILATERAL
      ↕
RECTIFIED SCREEN
      ↕
QUESTION / ANSWER BBOX
      ↕
CAMERA COORDINATES
      ↓
AR OVERLAY
```

Never draw directly from rectified coordinates without applying the inverse perspective mapping.

Track:

- screen corners;
- homography;
- answer bounding box;
- confidence;
- frame timestamp;
- question fingerprint.

---

# 14. Real-time execution model

Camera preview target:

```text
30–60 FPS
```

Solver target:

```text
~5–10 FPS / event driven
```

Do not solve every frame.

Use:

```text
question fingerprint
→ cache
→ solve only on new question/state
```

Possible fingerprint components:

- perceptual hash;
- normalized question crop;
- task type;
- layout fingerprint;
- text fingerprint.

While the question remains unchanged:

```text
reuse answer
continue overlay tracking
```

Initial engineering target:

```text
new question detected
→ answer overlay
< ~300 ms
```

This is a benchmark target, not a guaranteed performance claim.

---

# 15. Dataset strategy

Do not build a dataset containing only final screenshots.

Each fixture should preserve:

- source;
- task;
- problem family;
- image;
- question state;
- statement image/text if applicable;
- ground-truth answer;
- answer option index;
- answer bounding box;
- relevant stimulus bounding boxes;
- difficulty/notes;
- expected edge-case class.

Use authorized material and synthetic fixtures.

See `docs/dataset-specification.md`.

---

# 16. Benchmark strategy

Every solver needs:

1. unit tests;
2. labelled fixture benchmark;
3. adversarial tests;
4. latency benchmark;
5. confidence calibration.

End-to-end benchmark:

```text
question appears
→ state recognized
→ parsed
→ solved
→ answer localized
→ overlay displayed
```

Track:

- solver accuracy;
- family accuracy;
- state-detection accuracy;
- OCR/glyph accuracy;
- answer localization error;
- stale-answer rate;
- missed-question rate;
- median latency;
- p95 latency;
- end-to-end latency.

See `docs/benchmark-specification.md`.

---

# 17. Visual validation

The AR UI requires image-based regression.

For each module maintain reference screenshots for:

- instructions;
- question;
- answer options;
- transition states;
- representative solved state.

Validate:

- screen quad;
- perspective correction;
- answer bbox;
- overlay position;
- overlay persistence;
- overlay movement under camera movement;
- overlay disappearance when question changes.

Do not consider a solver complete merely because its unit test returns the correct answer.

---

# 18. SOAK strategy

Run module-level and cross-pipeline SOAK tests.

Minimum areas:

- camera stability;
- screen detection;
- perspective;
- state detection;
- all five solvers;
- answer localization;
- coordinate mapping;
- tracking;
- overlay;
- question change detection;
- cross-module transitions.

Track:

- memory growth;
- CPU/GPU load;
- latency drift;
- frame drops;
- stale overlays;
- false question changes;
- accumulated coordinate drift;
- solver failures.

Destructive or synthetic test data must be isolated from canonical fixtures.

---

# 19. Multi-agent execution

Parallelize only when work is safely separable.

Good parallelization:

```text
Agent A → spatial solver
Agent B → perceptual solver
Agent C → numeric solver
Agent D → reasoning solver
Agent E → word solver
Agent F → benchmark infrastructure
Agent G → camera/screen detection
```

Each agent must have:

- explicit TODO ownership;
- isolated branch/worktree where appropriate;
- defined files/components;
- tests;
- handoff summary.

No two agents modify the same critical files concurrently without explicit coordination.

Use fan-out/fan-in:

```text
DISCOVERY / DESIGN
       ↓
parallel implementation
       ↓
integration
       ↓
global tests
       ↓
SOAK
       ↓
visual validation
```

---

# 20. Implementation loop

For every TODO item:

```text
1. Claim item
2. Read relevant specs
3. Inspect existing implementation
4. Define minimal change
5. Implement
6. Run focused tests
7. Run affected benchmark
8. Run visual validation when applicable
9. Run regression suite
10. Update TODO
11. Update documentation if behavior changed
12. Record lessons/failures
13. Handoff or merge
```

Never mark COMPLETED merely because code compiles.

---

# 21. Quality principles

Mandatory:

- YAGNI
- KISS
- DRY
- separation of concerns
- deterministic algorithms where possible
- measurable confidence
- test-first for core logic
- reproducible fixtures
- no unnecessary framework complexity
- no premature model training
- no LLM where deterministic CV/math/logic is sufficient

Technology choices must be evidence-driven.

---

# 22. Failure handling

When an agent fails:

1. capture error;
2. classify root cause;
3. check whether existing architecture/spec already solves it;
4. retry minimally;
5. avoid repeated blind retries;
6. create/update TODO if unresolved;
7. mark BLOCKED when a genuine dependency exists.

Never hide failures by weakening tests.

Never delete a failing fixture merely to make a benchmark pass.

---

# 23. Repository hygiene

Keep repository clean:

- no temporary screenshots in production paths;
- no generated junk;
- no secrets;
- no private test material;
- no abandoned branches/worktrees;
- no duplicate fixtures;
- no stale benchmark outputs committed unless explicitly required;
- no debug code left enabled.

Dataset hygiene is part of Definition of Done.

---

# 24. Privacy and security

Prefer local processing.

Do not transmit camera frames externally unless explicitly required and authorized.

Do not persist unnecessary camera footage.

Keep development fixtures free of personal/private information.

---

# 25. Human-decision queue

If an architectural or product decision cannot be resolved from source material, create:

```text
HD-XXX
Question:
Context:
Evidence:
Options:
Impact:
Recommended experiment:
```

Do not silently invent a decision.

---

# 26. Critical path

The current critical path is:

```text
Project setup
→ module/state framework
→ fixture capture
→ benchmark harness
→ solver implementations
→ camera engine
→ screen detection
→ perspective correction
→ question/state detection
→ answer localization
→ coordinate mapping
→ AR overlay
→ tracking
→ end-to-end optimization
→ SOAK
→ regression
```

Solver implementation may proceed in parallel with camera infrastructure because the solver contracts are screen-space based.

Recommended initial solver order:

```text
Spatial
→ Perceptual
→ Numeric
→ Reasoning
→ Word
```

This ordering is an engineering execution order, not a claim about the difficulty or importance of the tests.

---

# 27. Current Definition of Done

The product is not complete until:

- all five modules are recognized;
- module instruction states are handled;
- question states are detected;
- each solver passes its labelled benchmark;
- answer options are localized;
- coordinate mapping is validated;
- AR overlay is visually validated;
- question-change detection prevents stale answers;
- end-to-end latency is benchmarked;
- SOAK passes;
- regression passes;
- repository and dataset hygiene passes;
- TODO is reconciled;
- all unresolved `VERIFY` items are explicitly documented.

---

# 28. Autonomous execution rule

When the user asks the agent to continue implementation:

- inspect state;
- select the highest-priority READY item on the critical path;
- claim it;
- execute it;
- test it;
- integrate it;
- update TODO;
- continue to the next executable item.

Do not stop after producing a plan when implementation is requested.

Do not ask for confirmation for routine engineering decisions that are already covered by the specifications.

Stop only for:

- missing essential information;
- authorization/access requirements;
- genuine safety/privacy issue;
- unresolved human decision with material impact;
- blocked dependency;
- destructive action requiring explicit authorization.

The agent's objective is continuous, resumable progress while preserving correctness and repository integrity.
