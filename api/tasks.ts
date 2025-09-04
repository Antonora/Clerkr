// api/tasks.ts
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });
const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

export default async function handler(req: any, res: any) {
  try {
    if (req.method === "GET") {
      const { data, error } = await supabase
        .from("tasks")
        .select("id,title,estimate_min,impact,deadline_at,status,ai_reason,blocking,created_at")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) {
        console.error("TASKS_GET_ERROR", error.message);
        return res.status(500).json({ error: error.message, items: [] });
      }
      return res.status(200).json({ items: data ?? [] });
    }

    if (req.method === "POST") {
      const { title, notes = null } = req.body || {};
      if (!title) return res.status(400).json({ error: "title required" });

      // 1) Skapa raden minimalistiskt
      const ins = await supabase
        .from("tasks")
        .insert([{ title, notes, status: "todo" }])
        .select("id,title,status")
        .single();
      if (ins.error) {
        console.error("TASKS_POST_ERROR", ins.error.message);
        return res.status(500).json({ error: ins.error.message });
      }
      const task = ins.data;

      // 2) Kör AI-klassificering INLINE (vänta in)
      const sys = `Du är Clerkr, exekutiv sekreterare.
Uppgift: härled impact (1–5), estimate_min (5–240), blocking (true/false) och ev. deadline ur titel+notes.
Regler:
- Prioritera pengar in, kundrelation, hårda deadlines (<48h).
- Om task låser upp andra aktiviteter → blocking=true.
- Om tidsangivelser finns (“imorgon 17:00”, “fredag 12”) → tolka till ISO i Europe/Stockholm.
- Kort motivering (<=140 tecken). Strikt JSON.`;

      const user = `Titel: ${title}
Notes: ${notes ?? ""}

Returnera JSON:
{"impact":n,"estimate_min":n,"blocking":bool,"deadline_at":"ISO|null","why":"..."}`;

      let impact = 3, estimate = 30, blocking = false, deadline_at: string|null = null, why = "";
      try {
        const ai = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          temperature: 0.2,
          response_format: { type: "json_object" },
          messages: [{ role: "system", content: sys }, { role: "user", content: user }]
        });
        const out = JSON.parse(ai.choices?.[0]?.message?.content || "{}");
        impact = Math.max(1, Math.min(5, Number(out.impact ?? 3)));
        estimate = Math.max(5, Math.min(240, Math.round(Number(out.estimate_min ?? 30)/5)*5));
        blocking = Boolean(out.blocking ?? false);
        deadline_at = out.deadline_at && out.deadline_at !== "null" ? out.deadline_at : null;
        why = String(out.why ?? "").slice(0,140);
      } catch (e:any) {
        console.error("AI_CLASSIFY_ERROR", e?.message);
        // behåll defaults om AI faller
      }

      // 3) Uppdatera raden med AI-resultatet
      const upd = await supabase
        .from("tasks")
        .update({
          impact,
          estimate_min: estimate,
          blocking,
          deadline_at,
          ai_reason: why,
          ai_version: "v1-inline",
          source: "ai"
        })
        .eq("id", task.id)
        .select("id,title,estimate_min,impact,deadline_at,status,ai_reason,blocking,created_at")
        .single();
      if (upd.error) {
        console.error("TASKS_UPDATE_AFTER_AI_ERROR", upd.error.message);
        // returnera ändå originalet
        return res.status(200).json(task);
      }

      // 4) Returnera den BERIKADE raden (så UI slipper 30/3)
      return res.status(200).json(upd.data);
    }

    return res.status(405).json({ error: "Only GET or POST" });
  } catch (e: any) {
    console.error("TASKS_HANDLER_FATAL", e?.message);
    return res.status(500).json({ error: "internal_error" });
  }
}
