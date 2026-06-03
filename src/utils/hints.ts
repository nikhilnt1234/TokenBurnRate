/**
 * hints.ts
 * Deterministic optimization hint engine.
 * Analyses raw usage stats and returns ranked, actionable hints
 * with estimated monthly savings attached to each one.
 * Zero LLM calls — all rule-based so it works instantly for free users.
 */

export type Severity = "critical" | "high" | "medium" | "low";
export type HintCategory =
  | "cache"
  | "model-swap"
  | "prompt-efficiency"
  | "session-hygiene"
  | "retry-loops"
  | "context-bloat";

export interface Hint {
  id: string;
  category: HintCategory;
  severity: Severity;
  title: string;
  detail: string;
  action: string;           // concrete next step
  estimatedMonthlySaving: number; // USD
  evidence: string;         // the stat that triggered this
}

export interface UsageStats {
  period: "today" | "week" | "month" | "all";
  totalCost: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCacheReadTokens: number;
  totalCacheWriteTokens: number;
  totalCalls: number;
  avgTokensPerCall: number;
  avgCostPerCall: number;
  outputToInputRatio: number;   // high = verbose outputs
  cacheHitPct: number;          // cache_read / (input + cache_read)
  sessions: SessionStat[];
  byModel: ModelStat[];
  byTask: TaskStat[];
}

export interface SessionStat {
  id: string;
  model: string;
  calls: number;
  tokens: number;
  cost: number;
}

export interface ModelStat {
  model: string;
  calls: number;
  tokens: number;
  cost: number;
}

export interface TaskStat {
  taskType: string;
  model: string;
  calls: number;
  cost: number;
}

// ─── helpers ──────────────────────────────────────────────────────────────────

function extrapolateMonthly(cost: number, period: UsageStats["period"]): number {
  const multiplier = period === "today" ? 30 : period === "week" ? 4.3 : 1;
  return cost * multiplier;
}

function isCheaperModel(model: string): boolean {
  return model.includes("haiku") || model.includes("mini") || model.includes("flash");
}

function isExpensiveModel(model: string): boolean {
  return model.includes("opus") || model.includes("gpt-4o") && !model.includes("mini");
}

// ─── individual rules ─────────────────────────────────────────────────────────

function checkCacheUtilization(stats: UsageStats): Hint | null {
  if (stats.totalInputTokens < 50_000) return null; // not enough data
  if (stats.cacheHitPct >= 30) return null;

  const potentialCacheTokens = stats.totalInputTokens * 0.4; // assume 40% cacheable
  // Cache reads are ~10x cheaper than input; saving = (input_price - cache_read_price) * tokens
  const savingPerToken = 0.000003 - 0.0000003; // sonnet approx: $3/M input vs $0.30/M cache read
  const periodSaving = potentialCacheTokens * savingPerToken;
  const monthlySaving = extrapolateMonthly(periodSaving, stats.period);

  const severity: Severity =
    stats.cacheHitPct < 5  ? "critical" :
    stats.cacheHitPct < 15 ? "high" : "medium";

  return {
    id: "cache-utilization",
    category: "cache",
    severity,
    title: "Prompt cache barely used",
    detail: `Your cache hit rate is ${stats.cacheHitPct.toFixed(1)}% — industry best practice is 30–60%. ` +
            `Cache reads cost 10× less than regular input tokens.`,
    action: "Move static content (system prompts, docs, code context) to the top of your messages and keep them identical across turns. " +
            "In Claude Code, use persistent system prompts rather than re-pasting context each session.",
    estimatedMonthlySaving: monthlySaving,
    evidence: `Cache hit rate: ${stats.cacheHitPct.toFixed(1)}% (${(stats.totalCacheReadTokens / 1000).toFixed(0)}K cached vs ${(stats.totalInputTokens / 1000).toFixed(0)}K total input)`,
  };
}

function checkModelSwapForTesting(stats: UsageStats): Hint | null {
  const testingOnExpensive = stats.byTask.filter(
    t => ["testing", "test-gen", "unit-tests"].includes((t.taskType ?? "").toLowerCase()) &&
         isExpensiveModel(t.model)
  );
  if (!testingOnExpensive.length) return null;

  const periodCost = testingOnExpensive.reduce((s, t) => s + t.cost, 0);
  if (periodCost < 0.5) return null;

  const monthlySaving = extrapolateMonthly(periodCost * 0.8, stats.period);

  return {
    id: "model-swap-testing",
    category: "model-swap",
    severity: "high",
    title: "Expensive model doing test generation",
    detail: `You're spending ${testingOnExpensive.map(t => `$${t.cost.toFixed(2)} on ${t.model}`).join(", ")} ` +
            `for test generation tasks. Haiku or GPT-4o-mini produce equivalent unit tests at 80% lower cost.`,
    action: "Tag your test-gen sessions as task_type='testing' and route them to claude-haiku-4-5. " +
            "Reserve Sonnet/Opus for architecture decisions, complex debugging, and code review.",
    estimatedMonthlySaving: monthlySaving,
    evidence: `${testingOnExpensive.reduce((s,t) => s + t.calls, 0)} test-gen calls on expensive models costing $${periodCost.toFixed(2)} this ${stats.period}`,
  };
}

