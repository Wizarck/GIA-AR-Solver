"""Spatial Visualisation solver (solver-specification.md §6, taxonomy §6).

Two squares, each holding two letter glyphs. A square matches when its two
glyphs are rotation-equivalent; a mirrored glyph is NOT a match — unless the
glyph itself is mirror-symmetric, in which case its mirror equals some
rotation of it and the pair is genuinely rotation-equivalent (taxonomy S7).

Pipeline per square region:

    square crop → binarize → components (drop border artifacts) → 2 glyphs
    → per glyph: crop → scale/center normalization
    → rotation sweep score (top vs bottom)
    → mirror sweep score  (mirror(top) vs bottom)
    → self-symmetry sweep (top vs mirror(top))
    → ROTATION_MATCH / MIRROR_ONLY / NO_MATCH / AMBIGUOUS

answer = count(MATCH) across the two squares; any AMBIGUOUS square marks the
result unsolved (never guess at low confidence).
"""

from __future__ import annotations

import cv2
import numpy as np

from gia_ar_solver.contracts import SolverResult, TaskType
from gia_ar_solver.solvers.base import Solver, SpatialTask

CANVAS = 96
ANGLE_STEP_DEG = 5.0
FINE_STEP_DEG = 1.0
FINE_WINDOW_DEG = 6.0
# Provisional thresholds calibrated on synthetic rendered letters
# (rotation / mirror / mirror+rotation / different-letter sweeps, blur-cosine
# similarity). Measured bands: true rotations 0.93-0.98, mirrored impostors
# rot ≤ 0.86 (mir > rot), different letters ≤ 0.74. The rot-vs-mir margin is
# the discriminator that rejects round glyphs (e.g. mirrored G) whose plain
# rotation score stays high. MUST be re-calibrated on authorized real
# fixtures — TODO VERIFY-010/011.
MATCH_THRESHOLD = 0.88
MATCH_MARGIN = 0.10
SYMMETRY_THRESHOLD = 0.90
AMBIGUOUS_MARGIN = 0.12


def normalize_glyph(image: np.ndarray) -> np.ndarray | None:
    """Binarize a glyph crop and return a centered binary mask (uint8 0/1)."""
    gray = image if image.ndim == 2 else cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    if gray.dtype != np.uint8:
        gray = np.clip(gray, 0, 255).astype(np.uint8)
    _, binary = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)

    num, labels, stats, _ = cv2.connectedComponentsWithStats(binary, connectivity=8)
    if num < 2:
        return None
    largest = 1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA]))
    x, y, w, h = (
        stats[largest, cv2.CC_STAT_LEFT],
        stats[largest, cv2.CC_STAT_TOP],
        stats[largest, cv2.CC_STAT_WIDTH],
        stats[largest, cv2.CC_STAT_HEIGHT],
    )
    glyph = (labels[y : y + h, x : x + w] == largest).astype(np.uint8)

    # Scale by the LONGEST side only (not fit-both): fitting both dimensions
    # breaks rotation invariance for glyphs whose bbox aspect changes under
    # rotation (e.g. an 'L' rotated 180° swaps width/height dominance).
    scale = (CANVAS - 8) / max(w, h)
    resized_w, resized_h = max(1, round(w * scale)), max(1, round(h * scale))
    resized = cv2.resize(glyph, (resized_w, resized_h), interpolation=cv2.INTER_AREA)

    canvas = np.zeros((CANVAS, CANVAS), dtype=np.uint8)
    x0, y0 = (CANVAS - resized_w) // 2, (CANVAS - resized_h) // 2
    canvas[y0 : y0 + resized_h, x0 : x0 + resized_w] = resized

    # Centroid-center for rotation stability.
    ys, xs = np.nonzero(canvas)
    if xs.size == 0:
        return None
    cx, cy = int(round(xs.mean())), int(round(ys.mean()))
    shift_x, shift_y = CANVAS // 2 - cx, CANVAS // 2 - cy
    matrix = np.float32([[1, 0, shift_x], [0, 1, shift_y]])
    return cv2.warpAffine(canvas, matrix, (CANVAS, CANVAS), flags=cv2.INTER_NEAREST)


