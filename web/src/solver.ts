/**
 * Pixel-space solvers for the five GIA modules + question classifier.
 *
 * Everything here operates on the RECTIFIED screen (ImageData) — no DOM, no
 * page access: camera pixels in, answer index + confidence out. Shared
 * connected-component engine feeds option-box detection (numeric/word/
 * reasoning/perceptual answers), the perceptual letter grid and the spatial
 * square/glyph extraction.
 */

// ---------------------------------------------------------------------------
// Shared component engine (Otsu + 8-connected flood fill, interior-only)
// ---------------------------------------------------------------------------

export interface Rect { x: number; y: number; w: number; h: number }
interface Comp { minX: number; minY: number; maxX: number; maxY: number; area: number }

function otsuBand(hist: number[], total: number): number {
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * hist[i];
  let sumB = 0, wB = 0, best = 0, t = 127;
  for (let i = 0; i < 256; i++) {
    wB += hist[i];
    if (wB === 0) continue;
    const wF = total - wB;
    if (wF === 0) break;
    sumB += i * hist[i];
    const mB = sumB / wB, mF = (sum - sumB) / wF;
    const b = wB * wF * (mB - mF) * (mB - mF);
    if (b > best) { best = b; t = i; }
  }
  return t;
}

/** Dark-ink components in a horizontal band, ignoring the outermost frame. */
export function findComponents(frame: ImageData, y0f: number, y1f: number): Comp[] {
  const { width: w, height: h, data } = frame;
  const y0 = Math.max(0, Math.round(h * y0f));
  const y1 = Math.min(h, Math.round(h * y1f));
  const bh = y1 - y0;
  if (bh < 4) return [];
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
  // Multi-threshold sweep: real screen captures leave text at mid-gray
  // (100-160) after resampling, while a plain Otsu split fights between the
  // bright page and the dark out-of-bounds fill. Try progressively higher
  // thresholds and keep the first that yields interior components.
  const otsuTh = otsuBand(hist, w * bh);
  const INSET = 2;
  const inside = (x: number, y: number): boolean =>
    x >= INSET && x < w - INSET && y >= INSET && y < bh - INSET;
  const thresholds = [
    Math.max(40, Math.round(otsuTh * 0.65)),
    otsuTh,
    190,
    215,
  ].filter((v, i, arr) => arr.indexOf(v) === i);
  let comps: Comp[] = [];
  for (const th of thresholds) {
    comps = scanComponents(gray, w, bh, th, inside);
    if (comps.length > 0) break;
  }
  return comps;
}

function scanComponents(gray: Uint8Array, w: number, bh: number, th: number, inside: (x: number, y: number) => boolean): Comp[] {
  const INSET = 2;
  const dark = (x: number, y: number): boolean =>
    inside(x, y) && gray[y * w + x] < th;
  const visited = new Uint8Array(w * bh);
  const comps: Comp[] = [];
  const stack: number[] = [];
  for (let sy = INSET; sy < bh - INSET; sy++) {
    for (let sx = INSET; sx < w - INSET; sx++) {
      const start = sy * w + sx;
      if (gray[start] >= th || visited[start]) continue;
      stack.length = 0;
      stack.push(start);
      visited[start] = 1;
      const c: Comp = { minX: w, minY: bh, maxX: 0, maxY: 0, area: 0 };
      while (stack.length) {
        const idx = stack.pop() as number;
        const x = idx % w;
        const y = (idx / w) | 0;
        c.area++;
        if (x < c.minX) c.minX = x;
        if (x > c.maxX) c.maxX = x;
        if (y < c.minY) c.minY = y;
        if (y > c.maxY) c.maxY = y;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx, ny = y + dy;
            if (dark(nx, ny)) {
              const ni = ny * w + nx;
              if (!visited[ni]) { visited[ni] = 1; stack.push(ni); }
            }
          }
        }
      }
      if (c.area >= 12) comps.push(c);
    }
  }
  return comps;
}

const toRect = (c: Comp, y0: number): Rect => ({ x: c.minX, y: y0 + c.minY, w: c.maxX - c.minX + 1, h: c.maxY - c.minY + 1 });

/**
 * Detect answer-option boxes in a band: outline components first (boxed
 * layouts), digit/word clusters second (unboxed layouts).
 */
export function findOptionBoxes(frame: ImageData, y0f: number, expected: number): Rect[] {
  const { width: w } = frame;
  const y0 = Math.round(frame.height * y0f);
  const bandH = frame.height - y0;
  const comps = findComponents(frame, y0f, 1.0);
  const outlines = comps.filter((c) => {
    const bw = c.maxX - c.minX + 1, bhh = c.maxY - c.minY + 1;
    if (c.minX <= 1 || c.maxX >= w - 2) return false;
    return bw > w * 0.05 && bhh > bandH * 0.25 && c.area / (bw * bhh) < 0.45;
  });
  if (outlines.length >= 2) {
    return outlines.sort((a, b) => a.minX - b.minX).slice(0, expected).map((c) => toRect(c, y0));
  }
  // cluster ink blobs by x-gaps
  const ink = comps.filter((c) => c.maxX - c.minX > 3).sort((a, b) => a.minX - b.minX);
  if (ink.length < 2) return [];
  const clusters: Comp[][] = [[ink[0]]];
  for (let i = 1; i < ink.length; i++) {
    const prev = ink[i - 1], cur = ink[i];
    if (cur.minX - prev.maxX < w * 0.035) clusters[clusters.length - 1].push(cur);
    else clusters.push([cur]);
  }
  return clusters
    .map((g) => {
      const minX = Math.min(...g.map((c) => c.minX)), maxX = Math.max(...g.map((c) => c.maxX));
      const minY = Math.min(...g.map((c) => c.minY)), maxY = Math.max(...g.map((c) => c.maxY));
      return { minX, minY, maxX, maxY, area: 0 };
    })
    .filter((c) => c.maxX - c.minX > w * 0.04)
    .sort((a, b) => a.minX - b.minX)
    .slice(0, expected)
    .map((c) => ({ x: c.minX - 4, y: y0 + c.minY - 4, w: c.maxX - c.minX + 9, h: c.maxY - c.minY + 9 }));
}

