"""Shared test fixtures."""

import pytest

from gia_ar_solver.contracts import BoundingBox, Option


def make_options(count: int, texts: list[str] | None = None) -> list[Option]:
    """Build visible options with deterministic normalized bboxes."""
    texts = texts or [str(i) for i in range(count)]
    width = 0.9 / count
    options = []
    for i in range(count):
        bbox = BoundingBox(x=0.05 + i * width, y=0.8, w=width * 0.9, h=0.12)
        options.append(Option(index=i, text=texts[i], bbox=bbox))
    return options


@pytest.fixture
def options_factory():
    return make_options
