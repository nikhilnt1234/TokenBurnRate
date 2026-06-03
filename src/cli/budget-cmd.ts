/**
 * budget-cmd.ts — `token-tracker budget`
 */

import { getDb } from "../db/database.js";
import { c, fmt, hr, header, nl } from "./render.js";

export async function runBudget() {
  const db      = getDb();
  const budgets = db.prepare("SELECT * FROM budgets ORDER BY created_at DESC").all() as any[];

  nl();
  console.log(`${c.orange}${c.bold}  ⬡ token-tracker${c.reset}  ${c.muted}Budget Status${c.reset}`);
  console.log(hr());
  nl();

  if (!budgets.length) {
    console.log(`  ${c.muted}No budgets set. Use the set_budget MCP tool to create one.${c.reset}`);
    nl();
    return;
  }

  for (const b of budgets) {
    const since = b.period === "daily" ? "start of day"
      : b.period === "weekly"  ? "-6 days"
      : "start of month";

    const row = db.prepare(
      `SELECT COALESCE(SUM(cost_usd),0) as total, COUNT(*) as calls FROM usage_events WHERE created_at >= unixepoch('now', '${since}')`
    ).get() as any;

    const pct       = Math.min((row.total / b.limit_usd) * 100, 100);
    const remaining = Math.max(b.limit_usd - row.total, 0);
    const barWidth  = 40;
    const filled    = Math.round((pct / 100) * barWidth);
    const barColor  = pct >= 90 ? c.red : pct >= b.alert_pct ? c.amber : c.lime;
    const bar       = barColor + "█".repeat(filled) + c.muted2 + "░".repeat(barWidth - filled) + c.reset;

    console.log(`  ${c.bold}${c.white}${b.label}${c.reset}  ${c.muted}(${b.period})${c.reset}`);
    console.log();
    console.log(`  ${bar}  ${barColor}${c.bold}${pct.toFixed(1)}%${c.reset}`);
    console.log();
    console.log(`  ${c.muted}Spent:${c.reset}     ${c.amber}${c.bold}${fmt.usd2(row.total)}${c.reset}`);
    console.log(`  ${c.muted}Remaining:${c.reset} ${c.lime}${fmt.usd2(remaining)}${c.reset}  ${c.muted}of ${fmt.usd2(b.limit_usd)} limit${c.reset}`);
    console.log(`  ${c.muted}Calls:${c.reset}     ${row.calls}`);

    if (pct >= b.alert_pct) {
      console.log();
      console.log(`  ${c.amber}⚠  Alert threshold (${b.alert_pct}%) reached.${c.reset}`);
    }
    nl();
    console.log(hr("─"));
    nl();
  }
}
