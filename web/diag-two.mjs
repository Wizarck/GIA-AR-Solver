import { createWorker } from "tesseract.js";
import fs from "node:fs";
import { solveFromTokens } from "./dist-node/solver.mjs";

const buffer = fs.readFileSync("../captures/battery/raw/n-401.png");
const spa = await createWorker("spa", 1, { logger: () => undefined });
await spa.setParameters({ tessedit_pageseg_mode: "11", user_defined_dpi: "300" });
const { data: page } = await spa.recognize(buffer, {}, { text: true, blocks: true });

// EXACT battery token extraction
const tokens = [];
const push = (w) => {
  const t = (w.text ?? "").trim();
  if (t && w.bbox) tokens.push({ text: t, conf: w.confidence ?? 0, x0: w.bbox.x0, y0: w.bbox.y0, x1: w.bbox.x1, y1: w.bbox.y1 });
};
if (Array.isArray(page.blocks)) {
  for (const b of page.blocks ?? []) {
    for (const p of b.paragraphs ?? []) {
      for (const l of p.lines ?? []) {
        for (const w of l.words ?? []) push(w);
      }
    }
  }
} else if (Array.isArray(page.words)) {
  page.words.forEach(push);
}
console.log("tokens extraídos:", tokens.length);
console.log("muestra:", JSON.stringify(tokens.slice(0, 8)));
const sol = solveFromTokens(tokens, null, null);
console.log("solve:", JSON.stringify(sol));
process.exit(0);
