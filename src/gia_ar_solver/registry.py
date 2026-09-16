"""Solver registry / family dispatch (problem-taxonomy.md §7)."""

from __future__ import annotations

from gia_ar_solver.contracts import TaskType
from gia_ar_solver.solvers.base import Solver

_REGISTRY: dict[TaskType, Solver] = {}


def register(solver: Solver) -> Solver:
    """Register a solver instance for its declared task type (idempotent)."""
    existing = _REGISTRY.get(solver.task_type)
    if existing is not None and existing is not solver:
        raise ValueError(f"solver already registered for {solver.task_type}")
    _REGISTRY[solver.task_type] = solver
    return solver


def get_solver(task_type: TaskType) -> Solver:
    try:
        return _REGISTRY[task_type]
    except KeyError as exc:  # pragma: no cover - defensive
        raise LookupError(f"no solver registered for {task_type}") from exc


def registered_families() -> dict[TaskType, Solver]:
    return dict(_REGISTRY)


def load_default_solvers() -> None:
    """Register the built-in deterministic solvers (idempotent, replaces)."""
    from gia_ar_solver.solvers.numeric import NumericSolver
    from gia_ar_solver.solvers.perceptual import PerceptualSolver
    from gia_ar_solver.solvers.reasoning import ReasoningSolver
    from gia_ar_solver.solvers.spatial import SpatialSolver
    from gia_ar_solver.solvers.word_meaning import WordMeaningSolver

    for solver in (
        SpatialSolver(),
        PerceptualSolver(),
        NumericSolver(),
        ReasoningSolver(),
        WordMeaningSolver(),
    ):
        _REGISTRY[solver.task_type] = solver
