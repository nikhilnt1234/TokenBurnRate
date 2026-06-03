import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getDb } from "../db/database.js";
import { calcCost, MODEL_PRICING } from "../utils/pricing.js";
import { generateHints, formatHintsText, totalEstimatedSaving } from "../utils/hints.js";
import { buildStats } from "../utils/stats.js";

export function registerTools(server: McpServer) {

  // ── log_usage ─────────────────────────────────────────────────────────────
  server.tool(
    "log_usage",
    "Log a single LLM API call with token counts. Call this after every Claude/GPT/Gemini response.",
    {
      model:               z.string().describe("Model ID, e.g. claude-sonnet-4-6"),
      input_tokens:        z.number().int().min(0),
      output_tokens:       z.number().int().min(0),
      session_id:          z.string().optional().default("default"),
      provider:            z.string().optional().default("anthropic"),
      cache_read_tokens:   z.number().int().min(0).optional().default(0),
      cache_write_tokens:  z.number().int().min(0).optional().default(0),
      task_type:           z.string().optional().describe("e.g. coding, debugging, writing"),
      project:             z.string().optional(),
      notes:               z.string().optional(),
    },
    async (args) => {
      const cost = calcCost({
        model: args.model,
        inputTokens: args.input_tokens,
        outputTokens: args.output_tokens,
        cacheReadTokens: args.cache_read_tokens,
        cacheWriteTokens: args.cache_write_tokens,
      });

      const db = getDb();
      const stmt = db.prepare(`
        INSERT INTO usage_events
          (session_id, model, provider, input_tokens, output_tokens,
           cache_read_tokens, cache_write_tokens, cost_usd, task_type, project, notes)
        VALUES (?,?,?,?,?,?,?,?,?,?,?)
      `);
      const info = stmt.run(
        args.session_id, args.model, args.provider,
        args.input_tokens, args.output_tokens,
        args.cache_read_tokens ?? 0, args.cache_write_tokens ?? 0,
        cost, args.task_type ?? null, args.project ?? null, args.notes ?? null,
      );

      // Budget check
      const budgets = db.prepare("SELECT * FROM budgets").all() as any[];
      const alerts: string[] = [];
      for (const b of budgets) {
        const since = b.period === "daily"
          ? "unixepoch('now','start of day')"
          : b.period === "weekly"
          ? "unixepoch('now','-6 days')"
          : "unixepoch('now','start of month')";
        const row = db.prepare(
          `SELECT COALESCE(SUM(cost_usd),0) as total FROM usage_events WHERE created_at >= ${since}`
        ).get() as any;
        const pct = (row.total / b.limit_usd) * 100;
        if (pct >= b.alert_pct) {
          alerts.push(`⚠️ Budget "${b.label}": $${row.total.toFixed(4)} / $${b.limit_usd} (${pct.toFixed(1)}%)`);
        }
      }

      return {
        content: [{
          type: "text",
          text: [
            `✅ Logged — id: ${info.lastInsertRowid}`,
            `   tokens: ${args.input_tokens} in / ${args.output_tokens} out`,
            `   cost: $${cost.toFixed(6)}`,
            ...alerts,
          ].join("\n"),
        }],
      };
    }
  );

  // ── get_summary ───────────────────────────────────────────────────────────
  server.tool(
    "get_summary",
    "Get token usage and cost summary for a time period.",
    {
      period: z.enum(["today","week","month","all"]).optional().default("week"),
      project: z.string().optional(),
      model:   z.string().optional(),
    },
    async ({ period, project, model }) => {
      const db = getDb();
      const sinceSql =
        period === "today" ? "AND created_at >= unixepoch('now','start of day')"
        : period === "week"  ? "AND created_at >= unixepoch('now','-6 days')"
        : period === "month" ? "AND created_at >= unixepoch('now','start of month')"
        : "";

      const projectFilter = project ? `AND project = '${project.replace(/'/g,"''")}' ` : "";
      const modelFilter   = model   ? `AND model   = '${model.replace(/'/g,"''")}' ` : "";

      const row = db.prepare(`
        SELECT
          COUNT(*)               as calls,
          SUM(input_tokens)      as total_in,
          SUM(output_tokens)     as total_out,
          SUM(cost_usd)          as total_cost,
          SUM(cache_read_tokens) as cache_hits
        FROM usage_events
        WHERE 1=1 ${sinceSql} ${projectFilter} ${modelFilter}
      `).get() as any;

      const byModel = db.prepare(`
        SELECT model, COUNT(*) as calls, SUM(input_tokens+output_tokens) as tokens, SUM(cost_usd) as cost
        FROM usage_events WHERE 1=1 ${sinceSql} ${projectFilter}
        GROUP BY model ORDER BY cost DESC LIMIT 10
      `).all() as any[];

      const lines = [
        `📊 Token Summary — ${period.toUpperCase()}`,
        `   API calls:    ${row.calls ?? 0}`,
        `   Input tokens: ${(row.total_in ?? 0).toLocaleString()}`,
        `   Output tokens:${(row.total_out ?? 0).toLocaleString()}`,
        `   Cache hits:   ${(row.cache_hits ?? 0).toLocaleString()}`,
        `   Total cost:   $${(row.total_cost ?? 0).toFixed(4)}`,
        "",
        "📈 By Model:",
        ...byModel.map(m =>
          `   ${m.model.padEnd(24)} ${String(m.calls).padStart(4)} calls  ${String(m.tokens).padStart(8)} tokens  $${m.cost.toFixed(4)}`
        ),
      ];

      return { content: [{ type: "text", text: lines.join("\n") }] };
    }
  );

  // ── set_budget ────────────────────────────────────────────────────────────
  server.tool(
    "set_budget",
    "Set a spending budget with alert threshold.",
    {
      label:     z.string().describe("Name for this budget, e.g. 'dev-work'"),
      period:    z.enum(["daily","weekly","monthly"]),
      limit_usd: z.number().positive().describe("USD limit for the period"),
      alert_pct: z.number().min(1).max(100).optional().default(80),
    },
    async ({ label, period, limit_usd, alert_pct }) => {
      const db = getDb();
      db.prepare(`
        INSERT INTO budgets (label, period, limit_usd, alert_pct)
        VALUES (?,?,?,?)
      `).run(label, period, limit_usd, alert_pct ?? 80);
      return { content: [{ type: "text", text: `✅ Budget "${label}" set: $${limit_usd}/${period} (alert at ${alert_pct}%)` }] };
    }
  );

  // ── list_sessions ─────────────────────────────────────────────────────────
  server.tool(
    "list_sessions",
    "List recent sessions with their cost and token totals.",
    { limit: z.number().int().min(1).max(50).optional().default(10) },
    async ({ limit }) => {
      const db = getDb();
      const rows = db.prepare(`
        SELECT session_id, model, COUNT(*) as calls,
               SUM(input_tokens+output_tokens) as tokens, SUM(cost_usd) as cost,
               datetime(MAX(created_at), 'unixepoch') as last_seen
        FROM usage_events
        GROUP BY session_id
        ORDER BY MAX(created_at) DESC
        LIMIT ?
      `).all(limit) as any[];

      if (!rows.length) return { content: [{ type: "text", text: "No sessions logged yet." }] };

      const lines = [
        "🗂  Recent Sessions:",
        ...rows.map(r =>
          `  ${r.session_id.padEnd(20)} ${r.calls} calls  ${String(r.tokens).padStart(8)} tokens  $${r.cost.toFixed(4)}  (${r.last_seen})`
        ),
      ];
      return { content: [{ type: "text", text: lines.join("\n") }] };
    }
  );

  // ── list_models ───────────────────────────────────────────────────────────
  server.tool(
    "list_models",
    "Show known models with their pricing per 1M tokens.",
    {},
    async () => {
      const lines = [
        "💰 Model Pricing (per 1M tokens):",
        ...Object.entries(MODEL_PRICING).map(([m, p]) =>
          `  ${m.padEnd(26)} in: $${p.input.toFixed(2).padStart(6)}  out: $${p.output.toFixed(2).padStart(6)}`
        ),
      ];
      return { content: [{ type: "text", text: lines.join("\n") }] };
    }
  );

  // ── export_csv ────────────────────────────────────────────────────────────
  server.tool(
    "export_csv",
    "Export usage data as CSV text.",
    { period: z.enum(["today","week","month","all"]).optional().default("all") },
    async ({ period }) => {
      const db = getDb();
      const since =
        period === "today" ? "AND created_at >= unixepoch('now','start of day')"
        : period === "week"  ? "AND created_at >= unixepoch('now','-6 days')"
        : period === "month" ? "AND created_at >= unixepoch('now','start of month')"
        : "";
      const rows = db.prepare(
        `SELECT datetime(created_at,'unixepoch') as date, session_id, model, provider,
                input_tokens, output_tokens, cache_read_tokens, cost_usd, task_type, project, notes
         FROM usage_events WHERE 1=1 ${since} ORDER BY created_at DESC`
      ).all() as any[];

      const header = "date,session_id,model,provider,input_tokens,output_tokens,cache_read_tokens,cost_usd,task_type,project,notes";
      const csv = [header, ...rows.map(r => Object.values(r).map(v => `"${v ?? ""}"`).join(","))].join("\n");
      return { content: [{ type: "text", text: csv }] };
    }
  );

  // ── get_hints ─────────────────────────────────────────────────────────────
  server.tool(
    "get_hints",
    "Analyse your token usage and return ranked optimisation hints with estimated monthly savings. " +
    "Call this any time you want actionable advice on reducing your AI spend.",
    {
      period: z.enum(["today", "week", "month", "all"]).optional().default("week"),
      min_saving: z.number().optional().default(0)
        .describe("Only return hints with estimated monthly saving above this USD threshold"),
    },
    async ({ period, min_saving }) => {
      const stats = buildStats(period as any);

      if (stats.totalCalls === 0) {
        return {
          content: [{
            type: "text",
            text: "No usage data found for this period. Log some API calls first with log_usage.",
          }],
        };
      }

      const allHints  = generateHints(stats);
      const hints     = allHints.filter(h => h.estimatedMonthlySaving >= (min_saving ?? 0));
      const totalSave = totalEstimatedSaving(hints);

      // Extrapolate current spend to monthly for context
      const monthlyMultiplier =
        period === "today" ? 30 : period === "week" ? 4.3 : 1;
      const estMonthlyCost = stats.totalCost * monthlyMultiplier;

      const header = [
        `📊 Analysed ${stats.totalCalls} calls  |  $${stats.totalCost.toFixed(2)} this ${period}  |  ~$${estMonthlyCost.toFixed(2)}/month`,
        "",
      ].join("\n");

      return {
        content: [{
          type: "text",
          text: header + formatHintsText(hints, estMonthlyCost),
        }],
      };
    }
  );

  // ── get_hint_detail ───────────────────────────────────────────────────────
  server.tool(
    "get_hint_detail",
    "Get a deep-dive on a specific optimisation hint by its ID.",
    {
      hint_id: z.string().describe("Hint ID from get_hints, e.g. 'cache-utilization'"),
      period:  z.enum(["today", "week", "month", "all"]).optional().default("week"),
    },
    async ({ hint_id, period }) => {
      const stats = buildStats(period as any);
      const hints = generateHints(stats);
      const hint  = hints.find(h => h.id === hint_id);

      if (!hint) {
        const available = hints.map(h => h.id).join(", ") || "none";
        return {
          content: [{
            type: "text",
            text: `Hint "${hint_id}" not found for this period.\nAvailable hints: ${available}`,
          }],
        };
      }

      const lines = [
        `🔍 Deep Dive: ${hint.title}`,
        `${"─".repeat(50)}`,
        `Category:  ${hint.category}`,
        `Severity:  ${hint.severity.toUpperCase()}`,
        ``,
        `📊 Evidence`,
        `   ${hint.evidence}`,
        ``,
        `📖 Why this matters`,
        `   ${hint.detail}`,
        ``,
        `✅ Recommended action`,
        `   ${hint.action}`,
        ``,
        `💰 Estimated monthly saving: $${hint.estimatedMonthlySaving.toFixed(2)}`,
        ``,
        `💡 Quick wins for this category:`,
        ...quickWins(hint.category),
      ];

      return { content: [{ type: "text", text: lines.join("\n") }] };
    }
  );
}

