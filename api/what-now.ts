import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";

// Initiera klienter
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export default async function handler(req: any, res: any) {
  try {
    // 1) Hämta aktiva tasks
    const { data: rows, error } = await supabase
      .from("tasks")
      .select("id,title,estimate_min,impact,deadline_at,blocking,status")
      .neq("status", "done")
      .limit(50);

    if (error) {
      console.error("WHATNOW_DB_ERROR", error.message);
      return res.status(500).json({ error: error.message });
    }

    // 2) Hämta prefs (för tid på dygnet/veckan)
    const { data: prefs } = await supabase
      .from("user_prefs")
      .select("*")
      .limit(1)
      .single();

    // 3) Räkna ut fas
    const now = new Date();
    const dow = now.getDay(); // 0=sön
    const hour = now.getHours();
    const isWeekend = dow === 0 || dow === 6;

    let phase: "morning" | "afternoon" | "evening" = "morning";
    if (hour >= 12 && hour < 17) phase = "afternoon";
    else if (hour >= 17 || hour < 6) phase = "evening";

    const timeGuidance = `Tidsguidning:
- Morgon: ${(prefs?.morning_focus || []).join(", ") || "deep_work"}
- Eftermiddag: ${(prefs?.afternoon_focus || []).join(", ") || "meetings, admin"}
- Kväll: ${(prefs?.evening_focus || []).join(", ") || "home, creative_light"}
- Helg: ${(prefs?.weekend_focus || []).join(", ") || "home, planning"}
Nu är det ${isWeekend ? "helg" : "vardag"} och fas="${phase}".`;

    // 4) Kortlista (skicka inte hundratals tasks till GPT)
    const shortlist = (rows || []).slice(0, 20);

    // 5) Prompt
    const system = `Du är Clerkr, exekutiv sekreterare. Rakt på sak.
Prioritera i denna ordning:
1) Hårda deadlines <48h
2) Pengar in / kundrelationer
3) Blocking som låser upp annat
4) Passform för tid på dygnet/veckodag enligt guidning
Om en task inte passar nu (t.ex. hem på arbetstid) → föreslå "defer" i next_step.
Svara strikt JSON utan extra text.

${timeGuidance}`;

    const userMsg = `Backlog (kandidater): ${JSON.stringify(shortlist)}
Returnera:
{
  "primary_task": {"task_id":"...","title":"...","duration_min":30,"why":"..."},
  "alternatives": [{"task_id":"...","title":"...","duration_min":15}],
  "next_step": {"action":"start|split|clarify|defer","details":"..."}
}`;

    // 6) Anropa GPT
    const ai = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.2,
      max_tokens: 350,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: userMsg }
      ]
    });

    const json = ai.choices?.[0]?.message?.content ?? "{}";
    return res.status(200).json(JSON.parse(json));
  } catch (e: any) {
    console.error("WHATNOW_FATAL", e?.message);
    return res
      .status(500)
      .json({ error: "FUNCTION_INVOCATION_FAILED", details: e?.message });
  }
}