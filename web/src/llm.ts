/**
 * Cliente LLM (VLM) para percepción: una llamada con el screenshot
 * rectificado devuelve el módulo, la pregunta, las opciones y la respuesta
 * propuesta en JSON estructurado. OpenRouter-compatible (cualquier modelo
 * con entrada de imagen).
 *
 * La API key se configura en el cliente (localStorage) o en el proxy del
 * servidor para el despliegue — nunca se versiona en el repo.
 */

export interface VlmReading {
  module: "numeric" | "perceptual" | "word" | "reasoning" | "spatial" | "unknown";
  question: string;
  statement: string | null;
  options: string[];
  values: number[] | null;
  answerIndex: number | null;
  answerText: string | null;
  confidence: number;
}

const PROMPT = `Analiza esta captura de una pregunta de un test tipo GIA y responde SOLO con JSON válido (sin markdown, sin texto extra):
{"module":"numeric|perceptual|word|reasoning|spatial|unknown",
"question":"texto de la pregunta",
"statement":"sentencia previa si está visible, si no null",
"options":["opción 1","opción 2",...],
"values":[n1,n2,n3],
"answerIndex":0,
"answerText":"texto de la opción correcta",
"confidence":0.0}
Reglas de resolución: numeric → la opción cuyo número esté MÁS LEJOS de la mediana de los tres. perceptual → cuenta las columnas (de 4) donde la letra de arriba y la de abajo son la MISMA sin importar mayúscula/minúscula; la respuesta es ese número (0-4), options son 0,1,2,3,4. word → la palabra que NO encaja semánticamente con las otras dos. reasoning → responde con la sentencia mostrada (comparativos con negación invierten). spatial → cuenta los cuadrados (de 2) donde las dos letras son la misma sin importar ROTACIÓN pero NO contando si una es el reflejo especular de la otra; options son 0,1,2. answerIndex es 0-based sobre options en orden izquierda→derecha. confidence: tu seguridad 0-1.`;

export interface LlmConfig {
  base: string;
  key: string;
  model: string;
}

const DEFAULT_BASE = "https://openrouter.ai/api/v1/chat/completions";
const DEFAULT_MODEL = "google/gemma-4-31b-it:free";

export function loadLlmConfig(): LlmConfig | null {
  try {
    const base = localStorage.getItem("gia.llm.base") ?? DEFAULT_BASE;
    const key = localStorage.getItem("gia.llm.key") ?? "local";
    const model = localStorage.getItem("gia.llm.model");
    if (!model) return null;
    return { base, key, model };
  } catch {
    return null;
  }
}

/**
 * Configura el proveedor. Ejemplos:
 *  - OpenRouter: base "https://openrouter.ai/api/v1/chat/completions",
 *    model "google/gemma-4-31b-it:free", key de OpenRouter.
 *  - Gemma local (Ollama): base "http://localhost:11434/v1/chat/completions",
 *    model "gemma3:12b" (o el tag local), key cualquiera ("local").
 *  - LM Studio: base "http://localhost:1234/v1/chat/completions", model el
 *    identificador del modelo cargado.
 */
export function saveLlmConfig(base: string, key: string, model: string): void {
  localStorage.setItem("gia.llm.base", base);
  localStorage.setItem("gia.llm.key", key);
  localStorage.setItem("gia.llm.model", model);
}

/** Interpreta un screenshot rectificado (dataURL) con el VLM. */
export async function vlmRead(dataUrl: string, cfg: LlmConfig): Promise<VlmReading | null> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (cfg.key && cfg.key !== "local") headers["Authorization"] = `Bearer ${cfg.key}`;
  const res = await fetch(cfg.base, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: cfg.model,
      temperature: 0,
      messages: [{ role: "user", content: [
        { type: "image_url", image_url: { url: dataUrl } },
        { type: "text", text: PROMPT },
      ]}],
    }),
    signal: AbortSignal.timeout(120000),
  });
  if (!res.ok) throw new Error(`VLM ${res.status}: ${(await res.text()).slice(0, 100)}`);
  const j = await res.json();
  let txt = j.choices?.[0]?.message?.content ?? "";
  txt = txt.replace(/```json|```/g, "").trim();
  const m = txt.match(/\{[\s\S]*\}/);
  if (!m) return null;
  const parsed = JSON.parse(m[0]);
  return {
    module: parsed.module ?? "unknown",
    question: parsed.question ?? "",
    statement: parsed.statement ?? null,
    options: Array.isArray(parsed.options) ? parsed.options : [],
    values: Array.isArray(parsed.values) ? parsed.values : null,
    answerIndex: typeof parsed.answerIndex === "number" ? parsed.answerIndex : null,
    answerText: parsed.answerText ?? null,
    confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0.5,
  };
}
