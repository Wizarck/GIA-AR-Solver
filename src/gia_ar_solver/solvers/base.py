"""Solver base class and per-family task inputs (solver-specification.md)."""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field

import numpy as np

from gia_ar_solver.contracts import Option, Relation, SolverResult, TaskType


@dataclass
class ReasoningTask:
    """Reasoning input: statement + question text with visible options.

    The statement context must survive the statement→question UI transition;
    the caller (state machine) is responsible for carrying it.
    """

    statement_text: str
    question_text: str
    options: list[Option]


@dataclass
class PerceptualTask:
    """Perceptual Speed input: 4 columns × 2 case-varied glyph IDs.

    Glyph IDs are canonical single-letter identifiers produced upstream by the
    constrained glyph classifier; image-level recognition is GIA-013 scope.
    """

    question_text: str
    columns: list[tuple[str, str]]
    options: list[Option]


@dataclass
class NumericTask:
    """Number Speed & Accuracy input: exactly three numbers."""

    question_text: str
    options: list[Option]
    values: list[int]


@dataclass
class WordMeaningTask:
    """Word Meaning input: three words, odd-one-out."""

    question_text: str
    words: list[str]
    options: list[Option]


@dataclass
class SpatialTask:
    """Spatial Visualisation input: two square regions, each holding two glyphs.

    Squares are grayscale crops of the two stimulus squares as a question
    detector would deliver them (borders and inner glyphs included); the
    solver performs glyph extraction itself (solver-specification.md §6).
    """

    question_text: str
    options: list[Option]
    squares: list[np.ndarray]
    _resources: dict = field(default_factory=dict, repr=False)


class Solver(ABC):
    """Common solver interface: ``solve(task) -> SolverResult``."""

    task_type: TaskType
    problem_family: str

    @abstractmethod
    def solve(self, task: Any) -> SolverResult:
        """Solve one parsed question task and return the common contract."""

    @staticmethod
    def _start() -> float:
        return SolverResult.now_ms()
