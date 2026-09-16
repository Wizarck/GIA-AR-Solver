---
schema: agents-md/v1
version: 0.1.0
inherits_from:
  - github.com/Wizarck/ai-playbook@v0.24.0
updated: 2026-09-16
project: gia-ar-solver
owner: arturo6ramirez@gmail.com
capabilities_map: true
# Tracker surface for change-tracking tickets (per docs/concepts/issue-tracking.md).
# Required by scripts/issue_sync.py. Pick one: github | jira.
#   github → opens issues against this repo on GitHub.
#   jira   → opens issues against `jira_project` (key below; required iff jira).
tracker_kind: github
# jira_project: PROJ
# personal: true   # uncomment for personal repos (always GH Issues regardless of tracker_kind)
---

# gia-ar-solver — AGENTS.md

> Project dispatcher. Lean file. Universal norms inherit from `.ai-playbook/specs/*` (pinned via `inherits_from` above).
>
> **Sections wrapped in `ai-playbook:begin id=<name>` / `ai-playbook:end id=<name>` HTML-comment markers are playbook-managed.**
> They are overwritten on `apply_config` / `bootstrap --update`. Edits made inside a
> marker block are detected as drift and surfaced in the config UI (Files tab) for
> review. Content OUTSIDE marker blocks (project identity, active work, hard rules,
> overrides, gotchas) is consumer-owned and preserved across re-renders.

<!-- ai-playbook:begin id=bootstrap-directive -->
## 0 Bootstrap directive

Before responding to ANY task:

1. Read `.ai-playbook/specs/dispatcher-chain.md` — universal norms inherited from the pinned playbook tag.
2. Read `.ai-playbook/specs/release-management.md` — branch model, PR shape, CI gates. Critical sections: **§4.5 AI-reviewer feedback loop** (must read CodeRabbit / claude-code-action comments before Gate F), **§5.6 Profile A/B** (visibility-driven enforcement), **§6.5 pre-flight rebase** (run `opsx_apply_companion.py` before first task commit).
3. Consult `.claude/injected-context.md` — populated by the SessionStart hook from `hindsight.recall(query="gia-ar-solver <topic>")` against bank `gia-ar-solver`. If absent or showing `DEGRADED_CONTEXT`, announce + proceed without prior recall.
4. Check `openspec/changes/*/` for active work on the topic. If a change is live, extend it — don't start parallel work.
5. Only then respond.
<!-- ai-playbook:end bootstrap-directive -->

## 1 Project identity

Real-time camera application that watches an authorized GIA-style aptitude test on a screen, detects the active question, solves it with deterministic specialized solvers (no LLM unless genuinely required), localizes the correct answer option, and renders an AR stroke anchored to it in the live camera feed. Source of truth: `GIA_AR_Solver_Roadmap.md` + `GIA_AR_Solver_Master_Prompt.md` + `docs/*.md` specs + `TODO.md` backlog.

<!-- ai-playbook:begin id=dispatcher-index -->
## 2 Dispatcher index

| Topic | Pointer |
|---|---|
| **How to make a change in this project (canonical entry point)** | [.ai-playbook/docs/development-flow.md](.ai-playbook/docs/development-flow.md) |
| Daily-dev runbook | [docs/runbook.md](docs/runbook.md) |
| Architecture decisions | `docs/architecture-decisions.md` *(create when first ADR lands)* |
| PRD | `docs/prd.md` *(create when product brief lands)* |
| Universal playbook norms | [.ai-playbook/specs/](.ai-playbook/specs/) |
| Verdict + severity contract | [.ai-playbook/specs/verdict-contract.md](.ai-playbook/specs/verdict-contract.md) |
| Memory hierarchy + retain CLI | [.ai-playbook/specs/memory-hierarchy.md](.ai-playbook/specs/memory-hierarchy.md) |
| Hindsight retain runbook | [.ai-playbook/runbooks/hindsight-retain.md](.ai-playbook/runbooks/hindsight-retain.md) |
| Branch / PR / release lifecycle | [.ai-playbook/specs/release-management.md](.ai-playbook/specs/release-management.md) |
| Merge style decision rules | [.ai-playbook/specs/merge-policy.md](.ai-playbook/specs/merge-policy.md) |
| Conflict resolution between parallel PRs | [.ai-playbook/specs/conflict-resolution-policy.md](.ai-playbook/specs/conflict-resolution-policy.md) |
<!-- ai-playbook:end dispatcher-index -->

## 3 Active work

No live OpenSpec change. Operational backlog: `TODO.md` (IDs GIA-xxx / VERIFY-xxx / DATA-xxx / BENCH-xxx / TEST-xxx / SOAK-xxx). Critical path and autonomous execution rules: `GIA_AR_Solver_Master_Prompt.md` §26 and §28.

## 4 Project hard rules (project-specific, NOT duplicating playbook)