def rotate_mask(mask: np.ndarray, angle_deg: float) -> np.ndarray:
    matrix = cv2.getRotationMatrix2D((CANVAS / 2, CANVAS / 2), angle_deg, 1.0)
    rotated = cv2.warpAffine(mask, matrix, (CANVAS, CANVAS), flags=cv2.INTER_LINEAR)
    return (rotated > 0.5).astype(np.uint8)


def mirror_mask(mask: np.ndarray) -> np.ndarray:
    return cv2.flip(mask, 1)


def iou(a: np.ndarray, b: np.ndarray) -> float:
    union = np.logical_or(a, b).sum()
    if union == 0:
        return 0.0
    return float(np.logical_and(a, b).sum() / union)


def _similarity(a: np.ndarray, b: np.ndarray) -> float:
    """Blur-cosine similarity between two binary masks.

    Raw IoU is too brittle for thin strokes: a 1-2 px rasterization offset
    halves it. Gaussian blurring turns strokes into smooth hills so sub-pixel
    misalignment degrades the score gracefully.
    """
    fa = cv2.GaussianBlur(a.astype(np.float32), (9, 9), 2.0)
    fb = cv2.GaussianBlur(b.astype(np.float32), (9, 9), 2.0)
    denom = float(np.sqrt((fa * fa).sum() * (fb * fb).sum()))
    return float((fa * fb).sum() / denom) if denom else 0.0


def _translated_similarity(a: np.ndarray, b: np.ndarray, max_shift: int = 6, step: int = 2) -> float:
    """Best similarity under small translations.

    Rasterization + re-thresholding bias the measured centroid by a couple of
    pixels, which plain centroid alignment cannot recover.
    """
    best = _similarity(a, b)
    for dy in range(-max_shift, max_shift + 1, step):
        for dx in range(-max_shift, max_shift + 1, step):
            if dx == 0 and dy == 0:
                continue
            shifted = np.roll(np.roll(a, dy, axis=0), dx, axis=1)
            best = max(best, _similarity(shifted, b))
    return best


def rotation_score(reference: np.ndarray, target: np.ndarray, mirrored: bool = False) -> float:
    """Max blur-cosine of target against reference (optionally mirrored).

    Coarse 5° sweep → translation refinement at the best angle → fine ±6°
    pass at 1° with a second translation refinement.
    """
    source = mirror_mask(reference) if mirrored else reference
    best, best_angle = 0.0, 0.0
    angle = -180.0
    while angle < 180.0:
        score = _similarity(rotate_mask(source, angle), target)
        if score > best:
            best, best_angle = score, angle
        angle += ANGLE_STEP_DEG

    best = _translated_similarity(rotate_mask(source, best_angle), target)

    angle = best_angle - FINE_WINDOW_DEG
    while angle <= best_angle + FINE_WINDOW_DEG:
        score = _similarity(rotate_mask(source, angle), target)
        if score > best:
            best, best_angle = score, angle
        angle += FINE_STEP_DEG

    return max(best, _translated_similarity(rotate_mask(source, best_angle), target))


def classify_pair(top: np.ndarray, bottom: np.ndarray) -> dict:
    """Classify a glyph pair into ROTATION_MATCH / MIRROR_ONLY / NO_MATCH / AMBIGUOUS."""
    top_norm, bottom_norm = normalize_glyph(top), normalize_glyph(bottom)
    if top_norm is None or bottom_norm is None:
        return {"verdict": "AMBIGUOUS", "reason": "glyph extraction failed"}

    rot = rotation_score(top_norm, bottom_norm)
    mir = rotation_score(top_norm, bottom_norm, mirrored=True)
    # Self-symmetry: can mirror(top) be reached by rotating top at all?
    self_symmetry = rotation_score(top_norm, mirror_mask(top_norm))

    if rot >= MATCH_THRESHOLD and rot - mir >= MATCH_MARGIN:
        # Strong direct evidence, and clearly better than the mirror read.
        verdict = "ROTATION_MATCH"
    elif mir >= MATCH_THRESHOLD and self_symmetry >= SYMMETRY_THRESHOLD:
        # Mirror-symmetric glyph: mirror(top) is a rotation of top → real match.
        verdict = "ROTATION_MATCH"
    elif mir >= MATCH_THRESHOLD:
        verdict = "MIRROR_ONLY"
    elif max(rot, mir) >= MATCH_THRESHOLD - AMBIGUOUS_MARGIN:
        verdict = "AMBIGUOUS"
    else:
        verdict = "NO_MATCH"
    return {
        "verdict": verdict,
        "rotation_score": round(rot, 3),
        "mirror_score": round(mir, 3),
        "self_symmetry": round(self_symmetry, 3),
    }


