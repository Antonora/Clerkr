import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

export default async function handler(req: any, res: any) {
  try {
    const backlog = [
      { id: "t1", title: "Skicka påminnelse till Electrolux om royalty", estimate_min: 30, impact: 5, deadline: "2025-09-04T17:00:00+02:00" },
      { id: "t2", title: "Bokföra 2025", estimate_min: 60, impact: 3 },
      { id: "t3", title: "Felsök Neotek-aggregat", estimate_min: 20, impact: 2 }
    ];

    const system = `Du är Clerkr, exekutiv sekreterare.
Prioritera hård deadline <48h och pengar in/kundrelationer.
Svara alltid i JSON enligt schema. Inga artigheter.`;

    const resp = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.3,
      max_tokens: 350,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        {
          role: "user",
          content:
`Backlog: ${JSON.stringify(backlog)}.
Returnera JSON:
{
  "primary_task": {"task_id":"...","title":"...","duration_min":30,"why":"..."},
  "alternatives": [{"task_id":"...","title":"...","duration_min":15}],
  "next_step": {"action":"start|defer","details":"..."}
}`
        }
      ]
    });

    const json = resp.choices[0].message?.content ?? "{}";
    res.status(200).json(JSON.parse(json));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "AI call failed" });
  }
}
