/**
 * MVP-1 POC wiring: camera → screen detection → rectified view.
 *
 * Real-time model (roadmap §1.2/§19): the native <video> element renders the
 * preview (browser compositor, full frame rate); processing (detection +
 * rectification) runs on a setInterval at ~15 Hz. The solver loop plugs into
 * the rectified view in the next milestone (GIA-013+).
 */

import { ScreenDetector } from "./detector";
import { computeHomography, rectify, type Matrix3, type Point } from "./homography";

const PROCESS_INTERVAL_MS = 66; // ~15 Hz detection cadence
const WORK_WIDTH = 240; // detector working width in pixels

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

let stream: MediaStream | null = null;
let running = false;
let facingMode: "environment" | "user" = "environment";
let timerId: number | undefined;
let frames = 0;
let detections = 0;
let lastFpsAt = performance.now();
let fps = 0;

const detector = new ScreenDetector();
const work = document.createElement("canvas");
const workCtx = work.getContext("2d", { willReadFrequently: true });

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
  timerId = undefined;
  stream?.getTracks().forEach((t) => t.stop());
  stream = null;
  cameraEl.srcObject = null;
  startBtn.disabled = false;
  stopBtn.disabled = true;
  flipBtn.disabled = true;
  detector.state.smoothed = null;
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
  const scale = vw / w;
  drawOverlay(detection, scale);

  if (detection) {
    detections++;
    const rw = rectifiedCanvas.width;
    const rh = rectifiedCanvas.height;
    const dstCorners: Point[] = [
      { x: 0, y: 0 },
      { x: rw - 1, y: 0 },
      { x: rw - 1, y: rh - 1 },
      { x: 0, y: rh - 1 },
    ];
    // homography from rectified space → screen space; rectify() inverse-maps
    const h = computeHomography(dstCorners, detection.corners);
    if (h) renderRectified(frame, h, rw, rh);
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
  hudEl.textContent = `${fps.toFixed(0)} Hz · detecciones ${detections}`;
}

function drawOverlay(detection: ReturnType<ScreenDetector["detect"]>, scale: number): void {
  if (overlayCanvas.width !== cameraEl.videoWidth) {
    overlayCanvas.width = cameraEl.videoWidth;
    overlayCanvas.height = cameraEl.videoHeight;
  }
  const ctx = overlayCanvas.getContext("2d");
  if (!ctx) return;
  ctx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
  if (!detection) return;
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

let lastRendered: Matrix3 | null = null;
function renderRectified(frame: ImageData, hInv: Matrix3, rw: number, rh: number): void {
  // skip near-identical re-renders when the homography barely moved
  if (lastRendered && matricesClose(lastRendered, hInv)) return;
  lastRendered = hInv;
  const rctx = rectifiedCanvas.getContext("2d");
  if (!rctx) return;
  const img = rctx.createImageData(rw, rh);
  img.data.set(rectify(frame, hInv, rw, rh).data);
  rctx.putImageData(img, 0, 0);
}

function matricesClose(a: Matrix3, b: Matrix3): boolean {
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += Math.abs(a[i] - b[i]);
  return sum < 0.02;
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
(window as unknown as { __giaDebug?: () => unknown }).__giaDebug = () => ({
  running,
  videoWidth: cameraEl.videoWidth,
  videoHeight: cameraEl.videoHeight,
  readyState: cameraEl.readyState,
  paused: cameraEl.paused,
  trackCount: stream?.getTracks().length ?? 0,
});
