/**
 * export-cmd.ts — `token-tracker export`
 * Pipes CSV to stdout. Pipe to a file: token-tracker export > usage.csv
 */

import { getDb } from "../db/database.js";

type Period = "today" | "week" | "month" | "all";

export async function runExport(period: Period = "all") {
  const db = getDb();
  const since =
    period === "today" ? "AND created_at >= unixepoch('now','start of day')"
    : period === "week"  ? "AND created_at >= unixepoch('now','-6 days')"
    : period === "month" ? "AND created_at >= unixepoch('now','start of month')"
    : "";

  const rows = db.prepare(`
    SELECT
      datetime(created_at, 'unixepoch') AS date,
      session_id, model, provider,
      input_tokens, output_tokens,
      cache_read_tokens, cache_write_tokens,
      cost_usd, task_type, project, notes
    FROM usage_events
    WHERE 1=1 ${since}
    ORDER BY created_at DESC
  `).all() as any[];

  const header = "date,session_id,model,provider,input_tokens,output_tokens,cache_read_tokens,cache_write_tokens,cost_usd,task_type,project,notes";
  const esc = (v: any) => `"${String(v ?? "").replace(/"/g, '""')}"`;

  console.log(header);
  for (const r of rows) {
    console.log(Object.values(r).map(esc).join(","));
  }

  process.stderr.write(`\n  Exported ${rows.length} rows\n\n`);
}
