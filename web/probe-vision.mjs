import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const cfg = JSON.parse(fs.readFileSync(path.join(os.homedir(), ".zcode/v2/config.json"), "utf-8"));
const prov = cfg.provider;
const b64 = fs.readFileSync("../captures/battery/raw/n-400.png").toString("base64");
const dataUrl = `data:image/png;base64,${b64}`;

const combos = [];
for (const [name, base] of [
  ["zai", "https://api.z.ai/api/paas/v4/chat/completions"],
  ["bigmodel", "https://open.bigmodel.cn/api/paas/v4/chat/completions"],
]) {
  const p = prov[`builtin:${name}`]?.options ?? {};
  if (!p.apiKey) continue;
  for (const model of ["glm-4.5v", "glm-4v-plus", "glm-4v-flash"]) {
    combos.push({ name, model, base, key: p.apiKey });
  }
}

for (const c of combos) {
  try {
    const res = await fetch(c.base, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${c.key}` },
      body: JSON.stringify({
        model: c.model,
        messages: [{ role: "user", content: [
          { type: "image_url", image_url: { url: dataUrl } },
          { type: "text", text: "¿Qué números ves? Responde solo los números separados por comas." },
        ]}],
        max_tokens: 100,
      }),
      signal: AbortSignal.timeout(45000),
    });
    const j = await res.json().catch(() => ({}));
    const msg = j.choices?.[0]?.message?.content ?? JSON.stringify(j).slice(0, 100);
    console.log(`${c.name}/${c.model}: ${res.status} -> ${String(msg).replace(/\n/g, " ").slice(0, 100)}`);
  } catch (e) {
    console.log(`${c.name}/${c.model}: ERR ${String(e).slice(0, 80)}`);
  }
}