// ---------------------------------------------------------------------------
// Question classifier (OCR text → module)
// ---------------------------------------------------------------------------

export type ModuleKind = "numeric" | "perceptual" | "word" | "reasoning" | "spatial" | "unknown";

export function stripAccents(t: string): string {
  return t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

export function classifyQuestion(line: string): ModuleKind {
  const t = stripAccents(line);
  if (t.includes("mediana") || t.includes("numero")) return "numeric";
  if (t.includes("columna")) return "perceptual";
  if (t.includes("palabra")) return "word";
  if (t.includes("cuadrado")) return "spatial";
  if (t.includes("quien")) return "reasoning";
  return "unknown";
}

// ---------------------------------------------------------------------------
// Numeric solver (solver-specification.md §4)
// ---------------------------------------------------------------------------

export interface NumericSolution {
  solved: boolean;
  answerIndex: number | null;
  confidence: number;
  values: number[];
  median: number | null;
  reason: string;
}

export function solveNumeric(values: number[]): NumericSolution {
  if (values.length !== 3 || values.some((v) => !Number.isFinite(v))) {
    return { solved: false, answerIndex: null, confidence: 0, values, median: null, reason: "expected 3 numbers" };
  }
  const median = [...values].sort((a, b) => a - b)[1];
  const distances = values.map((v) => Math.abs(v - median));
  let best = 0;
  for (let i = 1; i < 3; i++) if (distances[i] > distances[best]) best = i;
  if (distances.filter((d) => d === distances[best]).length > 1) {
    return { solved: false, answerIndex: null, confidence: 0, values, median, reason: "tie (VERIFY-006): refusing to guess" };
  }
  return { solved: true, answerIndex: best, confidence: 1, values, median, reason: "unique max distance to median" };
}

// ---------------------------------------------------------------------------
// Perceptual solver: letter grid extraction (glyphs clustered by column)
// ---------------------------------------------------------------------------

export interface PerceptualGrid {
  columns: Array<[Rect, Rect]> | null; // [topGlyph, bottomGlyph] × 4
}

export function extractLetterGrid(frame: ImageData, y0f = 0.26, y1f = 0.68): PerceptualGrid {
  const { width: w } = frame;
  const y0 = Math.round(frame.height * y0f);
  const comps = findComponents(frame, y0f, y1f)
    .filter((c) => c.maxX - c.minX > w * 0.008 && c.maxY - c.minY > 4);
  if (comps.length < 8) return { columns: null };
  comps.sort((a, b) => a.minX - b.minX);
  const clusters: Comp[][] = [[comps[0]]];
  for (let i = 1; i < comps.length; i++) {
    const prev = comps[i - 1], cur = comps[i];
    if (cur.minX - prev.maxX < w * 0.03) clusters[clusters.length - 1].push(cur);
    else clusters.push([cur]);
  }
  const columns: Array<[Rect, Rect]> = [];
  for (const cluster of clusters) {
    if (cluster.length < 2) continue;
    // group into rows by vertical gaps (dotted letters i/j split into dot +
    // body components that belong to the same row)
    const sorted = [...cluster].sort((a, b) => a.minY - b.minY);
    const rows: Comp[][] = [[sorted[0]]];
    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1], cur = sorted[i];
      if (cur.minY - prev.maxY > 14) rows.push([cur]);
      else rows[rows.length - 1].push(cur);
    }
    if (rows.length !== 2) continue;
    const rowRect = (row: Comp[]): Rect => {
      const minX = Math.min(...row.map((c) => c.minX));
      const minY = Math.min(...row.map((c) => c.minY));
      const maxX = Math.max(...row.map((c) => c.maxX));
      const maxY = Math.max(...row.map((c) => c.maxY));
      return { x: minX, y: y0 + minY, w: maxX - minX + 1, h: maxY - minY + 1 };
    };
    const rowHeight = (row: Comp[]): number =>
      Math.max(...row.map((c) => c.maxY)) - Math.min(...row.map((c) => c.minY));
    const topRow = rows[0];
    const bottomRow = rows[rows.length - 1];
    if (rowHeight(topRow) < 8 || rowHeight(bottomRow) < 8) continue;
    columns.push([rowRect(topRow), rowRect(bottomRow)]);
  }
  if (columns.length !== 4) return { columns: null };
  return { columns };
}

export function countMatchingColumns(letters: string[]): NumericSolution {
  // letters = [top0, bottom0, top1, bottom1, ...]
  if (letters.length !== 8 || letters.some((l) => !l)) {
    return { solved: false, answerIndex: null, confidence: 0, values: [], median: null, reason: "grid OCR incomplete" };
  }
  let count = 0;
  for (let c = 0; c < 4; c++) {
    if (stripAccents(letters[2 * c]) === stripAccents(letters[2 * c + 1])) count++;
  }
  return { solved: true, answerIndex: count, confidence: 1, values: [count], median: null, reason: `${count} matching columns` };
}

// ---------------------------------------------------------------------------
// Spatial solver: chirality via blur-cosine rotation/mirror sweeps
// (TS port of src/gia_ar_solver/solvers/spatial.py)
// ---------------------------------------------------------------------------

const CANVAS = 96;
const COARSE = 5.0, FINE = 1.0, FINE_WIN = 6.0;
const MATCH_THRESHOLD = 0.88, MATCH_MARGIN = 0.10, SYMMETRY_THRESHOLD = 0.90;

const MASK_LEN = CANVAS * CANVAS;
const newMask = (): Float32Array => new Float32Array(MASK_LEN);

