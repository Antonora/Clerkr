import { createClient } from "@supabase/supabase-js";

// Initiera Supabase-klient (server-side med service_role key)
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export default async function handler(req: any, res: any) {
  if (req.method === "GET") {
    // Hämta senaste 20 tasks
    const { data, error } = await supabase
      .from("tasks")
      .select("id,title,estimate_min,impact,deadline_at,status,ai_reason,blocking")
      .order("created_at", { ascending: false })
      .limit(20);

    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ items: data });
  }

  if (req.method === "POST") {
    const {
      title,
      estimate_min = 30,
      impact = 3,
      deadline_at = null,
      notes = null,
      blocking = false,
    } = req.body || {};

    if (!title) return res.status(400).json({ error: "title required" });

    // 1) Lägg till i databasen
    const { data, error } = await supabase
      .from("tasks")
      .insert([{ title, estimate_min, impact, deadline_at, notes, blocking }])
      .select(
        "id,title,estimate_min,impact,deadline_at,status,blocking"
      )
      .single();

    if (error) return res.status(500).json({ error: error.message });

    // 2) Starta AI-klassificering i bakgrunden
    if (data?.id) {
      fetch(
        `${
          process.env.VERCEL_URL
            ? "https://" + process.env.VERCEL_URL
            : ""
        }/api/classify-task`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ task_id: data.id }),
        }
      ).catch(() => {});
    }

    // 3) Returnera task direkt till klienten
    return res.status(200).json(data);
  }

  // Om annan HTTP-metod används
  return res.status(405).json({ error: "Only GET or POST" });
}
