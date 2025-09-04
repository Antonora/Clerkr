import { createClient } from "@supabase/supabase-js";
const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

const ALLOWED = new Set(["todo","doing","blocked","done"]);

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") return res.status(405).json({ error: "Only POST" });
  const { id, status } = req.body || {};
  if (!id) return res.status(400).json({ error: "task id required" });
  const s = (status || "done").toLowerCase();
  if (!ALLOWED.has(s)) return res.status(400).json({ error: "invalid status" });

  const { data, error } = await supabase
    .from("tasks")
    .update({ status: s })
    .eq("id", id)
    .select("id,status")
    .single();

  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.status(404).json({ error: "not found" });
  return res.status(200).json({ ok: true, task: data });
}
