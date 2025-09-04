import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

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
      // vi tar nu bara emot title + notes (AI fyller resten)
      const { title, notes = null } = req.body || {};
      if (!title) return res.status(400).json({ error: "title required" });

      // sätt status = 'todo' direkt vid insert
      const { data, error } = await supabase
        .from("tasks")
        .insert([{ title, notes, status: "todo" }])
        .select("id,title,status,created_at")
        .single();

      if (error) {
        console.error("TASKS_POST_ERROR", error.message);
        return res.status(500).json({ error: error.message });
      }

      // fire-and-forget AI-klassning (behöver inte vänta)
      try {
        const base =
          process.env.VERCEL_URL && !process.env.VERCEL_URL.startsWith("http")
            ? `https://${process.env.VERCEL_URL}`
            : (process.env.VERCEL_URL || "");
        if (base) {
          fetch(`${base}/api/classify-task`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ task_id: data.id }),
          }).catch(() => {});
        }
      } catch {}

      return res.status(200).json(data);
    }

    return res.status(405).json({ error: "Only GET or POST" });
  } catch (e: any) {
    console.error("TASKS_HANDLER_FATAL", e?.message);
    return res.status(500).json({ error: "internal_error" });
  }
}
