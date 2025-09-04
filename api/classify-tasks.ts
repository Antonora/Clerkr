import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";

// --- Init ---
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });
const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

// --- Helpers ---
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
  const k = s.trim().toLowerCase();
  if (k === "null" || k === "none" || k === "unknown") return null;
  const d = new Date(s);
  return Number.isFinite(d.getTime()) ? d.toISOString() : null;
}

// --- Core ---
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

  // 2) System + few-shots (1A + 1B)
  const system = `Du är Clerkr – exekutiv sekreterare. Rakt på sak.
Målsättning: sätt korrekta fält för tasks utan att hitta på.

ABSOLUTA REGLER:
- Hitta inte på deadlines. Om oklart → "deadline_at": null.
- Om titeln är vag → "blocking": false och "estimate_min": 15 och motivering som ber om förtydligande.
- Prioritera pengar in/kundrelationer > admin.
- Om task låser upp andra aktiviteter → "blocking": true.
- Europe/Stockholm för eventuell tolkning av tid.
- Returnera strikt JSON. Ingen extra text.`;

  const shots = [
    {
      role: "user",
      content:
        `Titel: Skicka faktura till Label X
Notes: Förfaller imorgon 12:00
Returnera JSON.`
    },
    {
      role: "assistant",
      content:
        `{"impact":5,"estimate_min":20,"blocking":true,"deadline_at":"2025-09-05T10:00:00.000Z","why":"Pengar in och hård deadline."}`
    },
    {
      role: "user",
      content:
        `Titel: Boka lunch med Pelle
Notes: inget mer
Returnera JSON.`
    },
    {
      role: "assistant",
      content:
        `{"impact":3,"estimate_min":15,"blocking":false,"deadline_at":null,"why":"Socialt/koordinering, ingen hård deadline."}`
    },
    {
      role: "user",
      content:
        `Titel: Felsök ljudkort inför studiosession
Notes: Session ikväll
Returnera JSON.`
    },
    {
      role: "assistant",
      content:
        `{"impact":5,"estimate_min":45,"blocking":true,"deadline_at":"2025-09-04T18:00:00.000Z","why":"Blockerar kvällens session."}`
    }
  ] as const;

  const user = `Titel: ${t.title}
Notes: ${t.notes ?? ""}

Returnera JSON exakt:
{"impact":n,"estimate_min":n,"blocking":bool,"deadline_at":"ISO eller null","why":"... (<=140 tecken)"}`
    ;

  // 3) Första passet mot modellen
  let out: any = {};
  try {
    const r = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [{ role: "system", content: system }, ...shots, { role: "user", content: user }]
    });
    out = JSON.parse(r.choices?.[0]?.message?.content || "{}");
  } catch (e: any) {
    console.error("CLASSIFY_AI_ERROR", e?.message);
    out = {};
  }

  // 4) Kritiker/validering (1C)
  try {
    const criticPrompt = `Validera/normalisera JSON enligt reglerna:
- deadline_at måste vara källbelagd; annars null.
- estimate_min inom 5–240 (avrunda till närmsta 5).
- impact inom 1–5.
- blocking endast bool.
Returnera endast JSON (ingen text).`;
    const v = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: criticPrompt },
        { role: "user", content: JSON.stringify(out || {}) }
      ]
    });
    const fixed = JSON.parse(v.choices?.[0]?.message?.content || "{}");
    // slå ihop, fixed tar företräde där det finns värden
    out = Object.assign({}, out, fixed);
  } catch (e: any) {
    // om kritiker faller, fortsätt med out som det är
    console.error("CLASSIFY_CRITIC_ERROR", e?.message);
  }

  // 5) Sista normalisering innan DB
  const impact = clamp(out.impact, 1, 5, 3);
  const estimate_min = round5(out.estimate_min, 30);
  const blocking = Boolean(out.blocking ?? false);
  const deadline_at = normalizeISO(out.deadline_at);
  const why = String(out.why ?? "").slice(0, 140);

  // 6) Skriv tillbaka
  const { error: e2 } = await supabase
    .from("tasks")
    .update({
      impact,
      estimate_min,
      blocking,
      deadline_at,
      ai_reason: why,
      ai_version: "v1-fewshot-critic",
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