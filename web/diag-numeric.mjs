import { createWorker } from "tesseract.js";
import { PNG } from "pngjs";
import fs from "node:fs";
import { solveFromTokens, classifyQuestion } from "./dist-node/solver.mjs";

const buffer = fs.readFileSync("../captures/battery/raw/n-400.png");
const png = PNG.sync.read(buffer);
const imageData = { width: png.width, height: png.height, data: png.data };

const spa = await createWorker("spa", 1, { logger: () => undefined });
await spa.setParameters({ tessedit_pageseg_mode: "11", user_defined_dpi: "300" });
const { data } = await spa.recognize(buffer, {}, { text: true, blocks: true });
const tokens = [];
for (const b of data.blocks ?? []) {
  for (const p of b.paragraphs ?? []) {
    for (const l of p.lines ?? []) {
      for (const w of l.words ?? []) {
        tokens.push({ text: w.text?.trim(), conf: w.confidence, x0: w.bbox.x0, y0: w.bbox.y0, x1: w.bbox.x1, y1: w.bbox.y1 });
      }
    }
  }
}
const usable = tokens.filter(t => t.conf >= 25 && t.text);
const fullText = usable.map(t => t.text).join(" ");
const H = imageData.height;
const midY = H * 0.55;
const lower = usable.filter(t => (t.y0 + t.y1) / 2 >= midY);
const digitTokens = lower.filter(t => /^\d{1,4}$/.test(t.text));
console.log("H:", H, "| module:", classifyQuestion(fullText));
console.log("lower tokens:", JSON.stringify(lower.map(t => ({ t: t.text, y: Math.round((t.y0+t.y1)/2) }))));
console.log("digitTokens:", digitTokens.length);
const sol = solveFromTokens(tokens, null, imageData);
console.log("solve:", JSON.stringify(sol));
process.exit(0);
