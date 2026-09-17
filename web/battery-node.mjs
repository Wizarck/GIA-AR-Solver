/**
 * Headless battery (Node): runs solveFromTokens over the captured screenshots
 * with exact labels. Incremental + resumable (results in battery-node.jsonl).
 *
 * Usage: node battery-node.mjs [limit] [budgetSeconds]
 */
import { createWorker } from "tesseract.js";
import { PNG } from "pngjs";
import fs from "node:fs";
import path from "node:path";
import { solveFromTokens, classifyQuestion } from "./dist-node/solver.mjs";

const rawDir = "../captures/battery/raw";
const manifestPath = path.join(rawDir, "manifest.jsonl");
const resultsPath = "battery-node-results.jsonl";
const [limitArg, budgetArg] = process.argv.slice(2);
const LIMIT = Number(limitArg ?? 40);
const BUDGET = (Number(budgetArg ?? 260) * 1000);

const entries = fs.readFileSync(manifestPath, "utf8").trim().split("\n").map((l) => JSON.parse(l));
const done = new Set(
  fs.existsSync(resultsPath)
    ? fs.readFileSync(resultsPath, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l).id)
    : [],
);
const pendingAll = entries.filter((e) => !done.has(e.id));
const pending = [
  ...pendingAll.filter((e) => e.module !== "perceptual"),
  ...pendingAll.filter((e) => e.module === "perceptual"),
].slice(0, LIMIT);

// workers: spa auto full-pass + eng digits
const spa = await createWorker("spa", 1, { logger: () => undefined });
await spa.setParameters({ tessedit_pageseg_mode: "11", user_defined_dpi: "300" }); // PSM.SPARSE_TEXT
const eng = await createWorker("eng", 1, { logger: () => undefined });
await eng.setParameters({ tessedit_char_whitelist: "0123456789", tessedit_pageseg_mode: "7", user_defined_dpi: "300" });

function tokensFromPage(data) {
  const out = [];
  const push = (w) => {
    const t = (w.text ?? "").trim();
    if (t && w.bbox) out.push({ text: t, conf: w.confidence ?? 0, x0: w.bbox.x0, y0: w.bbox.y0, x1: w.bbox.x1, y1: w.bbox.y1 });
  };
  if (Array.isArray(data.blocks)) {
    for (const b of data.blocks ?? []) {
      for (const p of b.paragraphs ?? []) {
        for (const l of p.lines ?? []) {
          for (const w of l.words ?? []) push(w);
        }
      }
    }
  } else if (Array.isArray(data.words)) {
    data.words.forEach(push);
  }
  return out;
}

function pngToImageData(buffer) {
  const png = PNG.sync.read(buffer);
  return { width: png.width, height: png.height, data: png.data };
}

const stripAccents = (t) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

let tested = 0, correct = 0, unsolved = 0;
const t0 = Date.now();
for (const e of pending) {
  if (Date.now() - t0 > BUDGET) break;
  const buffer = fs.readFileSync(path.join(rawDir, e.file));
  try {
    const imageData = pngToImageData(buffer);
    const { data: page } = await spa.recognize(buffer, {}, { text: true, blocks: true });
    let tokens = tokensFromPage(page).filter((t) => t.conf >= 25);
    const fullText = tokens.map((t) => t.text).join(" ");
    const module = classifyQuestion(fullText);

    const statement = e.module === "reasoning" ? e.statement : null;

    // numeric: eng digits pass on the region below the question — spa tokens
    // alone miss ~1 of 3 option numbers on real captures
    if (module === "numeric") {
      const KEY = ["mediana"];
      let qY = null;
      for (const t of tokens) {
        const nt = stripAccents(t.text);
        if (KEY.some((k) => nt.includes(k))) qY = Math.max(qY ?? 0, (t.y0 + t.y1) / 2);
      }
      if (qY !== null) {
        const rect = { left: 0, top: Math.round(qY + 10), width: imageData.width, height: Math.round(imageData.height * 0.92 - qY) };
        const r = await eng.recognize(buffer, { rectangle: rect }, { text: true });
        const values = (r.data.text ?? "").split(/\s+/).filter((t) => /^\d{1,4}$/.test(t));
        if (values.length === 3) {
          // replace non-digit tokens in the lower band with the eng readings,
          // positioned by x order
          const oldDigitTokens = tokens
            .filter((t) => (t.y0 + t.y1) / 2 > qY && /^\d{1,4}$/.test(t.text))
            .sort((a, b) => a.x0 - b.x0);
          if (oldDigitTokens.length === 3) {
            oldDigitTokens.forEach((t, i) => { t.text = values[i]; });
          } else {
            // synthesize token positions evenly across the option row
            const xs = [0.2, 0.5, 0.8].map((f) => Math.round(f * imageData.width));
            oldDigitTokens.length = 0;
            values.forEach((v, i) => {
              tokens.push({ text: v, conf: 80, x0: xs[i] - 40, y0: Math.round(qY + 40), x1: xs[i] + 40, y1: Math.round(qY + 120) });
            });
          }
        }
      }
    }

    const sol = solveFromTokens(tokens, statement, module === "spatial" ? imageData : null);
    let expected = null;
    if (e.module === "numeric" || e.module === "perceptual" || e.module === "spatial") expected = String(e.answer);
    else if (e.module === "word") expected = e.words[e.answer];
    else if (e.module === "reasoning") expected = e.answerText;
    const ok = sol.solved && sol.label !== null && String(sol.label) === String(expected);
    if (ok) correct++;
    if (!sol.solved) unsolved++;
    tested++;
    fs.appendFileSync(resultsPath, JSON.stringify({ id: e.id, module: e.module, expected, got: sol.solved ? sol.label : null, conf: sol.confidence, ok }) + "\n");
  } catch (err) {
    fs.appendFileSync(resultsPath, JSON.stringify({ id: e.id, module: e.module, error: String(err).slice(0, 120) }) + "\n");
    tested++;
  }
}
const total = tested + done.size;
console.log(JSON.stringify({ batchTested: tested, batchCorrect: correct, batchUnsolved: unsolved, totalDone: total, ofTotal: entries.length }));
