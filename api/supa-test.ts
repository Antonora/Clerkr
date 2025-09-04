import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export default async function handler(req: any, res: any) {
  try {
    // Test: räkna rader i tasks (tabellen kan vara tom; vi vill bara få "count" eller 0)
    const { count, error } = await supabase
      .from("tasks")
      .select("*", { count: "exact", head: true });

    if (error) throw error;
    res.status(200).json({ ok: true, table: "tasks", count: count ?? 0 });
  } catch (e: any) {
    console.error("SUPA_TEST_ERROR", e?.message);
    res.status(500).json({ ok: false, error: e?.message || "supa_failed" });
  }
}