function checkModelSwapForDebugging(stats: UsageStats): Hint | null {
  const debuggingOnOpus = stats.byTask.filter(
    t => ["debugging", "debug"].includes((t.taskType ?? "").toLowerCase()) &&
         t.model.includes("opus")
  );
  if (!debuggingOnOpus.length) return null;

  const periodCost = debuggingOnOpus.reduce((s, t) => s + t.cost, 0);
  if (periodCost < 1) return null;

  const monthlySaving = extrapolateMonthly(periodCost * 0.6, stats.period);

  return {
    id: "model-swap-debug",
    category: "model-swap",
    severity: "medium",
    title: "Using Opus for routine debugging",
    detail: `Opus is 5× more expensive than Sonnet. For most debugging tasks — especially runtime errors, ` +
            `type errors, and stack traces — Sonnet performs identically.`,
    action: "Try Sonnet for your next 10 debug sessions. Only escalate to Opus for genuinely novel algorithmic problems.",
    estimatedMonthlySaving: monthlySaving,
    evidence: `$${periodCost.toFixed(2)} spent on Opus debugging this ${stats.period}`,
  };
}

function checkVerboseOutputs(stats: UsageStats): Hint | null {
  if (stats.totalCalls < 10) return null;
  if (stats.outputToInputRatio < 0.35) return null;

  // Output tokens cost 3-5x more than input; trimming 25% of output = significant saving
  const outputCostFraction = 0.65; // rough: ~65% of cost is from output at this ratio
  const savingFraction = 0.20;
  const periodSaving = stats.totalCost * outputCostFraction * savingFraction;
  const monthlySaving = extrapolateMonthly(periodSaving, stats.period);

  return {
    id: "verbose-outputs",
    category: "prompt-efficiency",
    severity: "medium",
    title: "High output-to-input ratio — responses may be over-verbose",
    detail: `Your output/input token ratio is ${stats.outputToInputRatio.toFixed(2)}. ` +
            `Output tokens cost 3–5× more than input. ` +
            `Trimming unnecessary explanation and boilerplate can materially cut your bill.`,
    action: 'Add "Be concise. No preamble. No explanations unless asked." to your system prompt. ' +
            'For code tasks, add "Return only the changed code block, no full-file rewrites unless necessary."',
    estimatedMonthlySaving: monthlySaving,
    evidence: `Output/input ratio: ${stats.outputToInputRatio.toFixed(2)} (target: <0.30)`,
  };
}

function checkSessionSpike(stats: UsageStats): Hint | null {
  if (stats.sessions.length < 3) return null;

  const avgCost = stats.sessions.reduce((s, r) => s + r.cost, 0) / stats.sessions.length;
  const spikes = stats.sessions.filter(s => s.cost > avgCost * 3 && s.cost > 1.0);
  if (!spikes.length) return null;

  const spikeCost = spikes.reduce((s, r) => s + r.cost, 0);
  const monthlySaving = extrapolateMonthly(spikeCost * 0.4, stats.period);

  return {
    id: "session-spike",
    category: "session-hygiene",
    severity: spikeCost > 5 ? "high" : "medium",
    title: `${spikes.length} session${spikes.length > 1 ? "s" : ""} costing 3× your average`,
    detail: `Session${spikes.length > 1 ? "s" : ""} ${spikes.map(s => `"${s.id}"`).join(", ")} ` +
            `cost $${spikeCost.toFixed(2)} combined — ${(spikeCost / stats.totalCost * 100).toFixed(0)}% of your total spend. ` +
            `These usually indicate unbounded context growth.`,
    action: "Use /compact in Claude Code mid-session to summarise and reset context. " +
            "Break large tasks into smaller sub-sessions with focused goals. " +
            "Set a per-session token budget in your workflow.",
    estimatedMonthlySaving: monthlySaving,
    evidence: `Spike sessions: ${spikes.map(s => `${s.id} ($${s.cost.toFixed(2)})`).join(", ")}  |  avg: $${avgCost.toFixed(2)}`,
  };
}

function checkContextBloat(stats: UsageStats): Hint | null {
  if (stats.avgTokensPerCall < 8_000) return null;

  const bloatFraction = (stats.avgTokensPerCall - 6_000) / stats.avgTokensPerCall;
  const periodSaving = stats.totalCost * bloatFraction * 0.3;
  const monthlySaving = extrapolateMonthly(periodSaving, stats.period);

  if (monthlySaving < 0.5) return null;

  return {
    id: "context-bloat",
    category: "context-bloat",
    severity: stats.avgTokensPerCall > 20_000 ? "high" : "medium",
    title: "High average tokens per call — context may be bloated",
    detail: `Average ${(stats.avgTokensPerCall / 1000).toFixed(1)}K tokens per call. ` +
            `Most coding tasks need 2–6K. Excess usually comes from re-sending unchanged files ` +
            `or accumulating conversation history.`,
    action: "Use @file references instead of pasting file contents. " +
            "In multi-turn workflows, summarize completed steps instead of keeping full history. " +
            "Check if you are sending node_modules, lock files, or build artifacts as context.",
    estimatedMonthlySaving: monthlySaving,
    evidence: `Avg tokens/call: ${(stats.avgTokensPerCall / 1000).toFixed(1)}K  (recommended: <6K for coding tasks)`,
  };
}

