import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";

// Init
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });
const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

// Helpers
function clamp(n: any, min: number, max: number, def: number) {
  const x = Number(n);
  return Number.isFinite(x) ? Math.min(max, Math.max(min, x)) : def;
}
function round5(n: any, def: number) {
  const x = Number(n);
  if (!Number.isFinite(x)) return def;
  return Math.max(5, Math.min(240, Math.round(x / 5) * 5));
}
function normalizeISO(s: any): string | null {
  if (!s || typeof s !== "string") return null;
  if (s.toLowerCase() === "null" || s.toLowerCase() === "none") return null;
  const d = new Date(s);
  return Number.isFinite(d.getTime()) ? d.toISOString() : null;
}

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") return res.status(405).json({ error: "Only POST" });

  const { task_id } = req.body || {};
  if (!task_id) return res.status(400).json({ error: "task_id required" });

  // 1) Läs endast titel/notes (ingen bias)
  const { data: t, error: e1 } = await supabase
    .from("tasks")
    .select("id,title,notes")
    .eq("id", task_id)
    .single();

  if (e1 || !t) return res.status(404).json({ error: "task not found" });

  // 2) Prompt (strikt JSON)
  const system = `Du är Clerkr – exekutiv sekreterare. Rakt på sak. 
Målsättning: sätt korrekta fält för tasks utan att hitta på.
ABSOLUTA REGLER:
- Hitta inte på deadlines. Om oklart → "deadline_at": null.
- Om titeln är vag → sätt "blocking": false och "estimate_min": 15 och motivering som ber om förtydligande.
- Prioritera pengar in/kundrelationer > admin.
- Om task låser upp andra aktiviteter → "blocking": true.
- Europe/Stockholm för eventuell tolkning av tid.
- Returnera strikt JSON. Ingen extra text.`;

  const user = `Titel: ${t.title}
Notes: ${t.notes ?? ""}

Returnera JSON exakt:
{"impact":n,"estimate_min":n,"blocking":bool,"deadline_at":"ISO eller null","why":"... (<=140 tecken)"}`;

  // 3) OpenAI
  let out: any = {};
  try {
    const r = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [{ role: "system", content: system }, { role: "user", content: user }]
    });
    out = JSON.parse(r.choices?.[0]?.message?.content || "{}");
  } catch (e: any) {
    console.error("CLASSIFY_AI_ERROR", e?.message);
    // Vi fortsätter med defaults nedan
    out = {};
  }

  // 4) Validera/normalisera
  const impact = clamp(out.impact, 1, 5, 3);
  const estimate_min = round5(out.estimate_min, 30);
  const blocking = Boolean(out.blocking ?? false);
  const deadline_at = normalizeISO(out.deadline_at);
  const why = String(out.why ?? "").slice(0, 140);

  // 5) Uppdatera raden
  const { error: e2 } = await supabase
    .from("tasks")
    .update({
      impact,
      estimate_min,
      blocking,
      deadline_at,
      ai_reason: why,
      ai_version: "v1-min",
      source: "ai",
      impact_confidence: out.impact != null ? 80 : 50,
      estimate_confidence: out.estimate_min != null ? 60 : 50,
      blocking_confidence: out.blocking != null ? 70 : 50
    })
    .eq("id", t.id);

  if (e2) {
    console.error("CLASSIFY_DB_UPDATE_ERROR", e2.message);
    return res.status(500).json({ error: e2.message });
  }

  return res.status(200).json({
    ok: true,
    task_id: t.id,
    impact,
    estimate_min,
    blocking,
    deadline_at,
    why
  });
}