function rectGray(frame: ImageData, r: Rect): { gray: Uint8Array; w: number; h: number } | null {
  const x0 = Math.max(0, Math.round(r.x)), y0 = Math.max(0, Math.round(r.y));
  const w = Math.max(1, Math.round(r.w)), h = Math.max(1, Math.round(r.h));
  if (x0 + w > frame.width || y0 + h > frame.height || w < 3 || h < 3) return null;
  const gray = new Uint8Array(w * h);
  const hist = new Array<number>(256).fill(0);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = ((y0 + y) * frame.width + x0 + x) * 4;
      const g = (frame.data[i] * 299 + frame.data[i + 1] * 587 + frame.data[i + 2] * 114) / 1000;
      gray[y * w + x] = g | 0;
      hist[gray[y * w + x]]++;
    }
  }
  const th = otsuBand(hist, w * h);
  // binary mask via flood of largest component would be ideal; threshold is
  // enough here because the crop is a tight glyph bbox
  for (let p = 0; p < gray.length; p++) gray[p] = gray[p] < Math.max(40, th * 0.8) ? 1 : 0;
  return { gray, w, h };
}

function normalizeBinary(gray: Uint8Array, w: number, h: number): Float32Array | null {
  let minX = w, minY = h, maxX = 0, maxY = 0, area = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (gray[y * w + x]) {
        area++;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (area < 20 || maxX <= minX || maxY <= minY) return null;
  const gw = maxX - minX + 1, gh = maxY - minY + 1;
  const scale = (CANVAS - 8) / Math.max(gw, gh); // longest side only (rotation invariance)
  const rw = Math.max(1, Math.round(gw * scale)), rh = Math.max(1, Math.round(gh * scale));
  const canvas = newMask();
  let cx = 0, cy = 0, n = 0;
  for (let y = 0; y < rh; y++) {
    const sy = minY + Math.min(gh - 1, Math.floor((y / rh) * gh));
    for (let x = 0; x < rw; x++) {
      const sx = minX + Math.min(gw - 1, Math.floor((x / rw) * gw));
      if (gray[sy * w + sx]) {
        const px = ((CANVAS - rw) >> 1) + x, py = ((CANVAS - rh) >> 1) + y;
        canvas[py * CANVAS + px] = 1;
        cx += px; cy += py; n++;
      }
    }
  }
  if (!n) return null;
  cx = Math.round(cx / n); cy = Math.round(cy / n);
  const shifted = newMask();
  const dx = (CANVAS >> 1) - cx, dy = (CANVAS >> 1) - cy;
  for (let y = 0; y < CANVAS; y++) {
    for (let x = 0; x < CANVAS; x++) {
      const sx = x - dx, sy = y - dy;
      if (sx >= 0 && sx < CANVAS && sy >= 0 && sy < CANVAS) shifted[y * CANVAS + x] = canvas[sy * CANVAS + sx];
    }
  }
  return shifted;
}

function normalizeGlyph(frame: ImageData, r: Rect): Float32Array | null {
  const g = rectGray(frame, r);
  if (!g) return null;
  return normalizeBinary(g.gray, g.w, g.h);
}

// --- alphabet template matching (perceptual glyph identification) ---

export interface GlyphId { letter: string; margin: number }

let refCache: Array<{ letter: string; mask: Float32Array }> | null = null;

function buildRefs(): Array<{ letter: string; mask: Float32Array }> {
  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
  const c = document.createElement("canvas");
  c.width = CANVAS; c.height = CANVAS;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  const refs: Array<{ letter: string; mask: Float32Array }> = [];
  if (!ctx) return refs;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (const L of letters) {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, CANVAS, CANVAS);
    ctx.fillStyle = "#000000";
    ctx.font = `bold ${Math.round(CANVAS * 0.75)}px sans-serif`;
    ctx.fillText(L, CANVAS / 2, CANVAS / 2 + 2);
    const img = ctx.getImageData(0, 0, CANVAS, CANVAS);
    const bin = new Uint8Array(CANVAS * CANVAS);
    for (let p = 0, i = 0; p < bin.length; p++, i += 4) {
      const g = (img.data[i] * 299 + img.data[i + 1] * 587 + img.data[i + 2] * 114) / 1000;
      bin[p] = g < 128 ? 1 : 0;
    }
    const mask = normalizeBinary(bin, CANVAS, CANVAS);
    if (mask) refs.push({ letter: L, mask });
  }
  return refs;
}

export interface ColumnMatch {
  matched: boolean;
  letter: string;
  score: number; // combined top+bottom score, 0..2
  margin: number;
}

/**
 * Decide whether a column's two glyphs are the same letter (any case) by
 * asking: does ONE letter of the alphabet explain both glyphs? This kills
 * the sans-serif ambiguities (l vs I, G vs Q) that per-glyph identification
 * cannot resolve after scale normalization.
 */
export function matchColumn(frame: ImageData, top: Rect, bottom: Rect, threshold = 1.55, marginReq = 0.06): ColumnMatch | null {
  if (!refCache) refCache = buildRefs();
  if (!refCache.length) return null;
  const mT = normalizeGlyph(frame, top);
  const mB = normalizeGlyph(frame, bottom);
  if (!mT || !mB) return null;
  // best score per LETTER (either case may explain each glyph)
  const byLetter = new Map<string, number>();
  for (const ref of refCache) {
    const key = ref.letter.toLowerCase();
    const prev = byLetter.get(key) ?? 0;
    // per glyph, keep this letter's best-case explanation
    byLetter.set(key, 0); // placeholder to init
    if (prev === 0) byLetter.set(key, 0);
  }
  const letters = [...new Set(refCache.map((r) => r.letter.toLowerCase()))];
  let bestLetter = "";
  let bestScore = 0;
  let second = 0;
  for (const L of letters) {
    const refs = refCache.filter((r) => r.letter.toLowerCase() === L);
    const sT = Math.max(...refs.map((r) => rawCosine(mT, r.mask)));
    const sB = Math.max(...refs.map((r) => rawCosine(mB, r.mask)));
    const combined = sT + sB;
    if (combined > bestScore) { second = bestScore; bestScore = combined; bestLetter = L; }
    else if (combined > second) second = combined;
  }
  return {
    matched: bestScore >= threshold && bestScore - second >= marginReq,
    letter: bestLetter,
    score: bestScore,
    margin: bestScore - second,
  };
}

