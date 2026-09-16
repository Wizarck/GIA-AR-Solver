/**
 * MVP-1/2 POC wiring: camera → screen detection → rectified view → solver.
 *
 * Real-time model (roadmap §1.2/§19): the native <video> element renders the
 * preview; detection + rectification + solving run on timers — detection at
 * ~15 Hz, the solver cycle at ~0.8 Hz (fresh hi-res rectification → digit
 * OCR on the option row → NumericSolver → answer stroke mapped back to the
 * camera overlay).
 */

import { ScreenDetector } from "./detector";
import { computeHomography, rectify, type Matrix3, type Point } from "./homography";
import { readDigits } from "./ocr";
import { findOptionBoxes, solveNumeric, type NumericSolution, type Rect } from "./solver";

const PROCESS_INTERVAL_MS = 66; // ~15 Hz detection cadence
const SOLVER_INTERVAL_MS = 1200; // solver cycle cadence
const WORK_WIDTH = 240; // detector working width in pixels
const RECT_W = 640; // solver-grade rectified width
const RECT_H = 400;

const cameraEl = document.getElementById("camera") as HTMLVideoElement;
const overlayCanvas = document.getElementById("overlay") as HTMLCanvasElement;
const rectifiedCanvas = document.getElementById("rectified") as HTMLCanvasElement;
const stateEl = document.getElementById("state") as HTMLDivElement;
const hudEl = document.getElementById("hud") as HTMLDivElement;
const msgEl = document.getElementById("msg") as HTMLDivElement;
const startBtn = document.getElementById("start") as HTMLButtonElement;
const stopBtn = document.getElementById("stop") as HTMLButtonElement;
const flipBtn = document.getElementById("flip") as HTMLButtonElement;

if (!cameraEl || !overlayCanvas || !rectifiedCanvas || !stateEl || !hudEl || !msgEl) {
  throw new Error("DOM elements missing");
}
rectifiedCanvas.width = RECT_W;
rectifiedCanvas.height = RECT_H;

let stream: MediaStream | null = null;
let running = false;
let facingMode: "environment" | "user" = "environment";
let timerId: number | undefined;
let solverTimerId: number | undefined;
let frames = 0;
let detections = 0;
let lastFpsAt = performance.now();
let fps = 0;
let ocrBusy = false;
let solverStatus = "inactivo";
let lastOcrTexts: string[] = [];
let lastSolution: (NumericSolution & { boxes: Array<{ x: number; y: number; w: number; h: number }> }) | null = null;

const detector = new ScreenDetector();
const work = document.createElement("canvas");
const workCtx = work.getContext("2d", { willReadFrequently: true });
const grab = document.createElement("canvas");
const grabCtx = grab.getContext("2d", { willReadFrequently: true });

function showMessage(text: string, isError = false): void {
  msgEl.textContent = text;
  msgEl.className = isError ? "error" : "";
}

function activateUi(): void {
  running = true;
  startBtn.disabled = true;
  stopBtn.disabled = false;
  flipBtn.disabled = false;
  timerId = window.setInterval(process, PROCESS_INTERVAL_MS);
  solverTimerId = window.setInterval(solverCycle, SOLVER_INTERVAL_MS);
}

async function startCamera(): Promise<void> {
  if (!navigator.mediaDevices?.getUserMedia) {
    showMessage("Este navegador no expone getUserMedia. Necesitas HTTPS (o localhost).", true);
    return;
  }
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: facingMode }, width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false,
    });
  } catch (err) {
    showMessage(`No se pudo abrir la cámara: ${(err as Error).message}`, true);
    return;
  }
  cameraEl.srcObject = stream;
  await cameraEl.play();
  activateUi();
  showMessage("");
  stateEl.textContent = "Buscando pantalla… apunta la cámara a un monitor con contenido claro.";
}

function stopCamera(): void {
  running = false;
  if (timerId !== undefined) window.clearInterval(timerId);
  if (solverTimerId !== undefined) window.clearInterval(solverTimerId);
  timerId = undefined;
  solverTimerId = undefined;
  stream?.getTracks().forEach((t) => t.stop());
  stream = null;
  cameraEl.srcObject = null;
  startBtn.disabled = false;
  stopBtn.disabled = true;
  flipBtn.disabled = true;
  detector.state.smoothed = null;
  lastSolution = null;
  const octx = overlayCanvas.getContext("2d");
  octx?.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
  stateEl.textContent = "Cámara detenida.";
}

