import { createWorker } from "tesseract.js";
import fs from "node:fs";

const buffer = fs.readFileSync("../captures/battery/raw/p-100.png");
const spa = await createWorker("spa", 1, { logger: () => undefined });
await spa.setParameters({ tessedit_pageseg_mode: "11", user_defined_dpi: "300" }); // SPARSE_TEXT
const t0 = Date.now();
const { data } = await spa.recognize(buffer, {}, { text: true, blocks: true });
console.log("elapsed_ms:", Date.now() - t0);
const lines = [];
for (const b of data.blocks ?? []) {
  for (const p of b.paragraphs ?? []) {
    for (const l of p.lines ?? []) {
      lines.push({
        y: l.bbox ? Math.round((l.bbox.y0 + l.bbox.y1) / 2) : null,
        conf: Math.round(l.confidence ?? 0),
        text: l.text?.trim()?.slice(0, 50),
        words: l.words?.map(w => w.text).join("/") ?? "",
      });
    }
  }
}
console.log(JSON.stringify(lines, null, 1));
process.exit(0);
