/**
 * hints-cmd.ts — `token-tracker hints` and `token-tracker hint <id>`
 */

import { buildStats } from "../utils/stats.js";
import { generateHints, totalEstimatedSaving, formatHintsText } from "../utils/hints.js";
import { c, fmt, hr, header, sevBadge, savingBadge, kv, nl, pad } from "./render.js";

type Period = "today" | "week" | "month" | "all";

const CATEGORY_TIPS: Record<string, string[]> = {
  cache: [
    "Keep system prompts byte-for-byte identical across turns — any change busts the cache",
    "Put all static docs and code context at the TOP of the first user message",
    "In Claude Code use --system-prompt flag to pin a persistent prompt across sessions",
  ],
  "model-swap": [
    "Haiku:  test-gen, boilerplate, format conversion, simple Q&A (<2K tokens)",
    "Sonnet: debugging, feature dev, code review, complex prompts",
    "Opus:   architecture decisions, novel research, multi-step reasoning only",
  ],
  "prompt-efficiency": [
    "Start every system prompt with \"Be concise. No preamble. No filler.\"",
    "Ask for diffs, not full-file rewrites: \"show only the changed function\"",
    "Specify output format explicitly: JSON / bullet list / single function",
  ],
  "session-hygiene": [
    "Run /compact in Claude Code when context exceeds 50K tokens",
    "Break tasks >2h into sub-sessions; pass a 3-sentence summary as handoff",
    "Delete scratch/test sessions — long idle context still costs on re-open",
  ],
  "retry-loops": [
    "Write a 3-sentence spec BEFORE starting: goal, scope, constraints",
    "If stuck after 3 retries, step back and rephrase the whole goal",
    "Use /clear to reset context and start fresh — beats 10 retry turns",
  ],
  "context-bloat": [
    "Use @filename instead of pasting file contents",
    "Exclude node_modules, lock files, build artefacts from context",
    "Summarise completed sub-tasks before continuing to new ones",
  ],
};

export async function runHints(period: Period = "week", hintId?: string) {
  const stats = buildStats(period);

  nl();
  console.log(`${c.orange}${c.bold}  ⬡ token-tracker${c.reset}  ${c.muted}Optimization Hints · ${period.toUpperCase()}${c.reset}`);
  console.log(hr());

  if (stats.totalCalls === 0) {
    nl();
    console.log(`  ${c.muted}No usage data for this period.${c.reset}`);
    nl();
    return;
  }

  const hints = generateHints(stats);

  if (hints.length === 0) {
    nl();
    console.log(`  ${c.lime}✓ No significant optimizations found — your usage looks efficient!${c.reset}`);
    nl();
    return;
  }

  // ── Deep-dive on a single hint ──────────────────────────────────────────────
  if (hintId) {
    const hint = hints.find(h => h.id === hintId);
    if (!hint) {
      console.log(`\n  ${c.red}Hint "${hintId}" not triggered for this period.${c.reset}`);
      console.log(`  Available: ${hints.map(h => c.cyan + h.id + c.reset).join(", ")}`);
      nl();
      return;
    }

    nl();
    console.log(header(`${hint.title}`));
    nl();
    console.log(kv("Severity",  sevBadge(hint.severity)));
    console.log(kv("Category",  `${c.muted}${hint.category}${c.reset}`));
    console.log(kv("Est. saving", `${c.lime}${c.bold}${fmt.usd2(hint.estimatedMonthlySaving)}/month${c.reset}`));
    nl();

    console.log(`  ${c.bold}${c.white}Why this matters${c.reset}`);
    console.log(`  ${c.muted}${wordWrap(hint.detail, 80)}${c.reset}`);
    nl();

    console.log(`  ${c.bold}${c.orange}Evidence${c.reset}`);
    console.log(`  ${c.amber}${hint.evidence}${c.reset}`);
    nl();

    console.log(`  ${c.bold}${c.lime}Recommended action${c.reset}`);
    console.log(`  ${c.white}${wordWrap(hint.action, 80)}${c.reset}`);
    nl();

    const tips = CATEGORY_TIPS[hint.category];
    if (tips) {
      console.log(`  ${c.bold}Quick wins — ${hint.category}${c.reset}`);
      for (const tip of tips) {
        console.log(`  ${c.muted}•${c.reset} ${tip}`);
      }
    }

    nl();
    console.log(hr());
    nl();
    return;
  }

  // ── Full hints list ─────────────────────────────────────────────────────────
  const totalSave = totalEstimatedSaving(hints);
  const monthlyMultiplier = period === "today" ? 30 : period === "week" ? 4.3 : 1;
  const estMonthly = stats.totalCost * monthlyMultiplier;

  nl();
  // Saving summary banner
  console.log(`  ${c.lime}${c.bold}💡 ${hints.length} optimization${hints.length > 1 ? "s" : ""} found${c.reset}`);
  console.log(`  ${c.muted}Estimated saving: ${c.lime}${c.bold}${fmt.usd2(totalSave)}/month${c.reset}  ${c.muted}(${Math.round(totalSave / estMonthly * 100)}% of projected spend)${c.reset}`);
  nl();
  console.log(hr("─"));

  for (const hint of hints) {
    nl();
    console.log(`  ${sevBadge(hint.severity)} ${c.bold}${hint.title}${c.reset}  ${savingBadge(hint.estimatedMonthlySaving)}`);
    nl();
    console.log(`  ${c.muted}${wordWrap(hint.detail, 80)}${c.reset}`);
    nl();
    console.log(`  ${c.muted2}Evidence:${c.reset}  ${c.amber}${hint.evidence}${c.reset}`);
    console.log(`  ${c.muted2}Action:${c.reset}    ${wordWrap(hint.action, 72, "           ")}`);
    nl();
    console.log(`  ${c.muted}Run: ${c.cyan}token-tracker hint ${hint.id}${c.muted} for deep-dive & quick wins.${c.reset}`);
    console.log(hr("─"));
  }

  nl();
  console.log(`  ${c.muted}Analysed ${fmt.num(stats.totalCalls)} calls · ${fmt.tok(stats.totalInputTokens + stats.totalOutputTokens)} tokens · ${fmt.usd2(stats.totalCost)} this ${period}${c.reset}`);
  nl();
}

function wordWrap(text: string, width: number, indent = ""): string {
  const words = text.split(" ");
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    if ((line + word).length > width) {
      lines.push(line.trimEnd());
      line = indent + word + " ";
    } else {
      line += word + " ";
    }
  }
  if (line.trim()) lines.push(line.trimEnd());
  return lines.join("\n  ");
}
