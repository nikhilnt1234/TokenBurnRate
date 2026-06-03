/**
 * status.ts — `token-tracker status`
 * Quick one-liner: today's spend + budget check + top hint.
 */

import { getDb } from "../db/database.js";
import { buildStats } from "../utils/stats.js";
import { generateHints } from "../utils/hints.js";
import { c, fmt, nl } from "./render.js";

export async function runStatus() {
  const db    = getDb();
  const stats = buildStats("today");

  nl();
  process.stdout.write(`  ${c.orange}${c.bold}⬡ token-tracker${c.reset}  `);

  if (stats.totalCalls === 0) {
    console.log(`${c.muted}no activity today${c.reset}`);
    nl();
    return;
  }

  // Today's cost
  process.stdout.write(`today: ${c.bold}${c.amber}${fmt.usd(stats.totalCost)}${c.reset}  `);

  // Cache hit
  const cacheColor = stats.cacheHitPct >= 30 ? c.lime : stats.cacheHitPct >= 15 ? c.gold : c.red;
  process.stdout.write(`cache: ${cacheColor}${fmt.pct(stats.cacheHitPct)}${c.reset}  `);

  // Calls
  process.stdout.write(`${fmt.num(stats.totalCalls)} calls  `);

  // Budget check
  const budgets = db.prepare("SELECT * FROM budgets").all() as any[];
  for (const b of budgets) {
    const since = b.period === "daily" ? "start of day"
      : b.period === "weekly"  ? "-6 days"
      : "start of month";
    const row = db.prepare(
      `SELECT COALESCE(SUM(cost_usd),0) as total FROM usage_events WHERE created_at >= unixepoch('now', '${since}')`
    ).get() as any;
    const pct = (row.total / b.limit_usd) * 100;
    const budgetColor = pct >= 90 ? c.red : pct >= 80 ? c.amber : c.lime;
    process.stdout.write(`budget: ${budgetColor}${pct.toFixed(0)}%${c.reset}  `);
  }

  console.log();

  // Top hint
  const hints = generateHints(stats);
  if (hints.length > 0) {
    const top = hints[0];
    console.log(`  ${c.muted}💡 ${top.title} — ${c.lime}saves ${fmt.usd2(top.estimatedMonthlySaving)}/mo${c.reset}  ${c.muted}(run: token-tracker hints)${c.reset}`);
  }

  nl();
}
