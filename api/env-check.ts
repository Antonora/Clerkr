export default async function handler(req: any, res: any) {
  const url = process.env.SUPABASE_DB_URL || "";
  let host = null;
  try { host = new URL(url).hostname } catch {}
  res.status(200).json({
    has_SUPABASE_DB_URL: Boolean(url),
    raw_len: url.length,
    starts_with: url.slice(0, 20),
    ends_with: url.slice(-20),
    parsed_host: host
  });
}
