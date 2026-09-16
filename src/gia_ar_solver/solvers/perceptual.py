"""Perceptual Speed solver (solver-specification.md §3).

Count the columns whose top and bottom glyphs are the same letter ignoring
case. Observed layout: 4 columns × 2 rows, answer range 0..4. Layout
variation is VERIFY (TODO VERIFY-004): unexpected column counts or answer
indices outside the visible options are reported unsolved.
"""

from __future__ import annotations

from gia_ar_solver.contracts import SolverResult, TaskType
from gia_ar_solver.solvers.base import PerceptualTask, Solver

OBSERVED_COLUMNS = 4


class PerceptualSolver(Solver):
    task_type = TaskType.PERCEPTUAL_SPEED
    problem_family = "P1"

    def solve(self, task: PerceptualTask) -> SolverResult:
        start = self._start()
        result = SolverResult(
            task_type=self.task_type,
            problem_family=self.problem_family,
            parser_confidence=1.0,
        )

        if len(task.columns) != OBSERVED_COLUMNS:
            result.diagnostics["verify"] = "VERIFY-004 layout variation"
            result.diagnostics["columns_seen"] = len(task.columns)
            result.latency_ms = self._start() - start
            return result

        comparisons = [
            {"top": top, "bottom": bottom, "match": top.casefold() == bottom.casefold()}
            for top, bottom in task.columns
        ]
        count = sum(1 for c in comparisons if c["match"])

        by_index = {opt.index for opt in task.options}
        if count not in by_index:
            result.solved = False
            result.diagnostics["count"] = count
            result.diagnostics["error"] = "count not present among visible options"
            result.latency_ms = self._start() - start
            return result

        option = next(opt for opt in task.options if opt.index == count)
        result.solved = True
        result.answer_id = option.index
        result.solver_confidence = 1.0
        result.confidence = 1.0
        result.answer_bbox = option.bbox
        result.diagnostics.update(
            {"comparisons": comparisons, "matches": count, "confidence_calibrated": False}
        )
        result.latency_ms = self._start() - start
        return result


__all__ = ["PerceptualSolver"]
