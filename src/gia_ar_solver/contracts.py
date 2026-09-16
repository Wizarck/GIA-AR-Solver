"""Common contracts shared by every solver (solver-specification.md §1).

Solver contracts are screen-space based: a solver receives a parsed task
(structured data extracted from the rectified screen) and returns the visible
answer option identity plus diagnostics. OCR/screen detection plug in upstream
as parsers producing these task objects.
"""

from __future__ import annotations

import time
from dataclasses import dataclass, field
from enum import Enum
from typing import Any


class TaskType(str, Enum):
    """The five observed GIA modules (problem-taxonomy.md)."""

    REASONING = "reasoning"
    PERCEPTUAL_SPEED = "perceptual_speed"
    NUMBER_SPEED = "number_speed"
    WORD_MEANING = "word_meaning"
    SPATIAL_VISUALISATION = "spatial_visualisation"


class ModuleState(str, Enum):
    """Common module lifecycle states (master prompt §6).

    The exact state machine may grow module-specific states; these are the
    shared vocabulary used by the future state detector (GIA-013).
    """

    UNKNOWN = "UNKNOWN"
    MODULE_INSTRUCTIONS = "MODULE_INSTRUCTIONS"
    READY = "READY"
    QUESTION = "QUESTION"
    TRANSITION = "TRANSITION"
    ANSWER_STATE = "ANSWER_STATE"
    COMPLETED = "COMPLETED"


QUESTION_STATES = frozenset({ModuleState.QUESTION, ModuleState.ANSWER_STATE})
ANSWER_STATES = frozenset({ModuleState.ANSWER_STATE})


@dataclass(frozen=True)
class BoundingBox:
    """Normalized screen-space box [x, y, w, h], each component in 0..1."""

    x: float
    y: float
    w: float
    h: float

    def as_list(self) -> list[float]:
        return [self.x, self.y, self.w, self.h]


@dataclass(frozen=True)
class Option:
    """One visible answer option. ``index`` is the solver-facing identity."""

    index: int
    text: str | None = None
    bbox: BoundingBox | None = None


@dataclass(frozen=True)
class Relation:
    """Reasoning comparative relation (problem-taxonomy.md §2)."""

    subject: str
    dimension: str
    relation: str  # "LT" | "GT" | "EQ"
    object: str


@dataclass
class SolverResult:
    """Common solver contract (solver-specification.md §1).

    ``answer_id`` identifies the actual visible answer option (its index in
    the option list), which is what AR localization needs.
    """

    task_type: TaskType
    problem_family: str
    solved: bool = False
    answer_id: int | str | None = None
    confidence: float = 0.0
    latency_ms: float = 0.0
    answer_bbox: BoundingBox | None = None
    parser_confidence: float | None = None
    solver_confidence: float | None = None
    fallback_used: bool = False
    diagnostics: dict[str, Any] = field(default_factory=dict)

    @staticmethod
    def now_ms() -> float:
        return time.perf_counter() * 1000.0
