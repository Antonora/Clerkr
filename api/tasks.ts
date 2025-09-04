import { createClient } from "@supabase/supabase-js";
const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

export default async function handler(req: any, res: any) {
  if (req.method === "GET") {
    const { data, error } = await supabase
      .from("tasks")
      .select("id,title,estimate_min,impact,deadline_at,status,ai_reason,blocking,created_at")
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ items: data });
  }

  if (req.method === "POST") {
    const { title, notes = null } = req.body || {};
    if (!title) return res.status(400).json({ error: "title required" });

    // Spara BARA title/notes – låt AI sätta resten
    const { data, error } = await supabase
      .from("tasks")
      .insert([{ title, notes }])
      .select("id,title,status")
      .single();
    if (error) return res.status(500).json({ error: error.message });

    // Fire-and-forget: trigga AI-klassning
    fetch(`${process.env.VERCEL_URL ? 'https://' + process.env.VERCEL_URL : ''}/api/classify-task`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ task_id: data.id })
    }).catch(()=>{});

    return res.status(200).json(data);
  }

  return res.status(405).json({ error: "Only GET or POST" });
}
