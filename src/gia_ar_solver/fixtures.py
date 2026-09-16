"""Fixture schema + loader (docs/dataset-specification.md §2).

A fixture is a JSON annotation file plus referenced images. The loader
validates the schema and materializes the family-specific solver task. Image
paths are resolved relative to the annotation file's directory.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path

import cv2
import numpy as np

from gia_ar_solver.contracts import BoundingBox, Option, TaskType
from gia_ar_solver.solvers.base import (
    NumericTask,
    PerceptualTask,
    ReasoningTask,
    SpatialTask,
    WordMeaningTask,
)

TASK_TYPE_ALIASES: dict[str, TaskType] = {
    "reasoning": TaskType.REASONING,
    "perceptual_speed": TaskType.PERCEPTUAL_SPEED,
    "number_speed": TaskType.NUMBER_SPEED,
    "word_meaning": TaskType.WORD_MEANING,
    "spatial_visualisation": TaskType.SPATIAL_VISUALISATION,
}

REQUIRED_FIELDS = {"id", "taskType", "problemFamily", "state", "source", "image", "answerId"}


class FixtureError(ValueError):
    """Raised when a fixture annotation violates the dataset schema."""


@dataclass
class Fixture:
    id: str
    task_type: TaskType
    problem_family: str
    state: str
    source: str
    image: Path
    answer_id: int | str
    answer_value: str | int | None = None
    answer_bbox: BoundingBox | None = None
    stimulus_bboxes: list[BoundingBox] = field(default_factory=list)
    difficulty: str = "baseline"
    notes: str = ""
    # family payloads
    question_text: str = ""
    statement_text: str = ""
    statement_image: Path | None = None
    words: list[str] = field(default_factory=list)
    columns: list[tuple[str, str]] = field(default_factory=list)
    values: list[int] = field(default_factory=list)
    square_images: list[Path] = field(default_factory=list)
    options: list[Option] = field(default_factory=list)
    path: Path | None = None

    def load_image(self) -> np.ndarray:
        return _imread(self.image)

    def load_statement_image(self) -> np.ndarray | None:
        return _imread(self.statement_image) if self.statement_image else None

    def load_square_images(self) -> list[np.ndarray]:
        if len(self.square_images) != 2:
            raise FixtureError(f"{self.id}: expected 2 square images, got {len(self.square_images)}")
        return [_imread(path) for path in self.square_images]

    def to_task(self) -> ReasoningTask | PerceptualTask | NumericTask | WordMeaningTask | SpatialTask:
        """Materialize the family-specific solver task."""
        if self.task_type is TaskType.REASONING:
            return ReasoningTask(
                statement_text=self.statement_text,
                question_text=self.question_text,
                options=self.options,
            )
        if self.task_type is TaskType.PERCEPTUAL_SPEED:
            return PerceptualTask(
                question_text=self.question_text,
                columns=self.columns,
                options=self.options,
            )
        if self.task_type is TaskType.NUMBER_SPEED:
            return NumericTask(
                question_text=self.question_text,
                options=self.options,
                values=self.values,
            )
        if self.task_type is TaskType.WORD_MEANING:
            return WordMeaningTask(
                question_text=self.question_text,
                words=self.words,
                options=self.options,
            )
        return SpatialTask(
            question_text=self.question_text,
            options=self.options,
            squares=self.load_square_images(),
        )


def _imread(path: Path) -> np.ndarray:
    image = cv2.imread(str(path), cv2.IMREAD_GRAYSCALE)
    if image is None:
        raise FixtureError(f"cannot read image: {path}")
    return image


def _bbox(raw: list[float], context: str) -> BoundingBox:
    if len(raw) != 4 or not all(0.0 <= v <= 1.0 for v in raw):
        raise FixtureError(f"{context}: bbox must be 4 normalized values, got {raw}")
    return BoundingBox(x=raw[0], y=raw[1], w=raw[2], h=raw[3])


def load_fixture(path: Path | str) -> Fixture:
    """Parse and validate one fixture annotation JSON."""
    path = Path(path)
    raw = json.loads(path.read_text(encoding="utf-8"))

    missing = REQUIRED_FIELDS - raw.keys()
    if missing:
        raise FixtureError(f"{path}: missing fields {sorted(missing)}")
    if raw["taskType"] not in TASK_TYPE_ALIASES:
        raise FixtureError(f"{path}: unknown taskType '{raw['taskType']}'")

    options = [
        Option(index=int(opt["index"]), text=opt.get("text"), bbox=_bbox(opt["bbox"], path.name))
        for opt in raw.get("options", [])
    ]
    answer_id = raw["answerId"]
    if options and answer_id not in {opt.index for opt in options}:
        raise FixtureError(f"{path}: answerId {answer_id} not among option indices")

    base = path.parent
    fixture = Fixture(
        id=raw["id"],
        task_type=TASK_TYPE_ALIASES[raw["taskType"]],
        problem_family=raw["problemFamily"],
        state=raw["state"],
        source=raw["source"],
        image=base / raw["image"],
        answer_id=answer_id,
        answer_value=raw.get("answerValue"),
        answer_bbox=_bbox(raw["answerBBox"], path.name) if raw.get("answerBBox") else None,
        stimulus_bboxes=[_bbox(b, path.name) for b in raw.get("stimulusBBoxes", [])],
        difficulty=raw.get("difficulty", "baseline"),
        notes=raw.get("notes", ""),
        question_text=raw.get("questionText", ""),
        statement_text=raw.get("statementText", ""),
        statement_image=base / raw["statementImage"] if raw.get("statementImage") else None,
        words=raw.get("words", []),
        columns=[tuple(pair) for pair in raw.get("columns", [])],
        values=[int(v) for v in raw.get("values", [])],
        square_images=[base / name for name in raw.get("squareImages", [])],
        options=options,
        path=path,
    )

    if not fixture.image.exists():
        raise FixtureError(f"{path}: image not found: {fixture.image}")
    return fixture


def load_family(fixtures_dir: Path | str, task_type: TaskType) -> list[Fixture]:
    """Load every annotation for one family from ``<dir>/<family>/``."""
    root = Path(fixtures_dir)
    family_dir = {
        TaskType.REASONING: "reasoning",
        TaskType.PERCEPTUAL_SPEED: "perceptual",
        TaskType.NUMBER_SPEED: "numeric",
        TaskType.WORD_MEANING: "word",
        TaskType.SPATIAL_VISUALISATION: "spatial",
    }[task_type]
    family_path = root / family_dir
    if not family_path.is_dir():
        return []
    return [
        load_fixture(p)
        for p in sorted(family_path.glob("*.json"))
    ]


def load_all(fixtures_dir: Path | str) -> list[Fixture]:
    fixtures: list[Fixture] = []
    for task_type in TaskType:
        fixtures.extend(load_family(fixtures_dir, task_type))
    return fixtures


__all__ = [
    "Fixture",
    "FixtureError",
    "load_all",
    "load_family",
    "load_fixture",
    "TASK_TYPE_ALIASES",
]
