"""Fixture loader tests (dataset-specification.md §2) and benchmark harness tests."""

from pathlib import Path

import pytest

from gia_ar_solver.bench import run_all, run_family
from gia_ar_solver.contracts import TaskType
from gia_ar_solver.fixtures import FixtureError, load_all, load_fixture

FIXTURES = Path(__file__).resolve().parents[1] / "fixtures"


def test_all_fixtures_load_and_validate():
    fixtures = load_all(FIXTURES)
    assert len(fixtures) == 10
    by_family = {fixture.task_type for fixture in fixtures}
    assert by_family == set(TaskType)


def test_documented_ground_truths():
    fixtures = {fixture.id: fixture for fixture in load_all(FIXTURES)}
    assert fixtures["R-001"].answer_id == 1
    assert fixtures["R-002"].answer_id == 1
    assert fixtures["PS-001"].answer_id == 2
    assert fixtures["PS-002"].answer_id == 4
    assert fixtures["N-001"].answer_id == 0
    assert fixtures["N-002"].answer_id == 0
    assert fixtures["W-001"].answer_id == 0
    assert fixtures["W-002"].answer_id == 1
    assert fixtures["S-001"].answer_id == 2
    assert fixtures["S-002"].answer_id == 1


def test_every_fixture_is_traceable():
    for fixture in load_all(FIXTURES):
        assert fixture.source, fixture.id
        assert fixture.notes, f"{fixture.id} missing provenance notes"


def test_answer_bbox_present_and_normalized():
    for fixture in load_all(FIXTURES):
        assert fixture.answer_bbox is not None, fixture.id
        box = fixture.answer_bbox
        assert 0.0 <= box.x <= 1.0 and 0.0 <= box.y <= 1.0
        assert 0.0 < box.w <= 1.0 and 0.0 < box.h <= 1.0


def test_missing_required_field_is_rejected(tmp_path):
    import json

    bad = tmp_path / "bad.json"
    bad.write_text(json.dumps({"id": "X-999"}), encoding="utf-8")
    with pytest.raises(FixtureError):
        load_fixture(bad)


def test_benchmark_full_suite_is_perfect_on_documented_fixtures():
    reports = run_all(FIXTURES)
    summary = {report.task_type: report for report in reports}
    for task_type in TaskType:
        report = summary[task_type.value]
        assert report.fixtures == 2, task_type
        assert report.accuracy == 1.0, (task_type, report.failures)
        assert report.solve_rate == 1.0
        assert report.median_ms > 0.0


def test_benchmark_single_family():
    report = run_family(TaskType.NUMBER_SPEED, FIXTURES)
    assert report.task_type == "number_speed"
    assert report.correct == 2
