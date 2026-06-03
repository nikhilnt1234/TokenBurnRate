/**
 * stats.ts
 * Pulls structured UsageStats from SQLite for the hints engine.
 */

import { getDb } from "../db/database.js";
import type { UsageStats, SessionStat, ModelStat, TaskStat } from "./hints.js";

type Period = "today" | "week" | "month" | "all";

function sinceSql(period: Period): string {
  return period === "today" ? "AND created_at >= unixepoch('now','start of day')"
    :    period === "week"  ? "AND created_at >= unixepoch('now','-6 days')"
    :    period === "month" ? "AND created_at >= unixepoch('now','start of month')"
    : "";
}

export function buildStats(period: Period): UsageStats {
  const db  = getDb();
  const sw  = sinceSql(period);

  // ── overview row ──────────────────────────────────────────────────────────
  const ov = db.prepare(`
    SELECT
      COUNT(*)                    AS calls,
      COALESCE(SUM(input_tokens),0)        AS totalIn,
      COALESCE(SUM(output_tokens),0)       AS totalOut,
      COALESCE(SUM(cache_read_tokens),0)   AS cacheRead,
      COALESCE(SUM(cache_write_tokens),0)  AS cacheWrite,
      COALESCE(SUM(cost_usd),0)            AS totalCost,
      COALESCE(AVG(input_tokens+output_tokens),0) AS avgTokens,
      COALESCE(AVG(cost_usd),0)            AS avgCost
    FROM usage_events WHERE 1=1 ${sw}
  `).get() as any;

  const totalTokens  = ov.totalIn + ov.cacheRead;
  const cacheHitPct  = totalTokens > 0
    ? (ov.cacheRead / totalTokens) * 100
    : 0;
  const outputToInputRatio = ov.totalIn > 0
    ? ov.totalOut / ov.totalIn
    : 0;

  // ── by session ────────────────────────────────────────────────────────────
  const sessions: SessionStat[] = (db.prepare(`
    SELECT
      session_id AS id,
      model,
      COUNT(*)                           AS calls,
      SUM(input_tokens + output_tokens)  AS tokens,
      SUM(cost_usd)                      AS cost
    FROM usage_events WHERE 1=1 ${sw}
    GROUP BY session_id
    ORDER BY cost DESC
    LIMIT 50
  `).all() as any[]).map(r => ({
    id: r.id, model: r.model,
    calls: r.calls, tokens: r.tokens, cost: r.cost,
  }));

  // ── by model ──────────────────────────────────────────────────────────────
  const byModel: ModelStat[] = (db.prepare(`
    SELECT
      model,
      COUNT(*)                           AS calls,
      SUM(input_tokens + output_tokens)  AS tokens,
      SUM(cost_usd)                      AS cost
    FROM usage_events WHERE 1=1 ${sw}
    GROUP BY model
    ORDER BY cost DESC
  `).all() as any[]).map(r => ({
    model: r.model, calls: r.calls, tokens: r.tokens, cost: r.cost,
  }));

  // ── by task + model ───────────────────────────────────────────────────────
  const byTask: TaskStat[] = (db.prepare(`
    SELECT
      COALESCE(task_type, 'unknown') AS taskType,
      model,
      COUNT(*)      AS calls,
      SUM(cost_usd) AS cost
    FROM usage_events WHERE 1=1 ${sw}
    GROUP BY task_type, model
    ORDER BY cost DESC
  `).all() as any[]).map(r => ({
    taskType: r.taskType, model: r.model, calls: r.calls, cost: r.cost,
  }));

  return {
    period,
    totalCost:           ov.totalCost,
    totalInputTokens:    ov.totalIn,
    totalOutputTokens:   ov.totalOut,
    totalCacheReadTokens:  ov.cacheRead,
    totalCacheWriteTokens: ov.cacheWrite,
    totalCalls:          ov.calls,
    avgTokensPerCall:    ov.avgTokens,
    avgCostPerCall:      ov.avgCost,
    outputToInputRatio,
    cacheHitPct,
    sessions,
    byModel,
    byTask,
  };
}
