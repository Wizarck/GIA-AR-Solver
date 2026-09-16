"""GIA AR Solver — deterministic solvers for GIA-style aptitude test questions."""

from gia_ar_solver.contracts import (
    ANSWER_STATES,
    QUESTION_STATES,
    BoundingBox,
    ModuleState,
    Option,
    Relation,
    SolverResult,
    TaskType,
)
from gia_ar_solver.localisation import AnswerLocalizer

__all__ = [
    "ANSWER_STATES",
    "QUESTION_STATES",
    "AnswerLocalizer",
    "BoundingBox",
    "ModuleState",
    "Option",
    "Relation",
    "SolverResult",
    "TaskType",
]