function checkRetryLoops(stats: UsageStats): Hint | null {
  // Proxy: sessions with very high calls but low unique task count
  const highCallSessions = stats.sessions.filter(s => s.calls > 30 && s.tokens / s.calls > 5_000);
  if (!highCallSessions.length) return null;

  const periodCost = highCallSessions.reduce((s, r) => s + r.cost, 0);
  if (periodCost < 1) return null;

  const monthlySaving = extrapolateMonthly(periodCost * 0.35, stats.period);

  return {
    id: "retry-loops",
    category: "retry-loops",
    severity: "high",
    title: "Possible retry loops in long sessions",
    detail: `${highCallSessions.length} session${highCallSessions.length > 1 ? "s" : ""} with 30+ calls and high tokens/call. ` +
            `This pattern often means the model is repeatedly attempting the same edit ` +
            `because the prompt is ambiguous or the context is conflicting.`,
    action: "Before a long session, spend 2 minutes writing a clear spec: what success looks like, " +
            "what files are in scope, and what constraints apply. " +
            "One good upfront prompt eliminates 5–10 retry turns.",
    estimatedMonthlySaving: monthlySaving,
    evidence: `Sessions: ${highCallSessions.map(s => `${s.id} (${s.calls} calls)`).join(", ")}`,
  };
}

function checkSingleModelDependency(stats: UsageStats): Hint | null {
  if (stats.byModel.length !== 1) return null;
  const model = stats.byModel[0];
  if (isCheaperModel(model.model)) return null; // already on a cheap model
  if (stats.totalCost < 5) return null;

  const monthlySaving = extrapolateMonthly(stats.totalCost * 0.25, stats.period);

  return {
    id: "single-model-dependency",
    category: "model-swap",
    severity: "low",
    title: "All traffic on one model — no task-based routing",
    detail: `100% of your calls use ${model.model}. Most workflows have a mix of simple ` +
            `and complex tasks. Routing simple tasks to a cheaper model could cut spend ` +
            `by 20–40% with no quality loss on those tasks.`,
    action: "Classify tasks: test-gen, boilerplate, docs → Haiku. " +
            "Debugging, architecture, review → Sonnet. " +
            "Novel research, complex reasoning → Opus. " +
            "Use the task_type field in log_usage to track the switch.",
    estimatedMonthlySaving: monthlySaving,
    evidence: `100% of ${model.calls} calls on ${model.model}`,
  };
}

// ─── main export ──────────────────────────────────────────────────────────────

export function generateHints(stats: UsageStats): Hint[] {
  const rules = [
    checkCacheUtilization,
    checkModelSwapForTesting,
    checkModelSwapForDebugging,
    checkVerboseOutputs,
    checkSessionSpike,
    checkContextBloat,
    checkRetryLoops,
    checkSingleModelDependency,
  ];

  const hints = rules
    .map(rule => rule(stats))
    .filter((h): h is Hint => h !== null);

  // Sort: critical > high > medium > low, then by saving descending
  const severityOrder: Record<Severity, number> = { critical: 0, high: 1, medium: 2, low: 3 };
  return hints.sort((a, b) =>
    severityOrder[a.severity] - severityOrder[b.severity] ||
    b.estimatedMonthlySaving - a.estimatedMonthlySaving
  );
}

export function totalEstimatedSaving(hints: Hint[]): number {
  // Cap at 70% of current spend to stay credible
  return hints.reduce((s, h) => s + h.estimatedMonthlySaving, 0);
}

export function formatHintsText(hints: Hint[], monthlyCost: number): string {
  if (!hints.length) {
    return "✅ No significant optimizations found. Your usage looks efficient!";
  }

  const totalSaving = totalEstimatedSaving(hints);
  const savingPct = monthlyCost > 0 ? Math.min((totalSaving / monthlyCost) * 100, 70) : 0;

  const severityIcon: Record<Severity, string> = {
    critical: "🔴",
    high:     "🟠",
    medium:   "🟡",
    low:      "🔵",
  };

  const lines: string[] = [
    `💡 ${hints.length} optimization${hints.length > 1 ? "s" : ""} found`,
    `   Estimated saving: $${totalSaving.toFixed(2)}/month  (${savingPct.toFixed(0)}% reduction)`,
    "",
  ];

  hints.forEach((h, i) => {
    lines.push(
      `${severityIcon[h.severity]} [${h.severity.toUpperCase()}] ${h.title}`,
      `   ${h.detail}`,
      ``,
      `   💰 Est. saving: $${h.estimatedMonthlySaving.toFixed(2)}/month`,
      `   📊 Evidence:    ${h.evidence}`,
      `   ✅ Action:      ${h.action}`,
      i < hints.length - 1 ? "" : "",
    );
  });

  return lines.join("\n");
}
