"""Numeric solver tests (docs/solver-specification.md §4, dataset spec N-001/N-002)."""

from gia_ar_solver.solvers.base import NumericTask
from gia_ar_solver.solvers.numeric import NumericSolver


def test_n001_answer_is_furthest_from_median(options_factory):
    task = NumericTask(
        question_text="Qué número está más alejado de la mediana?",
        options=options_factory(3),
        values=[17, 9, 12],
    )
    result = NumericSolver().solve(task)
    assert result.solved
    assert result.answer_id == 0  # 17
    assert result.answer_bbox is not None
    assert result.diagnostics["median"] == 12
    assert result.diagnostics["distances"] == [5, 3, 0]


def test_n002_answer_preserves_visual_order(options_factory):
    task = NumericTask(
        question_text="Qué número está más alejado de la mediana?",
        options=options_factory(3),
        values=[54, 24, 4],
    )
    result = NumericSolver().solve(task)
    assert result.solved
    assert result.answer_id == 0  # 54 is first visually


def test_permuted_positions_answer_follows_option_index(options_factory):
    task = NumericTask(
        question_text="Qué número está más alejado de la mediana?",
        options=options_factory(3),
        values=[9, 17, 12],
    )
    result = NumericSolver().solve(task)
    assert result.solved
    assert result.answer_id == 1  # 17 sits in the middle column


def test_max_distance_tie_is_not_guessed(options_factory):
    # distances 15, 0, 15 → two options tie at max: VERIFY-006, refuse.
    task = NumericTask(
        question_text="Qué número está más alejado de la mediana?",
        options=options_factory(3),
        values=[5, 20, 35],
    )
    result = NumericSolver().solve(task)
    assert not result.solved
    assert "VERIFY-006" in result.diagnostics["verify"]


def test_all_duplicates_are_not_guessed(options_factory):
    task = NumericTask(
        question_text="Qué número está más alejado de la mediana?",
        options=options_factory(3),
        values=[12, 12, 12],
    )
    result = NumericSolver().solve(task)
    assert not result.solved


def test_wrong_option_count_is_rejected(options_factory):
    task = NumericTask(
        question_text="Qué número está más alejado de la mediana?",
        options=options_factory(4),
        values=[1, 2, 3, 4],
    )
    result = NumericSolver().solve(task)
    assert not result.solved
