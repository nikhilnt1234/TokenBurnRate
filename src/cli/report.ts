/**
 * report.ts — `token-tracker report`
 * The hero command. Renders a full terminal dashboard:
 *   Overview stats → Daily cost bars → By-model breakdown →
 *   Top sessions → Quick hints summary
 */

import { getDb } from "../db/database.js";
import { buildStats } from "../utils/stats.js";
import { generateHints, totalEstimatedSaving } from "../utils/hints.js";
import { c, fmt, hr, header, barRow, kv, tableRow, sevBadge, savingBadge, nl, pad } from "./render.js";

type Period = "today" | "week" | "month" | "all";

export async function runReport(period: Period = "week") {
  const db    = getDb();
  const stats = buildStats(period);

  const COLS  = process.stdout.columns || 88;
  const label = period === "today" ? "TODAY" : period === "week" ? "LAST 7 DAYS" : period === "month" ? "THIS MONTH" : "ALL TIME";

  // ── logo + title ────────────────────────────────────────────────────────────
  nl();
  console.log(`${c.orange}${c.bold}  ⬡ token-tracker${c.reset}  ${c.muted}MCP · Cost Report · ${label}${c.reset}`);
  console.log(hr());

  if (stats.totalCalls === 0) {
    nl();
    console.log(`  ${c.muted}No usage data for this period. Log some calls with log_usage first.${c.reset}`);
    nl();
    return;
  }

  // ── overview stats ──────────────────────────────────────────────────────────
  nl();
  console.log(header("Overview"));
  nl();

  const monthlyMultiplier = period === "today" ? 30 : period === "week" ? 4.3 : 1;
  const estMonthly        = stats.totalCost * monthlyMultiplier;

  console.log(kv("Total cost",       `${c.bold}${c.amber}${fmt.usd(stats.totalCost)}${c.reset}   ${c.muted}(~${fmt.usd2(estMonthly)}/month est.)${c.reset}`));
  console.log(kv("API calls",        `${c.white}${fmt.num(stats.totalCalls)}`));
  console.log(kv("Input tokens",     `${c.white}${fmt.tok(stats.totalInputTokens)}`));
  console.log(kv("Output tokens",    `${c.white}${fmt.tok(stats.totalOutputTokens)}`));
  console.log(kv("Cache reads",      `${c.teal}${fmt.tok(stats.totalCacheReadTokens)}${c.reset}  ${c.muted}(${fmt.pct(stats.cacheHitPct)} hit rate)${c.reset}`));
  console.log(kv("Avg cost/call",    `${c.white}${fmt.usd(stats.avgCostPerCall)}`));
  console.log(kv("Avg tokens/call",  `${c.white}${fmt.tok(stats.avgTokensPerCall)}`));

  // ── daily cost bars ─────────────────────────────────────────────────────────
  const dailyRows = db.prepare(`
    SELECT
      date(created_at, 'unixepoch', 'localtime') AS day,
      SUM(cost_usd)                               AS cost,
      SUM(input_tokens + output_tokens)           AS tokens,
      COUNT(*)                                    AS calls
    FROM usage_events
    WHERE created_at >= unixepoch('now', $since)
    GROUP BY day
    ORDER BY day ASC
  `).all({
    since: period === "today"  ? "start of day"
         : period === "week"   ? "-6 days"
         : period === "month"  ? "start of month"
         : "-3650 days",
  }) as { day: string; cost: number; tokens: number; calls: number }[];

  if (dailyRows.length > 1) {
    nl();
    console.log(hr());
    nl();
    console.log(header("Daily Cost", `${dailyRows.length} days`));
    nl();

    const maxCost = Math.max(...dailyRows.map(r => r.cost), 0.001);
    for (const row of dailyRows) {
      // Format date nicely: "Mon Jun 02"
      const d   = new Date(row.day + "T12:00:00");
      const lbl = d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "2-digit" });
      console.log(barRow(lbl, fmt.usd(row.cost), row.cost / maxCost));
    }
  }

  // ── by model ────────────────────────────────────────────────────────────────
  if (stats.byModel.length > 0) {
    nl();
    console.log(hr());
    nl();
    console.log(header("By Model"));
    nl();

    const maxCost = Math.max(...stats.byModel.map(m => m.cost), 0.001);
    for (const m of stats.byModel) {
      const pct  = ((m.cost / stats.totalCost) * 100).toFixed(0);
      const lbl  = m.model.replace("claude-","").replace("-latest","");
      console.log(barRow(lbl, `${fmt.usd(m.cost)} (${pct}%)`, m.cost / maxCost));
      console.log(`  ${c.muted}${"".padStart(22)}${fmt.num(m.calls)} calls · ${fmt.tok(m.tokens)} tokens · avg ${fmt.usd(m.cost / m.calls)}/call${c.reset}`);
    }
  }

  // ── by task type ─────────────────────────────────────────────────────────────
  if (stats.byTask.length > 0) {
    const taskTotals = new Map<string, number>();
    for (const t of stats.byTask) {
      taskTotals.set(t.taskType, (taskTotals.get(t.taskType) ?? 0) + t.cost);
    }
    const taskRows = [...taskTotals.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8);

    if (taskRows.length > 1) {
      nl();
      console.log(hr());
      nl();
      console.log(header("By Task Type"));
      nl();

      const maxCost = Math.max(...taskRows.map(r => r[1]), 0.001);
      for (const [type, cost] of taskRows) {
        console.log(barRow(type || "unknown", fmt.usd(cost), cost / maxCost));
      }
    }
  }

  // ── top sessions ─────────────────────────────────────────────────────────────
  if (stats.sessions.length > 0) {
    const avgCost    = stats.sessions.reduce((s, r) => s + r.cost, 0) / stats.sessions.length;
    const topSessions = stats.sessions.slice(0, 8);

    nl();
    console.log(hr());
    nl();
    console.log(header("Top Sessions", `${stats.sessions.length} total`));
    nl();

    // Table header
    console.log(tableRow([
      { text: "Session",  width: 22, color: c.muted },
      { text: "Model",    width: 18, color: c.muted },
      { text: "Calls",    width:  6, color: c.muted, align: "right" },
      { text: "Tokens",   width:  9, color: c.muted, align: "right" },
      { text: "Cost",     width: 10, color: c.muted, align: "right" },
    ]));
    console.log(`  ${c.muted2}${"─".repeat(COLS - 4)}${c.reset}`);

    for (const s of topSessions) {
      const isSpike = s.cost > avgCost * 2.5;
      const spikeTag = isSpike ? ` ${c.orange}▲${c.reset}` : "";
      const model    = s.model.replace("claude-","").replace("-latest","");

      console.log(tableRow([
        { text: s.id.slice(0, 21) + (s.id.length > 21 ? "…" : ""), width: 22, color: isSpike ? c.amber : c.white },
        { text: model.slice(0, 17), width: 18, color: c.muted },
        { text: String(s.calls),    width:  6, align: "right", color: c.white },
        { text: fmt.tok(s.tokens),  width:  9, align: "right", color: c.muted },
        { text: fmt.usd(s.cost),    width: 10, align: "right", color: isSpike ? c.amber : c.white },
      ]) + spikeTag);
    }

    if (stats.sessions.length > 8) {
      console.log(`  ${c.muted}  … and ${stats.sessions.length - 8} more sessions${c.reset}`);
    }
  }

  // ── hints summary ─────────────────────────────────────────────────────────────
  const hints = generateHints(stats);
  if (hints.length > 0) {
    const totalSave = totalEstimatedSaving(hints);
    nl();
    console.log(hr("─"));
    nl();
    console.log(header("💡 Optimization Hints", `${savingBadge(totalSave)}`));
    nl();

    for (const h of hints.slice(0, 5)) {
      console.log(`  ${sevBadge(h.severity)} ${c.bold}${h.title}${c.reset}`);
      console.log(`  ${c.muted}${"".padStart(8)}${h.action.slice(0, COLS - 12)}${c.reset}`);
      console.log(`  ${c.muted2}${"".padStart(8)}Evidence: ${h.evidence.slice(0, COLS - 20)}${c.reset}`);
      nl();
    }

    if (hints.length > 5) {
      console.log(`  ${c.muted}Run ${c.cyan}token-tracker hints${c.muted} to see all ${hints.length} hints.${c.reset}`);
    } else {
      console.log(`  ${c.muted}Run ${c.cyan}token-tracker hints${c.muted} for detailed fix steps.${c.reset}`);
    }
  }

  // ── footer ────────────────────────────────────────────────────────────────────
  nl();
  console.log(hr());
  console.log(`  ${c.muted}token-tracker · data stored at ~/.token-tracker/usage.db · all local, nothing shared${c.reset}`);
  nl();
}
