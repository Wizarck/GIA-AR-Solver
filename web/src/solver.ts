/**
 * Numeric solver — TypeScript port of the Python NumericSolver
 * (src/gia_ar_solver/solvers/numeric.py, solver-specification.md §4).
 *
 * answer = option whose distance to the median of the three values is
 * largest. Ties are refused (VERIFY-006: tie behaviour unobserved).
 */

export interface NumericOptions {
  values: number[];
  /** Left edge of each option box in rectified-view pixels. */
  boxes: Array<{ x: number; y: number; w: number; h: number }>;
}

export interface NumericSolution {
  solved: boolean;
  answerIndex: number | null;
  confidence: number;
  values: number[];
  median: number | null;
  distances: number[];
  reason: string;
}

export function solveNumeric(options: NumericOptions): NumericSolution {
  const values = options.values;
  if (values.length !== 3) {
    return { solved: false, answerIndex: null, confidence: 0, values, median: null, distances: [], reason: "expected 3 numbers" };
  }
  const median = [...values].sort((a, b) => a - b)[1];
  const distances = values.map((v) => Math.abs(v - median));
  let best = 0;
  for (let i = 1; i < 3; i++) if (distances[i] > distances[best]) best = i;
  const ties = distances.filter((d) => d === distances[best]).length;
  if (ties > 1) {
    return { solved: false, answerIndex: null, confidence: 0, values, median, distances, reason: "tie (VERIFY-006): refusing to guess" };
  }
  return { solved: true, answerIndex: best, confidence: 1, values, median, distances, reason: "unique max distance" };
}

// ---------------------------------------------------------------------------
// Option-box detection from the rectified screen (mini GIA-013/GIA-014).
// ---------------------------------------------------------------------------

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Component {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  area: number;
}

/**
 * Detect answer-option boxes in the bottom band of a rectified frame.
 *
 * Two strategies, tried in order:
 * 1. box outlines — connected components whose bounding box is large but
 *    sparsely filled (a rectangle outline), sorted left→right;
 * 2. digit clusters — small ink components grouped by x-gaps, for layouts
 *    without bordered boxes.
 */
export function findOptionBoxes(frame: ImageData, y0f = 0.6, expected = 3): Rect[] {
  const { width: w, height: h, data } = frame;
  const y0 = Math.round(h * y0f);
  const y1 = h;
  const bh = y1 - y0;

  const gray = new Uint8Array(w * bh);
  const hist = new Array<number>(256).fill(0);
  for (let y = 0; y < bh; y++) {
    for (let x = 0; x < w; x++) {
      const i = ((y + y0) * w + x) * 4;
      const g = (data[i] * 299 + data[i + 1] * 587 + data[i + 2] * 114) / 1000;
      gray[y * w + x] = g | 0;
      hist[gray[y * w + x]]++;
    }
  }
  const th = otsuBand(hist, w * bh);
  // Harden the threshold: Otsu alone keeps the screen-edge shading gradient,
  // which merges the bezel with the first box outline. Real ink (borders,
  // digits) is much darker than that gradient — keep only the dark fraction.
  const hardThreshold = Math.max(40, Math.round(th * 0.65));

  // connected components over dark pixels (8-connected), confined to the
  // band INTERIOR: the rectified screen bezel/edge lives in the outermost
  // rows/columns and would bridge unrelated components along the frame
  const INSET = 2;
  const dark = (x: number, y: number): boolean =>
    x >= INSET && x < w - INSET && y >= INSET && y < bh - INSET && gray[y * w + x] < hardThreshold;
  const visited = new Uint8Array(w * bh);
  const components: Component[] = [];
  const stack: number[] = [];
  for (let sy = INSET; sy < bh - INSET; sy++) {
    for (let sx = INSET; sx < w - INSET; sx++) {
      const start = sy * w + sx;
      if (gray[start] >= hardThreshold || visited[start]) continue;
      stack.length = 0;
      stack.push(start);
      visited[start] = 1;
      const comp: Component = { minX: w, minY: bh, maxX: 0, maxY: 0, area: 0 };
      while (stack.length) {
        const idx = stack.pop() as number;
        const x = idx % w;
        const y = (idx / w) | 0;
        comp.area++;
        if (x < comp.minX) comp.minX = x;
        if (x > comp.maxX) comp.maxX = x;
        if (y < comp.minY) comp.minY = y;
        if (y > comp.maxY) comp.maxY = y;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx;
            const ny = y + dy;
            if (dark(nx, ny)) {
              const nIdx = ny * w + nx;
              if (!visited[nIdx]) {
                visited[nIdx] = 1;
                stack.push(nIdx);
              }
            }
          }
        }
      }
      if (comp.area >= 12) components.push(comp);
    }
  }
  if (components.length === 0) return [];

  const toRect = (c: Component): Rect => ({
    x: c.minX,
    y: y0 + c.minY,
    w: c.maxX - c.minX + 1,
    h: c.maxY - c.minY + 1,
  });

  // strategy 1: outline-like components (large bbox, sparse fill), ignoring
  // anything touching the left/right edges — in rectified space those are
  // the screen bezel, not options
  const outlines = components.filter((c) => {
    const bw = c.maxX - c.minX + 1;
    const bhh = c.maxY - c.minY + 1;
    if (c.minX <= 1 || c.maxX >= w - 2) return false;
    return bw > w * 0.06 && bhh > bh * 0.3 && c.area / (bw * bhh) < 0.4;
  });
  if (outlines.length >= 2) {
    return outlines
      .sort((a, b) => a.minX - b.minX)
      .slice(0, expected)
      .map(toRect);
  }

  // strategy 2: cluster ink components by x-gaps
  const ink = components.filter((c) => {
    const bw = c.maxX - c.minX + 1;
    return bw > 4 && c.maxY - c.minY + 1 > bh * 0.2;
  });
  if (ink.length < 2) return [];
  ink.sort((a, b) => a.minX - b.minX);
  const clusters: Component[][] = [[ink[0]]];
  for (let i = 1; i < ink.length; i++) {
    const prev = ink[i - 1];
    const cur = ink[i];
    if (cur.minX - prev.maxX < w * 0.03) clusters[clusters.length - 1].push(cur);
    else clusters.push([cur]);
  }
  const merged = clusters
    .map((group) => ({
      minX: Math.min(...group.map((c) => c.minX)),
      maxX: Math.max(...group.map((c) => c.maxX)),
      minY: Math.min(...group.map((c) => c.minY)),
      maxY: Math.max(...group.map((c) => c.maxY)),
      area: 0,
    }))
    .filter((c) => c.maxX - c.minX + 1 > w * 0.04);
  return merged
    .sort((a, b) => a.minX - b.minX)
    .slice(0, expected)
    .map((c) => ({
      x: c.minX - 4,
      y: y0 + c.minY - 4,
      w: c.maxX - c.minX + 9,
      h: c.maxY - c.minY + 9,
    }));
}

function otsuBand(hist: number[], total: number): number {
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * hist[i];
  let sumB = 0;
  let wB = 0;
  let best = 0;
  let threshold = 127;
  for (let i = 0; i < 256; i++) {
    wB += hist[i];
    if (wB === 0) continue;
    const wF = total - wB;
    if (wF === 0) break;
    sumB += i * hist[i];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);
    if (between > best) {
      best = between;
      threshold = i;
    }
  }
  return threshold;
}
