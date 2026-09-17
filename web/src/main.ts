/**
 * Webapp wiring (Fase 1 — "el OCR es el layout"):
 *
 * camera → screen detection (EMA quad) → rectification (homography)
 * → ONE full-screen OCR pass → word tokens {text, bbox, confidence}
 * → classify module from the question text
 * → module solver consumes tokens only (no custom box detection)
 * → AR stroke on the winning token's bbox mapped back to camera space.
 *
 * Real-time model: native <video> preview; detector ~15 Hz; solver cycle
 * ~1 Hz with skip-while-busy. Re-solve only when the token hash changes
 * (new question) — or via the Re-scan button.
 */

import { ScreenDetector } from "./detector";
import { computeHomography, rectify, type Matrix3, type Point } from "./homography";
import { ocrTokens } from "./ocr";
import {
  classifyQuestion,
  looksLikeStatement,
  solveFromTokens,
  type ModuleKind,
} from "./solver";

const PROCESS_INTERVAL_MS = 66; // ~15 Hz detection
const SOLVER_INTERVAL_MS = 1000; // solver cadence; cycles skip while busy
const WORK_WIDTH = 240;
const RECT_W = 640;
const RECT_H = 400;

const cameraEl = document.getElementById("camera") as HTMLVideoElement;
const overlayCanvas = document.getElementById("overlay") as HTMLCanvasElement;
const rectifiedCanvas = document.getElementById("rectified") as HTMLCanvasElement;
const stateEl = document.getElementById("state") as HTMLDivElement;
const hudEl = document.getElementById("hud") as HTMLDivElement;
const msgEl = document.getElementById("msg") as HTMLDivElement;
const moduleEl = document.getElementById("module") as HTMLSpanElement;
const confEl = document.getElementById("conf") as HTMLSpanElement;
const answerEl = document.getElementById("answer") as HTMLSpanElement;
const startBtn = document.getElementById("start") as HTMLButtonElement;
const stopBtn = document.getElementById("stop") as HTMLButtonElement;
const flipBtn = document.getElementById("flip") as HTMLButtonElement;
const refreshBtn = document.getElementById("refresh") as HTMLButtonElement;

if (!cameraEl || !overlayCanvas || !rectifiedCanvas || !stateEl || !hudEl || !msgEl || !moduleEl || !confEl || !answerEl) {
  throw new Error("DOM elements missing");
}
rectifiedCanvas.width = RECT_W;
rectifiedCanvas.height = RECT_H;

interface Rect { x: number; y: number; w: number; h: number }

interface Solution {
  module: ModuleKind;
  answerIndex: number | null;
  box: Rect | null;
  confidence: number;
  label: string;
}

let stream: MediaStream | null = null;
let running = false;
let facingMode: "environment" | "user" = "environment";
let timerId: number | undefined;
let solverTimerId: number | undefined;
let frames = 0;
let lastFpsAt = performance.now();
let fps = 0;
let ocrBusy = false;
let ocrFailed = false;
let lastSolution: Solution | null = null;
let moduleKind: ModuleKind = "unknown";
let lastQuestionLine = "";
let lastTokensHash = "";
let lastStatement: { text: string; at: number } | null = null;

const detector = new ScreenDetector();
const work = document.createElement("canvas");
const workCtx = work.getContext("2d", { willReadFrequently: true });
const grab = document.createElement("canvas");
const grabCtx = grab.getContext("2d", { willReadFrequently: true });

function showMessage(text: string, isError = false): void {
  msgEl.textContent = text;
  msgEl.className = isError ? "error" : "";
}

function setSolutionDisplay(): void {
  moduleEl.textContent =
    moduleKind === "unknown" ? "—" : moduleKind === "numeric" ? "numérica" : moduleKind === "perceptual" ? "perceptiva" : moduleKind === "word" ? "palabras" : moduleKind === "reasoning" ? "razonamiento" : "espacial";
  if (lastSolution) {
    confEl.textContent = `${Math.round(lastSolution.confidence * 100)} %`;
    answerEl.textContent = lastSolution.label;
  } else {
    confEl.textContent = "—";
    answerEl.textContent = "—";
  }
}

