"""Spatial solver tests (solver spec §6, taxonomy §6).

Glyphs and square regions are rendered with the shared synthetic renderer so
the geometry the solver sees matches what the fixture generator produces.
"""

import pytest

from gia_ar_solver.solvers.base import SpatialTask
from gia_ar_solver.solvers.spatial import SpatialSolver, classify_pair, classify_square
from gia_ar_solver.synth import render_letter

pytest.importorskip("cv2")
pytest.importorskip("PIL.ImageDraw")

import numpy as np  # noqa: E402
from PIL import Image, ImageDraw  # noqa: E402


def _glyph(letter, angle=0.0, mirror=False):
    return render_letter(letter, angle=angle, mirror=mirror)


def _square(letter_top, angle_top, letter_bottom, angle_bottom, mirror_bottom=False):
    """A square region as the question detector would deliver it."""
    img = Image.new("L", (260, 340), 255)
    draw = ImageDraw.Draw(img)
    draw.rectangle((0, 0, 259, 339), outline=0, width=4)
    for letter, angle, mirror, y in (
        (letter_top, angle_top, False, 15),
        (letter_bottom, angle_bottom, mirror_bottom, 170),
    ):
        glyph = render_letter(letter, canvas=180, angle=angle, mirror=mirror, font_size=130)
        img.paste(Image.fromarray(glyph), (40, y))
    return np.array(img)


def _task(squares, options_factory, count=3):
    return SpatialTask(
        question_text="Cuántos cuadrados tienen la misma letra?",
        options=options_factory(count),
        squares=squares,
    )


def test_rotation_only_pair_matches():
    verdict = classify_pair(_glyph("F", angle=40), _glyph("F", angle=130))
    assert verdict["verdict"] == "ROTATION_MATCH"


def test_mirrored_pair_is_rejected():
    verdict = classify_pair(_glyph("G", angle=15), _glyph("G", angle=60, mirror=True))
    assert verdict["verdict"] == "MIRROR_ONLY"


def test_mirror_plus_rotation_is_rejected():
    verdict = classify_pair(_glyph("P", angle=0), _glyph("P", angle=75, mirror=True))
    assert verdict["verdict"] in ("MIRROR_ONLY", "NO_MATCH")


def test_mirror_symmetric_letter_still_matches():
    # 'A' is mirror-symmetric: mirror(top) equals a rotation of top → real match.
    verdict = classify_pair(_glyph("A", angle=30), _glyph("A", angle=100, mirror=True))
    assert verdict["verdict"] == "ROTATION_MATCH"


def test_different_letters_do_not_match():
    verdict = classify_pair(_glyph("F", angle=20), _glyph("J", angle=65))
    assert verdict["verdict"] in ("NO_MATCH", "AMBIGUOUS")


def test_s001_both_squares_match(options_factory):
    result = SpatialSolver().solve(
        _task([_square("F", 40, "F", 150), _square("L", 15, "L", 230)], options_factory)
    )
    assert result.solved
    assert result.answer_id == 2


def test_s002_one_square_matches(options_factory):
    result = SpatialSolver().solve(
        _task([_square("F", 40, "F", 150), _square("G", 20, "G", 75, mirror_bottom=True)], options_factory)
    )
    assert result.solved
    assert result.answer_id == 1


def test_zero_matches(options_factory):
    result = SpatialSolver().solve(
        _task([_square("F", 45, "F", 45, mirror_bottom=True), _square("J", 30, "J", 90, mirror_bottom=True)], options_factory)
    )
    assert result.solved
    assert result.answer_id == 0


def test_non_letter_stimulus_is_ambiguous_not_guessed(options_factory):
    blank = np.full((100, 100), 255, dtype=np.uint8)
    result = SpatialSolver().solve(_task([blank, blank], options_factory))
    assert not result.solved


def test_square_region_input_extracts_glyphs_and_counts(options_factory):
    # square 1: F vs F rotated → match; square 2: G vs mirrored G → no match.
    s1 = _square("F", 40, "F", 150)
    s2 = _square("G", 20, "G", 75, mirror_bottom=True)
    assert classify_square(s1)["verdict"] == "ROTATION_MATCH"
    assert classify_square(s2)["verdict"] == "MIRROR_ONLY"

    result = SpatialSolver().solve(_task([s1, s2], options_factory))
    assert result.solved
    assert result.answer_id == 1
