/**
 * 4-point homography (DLT) + rectification.
 *
 * Computes the 3×3 projective transform H mapping unit-square-style source
 * quad corners to a destination rectangle, and warps images by inverse
 * mapping (roadmap §17: rectified screen is the solver's coordinate space).
 */

export interface Point {
  x: number;
  y: number;
}

export type Matrix3 = number[]; // row-major 3×3

/** Solve H with src[i] → dst[i] for exactly 4 correspondences. */
export function computeHomography(src: Point[], dst: Point[]): Matrix3 | null {
  // DLT: for each correspondence, two linear equations in h (8 unknowns).
  const A: number[][] = [];
  const b: number[] = [];
  for (let i = 0; i < 4; i++) {
    const { x, y } = src[i];
    const { x: u, y: v } = dst[i];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]);
    b.push(u);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y]);
    b.push(v);
  }
  const h = solveLinear8(A, b);
  if (!h) return null;
  // row-major 3×3 with h33 = 1
  return [h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7], 1];
}

function solveLinear8(A: number[][], b: number[]): number[] | null {
  const n = 8;
  // augmented copy
  const M: number[][] = A.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col++) {
    // partial pivot
    let pivot = col;
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(M[r][col]) > Math.abs(M[pivot][col])) pivot = r;
    }
    if (Math.abs(M[pivot][col]) < 1e-10) return null;
    [M[col], M[pivot]] = [M[pivot], M[col]];
    const inv = 1 / M[col][col];
    for (let r = col + 1; r < n; r++) {
      const factor = M[r][col] * inv;
      if (factor === 0) continue;
      for (let c = col; c <= n; c++) M[r][c] -= factor * M[col][c];
    }
  }
  const x = new Array<number>(n).fill(0);
  for (let row = n - 1; row >= 0; row--) {
    let sum = M[row][n];
    for (let c = row + 1; c < n; c++) sum -= M[row][c] * x[c];
    x[row] = sum / M[row][row];
  }
  return x;
}

export function applyMatrix(m: Matrix3, x: number, y: number): Point {
  const w = m[6] * x + m[7] * y + m[8];
  return {
    x: (m[0] * x + m[1] * y + m[2]) / w,
    y: (m[3] * x + m[4] * y + m[5]) / w,
  };
}

export interface RectifiedResult {
  /** RGBA pixel data of the rectified view, width × height. */
  data: Uint8ClampedArray;
}

/**
 * Inverse-warp a source frame into a width×height rectified view.
 * `hInv` maps rectified (dst) coordinates back into source coordinates.
 */
export function rectify(
  source: ImageData,
  hInv: Matrix3,
  width: number,
  height: number,
): RectifiedResult {
  const out = new Uint8ClampedArray(width * height * 4);
  const sw = source.width;
  const sh = source.height;
  const s = source.data;
  for (let dy = 0; dy < height; dy++) {
    for (let dx = 0; dx < width; dx++) {
      const w = hInv[6] * dx + hInv[7] * dy + hInv[8];
      const sx = (hInv[0] * dx + hInv[1] * dy + hInv[2]) / w;
      const sy = (hInv[3] * dx + hInv[4] * dy + hInv[5]) / w;
      const o = (dy * width + dx) * 4;
      if (sx < 0 || sy < 0 || sx >= sw - 1 || sy >= sh - 1 || !Number.isFinite(sx) || !Number.isFinite(sy)) {
        out[o] = 20;
        out[o + 1] = 20;
        out[o + 2] = 26;
        out[o + 3] = 255;
        continue;
      }
      // bilinear sample
      const x0 = sx | 0;
      const y0 = sy | 0;
      const fx = sx - x0;
      const fy = sy - y0;
      const i00 = (y0 * sw + x0) * 4;
      const i10 = i00 + 4;
      const i01 = i00 + sw * 4;
      const i11 = i01 + 4;
      for (let ch = 0; ch < 3; ch++) {
        const top = s[i00 + ch] * (1 - fx) + s[i10 + ch] * fx;
        const bot = s[i01 + ch] * (1 - fx) + s[i11 + ch] * fx;
        out[o + ch] = top * (1 - fy) + bot * fy;
      }
      out[o + 3] = 255;
    }
  }
  return { data: out };
}