async function flipCamera(): Promise<void> {
  facingMode = facingMode === "environment" ? "user" : "environment";
  stopCamera();
  await startCamera();
}

function process(): void {
  if (!running || !cameraEl.videoWidth) return;
  const vw = cameraEl.videoWidth;
  const vh = cameraEl.videoHeight;

  const w = WORK_WIDTH;
  const h = Math.round((w * vh) / vw);
  if (work.width !== w || work.height !== h) {
    work.width = w;
    work.height = h;
  }
  if (!workCtx) return;
  workCtx.drawImage(cameraEl, 0, 0, w, h);
  const frame = workCtx.getImageData(0, 0, w, h);

  frames++;
  const detection = detector.detect(frame);
  drawOverlay(detection, vw / w);

  if (detection) {
    detections++;
    stateEl.textContent = `Pantalla detectada — confianza ${(detection.confidence * 100).toFixed(0)} %`;
  } else if (!detector.state.smoothed) {
    stateEl.textContent = "Buscando pantalla…";
  }

  const now = performance.now();
  if (now - lastFpsAt >= 1000) {
    fps = (frames * 1000) / (now - lastFpsAt);
    frames = 0;
    detections = 0;
    lastFpsAt = now;
  }
  hudEl.textContent = `${fps.toFixed(0)} Hz · det ${detections} · solver: ${solverStatus}`;
}

