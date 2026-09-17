import { createWorker } from "tesseract.js";
import fs from "node:fs";
import { solveFromTokens, classifyQuestion } from "./dist-node/solver.mjs";

const buffer = fs.readFileSync("../captures/battery/raw/n-400.png");
const spa = await createWorker("spa", 1, { logger: () => undefined });
await spa.setParameters({ tessedit_pageseg_mode: "11", user_defined_dpi: "300" });
const { data } = await spa.recognize(buffer, {}, { text: true, blocks: true });
const tokens = [];
for (const b of data.blocks ?? []) {
  for (const p of b.paragraphs ?? []) {
    for (const l of p.lines ?? []) {
      for (const w of l.words ?? []) {
        tokens.push({ text: w.text?.trim(), conf: Math.round(w.confidence), x0: w.bbox.x0, y0: w.bbox.y0, x1: w.bbox.x1, y1: w.bbox.y1 });
      }
    }
  }
}
const usable = tokens.filter(t => t.conf >= 25 && t.text);
const fullText = usable.map(t => t.text).join(" ");
console.log("module:", classifyQuestion(fullText));
console.log("tokens (text, conf, x0, ycenter):");
for (const t of usable) console.log(" ", JSON.stringify(t.text), t.conf, t.x0, Math.round((t.y0+t.y1)/2));
const sol = solveFromTokens(tokens, null, null);
console.log("solution:", JSON.stringify(sol));
process.exit(0);
