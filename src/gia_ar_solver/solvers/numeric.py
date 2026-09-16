"""Number Speed & Accuracy solver (solver-specification.md §4).

answer = the option whose distance to the median of the three values is
largest. Original visual option order is preserved for localization.
Duplicate/tie behaviour is VERIFY (TODO VERIFY-006): a tie is reported as
unsolved rather than guessed.
"""

from __future__ import annotations

from gia_ar_solver.contracts import SolverResult, TaskType
from gia_ar_solver.solvers.base import NumericTask, Solver


class NumericSolver(Solver):
    task_type = TaskType.NUMBER_SPEED
    problem_family = "N1"

    def solve(self, task: NumericTask) -> SolverResult:
        start = self._start()
        result = SolverResult(
            task_type=self.task_type,
            problem_family=self.problem_family,
            parser_confidence=1.0,
        )

        values = task.values
        if len(values) != 3 or len(task.options) != 3:
            result.diagnostics["error"] = "expected exactly 3 numeric options"
            result.latency_ms = self._start() - start
            return result

        median = sorted(values)[1]
        distances = [abs(v - median) for v in values]
        best = max(range(3), key=lambda i: distances[i])
        ties = [i for i, d in enumerate(distances) if d == distances[best]]

        if len(ties) > 1:
            # VERIFY-006: tie behaviour unobserved — refuse to guess.
            result.diagnostics["verify"] = "VERIFY-006 tie/duplicate behaviour"
            result.diagnostics["distances"] = distances
            result.latency_ms = self._start() - start
            return result

        option = task.options[best]
        result.solved = True
        result.answer_id = option.index
        result.solver_confidence = 1.0
        result.confidence = 1.0
        result.answer_bbox = option.bbox
        result.diagnostics.update(
            {
                "values": values,
                "median": median,
                "distances": distances,
                "confidence_calibrated": False,
            }
        )
        result.latency_ms = self._start() - start
        return result


__all__ = ["NumericSolver"]
