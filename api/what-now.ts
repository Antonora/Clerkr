import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });
const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

function urgency(deadline: Date, now = new Date()) {
  const h = (deadline.getTime() - now.getTime()) / 3_600_000;
  if (h <= 0) return 2;
  if (h < 48) return 1.5 + (48 - h) / 48;
  return 1 / Math.log10(h + 10);
}
function scoreTask(t: any, now = new Date()) {
  const du = t.deadline_at ? urgency(new Date(t.deadline_at), now) : 0;
  const impact = t.impact ?? 3;
  const effort = (t.estimate_min ?? 30) / 30;
  const block = t.blocking ? 1 : 0;
  return 2.0 * du + 1.8 * impact - 0.6 * effort + 0.8 * block;
}

export default async function handler(req: any, res: any) {
  try {
    // 1) Läs tasks via Supabase HTTP
    const { data: rows, error } = await supabase
      .from("tasks")
      .select("id,title,estimate_min,impact,deadline_at,blocking,status")
      .eq("status", "todo")
      .order("deadline_at", { ascending: true, nullsFirst: false })
      .limit(50);
    if (error) throw error;

    // 2) Förscore & topp 10
    const now = new Date();
    const top = (rows ?? [])
      .map(r => ({ ...r, _score: scoreTask(r, now) }))
      .sort((a, b) => b._score - a._score)
      .slice(0, 10)
      .map(({ _score, ...t }) => t);

    // 3) Kör modellen
    const system = `Du är Clerkr, exekutiv sekreterare. Rakt på sak.
Prioritera hård deadline <48h, pengar in/kundrelationer > admin.
Kortlucka: 15–30 min. Annars 60–90 min. Svara i JSON.`;

    const user = {
      role: "user",
      content:
`Backlog (top 10): ${JSON.stringify(top)}.
Returnera JSON:
{
  "primary_task": {"task_id":"...","title":"...","duration_min":30,"why":"..."},
  "alternatives": [{"task_id":"...","title":"...","duration_min":15}],
  "next_step": {"action":"start|split|clarify|defer","details":"..."}
}`
    };

    const ai = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.3,
      max_tokens: 350,
      response_format: { type: "json_object" },
      messages: [{ role: "system", content: system }, user]
    });

    const json = ai.choices?.[0]?.message?.content ?? "{}";
    return res.status(200).json(JSON.parse(json));
  } catch (e: any) {
    console.error("WHAT-NOW ERROR", e?.message);
    return res.status(500).json({ error: "FUNCTION_INVOCATION_FAILED" });
  }
}
