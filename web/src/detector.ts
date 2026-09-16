/**
 * Screen quad detection (pure TypeScript, no external CV dependency).
 *
 * Pipeline (roadmap §5): downscale → grayscale → Otsu threshold →
 * connected components → largest bright component → convex hull →
 * extreme-point quad corners → plausibility gates.
 *
 * The detector works on the assumption documented in roadmap §5: the test
 * screen is the dominant bright quadrilateral in the frame.
 */

import type { Point } from "./homography";

export interface Detection {
  corners: [Point, Point, Point, Point]; // TL, TR, BR, BL in DOWNSCALED coords
  confidence: number;
}

/** Otsu threshold over a grayscale histogram. */
export function otsu(histogram: number[], total: number): number {
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * histogram[i];
  let sumB = 0;
  let wB = 0;
  let best = 0;
  let threshold = 127;
  for (let t = 0; t < 256; t++) {
    wB += histogram[t];
    if (wB === 0) continue;
    const wF = total - wB;
    if (wF === 0) break;
    sumB += t * histogram[t];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);
    if (between > best) {
      best = between;
      threshold = t;
    }
  }
  return threshold;
}

interface Component {
  pixels: number[]; // index = y * w + x
  area: number;
}

/** Largest 4-connected bright component above the threshold. */
function largestComponent(mask: Uint8Array, w: number, h: number): Component | null {
  const visited = new Uint8Array(w * h);
  const stack: number[] = [];
  let best: Component | null = null;
  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || visited[start]) continue;
    stack.length = 0;
    stack.push(start);
    visited[start] = 1;
    const pixels: number[] = [];
    while (stack.length > 0) {
      const idx = stack.pop() as number;
      pixels.push(idx);
      const x = idx % w;
      const y = (idx / w) | 0;
      if (x > 0 && mask[idx - 1] && !visited[idx - 1]) { visited[idx - 1] = 1; stack.push(idx - 1); }
      if (x < w - 1 && mask[idx + 1] && !visited[idx + 1]) { visited[idx + 1] = 1; stack.push(idx + 1); }
      if (y > 0 && mask[idx - w] && !visited[idx - w]) { visited[idx - w] = 1; stack.push(idx - w); }
      if (y < h - 1 && mask[idx + w] && !visited[idx + w]) { visited[idx + w] = 1; stack.push(idx + w); }
    }
    if (!best || pixels.length > best.area) best = { pixels, area: pixels.length };
  }
  return best;
}

/** Andrew's monotone chain convex hull over sampled points. */
function convexHull(points: Point[]): Point[] {
  const pts = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  if (pts.length < 3) return pts;
  const cross = (o: Point, a: Point, b: Point) =>
    (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower: Point[] = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: Point[] = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

/** Quad corners from hull extremes (robust for screen-like quadrilaterals). */
function extremeCorners(hull: Point[]): [Point, Point, Point, Point] {
  let tl = hull[0], tr = hull[0], br = hull[0], bl = hull[0];
  let minSum = Infinity, maxSum = -Infinity, minDiff = Infinity, maxDiff = -Infinity;
  for (const p of hull) {
    const sum = p.x + p.y;
    const diff = p.x - p.y;
    if (sum < minSum) { minSum = sum; tl = p; }
    if (sum > maxSum) { maxSum = sum; br = p; }
    if (diff > maxDiff) { maxDiff = diff; tr = p; }
    if (diff < minDiff) { minDiff = diff; bl = p; }
  }
  return [tl, tr, br, bl];
}

function polygonArea(points: Point[]): number {
  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    area += a.x * b.y - b.x * a.y;
  }
  return Math.abs(area) / 2;
}

export interface DetectorState {
  /** Downscaled working size. */
  width: number;
  height: number;
  /** Smoothed corners in downscaled coords (temporal EMA). */
  smoothed: [Point, Point, Point, Point] | null;
  lostFrames: number;
}

export class ScreenDetector {
  readonly state: DetectorState;
  private readonly minAreaRatio = 0.04;
  private readonly maxLost = 8;
  private readonly emaAlpha = 0.4;

  constructor() {
    this.state = { width: 0, height: 0, smoothed: null, lostFrames: 999 };
  }

  /**
   * Detect the screen quad in a downscaled RGBA frame. Returns the smoothed
   * detection (or the last known one for a few frames — roadmap §16
   * tracking: the overlay must not flicker when detection hiccups).
   */
  detect(frame: ImageData): Detection | null {
    const { width: w, height: h, data } = frame;
    this.state.width = w;
    this.state.height = h;

    // grayscale + histogram
    const gray = new Uint8Array(w * h);
    const histogram = new Array<number>(256).fill(0);
    for (let i = 0, p = 0; i < data.length; i += 4, p++) {
      const g = (data[i] * 299 + data[i + 1] * 587 + data[i + 2] * 114) / 1000;
      const v = g | 0;
      gray[p] = v;
      histogram[v]++;
    }

    const threshold = otsu(histogram, w * h);
    const mask = new Uint8Array(w * h);
    for (let i = 0; i < gray.length; i++) mask[i] = gray[i] > threshold ? 1 : 0;

    const component = largestComponent(mask, w, h);
    let detection: Detection | null = null;

    if (component && component.area > this.minAreaRatio * w * h) {
      // sample the component boundary-ish pixels for the hull
      const step = Math.max(1, (component.pixels.length / 1500) | 0);
      const points: Point[] = [];
      for (let i = 0; i < component.pixels.length; i += step) {
        const idx = component.pixels[i];
        points.push({ x: idx % w, y: (idx / w) | 0 });
      }
      const hull = convexHull(points);
      if (hull.length >= 4) {
        const corners = extremeCorners(hull);
        const quadArea = polygonArea(corners);
        const hullArea = polygonArea(hull);
        const rectangularity = quadArea / Math.max(hullArea, 1);
        const areaRatio = quadArea / (w * h);
        // plausible monitor: big and hull roughly quad-shaped
        if (areaRatio > this.minAreaRatio && rectangularity > 0.72) {
          let confidence = Math.min(1, rectangularity * 0.7 + Math.min(areaRatio * 4, 1) * 0.3);
          // widen thin-bezel screens: expand corners ~1.5% away from centroid
          const cx = (corners[0].x + corners[1].x + corners[2].x + corners[3].x) / 4;
          const cy = (corners[0].y + corners[1].y + corners[2].y + corners[3].y) / 4;
          const expanded = corners.map((p) => ({
            x: cx + (p.x - cx) * 1.015,
            y: cy + (p.y - cy) * 1.015,
          })) as [Point, Point, Point, Point];
          detection = { corners: expanded, confidence };
        }
      }
    }

    if (detection) {
      this.state.lostFrames = 0;
      if (!this.state.smoothed) {
        this.state.smoothed = detection.corners;
      } else {
        this.state.smoothed = this.state.smoothed.map((p, i) => ({
          x: p.x * (1 - this.emaAlpha) + detection.corners[i].x * this.emaAlpha,
          y: p.y * (1 - this.emaAlpha) + detection.corners[i].y * this.emaAlpha,
        })) as [Point, Point, Point, Point];
      }
      return { corners: this.state.smoothed, confidence: detection.confidence };
    }

    // grace period: keep the last quad briefly so the overlay degrades softly
    this.state.lostFrames++;
    if (this.state.smoothed && this.state.lostFrames <= this.maxLost) {
      return { corners: this.state.smoothed, confidence: 0.15 };
    }
    this.state.smoothed = null;
    return null;
  }
}
