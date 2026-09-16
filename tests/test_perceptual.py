"""Perceptual Speed solver tests (solver spec §3, dataset spec PS-001/PS-002)."""

from gia_ar_solver.solvers.base import PerceptualTask
from gia_ar_solver.solvers.perceptual import PerceptualSolver


def _task(columns, options_factory, count=5):
    return PerceptualTask(
        question_text="Cuántas columnas tienen la misma letra?",
        columns=columns,
        options=options_factory(count),
    )


def test_ps001_counts_matching_columns(options_factory):
    # j/J match, r/P no, l/L match, g/J no → 2
    task = _task([("j", "J"), ("r", "P"), ("l", "L"), ("g", "J")], options_factory)
    result = PerceptualSolver().solve(task)
    assert result.solved
    assert result.answer_id == 2


def test_ps002_all_columns_match(options_factory):
    task = _task([("C", "C"), ("e", "E"), ("g", "G"), ("o", "O")], options_factory)
    result = PerceptualSolver().solve(task)
    assert result.solved
    assert result.answer_id == 4


def test_zero_matches_selects_option_zero(options_factory):
    task = _task([("a", "B"), ("c", "D"), ("e", "F"), ("g", "H")], options_factory)
    result = PerceptualSolver().solve(task)
    assert result.solved
    assert result.answer_id == 0


def test_layout_variation_is_not_guessed(options_factory):
    # 3 columns deviates from the observed 4-column layout (VERIFY-004).
    task = _task([("a", "A"), ("b", "B"), ("c", "C")], options_factory)
    result = PerceptualSolver().solve(task)
    assert not result.solved
    assert "VERIFY-004" in result.diagnostics["verify"]


def test_count_outside_options_is_rejected(options_factory):
    task = _task([("a", "A"), ("b", "B"), ("c", "C"), ("d", "D")], options_factory, count=3)
    result = PerceptualSolver().solve(task)
    assert not result.solved
    assert result.diagnostics["count"] == 4
