"""Benchmark harness (docs/benchmark-specification.md §1-§2).

Runs solvers over labelled fixtures and reports per-family accuracy plus
median/p95 latency. Gates live in versioned config, not invented upfront
(§2): this report is the measuring stick, thresholds harden as fixtures grow.
"""

from __future__ import annotations

import json
import statistics
from dataclasses import asdict, dataclass, field
from pathlib import Path

from gia_ar_solver.contracts import TaskType
from gia_ar_solver.fixtures import Fixture, load_all, load_family
from gia_ar_solver.registry import get_solver, load_default_solvers


@dataclass
class FamilyReport:
    task_type: str
    fixtures: int = 0
    solved: int = 0
    correct: int = 0
    accuracy: float = 0.0  # correct / fixtures
    solve_rate: float = 0.0  # solved / fixtures (unsolved = refused to guess)
    median_ms: float = 0.0
    p95_ms: float = 0.0
    failures: list[str] = field(default_factory=list)


def _p95(samples: list[float]) -> float:
    if not samples:
        return 0.0
    ordered = sorted(samples)
    index = min(len(ordered) - 1, max(0, round(0.95 * len(ordered)) - 1))
    return ordered[index]


def run_family(task_type: TaskType, fixtures_dir: Path | str = "fixtures") -> FamilyReport:
    load_default_solvers()
    solver = get_solver(task_type)
    fixtures = load_family(fixtures_dir, task_type)
    report = FamilyReport(task_type=task_type.value, fixtures=len(fixtures))
    latencies: list[float] = []

    for fixture in fixtures:
        result = solver.solve(fixture.to_task())
        latencies.append(result.latency_ms)
        if result.solved:
            report.solved += 1
            if result.answer_id == fixture.answer_id:
                report.correct += 1
            else:
                report.failures.append(f"{fixture.id}: answered {result.answer_id}, expected {fixture.answer_id}")
        else:
            report.failures.append(f"{fixture.id}: unsolved ({result.diagnostics.get('error', 'no diagnostics')})")

    if fixtures:
        report.accuracy = report.correct / len(fixtures)
        report.solve_rate = report.solved / len(fixtures)
        report.median_ms = statistics.median(latencies)
        report.p95_ms = _p95(latencies)
    return report


def run_all(fixtures_dir: Path | str = "fixtures") -> list[FamilyReport]:
    return [run_family(task_type, fixtures_dir) for task_type in TaskType]


def format_report(reports: list[FamilyReport]) -> str:
    lines = [
        f"{'family':<22} {'fix':>4} {'solved':>7} {'correct':>8} {'accuracy':>9} {'median ms':>10} {'p95 ms':>8}",
        "-" * 74,
    ]
    for report in reports:
        lines.append(
            f"{report.task_type:<22} {report.fixtures:>4} {report.solved:>7} "
            f"{report.correct:>8} {report.accuracy:>9.3f} {report.median_ms:>10.1f} {report.p95_ms:>8.1f}"
        )
    for report in reports:
        for failure in report.failures:
            lines.append(f"  ! {failure}")
    return "\n".join(lines)


def report_to_json(reports: list[FamilyReport]) -> str:
    return json.dumps([asdict(report) for report in reports], indent=2)


__all__ = [
    "FamilyReport",
    "format_report",
    "report_to_json",
    "run_all",
    "run_family",
]
