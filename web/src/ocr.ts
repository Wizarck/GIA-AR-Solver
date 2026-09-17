/**
 * OCR engine (tesseract.js, WASM — fully client-side).
 *
 * One shared worker, Spanish model with English fallback (downloaded once
 * from the tesseract CDN and cached by the browser). Four recognition
 * configs switched on demand: digit boxes, free lines (question text),
 * single words (options/names) and single characters (perceptual grid).
 *
 * All crops are preprocessed identically: grayscale → Otsu binarize → 4×
 * upscale (integer coordinates everywhere — fractional indices silently
 * blank a Uint8Array crop).
 */

import { createWorker, PSM, type Worker } from "tesseract.js";

export type OcrMode = "digits" | "line" | "word" | "char" | "auto";

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

const PARAMS: Record<OcrMode, Record<string, string>> = {
  // every mode must set ALL keys: setParameters only overrides provided
  // keys, so a stale whitelist would leak between modes
  digits: { tessedit_char_whitelist: "0123456789", tessedit_pageseg_mode: PSM.SINGLE_WORD, user_defined_dpi: "300" },
  word: { tessedit_char_whitelist: "", tessedit_pageseg_mode: PSM.SINGLE_WORD, user_defined_dpi: "300" },
  char: { tessedit_char_whitelist: LETTERS, tessedit_pageseg_mode: PSM.SINGLE_CHAR, user_defined_dpi: "300" },
  line: { tessedit_char_whitelist: "", tessedit_pageseg_mode: PSM.SINGLE_BLOCK, user_defined_dpi: "300" },
  auto: { tessedit_char_whitelist: "", tessedit_pageseg_mode: PSM.AUTO, user_defined_dpi: "300" },
};

let textWorker: Promise<Worker> | null = null;
let digitWorker: Promise<Worker> | null = null;
let activeMode: OcrMode | null = null;

function spawn(lang: string): Promise<Worker> {
  return (async () => {
    const worker = await createWorker(lang, 1, { logger: () => undefined });
    await worker.setParameters(PARAMS.digits);
    return worker;
  })();
}

/**
 * Two workers: Spanish (fallback English) for text; English for digits —
 * the spa model drops thin strokes on digit strings ("17" → "7"), while
 * eng + digit whitelist handled the same crops flawlessly.
 */
async function getWorker(mode: OcrMode): Promise<Worker> {
  if (mode === "digits") {
    if (!digitWorker) {
      digitWorker = spawn("eng");
      digitWorker.catch(() => { digitWorker = null; });
    }
    return digitWorker;
  }
  if (!textWorker) {
    textWorker = spawn("spa").catch(() => spawn("eng"));
    textWorker.catch(() => { textWorker = null; });
  }
  return textWorker;
}

export function ocrReady(): boolean {
  return textWorker !== null || digitWorker !== null;
}

/**
 * Prepare a crop for OCR: integer coords → smooth 4× upscale → grayscale
 * contrast stretch. No hard binarization — real screen captures are
 * low-contrast, and thresholding thin gray strokes away produced garbage;
 * Tesseract's internal binarization handles grayscale better.
 */
function preprocess(source: HTMLCanvasElement, sx: number, sy: number, sw: number, sh: number, out: HTMLCanvasElement): void {
  const ix = Math.round(sx);
  const iy = Math.round(sy);
  const iw = Math.max(1, Math.round(sw));
  const ih = Math.max(1, Math.round(sh));
  if (iw <= 2 || ih <= 2) return;
  const scale = 4;
  out.width = iw * scale;
  out.height = ih * scale;
  const octx = out.getContext("2d", { willReadFrequently: true });
  if (!octx) return;
  octx.imageSmoothingEnabled = true;
  octx.imageSmoothingQuality = "high";
  octx.drawImage(source, ix, iy, iw, ih, 0, 0, out.width, out.height);
  // contrast stretch on the luminance range
  const img = octx.getImageData(0, 0, out.width, out.height);
  let mn = 255, mx = 0;
  for (let i = 0; i < img.data.length; i += 4) {
    const g = (img.data[i] * 299 + img.data[i + 1] * 587 + img.data[i + 2] * 114) / 1000;
    if (g < mn) mn = g;
    if (g > mx) mx = g;
  }
  if (mx - mn > 10) {
    const k = 255 / (mx - mn);
    for (let i = 0; i < img.data.length; i += 4) {
      const g = (img.data[i] * 299 + img.data[i + 1] * 587 + img.data[i + 2] * 114) / 1000;
      const v = Math.max(0, Math.min(255, (g - mn) * k));
      img.data[i] = v; img.data[i + 1] = v; img.data[i + 2] = v;
    }
    octx.putImageData(img, 0, 0);
  }
}

const crop = document.createElement("canvas");

export interface OcrResult {
  text: string;
  confidence: number; // 0..100 from tesseract
}

/** Recognize one crop in the requested mode. */
export async function ocrRead(source: HTMLCanvasElement, sx: number, sy: number, sw: number, sh: number, mode: OcrMode): Promise<OcrResult> {
  preprocess(source, sx, sy, sw, sh, crop);
  if (crop.width < 8) return { text: "", confidence: 0 };
  const worker = await getWorker(mode);
  if (activeMode !== mode) {
    await worker.setParameters(PARAMS[mode]);
    activeMode = mode;
  }
  const { data } = await worker.recognize(crop);
  return { text: (data.text ?? "").trim(), confidence: data.confidence ?? 0 };
}

export interface OcrToken {
  text: string;
  conf: number;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/**
 * Full-screen recognition returning every word with its bounding box —
 * the OCR result IS the layout (Fase 1 architecture): no custom box
 * detection. Requires the worker's blocks output.
 */
export async function ocrTokens(source: HTMLCanvasElement): Promise<OcrToken[]> {
  const worker = await getWorker("auto");
  if (activeMode !== "auto") {
    await worker.setParameters(PARAMS.auto);
    activeMode = "auto";
  }
  const { data } = await worker.recognize(source);
  const out: OcrToken[] = [];
  const push = (w: { text?: string; confidence?: number; bbox?: { x0: number; y0: number; x1: number; y1: number } }) => {
    const t = (w.text ?? "").trim();
    if (t && w.bbox) out.push({ text: t, conf: w.confidence ?? 0, x0: w.bbox.x0, y0: w.bbox.y0, x1: w.bbox.x1, y1: w.bbox.y1 });
  };
  const d = data as unknown as {
    blocks?: Array<{ paragraphs?: Array<{ lines?: Array<{ words?: unknown[] }> }> }> | null;
    words?: unknown[];
  };
  if (Array.isArray(d.blocks)) {
    for (const b of d.blocks ?? []) {
      for (const p of b.paragraphs ?? []) {
        for (const l of p.lines ?? []) {
          for (const w of l.words ?? []) push(w as never);
        }
      }
    }
  } else if (Array.isArray(d.words)) {
    for (const w of d.words as never[]) push(w);
  }
  return out;
}

/** Recognize digits in one option box; null when nothing numeric parses. */
export async function readDigits(source: HTMLCanvasElement, sx: number, sy: number, sw: number, sh: number): Promise<{ value: number | null; text: string; confidence: number }> {
  const r = await ocrRead(source, sx, sy, sw, sh, "digits");
  const text = r.text.replace(/\s+/g, "");
  if (!/^\d{1,4}$/.test(text)) return { value: null, text: r.text, confidence: r.confidence };
  return { value: parseInt(text, 10), text, confidence: r.confidence };
}
