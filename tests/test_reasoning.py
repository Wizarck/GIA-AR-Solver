"""Reasoning solver tests (solver spec §2, dataset spec R-001/R-002)."""

from gia_ar_solver.solvers.base import ReasoningTask
from gia_ar_solver.solvers.numeric import __name__ as _  # noqa: F401  (import guard)
from gia_ar_solver.solvers.reasoning import ReasoningSolver, parse_question, parse_statement


def _task(statement, question, texts, options_factory):
    return ReasoningTask(
        statement_text=statement,
        question_text=question,
        options=options_factory(len(texts), texts),
    )


def test_r001_inverse_question(options_factory):
    # Manuel < Marcos on organization; "menos caótico" = más organizado → Marcos.
    task = _task(
        "Manuel no es tan organizado como Marcos.",
        "Quién es menos caótico?",
        ["Manuel", "Marcos"],
        options_factory,
    )
    result = ReasoningSolver().solve(task)
    assert result.solved
    assert result.answer_id == 1


def test_r002_polarity_flip(options_factory):
    # Carlos > Eva on distractedness → Carlos < Eva on attention; "menos atento" → Carlos.
    task = _task(
        "Carlos es más distraído que Eva.",
        "Quién es menos atento?",
        ["Eva", "Carlos"],
        options_factory,
    )
    result = ReasoningSolver().solve(task)
    assert result.solved
    assert result.answer_id == 1


def test_direct_question(options_factory):
    task = _task(
        "Manuel no es tan organizado como Marcos.",
        "Quién es más organizado?",
        ["Manuel", "Marcos"],
        options_factory,
    )
    result = ReasoningSolver().solve(task)
    assert result.solved
    assert result.answer_id == 1


def test_question_negation_flips_polarity(options_factory):
    # "no es menos caótico" = the more chaotic one → Manuel.
    task = _task(
        "Manuel no es tan organizado como Marcos.",
        "Quién no es menos caótico?",
        ["Manuel", "Marcos"],
        options_factory,
    )
    result = ReasoningSolver().solve(task)
    assert result.solved
    assert result.answer_id == 0


def test_transitive_chain_composes(options_factory):
    # Ana > Beto > Carla on organization; "más organizado" → Ana.
    task = _task(
        "Ana es más organizado que Beto. Beto es más organizado que Carla.",
        "Quién es más organizado?",
        ["Carla", "Beto", "Ana"],
        options_factory,
    )
    result = ReasoningSolver().solve(task)
    assert result.solved
    assert result.answer_id == 2


def test_unknown_vocabulary_falls_back_without_guess(options_factory):
    task = _task(
        "Manuel no es tan valiente como Marcos.",
        "Quién es más valiente?",
        ["Manuel", "Marcos"],
        options_factory,
    )
    result = ReasoningSolver().solve(task)
    assert not result.solved
    assert result.fallback_used


def test_unparseable_question_falls_back(options_factory):
    task = _task(
        "Manuel no es tan organizado como Marcos.",
        "Cuál es la capital de España?",
        ["Manuel", "Marcos"],
        options_factory,
    )
    result = ReasoningSolver().solve(task)
    assert not result.solved


def test_gender_marker_variant_parses():
    relations = parse_statement("Manuel no es tan organizado(-a) como Marcos.")
    assert len(relations) == 1
    assert relations[0].subject == "Manuel"
    assert relations[0].object == "Marcos"


def test_question_parser_returns_trait_and_polarity():
    parsed = parse_question("Quién es menos caótico?")
    assert parsed is not None
    trait, want_max, negated = parsed
    assert trait == "caotico"
    assert want_max is False
    assert negated is False