function rawCosine(a: Float32Array, b: Float32Array): number {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const d = Math.sqrt(na * nb);
  return d > 0 ? dot / d : 0;
}

/**
 * Identify a glyph against the rendered alphabet. Raw (unblurred) cosine:
 * both masks are centroid-centered and scale-normalized, and the sharp
 * comparison preserves exactly the small details (G vs Q tick, l vs I serif)
 * that blur-cosine washes out.
 */
export function identifyGlyph(frame: ImageData, r: Rect): GlyphId | null {
  if (!refCache) refCache = buildRefs();
  if (!refCache.length) return null;
  const mask = normalizeGlyph(frame, r);
  if (!mask) return null;
  let best = "", bestScore = 0, second = 0;
  for (const ref of refCache) {
    const s = rawCosine(mask, ref.mask);
    if (s > bestScore) { second = bestScore; bestScore = s; best = ref.letter; }
    else if (s > second) second = s;
  }
  return { letter: best, margin: Math.max(0, Math.min(1, bestScore - second)) };
}

function rotateMask(m: Float32Array, angleDeg: number): Float32Array {
  const rad = (angleDeg * Math.PI) / 180;
  const cos = Math.cos(rad), sin = Math.sin(rad);
  const c = (CANVAS - 1) / 2;
  const out = newMask();
  for (let y = 0; y < CANVAS; y++) {
    for (let x = 0; x < CANVAS; x++) {
      // inverse map: output ← source rotated by -angle
      const sx = cos * (x - c) + sin * (y - c) + c;
      const sy = -sin * (x - c) + cos * (y - c) + c;
      if (sx >= 0 && sx < CANVAS - 1 && sy >= 0 && sy < CANVAS - 1) {
        const x0 = sx | 0, y0 = sy | 0;
        const fx = sx - x0, fy = sy - y0;
        const v = m[y0 * CANVAS + x0] * (1 - fx) * (1 - fy)
          + m[y0 * CANVAS + x0 + 1] * fx * (1 - fy)
          + m[(y0 + 1) * CANVAS + x0] * (1 - fx) * fy
          + m[(y0 + 1) * CANVAS + x0 + 1] * fx * fy;
        out[y * CANVAS + x] = v > 0.5 ? 1 : 0;
      }
    }
  }
  return out;
}

function mirrorMask(m: Float32Array): Float32Array {
  const out = newMask();
  for (let y = 0; y < CANVAS; y++) {
    for (let x = 0; x < CANVAS; x++) out[y * CANVAS + x] = m[y * CANVAS + (CANVAS - 1 - x)];
  }
  return out;
}

function blur(m: Float32Array): Float32Array {
  // separable gaussian, kernel 9 sigma 2
  const k = [0.006, 0.061, 0.242, 0.383, 0.242, 0.061, 0.006]; // normalized 7-tap σ≈2 approx
  const tmp = new Float32Array(CANVAS * CANVAS);
  const out = new Float32Array(CANVAS * CANVAS);
  for (let y = 0; y < CANVAS; y++) {
    for (let x = 0; x < CANVAS; x++) {
      let s = 0;
      for (let i = -3; i <= 3; i++) {
        const xx = Math.min(CANVAS - 1, Math.max(0, x + i));
        s += m[y * CANVAS + xx] * k[i + 3];
      }
      tmp[y * CANVAS + x] = s;
    }
  }
  for (let y = 0; y < CANVAS; y++) {
    for (let x = 0; x < CANVAS; x++) {
      let s = 0;
      for (let i = -3; i <= 3; i++) {
        const yy = Math.min(CANVAS - 1, Math.max(0, y + i));
        s += tmp[yy * CANVAS + x] * k[i + 3];
      }
      out[y * CANVAS + x] = s;
    }
  }
  return out;
}

function similarity(a: Float32Array, b: Float32Array): number {
  const fa = blur(a), fb = blur(b);
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += fa[i] * fb[i];
    na += fa[i] * fa[i];
    nb += fb[i] * fb[i];
  }
  const denom = Math.sqrt(na * nb);
  return denom > 0 ? dot / denom : 0;
}

function translatedSim(a: Float32Array, b: Float32Array, maxShift = 6, step = 2): number {
  let best = similarity(a, b);
  for (let dy = -maxShift; dy <= maxShift; dy += step) {
    for (let dx = -maxShift; dx <= maxShift; dx += step) {
      if (dx === 0 && dy === 0) continue;
      const shifted = newMask();
      for (let y = 0; y < CANVAS; y++) {
        for (let x = 0; x < CANVAS; x++) {
          const sx = x - dx, sy = y - dy;
          if (sx >= 0 && sx < CANVAS && sy >= 0 && sy < CANVAS) shifted[y * CANVAS + x] = a[sy * CANVAS + sx];
        }
      }
      best = Math.max(best, similarity(shifted, b));
    }
  }
  return best;
}

function rotationScore(ref: Float32Array, target: Float32Array, mirrored: boolean): number {
  const src = mirrored ? mirrorMask(ref) : ref;
  let best = 0, bestAngle = 0;
  for (let a = -180; a < 180; a += COARSE) {
    const s = similarity(rotateMask(src, a), target);
    if (s > best) { best = s; bestAngle = a; }
  }
  best = translatedSim(rotateMask(src, bestAngle), target);
  for (let a = bestAngle - FINE_WIN; a <= bestAngle + FINE_WIN; a += FINE) {
    const s = similarity(rotateMask(src, a), target);
    if (s > best) { best = s; bestAngle = a; }
  }
  return Math.max(best, translatedSim(rotateMask(src, bestAngle), target));
}

