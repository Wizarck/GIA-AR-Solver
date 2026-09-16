"""Reasoning solver (solver-specification.md §2, problem-taxonomy.md §2).

Deterministic symbolic pipeline:

    statement text → relation extraction → persistent ordering per dimension
    question text  → query trait + polarity → select candidate → option index

Comparative language and polarity are normalized through a trait lexicon that
maps each surface adjective to a canonical dimension and sign:

    "Manuel no es tan organizado como Marcos."   → Manuel LT organization Marcos
    "¿Quién es menos caótico?"                   → argmin(-organization) = argmax(organization)

Transitive chains (R4) are supported through constraint composition.
Vocabulary outside the lexicon resolves to unsolved + fallback flag — never a
guess. LLM/VLM fallback is out of scope here (advisory, GIA-008 handoff).
"""

from __future__ import annotations

import re
import unicodedata

from gia_ar_solver.contracts import Relation, SolverResult, TaskType
from gia_ar_solver.solvers.base import ReasoningTask, Solver

# Canonical dimension, sign (+1 trait means "more of the dimension").
# Observed vocabulary (problem-taxonomy.md R5) plus immediate near-synonyms.
TRAIT_LEXICON: dict[str, tuple[str, int]] = {
    "organizado": ("organization", +1),
    "ordenado": ("organization", +1),
    "caotico": ("organization", -1),
    "desordenado": ("organization", -1),
    "atento": ("attention", +1),
    "distraido": ("attention", -1),
    "desatento": ("attention", -1),
}

_STATEMENT_PATTERNS = [
    # X no es tan ADJ como Y  → strict less-than on ADJ
    re.compile(r"^(?P<subj>\w+)\s+no\s+es\s+tan\s+(?P<adj>[\w\-]+)\s+como\s+(?P<obj>\w+)", re.I),
    # X es mas ADJ que Y → greater-than; X es menos ADJ que Y → less-than
    # (patterns match accent-stripped text — see _norm)
    re.compile(r"^(?P<subj>\w+)\s+es\s+(?P<pol>mas|menos)\s+(?P<adj>[\w\-]+)\s+que\s+(?P<obj>\w+)", re.I),
    # X es tan ADJ como Y → equal
    re.compile(r"^(?P<subj>\w+)\s+es\s+tan\s+(?P<adj>[\w\-]+)\s+como\s+(?P<obj>\w+)", re.I),
]
_QUESTION_RE = re.compile(r"^\??\s*quien(es)?\s+(?P<neg>no\s+)?es\s+(?P<pol>mas|menos)\s+(?P<adj>[\w\-]+)", re.I)


def _strip_accents(text: str) -> str:
    return "".join(
        ch for ch in unicodedata.normalize("NFD", text) if unicodedata.category(ch) != "Mn"
    )


def _norm(word: str) -> str:
    """Lowercase, strip accents and the observed '(‑a)' gender markers."""
    word = word.strip().lower().replace("(-a)", "").replace("(a)", "")
    return _strip_accents(word)


def parse_statement(text: str) -> list[Relation]:
    """Extract comparative relations from one or more statement sentences.

    Multiple sentences compose transitively (taxonomy R4, VERIFY): e.g.
    "Ana es más organizada que Beto. Beto es más organizado que Carla."
    """
    relations: list[Relation] = []
    for sentence in re.split(r"[.\n]", text):
        normalized = _norm(sentence)
        for pattern in _STATEMENT_PATTERNS:
            match = pattern.match(normalized)
            if not match:
                continue
            subject = match.group("subj").capitalize()
            obj = match.group("obj").capitalize()
            adj = _norm(match.group("adj"))
            if pattern is _STATEMENT_PATTERNS[0]:
                relation = "LT"
            elif "pol" in match.groupdict() and match.group("pol"):
                relation = "GT" if _norm(match.group("pol")) == "mas" else "LT"
            else:
                relation = "EQ"
            relations.append(Relation(subject=subject, dimension=adj, relation=relation, object=obj))
            break
    return relations


def parse_question(text: str) -> tuple[str, int, bool] | None:
    """Extract (surface trait, want_max, negated) from a question sentence."""
    match = _QUESTION_RE.match(_norm(text))
    if not match:
        return None
    want_max = _norm(match.group("pol")) == "mas"
    negated = bool(match.group("neg"))
    if negated:
        want_max = not want_max
    return _norm(match.group("adj")), want_max, negated


def _trait_lookup(surface: str) -> tuple[str, int] | None:
    return TRAIT_LEXICON.get(_norm(surface))