def extract_glyphs(square: np.ndarray) -> list[np.ndarray] | None:
    """Extract the two glyph crops from one square region.

    Components touching the image border (frame artifacts) are dropped, the
    two largest remaining components are ordered top-to-bottom. Returns None
    when the square does not contain exactly two glyphs.
    """
    gray = square if square.ndim == 2 else cv2.cvtColor(square, cv2.COLOR_BGR2GRAY)
    if gray.dtype != np.uint8:
        gray = np.clip(gray, 0, 255).astype(np.uint8)
    _, binary = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)

    num, labels, stats, centroids = cv2.connectedComponentsWithStats(binary, connectivity=8)
    h, w = binary.shape
    candidates = []
    for label in range(1, num):
        x, y, cw, ch, area = (
            stats[label, cv2.CC_STAT_LEFT],
            stats[label, cv2.CC_STAT_TOP],
            stats[label, cv2.CC_STAT_WIDTH],
            stats[label, cv2.CC_STAT_HEIGHT],
            stats[label, cv2.CC_STAT_AREA],
        )
        touches_border = x == 0 or y == 0 or x + cw >= w or y + ch >= h
        if not touches_border:
            candidates.append((label, area, x, y, cw, ch, centroids[label][1]))
    if len(candidates) < 2:
        return None
    candidates.sort(key=lambda item: item[1], reverse=True)
    chosen = sorted(candidates[:2], key=lambda item: item[6])  # top-to-bottom

    glyphs = []
    for label, _area, x, y, cw, ch, _cy in chosen:
        glyph = np.where(labels[y : y + ch, x : x + cw] == label, gray[y : y + ch, x : x + cw], 255)
        glyphs.append(glyph.astype(np.uint8))
    return glyphs


def classify_square(square: np.ndarray) -> dict:
    """Classify one square region: extract its two glyphs and compare them."""
    glyphs = extract_glyphs(square)
    if glyphs is None:
        return {"verdict": "AMBIGUOUS", "reason": "glyph extraction failed"}
    return classify_pair(glyphs[0], glyphs[1])


class SpatialSolver(Solver):
    task_type = TaskType.SPATIAL_VISUALISATION
    problem_family = "S1"

    def solve(self, task: SpatialTask) -> SolverResult:
        start = self._start()
        result = SolverResult(
            task_type=self.task_type,
            problem_family=self.problem_family,
        )

        if len(task.squares) != 2:
            result.diagnostics["error"] = "expected exactly 2 squares"
            result.latency_ms = self._start() - start
            return result

        square_results = []
        ambiguous = False
        matches = 0
        for square in task.squares:
            verdict = classify_square(square)
            square_results.append(verdict)
            if verdict["verdict"] == "ROTATION_MATCH":
                matches += 1
            elif verdict["verdict"] == "AMBIGUOUS":
                ambiguous = True

        if ambiguous:
            result.diagnostics["squares"] = square_results
            result.diagnostics["verify"] = "VERIFY-010/011 threshold calibration"
            result.latency_ms = self._start() - start
            return result

        by_index = {opt.index for opt in task.options}
        if matches not in by_index:
            result.diagnostics["error"] = "count not present among visible options"
            result.latency_ms = self._start() - start
            return result

        option = next(opt for opt in task.options if opt.index == matches)
        result.solved = True
        result.answer_id = option.index
        result.solver_confidence = 1.0
        result.confidence = 1.0
        result.answer_bbox = option.bbox
        result.diagnostics.update(
            {
                "squares": square_results,
                "matches": matches,
                "thresholds": {
                    "match": MATCH_THRESHOLD,
                    "match_margin": MATCH_MARGIN,
                    "symmetry": SYMMETRY_THRESHOLD,
                },
                "confidence_calibrated": False,
            }
        )
        result.latency_ms = self._start() - start
        return result


__all__ = [
    "SpatialSolver",
    "classify_pair",
    "classify_square",
    "extract_glyphs",
    "normalize_glyph",
    "rotation_score",
    "iou",
]
