import { Client } from "pg";

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") return res.status(405).end();
  const { title, estimate_min = 30, impact = 3, deadline_at = null, notes = null } = req.body || {};
  if (!title) return res.status(400).json({ error: "title required" });

  const client = new Client({ connectionString: process.env.SUPABASE_DB_URL });
  await client.connect();
  try {
    const q = `insert into tasks (title, estimate_min, impact, deadline_at, notes)
               values ($1,$2,$3,$4,$5) returning id,title,estimate_min,impact,deadline_at,status`;
    const { rows } = await client.query(q, [title, estimate_min, impact, deadline_at, notes]);
    res.status(200).json(rows[0]);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "insert failed" });
  } finally {
    await client.end();
  }
}