function drawOverlay(detection: ReturnType<ScreenDetector["detect"]>, scale: number): void {
  if (overlayCanvas.width !== cameraEl.videoWidth) {
    overlayCanvas.width = cameraEl.videoWidth;
    overlayCanvas.height = cameraEl.videoHeight;
  }
  const ctx = overlayCanvas.getContext("2d");
  if (!ctx) return;
  ctx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
  if (detection) {
    ctx.strokeStyle = detection.confidence > 0.5 ? "#3fb950" : "#d29922";
    ctx.lineWidth = 4;
    ctx.beginPath();
    detection.corners.forEach((p, i) => {
      if (i === 0) ctx.moveTo(p.x * scale, p.y * scale);
      else ctx.lineTo(p.x * scale, p.y * scale);
    });
    ctx.closePath();
    ctx.stroke();
    ctx.fillStyle = ctx.strokeStyle;
    for (const p of detection.corners) {
      ctx.beginPath();
      ctx.arc(p.x * scale, p.y * scale, 6, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // AR answer stroke: winning option mapped from rectified space to camera
  if (lastSolution?.solved && lastSolution.answerIndex !== null) {
    const box = lastSolution.boxes[lastSolution.answerIndex];
    const hMap = currentRectToWork();
    if (hMap) {
      const corners = [
        { x: box.x, y: box.y },
        { x: box.x + box.w, y: box.y },
        { x: box.x + box.w, y: box.y + box.h },
        { x: box.x, y: box.y + box.h },
      ].map((p) => {
        const q = applyH(hMap, p.x, p.y);
        return { x: q.x * scale, y: q.y * scale };
      });
      ctx.strokeStyle = "#ff5555";
      ctx.lineWidth = 6;
      ctx.beginPath();
      corners.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
      ctx.closePath();
      ctx.stroke();
    }
  }
}

function applyH(m: Matrix3, x: number, y: number): Point {
  const w = m[6] * x + m[7] * y + m[8];
  return { x: (m[0] * x + m[1] * y + m[2]) / w, y: (m[3] * x + m[4] * y + m[5]) / w };
}

/** Homography mapping rectified-pixel coords → detector-work coords. */
function currentRectToWork(): Matrix3 | null {
  const smoothed = detector.state.smoothed;
  if (!smoothed) return null;
  return computeHomography(
    [
      { x: 0, y: 0 },
      { x: RECT_W - 1, y: 0 },
      { x: RECT_W - 1, y: RECT_H - 1 },
      { x: 0, y: RECT_H - 1 },
    ],
    smoothed,
  );
}

async function solverCycle(): Promise<void> {
  if (!running || !cameraEl.videoWidth || ocrBusy) return;
  const smoothed = detector.state.smoothed;
  if (!smoothed) return;
  ocrBusy = true;
  try {
    // hi-res grab from the camera for a solver-grade rectification
    const gw = 480;
    const gh = Math.round((gw * cameraEl.videoHeight) / cameraEl.videoWidth);
    if (grab.width !== gw || grab.height !== gh) {
      grab.width = gw;
      grab.height = gh;
    }
    if (!grabCtx) return;
    grabCtx.drawImage(cameraEl, 0, 0, gw, gh);
    const frame = grabCtx.getImageData(0, 0, gw, gh);
    // corners live in detector-work coords; rescale them to the grab frame
    const kx = gw / detector.state.width;
    const ky = gh / detector.state.height;
    const cornersGrab = smoothed.map((p) => ({ x: p.x * kx, y: p.y * ky })) as [Point, Point, Point, Point];
    const hInv = computeHomography(
      [
        { x: 0, y: 0 },
        { x: RECT_W - 1, y: 0 },
        { x: RECT_W - 1, y: RECT_H - 1 },
        { x: 0, y: RECT_H - 1 },
      ],
      cornersGrab,
    );
    if (!hInv) return;
    // render rectified and keep its pixels for option detection
    const rctx = rectifiedCanvas.getContext("2d");
    if (!rctx) return;
    const img = rctx.createImageData(RECT_W, RECT_H);
    img.data.set(rectify(frame, hInv, RECT_W, RECT_H).data);
    rctx.putImageData(img, 0, 0);
    const rectifiedData = rctx.getImageData(0, 0, RECT_W, RECT_H);

    // detect option boxes in the rectified bottom band (no fixed columns)
    const boxes: Rect[] = findOptionBoxes(rectifiedData, 0.6, 3);
    if (boxes.length !== 3) {
      lastSolution = null;
      solverStatus = boxes.length ? `${boxes.length} opciones detectadas (esperaba 3)` : "sin opciones en la banda inferior";
      return;
    }

    const values: number[] = [];
    const texts: string[] = [];
    // try several insets — Tesseract is sensitive to border noise
    const insets = [5, 0, 10, 14];
    for (const box of boxes) {
      let value: number | null = null;
      let text = "";
      for (const inset of insets) {
        const r = await readDigits(
          rectifiedCanvas,
          box.x + inset,
          box.y + inset,
          Math.max(10, box.w - 2 * inset),
          Math.max(10, box.h - 2 * inset),
        );
        if (r.value !== null) {
          value = r.value;
          text = r.text;
          break;
        }
        text = r.text;
      }
      values.push(value ?? NaN);
      texts.push(text);
    }
    lastOcrTexts = texts;
    if (values.some((v) => Number.isNaN(v))) {
      lastSolution = null;
      solverStatus = "sin lectura OCR";
      return;
    }
    const solution = solveNumeric({ values, boxes });
    lastSolution = { ...solution, boxes };
    if (solution.solved) {
      solverStatus = `resuelto: ${values[solution.answerIndex ?? 0]} (mediana ${solution.median})`;
      drawAnswerStroke();
    } else {
      solverStatus = `sin respuesta: ${solution.reason}`;
    }
  } finally {
    ocrBusy = false;
  }
}

function drawAnswerStroke(): void {
  if (!lastSolution?.solved || lastSolution.answerIndex === null) return;
  const box = lastSolution.boxes[lastSolution.answerIndex];
  const rctx = rectifiedCanvas.getContext("2d");
  if (!rctx) return;
  rctx.strokeStyle = "#ff5555";
  rctx.lineWidth = 5;
  rctx.strokeRect(box.x, box.y, box.w, box.h);
}

// homography self-test: unit square maps onto itself
{
  const identity = computeHomography(
    [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }],
    [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }],
  );
  if (!identity) throw new Error("homography self-test failed");
}

startBtn.addEventListener("click", () => void startCamera());
stopBtn.addEventListener("click", stopCamera);
flipBtn.addEventListener("click", () => void flipCamera());

/** Test seam: inject a synthetic MediaStream instead of a physical camera. */
async function injectStream(s: MediaStream): Promise<void> {
  stream = s;
  cameraEl.srcObject = s;
  await cameraEl.play();
  activateUi();
  stateEl.textContent = "Stream sintético inyectado (modo test).";
}
(window as unknown as { __giaInjectStream?: (s: MediaStream) => Promise<void> }).__giaInjectStream =
  injectStream;
(window as unknown as { __giaOcr?: typeof readDigits }).__giaOcr = readDigits;
(window as unknown as { __giaCropCanvas?: () => HTMLCanvasElement }).__giaCropCanvas = () => rectifiedCanvas;
(window as unknown as { __giaDebug?: () => unknown }).__giaDebug = () => ({
  running,
  videoWidth: cameraEl.videoWidth,
  videoHeight: cameraEl.videoHeight,
  readyState: cameraEl.readyState,
  trackCount: stream?.getTracks().length ?? 0,
  solverStatus,
  lastOcrTexts,
  lastSolution,
});
