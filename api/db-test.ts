import { Client } from "pg";

export default async function handler(req: any, res: any) {
  try {
    const client = new Client({ connectionString: process.env.SUPABASE_DB_URL });
    await client.connect();
    const { rows } = await client.query("select now() as now");
    await client.end();
    res.status(200).json({ ok: true, now: rows[0].now });
  } catch (e: any) {
    console.error("DB_TEST_ERROR", e?.message);
    res.status(500).json({ ok: false, error: "db_connect_failed" });
  }
}
