"""CLI: solve one fixture or run benchmarks.

    python -m gia_ar_solver solve --fixture fixtures/numeric/N-001.json
    python -m gia_ar_solver bench [--family numeric] [--json]
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from gia_ar_solver.bench import format_report, report_to_json, run_all, run_family
from gia_ar_solver.contracts import TaskType
from gia_ar_solver.fixtures import FixtureError, load_fixture
from gia_ar_solver.registry import get_solver, load_default_solvers

FAMILY_ALIASES = {task.value: task for task in TaskType}
FAMILY_ALIASES.update(
    {
        "spatial": TaskType.SPATIAL_VISUALISATION,
        "perceptual": TaskType.PERCEPTUAL_SPEED,
        "numeric": TaskType.NUMBER_SPEED,
        "reasoning": TaskType.REASONING,
        "word": TaskType.WORD_MEANING,
    }
)


def _cmd_solve(args: argparse.Namespace) -> int:
    load_default_solvers()
    fixture = load_fixture(Path(args.fixture))
    result = get_solver(fixture.task_type).solve(fixture.to_task())
    if result.solved:
        print(f"Fixture:   {fixture.id} ({fixture.task_type.value})")
        print(f"Answer:    option {result.answer_id} ({fixture.options[result.answer_id].text})")
        print(f"Confidence: {result.confidence:.3f}")
        print(f"Latency:   {result.latency_ms:.1f}ms")
        return 0
    print(f"Fixture:   {fixture.id} ({fixture.task_type.value})")
    print("Answer:    UNSOLVED (refused to guess)")
    print(f"Latency:   {result.latency_ms:.1f}ms")
    print(f"Diagnostic: {result.diagnostics}")
    return 1


def _cmd_bench(args: argparse.Namespace) -> int:
    if args.family:
        task_type = FAMILY_ALIASES[args.family]
        reports = [run_family(task_type, args.fixtures)]
    else:
        reports = run_all(args.fixtures)
    if args.json:
        print(report_to_json(reports))
    else:
        print(format_report(reports))
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="gia-ar-solver", description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)

    solve = sub.add_parser("solve", help="solve a single fixture annotation")
    solve.add_argument("--fixture", required=True, help="path to a fixture JSON")
    solve.set_defaults(func=_cmd_solve)

    bench = sub.add_parser("bench", help="run solver benchmarks over fixtures")
    bench.add_argument("--family", choices=sorted(FAMILY_ALIASES), help="restrict to one family")
    bench.add_argument("--fixtures", default="fixtures", help="fixtures root directory")
    bench.add_argument("--json", action="store_true", help="emit machine-readable JSON")
    bench.set_defaults(func=_cmd_bench)

    args = parser.parse_args(argv)
    try:
        return args.func(args)
    except FixtureError as exc:
        print(f"fixture error: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
