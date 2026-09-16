"""Word Meaning solver tests (solver spec §5, dataset spec W-001/W-002)."""

from gia_ar_solver.solvers.base import WordMeaningTask
from gia_ar_solver.solvers.word_meaning import WordMeaningSolver


def _task(words, options_factory):
    return WordMeaningTask(
        question_text="Qué palabra no es adecuada?",
        words=words,
        options=options_factory(3, words),
    )


def test_w001_action_odd_one_out(options_factory):
    # Tallar (action) vs Intruso/Indiscreto (person traits) → Tallar.
    result = WordMeaningSolver().solve(_task(["Tallar", "Intruso", "Indiscreto"], options_factory))
    assert result.solved
    assert result.answer_id == 0
    assert result.diagnostics["odd_index"] == 0


def test_w002_object_odd_one_out(options_factory):
    # Abrigo (object) vs Indiscreto/Curioso (person traits) → Abrigo.
    result = WordMeaningSolver().solve(_task(["Indiscreto", "Abrigo", "Curioso"], options_factory))
    assert result.solved
    assert result.answer_id == 1


def test_odd_word_in_middle_position(options_factory):
    result = WordMeaningSolver().solve(_task(["Intruso", "Tallar", "Curioso"], options_factory))
    assert result.solved
    assert result.answer_id == 1


def test_unknown_word_falls_back_without_guess(options_factory):
    result = WordMeaningSolver().solve(_task(["Perro", "Gato", "Silla"], options_factory))
    assert not result.solved
    assert result.fallback_used


def test_all_same_category_is_ambiguous(options_factory):
    # All three person traits: lexical layer alone cannot pick the intruder.
    result = WordMeaningSolver().solve(_task(["Intruso", "Curioso", "Indiscreto"], options_factory))
    assert not result.solved
    assert result.fallback_used
