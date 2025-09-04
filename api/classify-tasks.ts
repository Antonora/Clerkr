import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });
const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") return res.status(405).json({ error: "Only POST" });
  const { task_id } = req.body || {};
  if (!task_id) return res.status(400).json({ error: "task_id required" });

  const { data: t, error: e1 } = await supabase
    .from("tasks")
    .select("id,title,notes")
    .eq("id", task_id)
    .single();
  if (e1 || !t) return res.status(404).json({ error: "task not found" });

  const sys = `Du är Clerkr, exekutiv sekreterare.
Uppgift: härled impact (1–5), estimate_min (5–240), blocking (true/false) och ev. deadline ur titel+notes.
Regler:
- Prioritera pengar in, kundrelation, hårda deadlines (<48h).
- Om task låser upp andra aktiviteter → blocking=true.
- Om tidsangivelser finns (“imorgon 17:00”, “fredag 12”) → tolka till ISO i Europe/Stockholm.
- Kort motivering (<=140 tecken). Strikt JSON.`;

  const user = `Titel: ${t.title}
Notes: ${t.notes ?? ""}

Returnera JSON enbart:
{"impact":n,"estimate_min":n,"blocking":bool,"deadline_at":"ISO|null","why":"..."}`;

  const r = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.2,
    response_format: { type: "json_object" },
    messages: [{ role: "system", content: sys }, { role: "user", content: user }]
  });

  let out:any={}; try{ out = JSON.parse(r.choices[0]?.message?.content || "{}"); }catch{}
  const impact = Math.max(1, Math.min(5, Number(out.impact ?? 3)));
  const estimate = Math.max(5, Math.min(240, Math.round(Number(out.estimate_min ?? 30)/5)*5));
  const blocking = Boolean(out.blocking ?? false);
  const deadline_at = out.deadline_at && out.deadline_at!=="null" ? out.deadline_at : null;
  const why = String(out.why ?? "").slice(0,140);

  const { error: e2 } = await supabase
    .from("tasks")
    .update({
      impact, estimate_min: estimate, blocking, deadline_at,
      ai_reason: why, ai_version: "v1-min", source: "ai",
      impact_confidence: out.impact ? 80 : 50,
      estimate_confidence: out.estimate_min ? 60 : 50,
      blocking_confidence: out.blocking!==undefined ? 70 : 50
    })
    .eq("id", t.id);
  if (e2) return res.status(500).json({ error: e2.message });

  return res.status(200).json({ ok: true, task_id: t.id });
}
