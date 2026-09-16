"""Generate the synthetic fixture set (docs/dataset-specification.md §3).

Every fixture is a deterministic re-render of a documented observed example:
the JSON annotation records source, derivation of the ground truth, and
generation parameters (traceability per §6). Images are synthetic renders —
they are NOT screenshots of the real test; real capture is DATA-001 scope.

Usage:  python tools/make_fixtures.py [--out fixtures]
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from PIL import Image, ImageDraw

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
from gia_ar_solver.synth import render_letter, resolve_font  # noqa: E402

SCREEN_W, SCREEN_H = 1280, 800
BG, INK = 255, 20
QUESTION_POS = (90, 60)
QUESTION_SIZE = 42
OPTION_Y, OPTION_H = 620, 100
MARGIN = 80


def _font(size: int):
    return resolve_font(size)


def _normalized(rect: tuple[int, int, int, int]) -> list[float]:
    x, y, w, h = rect
    return [round(x / SCREEN_W, 4), round(y / SCREEN_H, 4), round(w / SCREEN_W, 4), round(h / SCREEN_H, 4)]


def _option_cells(count: int) -> list[tuple[int, int, int, int]]:
    usable = SCREEN_W - 2 * MARGIN
    cell_w = usable // count
    gap = 24
    return [
        (MARGIN + i * cell_w + gap // 2, OPTION_Y, cell_w - gap, OPTION_H)
        for i in range(count)
    ]


def _draw_options(draw: ImageDraw.ImageDraw, texts: list[str]) -> list[list[float]]:
    bboxes = []
    for rect, text in zip(_option_cells(len(texts)), texts):
        x, y, w, h = rect
        draw.rectangle((x, y, x + w, y + h), outline=INK, width=3)
        font = _font(46)
        bbox = draw.textbbox((0, 0), text, font=font)
        tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
        draw.text((x + (w - tw) / 2 - bbox[0], y + (h - th) / 2 - bbox[1]), text, font=font, fill=INK)
        bboxes.append(_normalized(rect))
    return bboxes


def _question_screen(question_text: str, option_texts: list[str]) -> tuple[Image.Image, list[list[float]]]:
    image = Image.new("L", (SCREEN_W, SCREEN_H), BG)
    draw = ImageDraw.Draw(image)
    font = _font(QUESTION_SIZE)
    y = QUESTION_POS[1]
    for line in _wrap(draw, question_text, font, SCREEN_W - 2 * QUESTION_POS[0]):
        draw.text((QUESTION_POS[0], y), line, font=font, fill=INK)
        y += 60
    option_bboxes = _draw_options(draw, option_texts)
    return image, option_bboxes


def _wrap(draw: ImageDraw.ImageDraw, text: str, font, max_width: int) -> list[str]:
    words, lines, current = text.split(), [], ""
    for word in words:
        trial = f"{current} {word}".strip()
        if draw.textbbox((0, 0), trial, font=font)[2] <= max_width:
            current = trial
        else:
            lines.append(current)
            current = word
    if current:
        lines.append(current)
    return lines


def _statement_screen(statement_text: str) -> Image.Image:
    image = Image.new("L", (SCREEN_W, SCREEN_H), BG)
    draw = ImageDraw.Draw(image)
    draw.text(QUESTION_POS, statement_text, font=_font(QUESTION_SIZE + 6), fill=INK)
    return image


def _fixture_json(fixture_dir: Path, annotation: dict, images: dict[str, Image.Image]) -> None:
    for name, img in images.items():
        img.save(fixture_dir / name)
    (fixture_dir / f"{annotation['id']}.json").write_text(
        json.dumps(annotation, ensure_ascii=False, indent=2), encoding="utf-8"
    )


# ---------------------------------------------------------------------------
# Per-family builders
# ---------------------------------------------------------------------------


def build_reasoning(fid, statement, question, options, answer_id, derivation, out: Path) -> None:
    statement_img = _statement_screen(statement)
    question_img, option_bboxes = _question_screen(question, options)
    annotation = {
        "id": fid,
        "taskType": "reasoning",
        "problemFamily": "R1",
        "state": "QUESTION",
        "source": "authorized-practice-documented",
        "image": f"{fid}-question.png",
        "statementImage": f"{fid}-statement.png",
        "statementText": statement,
        "questionText": question,
        "answerId": answer_id,
        "answerBBox": option_bboxes[answer_id],
        "stimulusBBoxes": [],
        "options": [
            {"index": i, "text": text, "bbox": bbox}
            for i, (text, bbox) in enumerate(zip(options, option_bboxes))
        ],
        "difficulty": "baseline",
        "notes": (
            "Synthetic re-render of the documented example in docs/dataset-specification.md §3; "
            f"layout approximated, not a screenshot. Ground truth derivation: {derivation}"
        ),
    }
    _fixture_json(
        out / "reasoning",
        annotation,
        {f"{fid}-statement.png": statement_img, f"{fid}-question.png": question_img},
    )


def build_perceptual(fid, top: list[str], bottom: list[str], answer: int, out: Path) -> None:
    question = "Cuántas columnas tienen la misma letra?"
    screen = Image.new("L", (SCREEN_W, SCREEN_H), BG)
    draw = ImageDraw.Draw(screen)
    draw.text(QUESTION_POS, question, font=_font(QUESTION_SIZE), fill=INK)
    font = _font(96)
    x0, y_top, y_bottom, spacing = 330, 240, 390, 160
    for i in range(4):
        x = x0 + i * spacing
        draw.text((x, y_top), top[i], font=font, fill=INK)
        draw.text((x, y_bottom), bottom[i], font=font, fill=INK)
    option_texts = [str(i) for i in range(5)]
    option_bboxes = _draw_options(draw, option_texts)
    annotation = {
        "id": fid,
        "taskType": "perceptual_speed",
        "problemFamily": "P1",
        "state": "QUESTION",
        "source": "authorized-practice-documented",
        "image": f"{fid}.png",
        "questionText": question,
        "columns": [[top[i], bottom[i]] for i in range(4)],
        "answerId": answer,
        "answerValue": answer,
        "answerBBox": option_bboxes[answer],
        "stimulusBBoxes": [],
        "options": [
            {"index": i, "text": t, "bbox": b}
            for i, (t, b) in enumerate(zip(option_texts, option_bboxes))
        ],
        "difficulty": "baseline",
        "notes": "Synthetic re-render of the documented example in docs/dataset-specification.md §3; 4-column layout per problem-taxonomy.md §3.",
    }
    _fixture_json(out / "perceptual", annotation, {f"{fid}.png": screen})


def build_numeric(fid, values: list[int], answer_id: int, out: Path) -> None:
    question = "Qué número está más alejado de la mediana?"
    texts = [str(v) for v in values]
    screen, option_bboxes = _question_screen(question, texts)
    annotation = {
        "id": fid,
        "taskType": "number_speed",
        "problemFamily": "N1",
        "state": "QUESTION",
        "source": "authorized-practice-documented",
        "image": f"{fid}.png",
        "questionText": question,
        "values": values,
        "answerId": answer_id,
        "answerValue": values[answer_id],
        "answerBBox": option_bboxes[answer_id],
        "stimulusBBoxes": [],
        "options": [
            {"index": i, "text": t, "bbox": b}
            for i, (t, b) in enumerate(zip(texts, option_bboxes))
        ],
        "difficulty": "baseline",
        "notes": "Synthetic re-render of the documented example in docs/dataset-specification.md §3; ground truth per problem-taxonomy.md §4 median-distance rule.",
    }
    _fixture_json(out / "numeric", annotation, {f"{fid}.png": screen})


def build_word(fid, words: list[str], answer_id: int, out: Path) -> None:
    question = "Qué palabra no es adecuada?"
    screen, option_bboxes = _question_screen(question, words)
    annotation = {
        "id": fid,
        "taskType": "word_meaning",
        "problemFamily": "W1",
        "state": "QUESTION",
        "source": "authorized-practice-documented",
        "image": f"{fid}.png",
        "questionText": question,
        "words": words,
        "answerId": answer_id,
        "answerValue": words[answer_id],
        "answerBBox": option_bboxes[answer_id],
        "stimulusBBoxes": [],
        "options": [
            {"index": i, "text": w, "bbox": b}
            for i, (w, b) in enumerate(zip(words, option_bboxes))
        ],
        "difficulty": "baseline",
        "notes": "Synthetic re-render of the documented example in docs/dataset-specification.md §3; answer as OBSERVED there (odd-one-out).",
    }
    _fixture_json(out / "word", annotation, {f"{fid}.png": screen})


def _paste_glyph(square_img, letter, angle, mirror, x, y) -> None:
    glyph = render_letter(letter, canvas=180, angle=angle, mirror=mirror, font_size=130)
    square_img.paste(Image.fromarray(glyph), (x, y))


def build_spatial(fid, squares, answer: int, generation_note: str, out: Path) -> None:
    question = "Cuántos cuadrados tienen la misma letra?"
    screen = Image.new("L", (SCREEN_W, SCREEN_H), BG)
    draw = ImageDraw.Draw(screen)
    draw.text(QUESTION_POS, question, font=_font(QUESTION_SIZE), fill=INK)
    option_bboxes = _draw_options(draw, ["0", "1", "2"])

    square_origins = [(300, 240), (760, 240)]
    square_size = (260, 340)
    stimulus = []
    crops = {}
    square_image_names = []
    for (origin, glyphs), index in zip(zip(square_origins, squares), range(1, 3)):
        sq = Image.new("L", square_size, BG)
        sq_draw = ImageDraw.Draw(sq)
        sq_draw.rectangle((0, 0, square_size[0] - 1, square_size[1] - 1), outline=INK, width=4)
        (lt, at, mt), (lb, ab, mb) = glyphs
        _paste_glyph(sq, lt, at, mt, 40, 15)
        _paste_glyph(sq, lb, ab, mb, 40, 170)
        x, y = origin
        screen.paste(sq, (x, y))
        stimulus.append(_normalized((x, y, square_size[0], square_size[1])))
        name = f"{fid}-square{index}.png"
        crops[name] = sq.crop((8, 8, square_size[0] - 8, square_size[1] - 8))
        square_image_names.append(name)

    images = {f"{fid}.png": screen, **crops}
    annotation = {
        "id": fid,
        "taskType": "spatial_visualisation",
        "problemFamily": "S1",
        "state": "QUESTION",
        "source": "synthetic",
        "image": f"{fid}.png",
        "questionText": question,
        "answerId": answer,
        "answerValue": answer,
        "answerBBox": option_bboxes[answer],
        "stimulusBBoxes": stimulus,
        "squareImages": square_image_names,
        "options": [
            {"index": i, "text": str(i), "bbox": b} for i, b in enumerate(option_bboxes)
        ],
        "difficulty": "baseline",
        "notes": (
            "Synthetic fixture (no documented glyph content was supplied for this observed answer). "
            f"Generation parameters: {generation_note}. squareImages are inner crops excluding the 4px square border. "
            "Ground truth matches the observed result recorded in docs/dataset-specification.md §3."
        ),
    }
    _fixture_json(out / "spatial", annotation, images)


def main() -> int:
    parser = argparse.ArgumentParser(description="Generate synthetic GIA fixtures")
    parser.add_argument("--out", type=Path, default=Path("fixtures"))
    args = parser.parse_args()
    out = args.out
    for sub in ("reasoning", "perceptual", "numeric", "word", "spatial"):
        (out / sub).mkdir(parents=True, exist_ok=True)

    build_reasoning(
        "R-001",
        "Manuel no es tan organizado como Marcos.",
        "Quién es menos caótico?",
        ["Manuel", "Marcos"],
        answer_id=1,
        derivation="Manuel < Marcos on organization; menos caótico = más organizado → Marcos.",
        out=out,
    )
    build_reasoning(
        "R-002",
        "Carlos es más distraído que Eva.",
        "Quién es menos atento?",
        ["Eva", "Carlos"],
        answer_id=1,
        derivation="Carlos > Eva on distractedness ⇒ Carlos < Eva on attention; menos atento → Carlos.",
        out=out,
    )
    build_perceptual("PS-001", list("jrlg"), list("JPLJ"), answer=2, out=out)
    build_perceptual("PS-002", list("Cego"), list("CEGO"), answer=4, out=out)
    build_numeric("N-001", [17, 9, 12], answer_id=0, out=out)
    build_numeric("N-002", [54, 24, 4], answer_id=0, out=out)
    build_word("W-001", ["Tallar", "Intruso", "Indiscreto"], answer_id=0, out=out)
    build_word("W-002", ["Indiscreto", "Abrigo", "Curioso"], answer_id=1, out=out)
    build_spatial(
        "S-001",
        [(("F", 40.0, False), ("F", 150.0, False)), (("L", 15.0, False), ("L", 230.0, False))],
        answer=2,
        generation_note="square1: F@40° vs F@150° (rotation match); square2: L@15° vs L@230° (rotation match)",
        out=out,
    )
    build_spatial(
        "S-002",
        [(("F", 40.0, False), ("F", 150.0, False)), (("G", 20.0, False), ("G", 75.0, True))],
        answer=1,
        generation_note="square1: F@40° vs F@150° (rotation match); square2: G@20° vs mirror(G)@75° (mirror → NOT a match)",
        out=out,
    )

    total = sum(1 for _ in out.rglob("*.json"))
    print(f"wrote {total} fixture annotations under {out}/")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