def _resolve_ordering(relations: list[Relation]) -> dict[str, dict[str, int]]:
    """Compose relations into per-dimension canonical ranks.

    Returns {dimension: {name: rank}} where higher rank = more of the
    dimension. Chains (A<B, B<C) compose transitively via longest-path.
    """
    constraints: dict[str, list[tuple[str, str]]] = {}  # dim → [(lower, higher)]
    equal_groups: dict[str, list[list[str]]] = {}

    for rel in relations:
        trait = _trait_lookup(rel.dimension)
        if trait is None:
            continue
        dim, sign = trait
        if rel.relation == "EQ":
            equal_groups.setdefault(dim, []).append((rel.subject, rel.object))
            continue
        lower, higher = (rel.object, rel.subject) if sign * (1 if rel.relation == "GT" else -1) > 0 else (rel.subject, rel.object)
        # sign=+1: GT means subject has more; sign=-1 flips both directions.
        constraints.setdefault(dim, []).append((lower, higher))

    ranks: dict[str, dict[str, int]] = {}
    names = {n for rel in relations for n in (rel.subject, rel.object)}
    for dim, edges in constraints.items():
        rank: dict[str, int] = {n: 0 for n in names}
        # Bellman-Ford style longest path over ≤ len(names) passes.
        for _ in range(len(names)):
            changed = False
            for low, high in edges:
                if rank[high] <= rank[low]:
                    rank[high] = rank[low] + 1
                    changed = True
            if not changed:
                break
        for group_pairs in equal_groups.get(dim, []):
            names_eq = {n for pair in group_pairs for n in pair}
            base = min(rank[n] for n in names_eq if n in rank)
            for n in names_eq:
                if n in rank:
                    rank[n] = base
        ranks[dim] = rank
    return ranks


def _match_option(options, name: str) -> int | None:
    for opt in options:
        if opt.text and _norm(opt.text) == _norm(name):
            return opt.index
    return None


class ReasoningSolver(Solver):
    task_type = TaskType.REASONING
    problem_family = "R1"

    def solve(self, task: ReasoningTask) -> SolverResult:
        start = self._start()
        result = SolverResult(
            task_type=self.task_type,
            problem_family=self.problem_family,
        )

        relations = parse_statement(task.statement_text)
        query = parse_question(task.question_text)
        if not relations or query is None:
            result.diagnostics["error"] = "statement or question did not parse"
            result.fallback_used = True
            result.latency_ms = self._start() - start
            return result

        surface_trait, want_max, negated = query
        trait = _trait_lookup(surface_trait)
        if trait is None:
            result.diagnostics["error"] = f"unknown question trait '{surface_trait}'"
            result.fallback_used = True
            result.latency_ms = self._start() - start
            return result

        dim_q, pol_q = trait
        ranks = _resolve_ordering(relations)
        if dim_q not in ranks:
            result.diagnostics["error"] = f"statement has no relation on dimension '{dim_q}'"
            result.fallback_used = True
            result.latency_ms = self._start() - start
            return result

        rank = ranks[dim_q]
        candidates: list[tuple[int, str]] = []
        for opt in task.options:
            if opt.text is None:
                continue
            key = _norm(opt.text)
            matched = next((n for n in rank if _norm(n) == key), None)
            if matched is None:
                continue
            # question trait sign pol_q maps canonical rank onto the asked trait
            score = pol_q * rank[matched]
            candidates.append((score, opt.text))

        if len(candidates) < 2:
            result.diagnostics["error"] = "could not map options onto statement names"
            result.fallback_used = True
            result.latency_ms = self._start() - start
            return result

        best_score = max(c[0] for c in candidates) if want_max else min(c[0] for c in candidates)
        winners = [name for score, name in candidates if score == best_score]
        if len(winners) != 1:
            result.diagnostics["error"] = "ambiguous answer (tie or equal ranks)"
            result.diagnostics["candidates"] = candidates
            result.latency_ms = self._start() - start
            return result

        answer_index = _match_option(task.options, winners[0])
        if answer_index is None:
            result.diagnostics["error"] = "winner not found among options"
            result.latency_ms = self._start() - start
            return result

        option = next(opt for opt in task.options if opt.index == answer_index)
        result.solved = True
        result.answer_id = option.index
        result.solver_confidence = 1.0
        result.confidence = 1.0
        result.answer_bbox = option.bbox
        result.diagnostics.update(
            {
                "relations": [repr(r) for r in relations],
                "question_trait": surface_trait,
                "canonical_dimension": dim_q,
                "negated_question": negated,
                "candidates": candidates,
                "confidence_calibrated": False,
            }
        )
        result.latency_ms = self._start() - start
        return result


__all__ = [
    "ReasoningSolver",
    "parse_statement",
    "parse_question",
    "TRAIT_LEXICON",
]