function activateUi(): void {
  running = true;
  startBtn.disabled = true;
  stopBtn.disabled = false;
  flipBtn.disabled = false;
  refreshBtn.disabled = false;
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
  stateEl.textContent = "Buscando pantalla… apunta la cámara al test.";
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
  refreshBtn.disabled = true;
  detector.state.smoothed = null;
  lastSolution = null;
  moduleKind = "unknown";
  lastStatement = null;
  lastTokensHash = "";
  const octx = overlayCanvas.getContext("2d");
  octx?.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
  stateEl.textContent = "Cámara detenida.";
  setSolutionDisplay();
}

async function flipCamera(): Promise<void> {
  facingMode = facingMode === "environment" ? "user" : "environment";
  stopCamera();
  await startCamera();
}

/** Re-scan: drop cached state and force a fresh solve on the next cycle. */
function refreshSolve(): void {
  lastSolution = null;
  lastStatement = null;
  lastQuestionLine = "";
  lastTokensHash = "";
  setSolutionDisplay();
  void solverCycle();
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
    stateEl.textContent = `Pantalla detectada — confianza ${(detection.confidence * 100).toFixed(0)} %`;
  } else if (!detector.state.smoothed) {
    stateEl.textContent = "Buscando pantalla…";
  }
  const now = performance.now();
  if (now - lastFpsAt >= 1000) {
    fps = (frames * 1000) / (now - lastFpsAt);
    frames = 0;
    lastFpsAt = now;
  }
  hudEl.textContent = `${fps.toFixed(0)} Hz · módulo: ${moduleEl.textContent} · conf: ${confEl.textContent}`;
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
  // AR answer stroke: winning token bbox mapped rectified → camera
  if (lastSolution?.box) {
    const hMap = currentRectToWork();
    if (hMap) {
      const b = lastSolution.box;
      const corners = [
        { x: b.x, y: b.y },
        { x: b.x + b.w, y: b.y },
        { x: b.x + b.w, y: b.y + b.h },
        { x: b.x, y: b.y + b.h },
      ].map((p) => {
        const q = applyH(hMap, p.x, p.y);
        return { x: q.x * scale, y: q.y * scale };
      });
      ctx.strokeStyle = "#ff5555";
      ctx.lineWidth = 7;
      ctx.beginPath();
      corners.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
      ctx.closePath();
      ctx.stroke();
      const top = corners.reduce((a, p) => (p.y < a.y ? p : a), corners[0]);
      ctx.font = "bold 26px system-ui";
      ctx.fillStyle = "#ff5555";
      ctx.fillText(`${Math.round(lastSolution.confidence * 100)}%`, top.x - 20, top.y - 12);
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
    // hi-res grab + solver-grade rectification
    const gw = Math.min(960, cameraEl.videoWidth || 960);
    const gh = Math.round((gw * cameraEl.videoHeight) / cameraEl.videoWidth);
    if (grab.width !== gw || grab.height !== gh) {
      grab.width = gw;
      grab.height = gh;
    }
    if (!grabCtx) return;
    grabCtx.drawImage(cameraEl, 0, 0, gw, gh);
    const frame = grabCtx.getImageData(0, 0, gw, gh);
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
    const rctx = rectifiedCanvas.getContext("2d");
    if (!rctx) return;
    const img = rctx.createImageData(RECT_W, RECT_H);
    img.data.set(rectify(frame, hInv, RECT_W, RECT_H).data);
    rctx.putImageData(img, 0, 0);
    const rectData = rctx.getImageData(0, 0, RECT_W, RECT_H);

    if (ocrFailed) {
      stateEl.textContent = "Solver en error — auto-reintento o pulsa ↻ Re-scan.";
      return;
    }

    // ONE full-screen OCR pass → layout tokens → shared solve
    let tokens = await ocrTokens(rectifiedCanvas);
    tokens = tokens.filter((t) => t.conf >= 25 && t.text.trim());
    if (!tokens.length) return;

    // new-question detection by token-text hash
    const hash = tokens.map((t) => t.text).join("|");
    if (hash !== lastTokensHash) {
      lastTokensHash = hash;
      lastSolution = null;
      lastStatement = null;
      setSolutionDisplay();
    }
    const fullText = tokens.map((t) => t.text).join(" ");
    moduleKind = classifyQuestion(fullText);
    if (moduleKind === "unknown") {
      stateEl.textContent = "Módulo no reconocido todavía…";
      return;
    }
    // statement capture for reasoning (persists across the UI transition)
    if (looksLikeStatement(fullText) && !fullText.includes("?")) {
      lastStatement = { text: fullText, at: Date.now() };
    }

    const sol = solveFromTokens(tokens, lastStatement?.text ?? null, rectData);
    if (sol.solved && sol.answerIndex !== null) {
      lastSolution = {
        module: sol.module,
        answerIndex: sol.answerIndex,
        box: sol.box,
        confidence: sol.confidence,
        label: sol.label ?? "",
      };
    } else {
      lastSolution = null;
      stateEl.textContent = `Sin solución: ${sol.reason}`;
      return;
    }
    setSolutionDisplay();
    drawAnswerStroke();
  } catch (err) {
    ocrFailed = true;
    stateEl.textContent = `Error del solver: ${(err as Error).message} — auto-reintento en 5 s.`;
    // watchdog: auto-recover instead of staying stuck
    window.setTimeout(() => {
      ocrFailed = false;
    }, 5000);
  } finally {
    ocrBusy = false;
  }
}

