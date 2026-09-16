"""Word Meaning solver (solver-specification.md §5, problem-taxonomy.md §5).

Semantic odd-one-out: find the strongest coherent pair among the three words
and select the remaining one as the intruder.

Cascade (per spec): lexical relation checks first, semantic scoring second,
VLM/LLM fallback only for genuine ambiguity. This module implements the
lexical layer with a documented category lexicon; the embedding layer and the
VLM fallback are advisory hand-offs (TODO VERIFY-007/VERIFY-008) and are
flagged, never guessed.
"""

from __future__ import annotations

import unicodedata

from gia_ar_solver.contracts import SolverResult, TaskType
from gia_ar_solver.solvers.base import Solver, WordMeaningTask

# Seed lexicon for the lexical relation layer. Categories are semantic
# relationship classes, deliberately broader than synonymy (W1/W2 observed:
# person-trait descriptors vs objects vs actions).
WORD_LEXICON: dict[str, str] = {
    # person-trait descriptors
    "intruso": "person_trait",
    "indiscreto": "person_trait",
    "curioso": "person_trait",
    # objects
    "abrigo": "object",
    # actions
    "tallar": "action",
}


def _norm(word: str) -> str:
    word = unicodedata.normalize("NFD", word.strip().lower())
    return "".join(ch for ch in word if unicodedata.category(ch) != "Mn")


class WordMeaningSolver(Solver):
    task_type = TaskType.WORD_MEANING
    problem_family = "W1"

    def solve(self, task: WordMeaningTask) -> SolverResult:
        start = self._start()
        result = SolverResult(
            task_type=self.task_type,
            problem_family=self.problem_family,
        )

        if len(task.words) != 3 or len(task.options) != 3:
            result.diagnostics["error"] = "expected exactly 3 word options"
            result.latency_ms = self._start() - start
            return result

        categories = [_norm(w) for w in task.words]
        labels = [WORD_LEXICON.get(c) for c in categories]

        if any(label is None for label in labels):
            unknown = [w for w, label in zip(task.words, labels) if label is None]
            result.diagnostics["error"] = f"words outside lexicon: {unknown}"
            result.diagnostics["verify"] = "VERIFY-007/008 relationship taxonomy"
            result.fallback_used = True
            result.latency_ms = self._start() - start
            return result

        # Pairwise relation scoring: a pair is coherent when both words share
        # a category. Decide the pair with the strongest coherent relation.
        pairs = [(0, 1), (0, 2), (1, 2)]
        scored = []
        for i, j in pairs:
            related = labels[i] == labels[j]
            scored.append(
                {
                    "relatedPair": [i, j],
                    "category": labels[i],
                    "related": related,
                }
            )
        coherent = [s for s in scored if s["related"]]

        if len(coherent) == 1:
            pair = coherent[0]["relatedPair"]
            odd_index = ({0, 1, 2} - set(pair)).pop()
        else:
            # 0 coherent (all distinct categories) or 3 (all same category —
            # the intruder then requires semantic, not categorical, scoring):
            # ambiguous at the lexical layer → fallback flag, never a guess.
            result.diagnostics["error"] = "no unique coherent pair"
            result.diagnostics["pairs"] = scored
            result.fallback_used = True
            result.latency_ms = self._start() - start
            return result

        option = task.options[odd_index]
        result.solved = True
        result.answer_id = option.index
        # Margin-based confidence: unique coherent pair vs alternatives.
        result.solver_confidence = 1.0
        result.confidence = 1.0
        result.answer_bbox = option.bbox
        result.diagnostics.update(
            {
                "labels": dict(zip(task.words, labels)),
                "pairs": scored,
                "odd_index": odd_index,
                "confidence_calibrated": False,
            }
        )
        result.latency_ms = self._start() - start
        return result


__all__ = ["WordMeaningSolver", "WORD_LEXICON"]
