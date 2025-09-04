import { createClient } from "@supabase/supabase-js";
const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

export default async function handler(req: any, res: any) {
  if (req.method === "GET") {
    const { data, error } = await supabase
      .from("tasks")
      .select("id,title,estimate_min,impact,deadline_at,status")
      .order("created_at", { ascending: false })
      .limit(20);
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ items: data });
  }

  if (req.method === "POST") {
    const { title, estimate_min = 30, impact = 3, deadline_at = null, notes = null, blocking = false } = req.body || {};
    if (!title) return res.status(400).json({ error: "title required" });

    const { data, error } = await supabase
      .from("tasks")
      .insert([{ title, estimate_min, impact, deadline_at, notes, blocking }])
      .select("id,title,estimate_min,impact,deadline_at,status")
      .single();

    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json(data);
  }

  return res.status(405).json({ error: "Only GET or POST" });
}
