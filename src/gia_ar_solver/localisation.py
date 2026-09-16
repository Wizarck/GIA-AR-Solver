"""Answer localization: logical answer index → visible option bbox.

The solver owns the logical decision (option index); localization owns the
geometry (solver-specification.md §7). Screen-wide region detection is
upstream (GIA-013/014) — here options arrive with their bboxes attached.
"""

from __future__ import annotations

from gia_ar_solver.contracts import BoundingBox, Option


class AnswerLocalizer:
    """Map a solved answer index to its visible option bounding box."""

    def __init__(self, options: list[Option]):
        self._by_index = {opt.index: opt for opt in options}

    def bbox_for(self, answer_id: int | str | None) -> BoundingBox | None:
        if answer_id is None:
            return None
        option = self._by_index.get(answer_id)
        return option.bbox if option else None
