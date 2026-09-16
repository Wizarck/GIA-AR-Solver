"""Deterministic synthetic glyph/screen rendering support.

Used by tools/make_fixtures.py (fixture generation) and the test suite so
both share one rendering implementation. Synthetic fixtures are traceable to
the generation parameters recorded in their JSON annotations
(dataset-specification.md §6).
"""

from __future__ import annotations

import numpy as np
from PIL import Image, ImageDraw, ImageFont

_FONT_CANDIDATES = [
    "C:/Windows/Fonts/arial.ttf",
    "C:/Windows/Fonts/segoeui.ttf",
    "C:/Windows/Fonts/calibri.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    "/System/Library/Fonts/Helvetica.ttc",
]


def resolve_font(size: int = 96) -> ImageFont.FreeTypeFont:
    """Resolve a scalable TrueType font, platform-independently."""
    for candidate in _FONT_CANDIDATES:
        try:
            return ImageFont.truetype(candidate, size)
        except OSError:
            continue
    return ImageFont.load_default(size=size)


def render_letter(
    letter: str,
    canvas: int = 160,
    angle: float = 0.0,
    mirror: bool = False,
    font_size: int = 110,
) -> np.ndarray:
    """Render one glyph as a grayscale uint8 array (white background, dark ink).

    ``angle`` is counter-clockwise degrees; ``mirror`` flips horizontally.
    The result emulates a camera-space glyph crop the way the future question
    detector would deliver it.
    """
    font = resolve_font(font_size)
    image = Image.new("L", (canvas, canvas), 255)
    draw = ImageDraw.Draw(image)
    bbox = draw.textbbox((0, 0), letter, font=font)
    text_w, text_h = bbox[2] - bbox[0], bbox[3] - bbox[1]
    draw.text(
        ((canvas - text_w) / 2 - bbox[0], (canvas - text_h) / 2 - bbox[1]),
        letter,
        font=font,
        fill=0,
    )
    if angle:
        image = image.rotate(angle, resample=Image.BICUBIC, fillcolor=255)
    if mirror:
        image = image.transpose(Image.FLIP_LEFT_RIGHT)
    return np.array(image)


__all__ = ["resolve_font", "render_letter"]
