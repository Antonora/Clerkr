import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") return res.status(405).json({ error: "Only POST" });

  const { id } = req.body || {};
  if (!id) return res.status(400).json({ error: "task id required" });

  const { data, error } = await supabase
    .from("tasks")
    .delete()
    .eq("id", id)
    .select("id")
    .single(); // returnerar raderad id

  if (error) {
    console.error("DELETE_TASK_ERROR", error.message);
    return res.status(500).json({ error: error.message });
  }
  if (!data) return res.status(404).json({ error: "not found" });

  return res.status(200).json({ ok: true, id: data.id });
}
