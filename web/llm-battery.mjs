/**
 * Battery VLM: interpreta las capturas reales con GLM (visión) y compara
 * con las etiquetas del manifest. Clave leída SOLO local de la config de
 * ZCode — nunca se envía al cliente web.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const KEY = fs.readFileSync(".openrouter-key", "utf-8").trim();
const BASE = "https://openrouter.ai/api/v1/chat/completions";
const MODEL = process.argv[4] ?? "google/gemma-4-31b-it:free";

const rawDir = "../captures/battery/raw";
const resultsPath = "llm-battery-results.jsonl";
const manifest = fs.readFileSync(path.join(rawDir, "manifest.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));

// estratificado: primeras N por módulo
const N = Number(process.argv[2] ?? 1);
const OFFSET = Number(process.argv[3] ?? 0);
const byModule = {};
for (const e of manifest) (byModule[e.module] ??= []).push(e);
const sample = [];
for (const m of ["numeric", "perceptual", "word", "reasoning", "spatial"]) {
  sample.push(...(byModule[m] ?? []).slice(OFFSET, OFFSET + N));
}

const PROMPT = `Analiza esta captura de una pregunta de un test tipo GIA y responde SOLO con JSON válido (sin markdown, sin texto extra):
{"module":"numeric|perceptual|word|reasoning|spatial|unknown",
"question":"texto de la pregunta",
"statement":"sentencia previa si está visible, si no null",
"options":["opción 1","opción 2",...],
"values":[n1,n2,n3],
"gridTop":["letras fila superior"],"gridBottom":["letras fila inferior"],
"answerIndex":0,
"answerText":"texto de la opción correcta",
"confidence":0.0}
Reglas de resolución: numeric → la opción cuyo número esté MÁS LEJOS de la mediana de los tres. perceptual → cuenta las columnas (de 4) donde la letra de arriba y la de abajo son la MISMA sin importar mayúscula/minúscula; la respuesta es ese número (0-4), options son 0,1,2,3,4. word → la palabra que NO encaja semánticamente con las otras dos. reasoning → responde con la sentencia mostrada (comparativos con negación invierten). spatial → cuenta los cuadrados (de 2) donde las dos letras son la misma sin importar ROTACIÓN pero NO contando si una es el reflejo especular de la otra; options son 0,1,2. answerIndex es 0-based sobre options en orden izquierda→derecha. confidence: tu seguridad 0-1.`;

const wait = (ms) => new Promise(r => setTimeout(r, ms));
const PACING_MS = Number(process.env.LLM_PACING_MS ?? 15000);
let ok = 0, tested = 0;
const t0 = Date.now();
const results = [];
for (const e of sample) {
  try {
    const b64 = fs.readFileSync(path.join(rawDir, e.file)).toString("base64");
    const tCall = Date.now();
    let res = null;
    for (let attempt = 0; attempt < 4; attempt++) {
      res = await fetch(BASE, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${KEY}` },
        body: JSON.stringify({
          model: MODEL,
          temperature: 0,
          messages: [{ role: "user", content: [
            { type: "image_url", image_url: { url: `data:image/png;base64,${b64}` } },
            { type: "text", text: PROMPT },
          ]}],
        }),
        signal: AbortSignal.timeout(90000),
      });
      if (res.status !== 429) break;
      const retryAfter = Number(res.headers.get("retry-after") ?? 0);
      await wait(Math.max(retryAfter * 1000, 8000 * (attempt + 1)));
    }
    if (!res || res.status === 429) {
      results.push({ id: e.id, module: e.module, error: "429 persistente" });
      fs.appendFileSync(resultsPath, JSON.stringify(results.at(-1)) + "\n");
      tested++;
      continue;
    }
    const latency = Date.now() - tCall;
    if (!res.ok) {
      const errText = await res.text();
      results.push({ id: e.id, module: e.module, error: `${res.status}: ${errText.slice(0, 120)}`, latency });
      tested++;
      fs.appendFileSync(resultsPath, JSON.stringify(results.at(-1)) + "\n");
      continue;
    }
    const j = await res.json();
    let txt = j.choices?.[0]?.message?.content ?? "";
    txt = txt.replace(/```json|```/g, "").trim();
    const m = txt.match(/\{[\s\S]*\}/);
    const parsed = m ? JSON.parse(m[0]) : null;
    let expected = null;
    if (e.module === "numeric" || e.module === "perceptual" || e.module === "spatial") expected = String(e.answer);
    else if (e.module === "word") expected = e.words[e.answer];
    else if (e.module === "reasoning") expected = e.answerText;
    let got = parsed ? String(parsed.answerText ?? parsed.answerIndex ?? "") : null;
    if (parsed && e.module === "numeric" && parsed.values) {
      // el label correcto es el VALOR de la opción ganadora
      got = String(parsed.answerText ?? parsed.answerIndex ?? "");
    }
    const pass = parsed && expected !== null && String(got) === String(expected);
    if (pass) ok++;
    tested++;
    await wait(PACING_MS);
    results.push({ id: e.id, module: e.module, expected, got, conf: parsed?.confidence, latency, pass });
    fs.appendFileSync(resultsPath, JSON.stringify(results.at(-1)) + "\n");
  } catch (err) {
    results.push({ id: e.id, module: e.module, error: String(err).slice(0, 100) });
    fs.appendFileSync(resultsPath, JSON.stringify(results.at(-1)) + "\n");
    tested++;
    if (String(err).includes("fetch failed")) { await wait(1500); }
  await wait(PACING_MS);
  }
}
console.log(JSON.stringify({ tested, ok, avgLatencyMs: tested ? Math.round(results.filter(r=>r.latency).reduce((a,r)=>a+r.latency,0) / Math.max(1, results.filter(r=>r.latency).length)) : 0, results }, null, 1));