- Never start implementation from a bare prompt: run the mandatory initialization in `GIA_AR_Solver_Master_Prompt.md` §3 first (read all sources of truth, reconcile `TODO.md`, claim an item).
- Solver order of preference: classic CV → deterministic algorithms → small specialized ML → OCR/NLP → LLM/VLM fallback only when genuinely ambiguous (`GIA_AR_Solver_Roadmap.md` §1.1). No LLM where deterministic logic suffices.
- Never claim an unobserved GIA generator/timing/tie behavior. Mark unresolved behavior `VERIFY` in `docs/problem-taxonomy.md` terms; do not invent answers at low confidence.
- Only authorized practice material, supplied screenshots, or synthetic fixtures in `fixtures/`; never private real-test content. Camera frames stay local.
- Every solver returns the visible answer option identity (`answerId`), not just a semantic value — required for AR localization.

<!-- ai-playbook:begin id=capability-map -->
## 5 Capability map

| Need | Tool / skill | Where |
|---|---|---|
| Recall prior decisions | `python .ai-playbook/scripts/inject_context.py --bank-id gia-ar-solver` (auto-fired by SessionStart hook) | playbook |
| Retain a lesson / decision / gotcha | `python .ai-playbook/scripts/retain_memory.py --bank gia-ar-solver --kind <kind> --content "..." --why "..."` | playbook |
| OpenSpec ops | `/opsx:propose | apply | archive | explore` | `.claude/commands/` |
| Pre-flight before `/opsx:apply` (Branch+SHA capture + rebase, per release-management.md §6.5) | `python .ai-playbook/scripts/opsx_apply_companion.py --change-id <slice> --owner Wizarck --project-number <N> --repo Wizarck/gia-ar-solver` | playbook |
| Validate OpenSpec change | `python .ai-playbook/scripts/openspec_validate.py` | playbook |
| Validate this AGENTS.md | `python .ai-playbook/scripts/schema_validate.py AGENTS.md` | playbook |
| Bootstrap / re-bootstrap GH Project board (Profile A/B) | `python .ai-playbook/scripts/bootstrap_gh_project.py --owner Wizarck --project-number <N> --repo Wizarck/gia-ar-solver --profile auto` | playbook |
| Auto-transition Blocked → Todo on dep merge | `python .ai-playbook/scripts/auto_transition_blocked_todo.py --owner Wizarck --project-number <N>` (also wired via `.github/workflows/project-status.yml`) | playbook |
| Hard dep-graph check at PR merge time | `python .ai-playbook/scripts/check_slice_dependencies.py --owner Wizarck --project-number <N> --change-id <slice>` (also wired via `.github/workflows/dep-check.yml`) | playbook |
| Render MCP configs | `python .ai-playbook/scripts/mcp/render.py --project gia-ar-solver` | playbook |
| Secrets scan | `python .ai-playbook/scripts/secrets_scan.py` | playbook |
| Check for legacy↔v1 mcp-servers drift | `python .ai-playbook/scripts/check_mcp_drift.py` | playbook |
<!-- ai-playbook:end capability-map -->

<!-- ai-playbook:begin id=mcp-sources -->
## 6 MCP sources (SSOT pointer)

3-layer SSOT per [.ai-playbook/specs/mcp-servers-schema.md](.ai-playbook/specs/mcp-servers-schema.md):