export interface SquareVerdict {
  match: boolean;
  rotationScore: number;
  mirrorScore: number;
  confidence: number;
}

export function classifyGlyphPair(frame: ImageData, top: Rect, bottom: Rect): SquareVerdict | null {
  const t = normalizeGlyph(frame, top);
  const b = normalizeGlyph(frame, bottom);
  if (!t || !b) return null;
  const rot = rotationScore(t, b, false);
  const mir = rotationScore(t, b, true);
  const sym = rotationScore(t, mirrorMask(t), false);
  let match = false;
  if (rot >= MATCH_THRESHOLD && rot - mir >= MATCH_MARGIN) match = true;
  else if (mir >= MATCH_THRESHOLD && sym >= SYMMETRY_THRESHOLD) match = true;
  const confidence = Math.max(0, Math.min(1, Math.abs(rot - mir)));
  return { match, rotationScore: rot, mirrorScore: mir, confidence };
}

/** Extract the two stimulus squares (outlined) from the rectified frame. */
export function findSquares(frame: ImageData, y1f = 0.72): Array<[Rect, Rect]> | null {
  const { width: w } = frame;
  const y0 = Math.round(frame.height * 0.1);
  const comps = findComponents(frame, 0.1, y1f);
  const squares = comps.filter((c) => {
    const bw = c.maxX - c.minX + 1, bh = c.maxY - c.minY + 1;
    if (c.minX <= 1 || c.maxX >= w - 2) return false;
    return bw > w * 0.12 && bh > frame.height * 0.18 && c.area / (bw * bh) < 0.35;
  }).sort((a, b) => a.minX - b.minX);
  if (squares.length < 2) return null;
  const out: Array<[Rect, Rect]> = [];
  for (const sq of squares.slice(0, 2)) {
    // interior glyphs: components fully inside the square, 2 largest by area
    const glyphs = comps
      .filter((c) => c !== sq
        && c.minX > sq.minX && c.maxX < sq.maxX
        && c.minY > sq.minY && c.maxY < sq.maxY
        && (c.maxX - c.minX) > 6)
      .sort((a, b) => b.area - a.area);
    if (glyphs.length < 2) return null;
    const two = [...glyphs.slice(0, 2)].sort((a, b) => a.minY - b.minY);
    out.push([toRect(two[0], y0), toRect(two[1], y0)]);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Reasoning solver (statement + question text → option index)
// ---------------------------------------------------------------------------

const LEX: Record<string, [string, number]> = {
  organizado: ["organization", 1], ordenado: ["organization", 1], caotico: ["organization", -1], desordenado: ["organization", -1], meticuloso: ["organization", 1],
  atento: ["attention", 1], distraido: ["attention", -1], desatento: ["attention", -1], descuidado: ["attention", -1], vigilante: ["attention", 1], despistado: ["attention", -1],
  fiable: ["trust", 1], confiable: ["trust", 1], leal: ["trust", 1], sincero: ["trust", 1], honesto: ["trust", 1], sospechoso: ["trust", -1], desleal: ["trust", -1], mentiroso: ["trust", -1], infiel: ["trust", -1],
  valiente: ["courage", 1], cobarde: ["courage", -1], audaz: ["courage", 1],
  fuerte: ["strength", 1], debil: ["strength", -1],
  inteligente: ["intelligence", 1], listo: ["intelligence", 1], brillante: ["intelligence", 1], tonto: ["intelligence", -1], necio: ["intelligence", -1], sabio: ["intelligence", 1],
  amable: ["kindness", 1], simpatico: ["kindness", 1], agradable: ["kindness", 1], amigable: ["kindness", 1], tierno: ["kindness", 1], carinoso: ["kindness", 1], grosero: ["kindness", -1], desagradable: ["kindness", -1], cruel: ["kindness", -1], hostil: ["kindness", -1],
  cooperativo: ["cooperation", 1], individualista: ["cooperation", -1],
  empatico: ["empathy", 1], insensible: ["empathy", -1], compasivo: ["empathy", 1],
  educado: ["politeness", 1], respetuoso: ["politeness", 1], maleducado: ["politeness", -1],
  humilde: ["humility", 1], arrogante: ["humility", -1], orgulloso: ["humility", -1],
  activo: ["energy", 1], dinamico: ["energy", 1], energetico: ["energy", 1], enegico: ["energy", 1], perezoso: ["energy", -1], vago: ["energy", -1],
  divertido: ["fun", 1], serio: ["fun", -1], aburrido: ["fun", -1],
  perdonador: ["forgiveness", 1], tolerante: ["forgiveness", 1], resentido: ["forgiveness", -1], rencoroso: ["forgiveness", -1],
  flexible: ["flexibility", 1], rigido: ["flexibility", -1],
  accesible: ["approachability", 1], cercano: ["approachability", 1], abierto: ["approachability", 1], intimidante: ["approachability", -1], distante: ["approachability", -1], reservado: ["approachability", -1],
  alto: ["height", 1], bajo: ["height", -1],
  optimista: ["optimism", 1], pesimista: ["optimism", -1],
  paciente: ["patience", 1], impaciente: ["patience", -1],
  generoso: ["generosity", 1], egoista: ["generosity", -1], tacano: ["generosity", -1],
  innovador: ["novelty", 1], creativo: ["novelty", 1], original: ["novelty", 1], conservador: ["novelty", -1], clasico: ["novelty", -1],
  diplomatico: ["diplomacy", 1], agresivo: ["diplomacy", -1],
  entusiasta: ["enthusiasm", 1], apatico: ["enthusiasm", -1],
  trabajador: ["diligence", 1], aplicado: ["diligence", 1], disciplinado: ["diligence", 1], flojo: ["diligence", -1],
  ingenioso: ["wit", 1], gracioso: ["wit", 1],
  prudente: ["prudence", 1], imprudente: ["prudence", -1], cauto: ["prudence", 1], cauteloso: ["prudence", 1], temerario: ["prudence", -1],
  sociable: ["sociability", 1], extrovertido: ["sociability", 1], hablador: ["sociability", 1], callado: ["sociability", -1], timido: ["sociability", -1], solitario: ["sociability", -1],
  maduro: ["maturity", 1], inmaduro: ["maturity", -1],
  curioso: ["curiosity", 1],
  puntual: ["punctuality", 1], impuntual: ["punctuality", -1],
  predecible: ["predictability", 1], impredecible: ["predictability", -1], inconsistente: ["predictability", -1],
  romantico: ["romance", 1], pragmatico: ["romance", -1],
  motivado: ["motivation", 1], desmotivado: ["motivation", -1],
  sereno: ["calm", 1], tranquilo: ["calm", 1], nervioso: ["calm", -1],
  ambicioso: ["ambition", 1], conformista: ["ambition", -1],
};

function norm(t: string): string {
  return stripAccents(t).replace(/-a\b|-e\b|-o\b/g, "").replace(/[().?¡!]/g, " ").replace(/\s+/g, " ").trim();
}

function lookupTrait(adj: string): [string, number] | null {
  const t = norm(adj);
  if (LEX[t]) return LEX[t];
  for (const pref of ["in", "des", "im", "i"]) {
    if (t.startsWith(pref) && LEX[t.slice(pref.length)]) {
      const [dim, pol] = LEX[t.slice(pref.length)];
      return [dim, -pol];
    }
  }
  return null;
}

const cap = (w: string): string => w.charAt(0).toUpperCase() + w.slice(1);

export interface ParsedStatement { s: string; adj: string; rel: "LT" | "GT" | "EQ"; o: string }

export function parseStatement(text: string): ParsedStatement | null {
  const t = norm(text);
  let m = t.match(/^(\w+) no es tan ([\w-]+) como (\w+)/);
  if (m) return { s: cap(m[1]), adj: m[2], rel: "LT", o: cap(m[3]) };
  m = t.match(/^(\w+) es (mas|menos) ([\w-]+) que (\w+)/);
  if (m) return { s: cap(m[1]), adj: m[3], rel: m[2] === "mas" ? "GT" : "LT", o: cap(m[4]) };
  m = t.match(/^(\w+) es tan ([\w-]+) como (\w+)/);
  if (m) return { s: cap(m[1]), adj: m[2], rel: "EQ", o: cap(m[3]) };
  return null;
}

export function looksLikeStatement(text: string): boolean {
  return parseStatement(text) !== null;
}

export function parseQuestion(text: string): { adj: string; wantMax: boolean } | null {
  const t = norm(text);
  const m = t.match(/^quien(es)? (no )?es (mas|menos) ([\w-]+)/);
  if (!m) return null;
  let wantMax = m[3] === "mas";
  if (m[2]) wantMax = !wantMax;
  return { adj: m[4], wantMax };
}

export interface ReasoningSolution {
  answerText: string | null;
  confidence: number;
  reason: string;
}

export function solveReasoning(statement: string, question: string, options: string[]): ReasoningSolution {
  const rel = parseStatement(statement);
  const query = parseQuestion(question);
  if (!rel || !query) return { answerText: null, confidence: 0, reason: "parse failed" };
  const t1 = lookupTrait(rel.adj);
  const t2 = lookupTrait(query.adj);
  if (!t1 || !t2) return { answerText: null, confidence: 0, reason: `lexicon: ${!t1 ? rel.adj : query.adj}` };
  if (t1[0] !== t2[0]) return { answerText: null, confidence: 0, reason: "dimension mismatch" };
  const [, sign] = t1;
  let ranks: Record<string, number>;
  if (rel.rel === "EQ") ranks = { [rel.s]: 0, [rel.o]: 0 };
  else {
    const gt = (sign > 0) === (rel.rel === "GT");
    ranks = gt ? { [rel.s]: 1, [rel.o]: 0 } : { [rel.s]: 0, [rel.o]: 1 };
  }
  const scored = options.map((opt) => {
    const key = Object.keys(ranks).find((n) => n === opt || norm(n) === norm(opt));
    return { opt, score: key !== undefined ? sign * ranks[key] : null };
  });
  if (scored.some((x) => x.score === null)) return { answerText: null, confidence: 0, reason: "option not in statement" };
  const target = query.wantMax ? Math.max(...scored.map((x) => x.score as number)) : Math.min(...scored.map((x) => x.score as number));
  const winners = scored.filter((x) => x.score === target);
  if (winners.length !== 1) return { answerText: null, confidence: 0, reason: "tie" };
  return { answerText: winners[0].opt, confidence: 0.9, reason: `${t1[0]} ranking` };
}

// ---------------------------------------------------------------------------
// Word-meaning solver: lexical cascade with auditable confidence
// ---------------------------------------------------------------------------

const isVerb = (w: string): boolean => /(ar|er|ir)$/.test(stripAccents(w)) && w.length > 4;
const isAdj = (w: string): boolean => /(nte|oso|osa|ivo|iva|ado|ada|ido|ida|able|ible|il|ente|ante)$/.test(stripAccents(w)) && w.length > 5;

const WORD_CATS: Record<string, string[]> = {
  clothing: ["jersey", "abrigo", "camisa", "pantalon", "zapato", "chaqueta", "bufanda", "guante", "falda", "vestido", "sombrero"],
  profession: ["medico", "doctor", "paramedico", "profesor", "enfermero", "abogado", "ingeniero", "policia", "bombero", "arquitecto"],
  tech: ["computadora", "tableta", "ordenador", "teclado", "pantalla", "movil", "portatil"],
  instrument: ["guitarra", "violin", "violonchelo", "piano", "trompeta", "flauta", "bateria", "arpa", "viola", "contrabajo", "saxofon", "clarinete"],
  place: ["jungla", "matorral", "bosque", "desierto", "playa", "montana", "ciudad", "pueblo"],
  tool: ["alicates", "martillo", "destornillador", "sierra", "taladro"],
  notepad: ["bloc", "cuaderno", "libreta"],
  event: ["simposio", "conferencia", "congreso", "seminario", "reunion"],
  vehicle: ["monopatin", "patines", "bicicleta", "coche", "moto"],
};

function wordCategory(w: string): string | null {
  const lw = stripAccents(w);
  for (const [cat, ws] of Object.entries(WORD_CATS)) if (ws.includes(lw)) return cat;
  return null;
}

export interface WordSolution {
  oddIndex: number | null;
  confidence: number;
  reason: string;
}

export function solveWordMeaning(words: string[]): WordSolution {
  if (words.length !== 3) return { oddIndex: null, confidence: 0, reason: "expected 3 words" };
  const cats = words.map(wordCategory);
  for (let i = 0; i < 3; i++) {
    if (cats[i] === null) continue;
    const j = [0, 1, 2].find((k) => k !== i && cats[k] === cats[i]);
    if (j !== undefined) {
      const odd = 3 - i - j;
      return { oddIndex: odd, confidence: 0.95, reason: `category: ${cats[i]}` };
    }
  }
  const verbs = words.map(isVerb);
  const vCount = verbs.filter(Boolean).length;
  if (vCount === 1) return { oddIndex: verbs.indexOf(true), confidence: 0.8, reason: "unique verb" };
  if (vCount === 2) return { oddIndex: verbs.indexOf(false), confidence: 0.8, reason: "unique non-verb" };
  const adjs = words.map(isAdj);
  const aCount = adjs.filter(Boolean).length;
  if (aCount === 2) return { oddIndex: adjs.indexOf(false), confidence: 0.75, reason: "2 adjectives + 1 noun" };
  if (aCount === 1) return { oddIndex: adjs.indexOf(true), confidence: 0.75, reason: "unique adjective" };
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      if (i === j) continue;
      const a = stripAccents(words[i]), b = stripAccents(words[j]);
      if (a.length > 3 && (b.includes(a) || a.includes(b))) {
        return { oddIndex: 3 - i - j, confidence: 0.6, reason: "substring pair" };
      }
    }
  }
  // deterministic last resort (always answer, low confidence)
  return { oddIndex: 0, confidence: 0.3, reason: "ambiguous — low-confidence pick" };
}


