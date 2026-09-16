/**
 * Digit OCR for the solver loop (tesseract.js, WASM — runs fully local).
 *
 * Crops come from the rectified screen (dark text on light background).
 * Pre-processing: grayscale → Otsu binarize → 4× upscale, which lifts
 * small option-box digits well above Tesseract's comfort floor.
 */

import { createWorker, PSM, type Worker } from "tesseract.js";

let workerPromise: Promise<Worker> | null = null;

async function getWorker(): Promise<Worker> {
  if (!workerPromise) {
    // default worker/core/lang paths resolve to CDNs matching the installed
    // tesseract.js version; everything runs client-side (WASM)
    workerPromise = createWorker("eng", 1, {
      logger: () => undefined,
    }).then(async (worker) => {
      await worker.setParameters({
        tessedit_char_whitelist: "0123456789",
        tessedit_pageseg_mode: PSM.SINGLE_WORD, // one option box = one "word"
        user_defined_dpi: "300",
      });
      return worker;
    });
  }
  return workerPromise;
}

function otsu(hist: number[], total: number): number {
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * hist[i];
  let sumB = 0;
  let wB = 0;
  let best = 0;
  let t = 127;
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
      t = i;
    }
  }
  return t;
}

/** Binarize a crop into clean black-on-white and upscale for OCR. */
function preprocess(source: HTMLCanvasElement, sx: number, sy: number, sw: number, sh: number, out: HTMLCanvasElement): void {
  // integerize: fractional coords make getImageData/gray indexing misbehave
  const ix = Math.round(sx);
  const iy = Math.round(sy);
  const iw = Math.max(1, Math.round(sw));
  const ih = Math.max(1, Math.round(sh));
  const ctx = source.getContext("2d", { willReadFrequently: true });
  if (!ctx || iw <= 2 || ih <= 2) return;
  const img = ctx.getImageData(ix, iy, iw, ih);
  const hist = new Array<number>(256).fill(0);
  const gray = new Uint8Array(iw * ih);
  for (let i = 0, p = 0; i < img.data.length; i += 4, p++) {
    const g = (img.data[i] * 299 + img.data[i + 1] * 587 + img.data[i + 2] * 114) / 1000;
    gray[p] = g | 0;
    hist[gray[p]]++;
  }
  const th = otsu(hist, iw * ih);
  const scale = 4;
  out.width = iw * scale;
  out.height = ih * scale;
  const octx = out.getContext("2d");
  if (!octx) return;
  const outImg = octx.createImageData(out.width, out.height);
  for (let y = 0; y < ih; y++) {
    for (let x = 0; x < iw; x++) {
      const g = gray[y * iw + x];
      const ink = g < th ? 0 : 255;
      for (let dy = 0; dy < scale; dy++) {
        for (let dx = 0; dx < scale; dx++) {
          const o = ((y * scale + dy) * out.width + x * scale + dx) * 4;
          outImg.data[o] = ink;
          outImg.data[o + 1] = ink;
          outImg.data[o + 2] = ink;
          outImg.data[o + 3] = 255;
        }
      }
    }
  }
  octx.putImageData(outImg, 0, 0);
}

/** Recognize digits in one crop. Returns the raw text + parsed value. */
export async function readDigits(source: HTMLCanvasElement, sx: number, sy: number, sw: number, sh: number): Promise<{ value: number | null; text: string }> {
  const crop = document.createElement("canvas");
  preprocess(source, sx, sy, sw, sh, crop);
  if (crop.width < 8) return { value: null, text: "" };
  const worker = await getWorker();
  const { data } = await worker.recognize(crop);
  const text = (data.text ?? "").replace(/\s+/g, "");
  if (!/^\d{1,4}$/.test(text)) return { value: null, text };
  return { value: parseInt(text, 10), text };
}