function quickWins(category: string): string[] {
  const tips: Record<string, string[]> = {
    cache: [
      "  • Keep your system prompt identical across sessions — even one character change busts the cache",
      "  • Put all static context (docs, schemas, code) at the top of the first user message",
      "  • Use Claude Code's --system-prompt flag to pin a persistent prompt",
    ],
    "model-swap": [
      "  • Haiku for: tests, boilerplate, format conversion, simple Q&A",
      "  • Sonnet for: debugging, feature dev, code review, complex prompts",
      "  • Opus for: architecture decisions, novel research, multi-step reasoning",
    ],
    "prompt-efficiency": [
      '  • Start every system prompt with "Be concise. No preamble."',
      "  • Ask for diffs, not full file rewrites",
      "  • Specify output format explicitly: JSON, bullet list, single function",
    ],
    "session-hygiene": [
      "  • Use /compact in Claude Code when context exceeds 50K tokens",
      "  • Break tasks > 2 hours into separate sessions with a summary handoff",
      "  • Delete test/scratch sessions — long idle context still costs",
    ],
    "retry-loops": [
      "  • Write a 3-sentence spec before starting any session",
      "  • If stuck after 3 retries, step back and rephrase the goal",
      "  • Use /clear to reset context and try a fresh approach",
    ],
    "context-bloat": [
      "  • Use @filename instead of pasting file contents",
      "  • Exclude lock files, build artefacts, and test fixtures from context",
      "  • Summarise completed sub-tasks before continuing",
    ],
  };

  return tips[category] ?? ["  • No additional tips for this category yet."];
}