// ---------------------------------------------------------------------------
// Token-based dispatch (Fase 1): OCR word tokens in → solution out.
// Shared by the webapp and the headless battery (pure logic, no DOM).
// ---------------------------------------------------------------------------

export interface OcrToken {
  text: string;
  conf: number;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface TokenSolution {
  module: ModuleKind;
  solved: boolean;
  answerIndex: number | null;
  label: string | null;
  box: Rect | null;
  confidence: number;
  reason: string;
}

function tokenRect(t: OcrToken): Rect {
  return { x: t.x0, y: t.y0, w: t.x1 - t.x0, h: t.y1 - t.y0 };
}

const isLowerToken = (t: OcrToken, h: number): boolean => (t.y0 + t.y1) / 2 >= h * 0.55;

/**
 * Classify + solve from OCR word tokens of the rectified screen.
 * `imageData` is only required for the spatial module (glyph geometry).
 */
export function solveFromTokens(
  tokens: OcrToken[],
  statement: string | null,
  imageData: { width: number; height: number; data: Uint8ClampedArray } | null,
): TokenSolution {
  const fail = (reason: string): TokenSolution => ({ module: "unknown", solved: false, answerIndex: null, label: null, box: null, confidence: 0, reason });
  const usable = tokens.filter((t) => t.conf >= 25 && t.text.trim());
  if (!usable.length) return fail("no tokens");
  const fullText = usable.map((t) => t.text).join(" ");
  const module = classifyQuestion(fullText);
  if (module === "unknown") return fail("module not recognized");

  // Content-anchored layout: locate the question line by its keyword, then
  // options are the tokens below it (footer excluded). Works on full page
  // screenshots and camera views alike — never assume the card fills the frame.
  const H = imageData?.height ?? Math.max(...usable.map((t) => t.y1));
  const KEYWORDS = ["mediana", "columnas", "palabra", "cuadrados", "quien"];
  let questionY: number | null = null;
  for (const t of usable) {
    const nt = norm(t.text);
    if (KEYWORDS.some((k) => nt.includes(k))) {
      const y = (t.y0 + t.y1) / 2;
      questionY = questionY === null ? y : Math.max(questionY, y);
    }
  }
  if (questionY === null) {
    const qTok = usable.find((t) => t.text.includes("?"));
    if (qTok) questionY = (qTok.y0 + qTok.y1) / 2;
  }
  if (questionY === null) return fail("question line not found");
  const below = usable.filter((t) => {
    const y = (t.y0 + t.y1) / 2;
    return y > questionY + 8 && y < H * 0.95;
  });

  if (module === "numeric") {
    const digitTokens = below.filter((t) => /^\d{1,4}$/.test(t.text));
    if (digitTokens.length !== 3) return fail(`numeric: ${digitTokens.length} digit tokens below question`);
    const sorted = [...digitTokens].sort((a, b) => a.x0 - b.x0);
    const values = sorted.map((t) => Number(t.text));
    const sol = solveNumeric(values);
    if (!sol.solved || sol.answerIndex === null) return { module, solved: false, answerIndex: null, label: null, box: null, confidence: 0, reason: sol.reason };
    const win = sorted[sol.answerIndex];
    return {
      module, solved: true, answerIndex: sol.answerIndex,
      label: String(values[sol.answerIndex]),
      box: tokenRect(win),
      confidence: 0.9, reason: sol.reason,
    };
  }

  if (module === "perceptual") {
    const digitOpts = below.filter((t) => /^[0-4]$/.test(t.text)).sort((a, b) => a.x0 - b.x0);
    const gridTokens = below.filter((t) => /^[A-Za-z]{1,8}$/.test(t.text) && t.text !== "-");
    if (!digitOpts.length || gridTokens.length < 2) return fail("perceptual: grid or options not found");
    // split grid tokens into 2 rows by the largest vertical gap
    const rows: OcrToken[][] = [];
    const sortedY = [...gridTokens].sort((a, b) => (a.y0 + a.y1) / 2 - (b.y0 + b.y1) / 2);
    let current: OcrToken[] = [sortedY[0]];
    let biggestGap = 0;
    for (let i = 1; i < sortedY.length; i++) {
      const gap = sortedY[i].y0 - sortedY[i - 1].y1;
      if (gap > biggestGap) { biggestGap = gap; rows.push(current = []); }
      current.push(sortedY[i]);
    }
    if (rows.length !== 2) return fail(`perceptual: ${rows.length} rows`);
    const rowStr = (row: OcrToken[]) =>
      [...row].sort((a, b) => a.x0 - b.x0).map((t) => t.text).join("");
    const topStr = rowStr(rows[0]);
    const botStr = rowStr(rows[1]);
    if (topStr.length !== 4 || botStr.length !== 4) return fail(`perceptual: rows len ${topStr.length}/${botStr.length}`);
    let matches = 0;
    for (let i = 0; i < 4; i++) {
      if (topStr[i].toLowerCase() === botStr[i].toLowerCase()) matches++;
    }
    const win = digitOpts[matches];
    if (!win) return fail("perceptual: digit option missing");
    return {
      module, solved: true, answerIndex: matches,
      label: String(matches),
      box: tokenRect(win),
      confidence: 0.85, reason: `${matches} matching columns`,
    };
  }

  if (module === "word") {
    const wordTokens = below.filter((t) => /^[A-Za-zÁÉÍÓÚÑáéíóúñü]+$/.test(t.text) && t.text.length >= 2);
    if (wordTokens.length !== 3) return fail(`word: ${wordTokens.length} word tokens`);
    const sorted = [...wordTokens].sort((a, b) => a.x0 - b.x0);
    const words = sorted.map((t) => t.text);
    const sol = solveWordMeaning(words);
    if (sol.oddIndex === null) return { module, solved: false, answerIndex: null, label: null, box: null, confidence: 0, reason: sol.reason };
    const win = sorted[sol.oddIndex];
    return {
      module, solved: true, answerIndex: sol.oddIndex,
      label: words[sol.oddIndex],
      box: tokenRect(win),
      confidence: sol.confidence, reason: sol.reason,
    };
  }

  if (module === "reasoning") {
    const nameTokens = below
      .filter((t) => /^[A-ZÁÉÍÓÚÑ][a-záéíóúñü]+$/.test(t.text) && t.text.length >= 3)
      .sort((a, b) => a.x0 - b.x0);
    if (nameTokens.length !== 2) return fail(`reasoning: ${nameTokens.length} name tokens`);
    const names = nameTokens.map((t) => t.text);
    if (!statement) return fail("reasoning: no statement in memory");
    const qm = norm(fullText).match(/quien(es)? (no )?es (mas|menos) ([\w-]+)/);
    if (!qm) return fail("reasoning: question not found");
    const sol = solveReasoning(statement, qm[0], names);
    if (!sol.answerText) return { module, solved: false, answerIndex: null, label: null, box: null, confidence: 0, reason: sol.reason };
    const answerText: string = sol.answerText;
    const idx = names.findIndex((n) => stripAccents(n) === stripAccents(answerText));
    if (idx < 0) return fail("reasoning: answer not among options");
    const win = nameTokens[idx];
    return {
      module, solved: true, answerIndex: idx,
      label: names[idx],
      box: tokenRect(win),
      confidence: sol.confidence, reason: sol.reason,
    };
  }

  if (module === "spatial") {
    if (!imageData) return fail("spatial: imageData required");
    const letterTokens = below
      .filter((t) => /^[A-Za-z]$/.test(t.text))
      .sort((a, b) => a.x0 - b.x0);
    if (letterTokens.length !== 4) return fail(`spatial: ${letterTokens.length} letter tokens`);
    const left = letterTokens.slice(0, 2).sort((a, b) => a.y0 - b.y0);
    const right = letterTokens.slice(2, 4).sort((a, b) => a.y0 - b.y0);
    const v1 = classifyGlyphPair(imageData as unknown as Parameters<typeof classifyGlyphPair>[0], tokenRect(left[0]), tokenRect(left[1]));
    const v2 = classifyGlyphPair(imageData as unknown as Parameters<typeof classifyGlyphPair>[0], tokenRect(right[0]), tokenRect(right[1]));
    if (!v1 || !v2) return fail("spatial: glyph extraction failed");
    const matches = (v1.match ? 1 : 0) + (v2.match ? 1 : 0);
    const digitOpts = below.filter((t) => /^[0-2]$/.test(t.text)).sort((a, b) => a.x0 - b.x0);
    const win = digitOpts[matches];
    if (!win) return fail("spatial: digit option missing");
    return {
      module, solved: true, answerIndex: matches,
      label: String(matches),
      box: tokenRect(win),
      confidence: Math.min(1, ((v1.confidence + v2.confidence) / 2) * 0.9 + 0.1),
      reason: "chirality",
    };
  }

  return fail("unhandled module");
}
// needed by solveFromTokens (re-exported norm lives in reasoning section)