function drawAnswerStroke(): void {
  if (!lastSolution?.box) return;
  const b = lastSolution.box;
  const rctx = rectifiedCanvas.getContext("2d");
  if (!rctx) return;
  rctx.strokeStyle = "#ff5555";
  rctx.lineWidth = 5;
  rctx.strokeRect(b.x, b.y, b.w, b.h);
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
refreshBtn.addEventListener("click", refreshSolve);

// ---------------------------------------------------------------------------
// Test seams: synthetic camera painters (per module) + real-image feed +
// debug/OCR probes. Only used by the automated battery.
// ---------------------------------------------------------------------------

interface MockState { n: number; kind: string; payload: Record<string, unknown>; useImage: boolean }

const mockCanvas = document.createElement("canvas");
mockCanvas.width = 1280;
mockCanvas.height = 800;

let mockImgReady = false;
const mockImg = new Image();
mockImg.onload = () => { mockImgReady = true; };

async function injectStream(s: MediaStream): Promise<void> {
  stream = s;
  cameraEl.srcObject = s;
  await cameraEl.play();
  activateUi();
  stateEl.textContent = "Stream sintético inyectado (modo test).";
}

(window as unknown as { __giaInjectStream?: (s: MediaStream) => Promise<void> }).__giaInjectStream = injectStream;

const mockState: MockState = { n: 0, kind: "numeric", payload: { values: [17, 9, 12] }, useImage: false };

function paintMockScreen(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = "#14161a";
  ctx.fillRect(0, 0, 1280, 800);
  ctx.fillStyle = "#f2f4f8";
  ctx.beginPath();
  ctx.moveTo(100, 60); ctx.lineTo(1180, 44); ctx.lineTo(1196, 760); ctx.lineTo(84, 744);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = "#20242c";
  ctx.textAlign = "center";
  ctx.save();
  ctx.scale(2, 2); // painters use the original 640x400 coordinate space
  const p = mockState.payload;
  if (mockState.useImage) {
    ctx.restore();
    if (mockImgReady) {
      const q = [{ x: 100, y: 60 }, { x: 1180, y: 44 }, { x: 1196, y: 760 }, { x: 84, y: 744 }];
      const ux = { x: q[1].x - q[0].x, y: q[1].y - q[0].y };
      const uy = { x: q[3].x - q[0].x, y: q[3].y - q[0].y };
      ctx.save();
      ctx.setTransform(ux.x / mockImg.width, ux.y / mockImg.width, uy.x / mockImg.height, uy.y / mockImg.height, q[0].x, q[0].y);
      ctx.drawImage(mockImg, 0, 0);
      ctx.restore();
    }
  } else if (mockState.kind === "numeric") {
    ctx.font = "bold 22px sans-serif";
    ctx.fillText("Qué número está más alejado de la mediana?", 320, 80);
    const values = (p.values as number[]) ?? [17, 9, 12];
    const y = 288, h = 96, w = 130, xs = [115, 255, 395];
    ctx.font = "bold 44px sans-serif";
    values.forEach((v, i) => {
      ctx.strokeStyle = "#3a3f4a"; ctx.lineWidth = 3;
      ctx.strokeRect(xs[i], y, w, h);
      ctx.fillText(String(v), xs[i] + w / 2, y + h / 2 + 16);
    });
    ctx.restore();
  } else if (mockState.kind === "perceptual") {
    ctx.font = "bold 22px sans-serif";
    ctx.fillText("Cuántas columnas tienen la misma letra?", 320, 80);
    const cols = (p.columns as string[][]) ?? [["j", "J"], ["r", "P"], ["l", "L"], ["g", "J"]];
    ctx.font = "bold 56px sans-serif";
    cols.forEach(([t, b], i) => {
      const x = 190 + i * 90;
      ctx.fillText(t, x, 180);
      ctx.fillText(b, x, 250);
    });
    ctx.font = "bold 30px sans-serif";
    [0, 1, 2, 3, 4].forEach((v, i) => {
      const y = 300, w = 80, xs = 150 + i * 85;
      ctx.strokeStyle = "#3a3f4a"; ctx.lineWidth = 3;
      ctx.strokeRect(xs, y, w, 64);
      ctx.fillText(String(v), xs + w / 2, y + 44);
    });
    ctx.restore();
  } else if (mockState.kind === "word") {
    ctx.font = "bold 22px sans-serif";
    ctx.fillText("Qué palabra no es adecuada?", 320, 80);
    const words = (p.words as string[]) ?? ["Tallar", "Intruso", "Indiscreto"];
    const y = 288, h = 96, w = 170, xs = [95, 245, 395];
    ctx.font = "bold 24px sans-serif";
    words.forEach((w0, i) => {
      ctx.strokeStyle = "#3a3f4a"; ctx.lineWidth = 3;
      ctx.strokeRect(xs[i], y, w, h);
      ctx.fillText(w0, xs[i] + w / 2, y + h / 2 + 10);
    });
    ctx.restore();
  } else {
    ctx.restore();
  }
  ctx.textAlign = "start";
  ctx.fillStyle = `rgba(255,255,255,${(mockState.n % 2) * 0.02})`;
  ctx.fillRect(1279, 799, 1, 1);
}

(window as unknown as { __giaMockStart?: () => Promise<void> }).__giaMockStart = async () => {
  const ctx = mockCanvas.getContext("2d");
  if (!ctx) return;
  paintMockScreen(ctx);
  const s = mockCanvas.captureStream(30);
  (window as unknown as { __mockTimer?: number }).__mockTimer = window.setInterval(() => {
    mockState.n++;
    paintMockScreen(ctx);
  }, 60);
  await injectStream(s);
};

(window as unknown as { __giaMockScreen?: (kind: string, payload: Record<string, unknown>) => void }).__giaMockScreen = (kind, payload) => {
  mockState.kind = kind;
  mockState.payload = payload;
  mockState.useImage = false;
  const ctx = mockCanvas.getContext("2d");
  if (ctx) paintMockScreen(ctx);
};

(window as unknown as { __giaMockImage?: (dataUrl: string) => void }).__giaMockImage = (dataUrl) => {
  mockState.useImage = true;
  mockImgReady = false;
  mockImg.src = dataUrl;
};

(window as unknown as { __giaDebug?: () => unknown }).__giaDebug = () => ({
  running,
  videoWidth: cameraEl.videoWidth,
  trackCount: stream?.getTracks().length ?? 0,
  module: moduleKind,
  questionLine: lastQuestionLine,
  statement: lastStatement,
  solution: lastSolution,
});