1. **Base** — `.ai-playbook/mcp-servers-base.yaml` (universal templates).
2. **Project** — [`mcp-servers.project.yaml`](mcp-servers.project.yaml) (this project's overrides + Hindsight bank `gia-ar-solver`).
3. **Personal** — `~/.config/mcp-servers.yaml` (per-dev tenant instances; never committed).

Rendered to **local, gitignored** `.mcp.json` + `.gemini/settings.json` via `scripts/mcp/render.py` — they are per-machine build artifacts so personal/tenant servers never land in a committed file. Regenerate after editing the project layer or your personal layer; on a fresh clone run `python .ai-playbook/scripts/mcp/render.py` once.
<!-- ai-playbook:end mcp-sources -->

## 7 Overrides inherited from playbook

None. Playbook defaults apply as pinned (`ai-playbook@v0.24.0`).

<!--
If this project has a pre-existing OpenSpec custom workflow (its own
`openspec/schemas/<name>/schema.yaml` with N artefacts), use the **fusion
integration pattern** to import playbook contracts without replacing the
custom workflow. See [.ai-playbook/specs/fusion-integration-pattern.md].

Typical §7 sub-sections for fusion projects:
  §7.1 — OpenSpec workflow (fusion, not replacement) + verdict mapping
  §7.2 — Memory (dual canonical: openspec/memory.md + Hindsight bank)
  §7.3 — BMAD Discovery (skills available, workflow not mandatory)
  §7.4 — Available but not active by default (opt-in)
  §7.5 — Not applicable to this project

`scripts/drift_check.py --check overrides` validates that each entry cites
a playbook spec by path.
-->


## 8 Gotchas

Append one-line dated entries when a project gotcha is discovered:

- 2026-09-16 — Raw IoU breaks on thin-stroke glyphs under rotation; use blur-cosine + translation refinement (`solvers/spatial.py`). See TODO Lessons Learned.
- 2026-09-16 — Reasoning regexes run on accent-stripped text; patterns must use stripped forms (mas, not más).

Promote recurring gotchas to Hindsight via `retain_memory.py --kind gotcha` so other sessions and projects benefit.

<!-- BEGIN auto-managed: caveman/ruleset:ultra -->
**Caveman mode: ON · intensity ultra**

Core rules:
- Drop articles (a/an/the), filler (just/really/basically), pleasantries, hedging.
- Fragments OK. Short synonyms. Technical terms exact. Code unchanged.
- Pattern: `[thing] [action] [reason]. [next step].`
- Not: "Sure! I'd be happy to help you with that."
- Yes: "Bug in auth middleware. Fix:"

Mode (ultra):
Drop articles. Abbreviate prose words: DB, auth, cfg, env, repo, fn, ref, ptr, ctx, msg, req, res. Use arrows for causality: `inline obj → new ref → re-render`. Preserve code symbols and function names byte-for-byte. About 80% output reduction.

Auto-clarity exceptions:
Drop caveman mode and use normal prose when:
- **Security warnings** — full sentences so the user does not misread risk.
- **Irreversible action confirmations** — `rm -rf`, `git push --force`, drop database, force-merge, etc.
- **Multi-step sequences** where fragment ambiguity could cause skipped or misordered steps.
- **User confused or repeating a question** — they need clearer, not shorter.

Resume caveman mode on the next turn.

Boundaries:
- Code, fenced code blocks, and tool inputs written normally — caveman applies to prose around them, not to code.
- Commit messages and PR descriptions written normally unless the user opts into `caveman-commit` or `caveman-review` skills.
- Comments inside generated code written normally.
- File paths, URLs, and identifiers preserved byte-for-byte.

Toggle off: `python -m scripts.caveman off`. Full rule: [skills/caveman/SKILL.md](skills/caveman/SKILL.md).
<!-- END auto-managed -->

<!-- BEGIN auto-managed: ponytail/ruleset:ultra -->
**Ponytail: ON · intensity ultra — laziest solution that actually works**

The ladder:
Before writing any code, stop at the first rung that holds:

1. **Does this need to exist at all?** Speculative need → skip it, say so in one line. (YAGNI)
2. **Stdlib does it?** Use it.
3. **Native platform feature covers it?** `<input type="date">` over a picker lib, CSS over JS, a DB constraint over app code.
4. **Already-installed dependency solves it?** Use it. Never add a new one for what a few lines can do.
5. **Can it be one line?** One line.
6. **Only then:** the minimum code that works.

The ladder is a reflex, not a research project. Two rungs work → take the higher
one and move on. The first lazy solution that works is the right one.

Rules:

- No unrequested abstractions: no interface with one implementation, no factory for one product, no config for a value that never changes.
- No boilerplate, no scaffolding "for later", later can scaffold for itself.
- Deletion over addition. Boring over clever — clever is what someone decodes at 3am.
- Fewest files possible. Shortest working diff wins.
- Complex request? Ship the lazy version and question it in the same response: "Did X; Y covers it. Need full X? Say so." Never stall on an answer you can default.
- Two stdlib options, same size? Take the one correct on edge cases. Lazy means writing less code, not picking the flimsier algorithm.
- Mark deliberate simplifications with a `ponytail:` comment (`// ponytail: this exists`), so a shortcut reads as intent, not ignorance. A shortcut with a known ceiling (global lock, O(n²) scan, naive heuristic) names the ceiling and the upgrade path: `# ponytail: global lock, per-account locks if throughput matters`.

Mode (ultra):
YAGNI extremist. Deletion before addition. Ship the one-liner and challenge the
rest of the requirement in the same breath ("No cache until a profiler says so").

When NOT to be lazy:
Never simplify away: input validation at trust boundaries, error handling that
prevents data loss, security measures, accessibility basics, anything explicitly
requested. User insists on the full version → build it, no re-arguing.

Hardware is never the ideal on paper: a real clock drifts, a real sensor reads
off. Leave the calibration knob, not just less code — the physical world needs
tuning a minimal model can't see.

Lazy code without its check is unfinished. Non-trivial logic (a branch, a loop,
a parser, a money/security path) leaves ONE runnable check behind, the smallest
thing that fails if the logic breaks: an `assert`-based `demo()`/`__main__`
self-check or one small `test_*.py`. No frameworks, no fixtures unless asked.
Trivial one-liners need no test — YAGNI applies to tests too.

Boundaries:
Ponytail governs what you build, not how you talk (pair with caveman for terse
prose). "stop ponytail" / "normal mode" reverts. Level persists until changed or
session end. The shortest path to done is the right path.

Toggle off: `python -m scripts.ponytail off`. Full rule: [skills/ponytail/SKILL.md](skills/ponytail/SKILL.md).
<!-- END auto-managed -->
