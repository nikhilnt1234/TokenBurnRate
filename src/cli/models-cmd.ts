/**
 * models-cmd.ts — `token-tracker models`
 */

import { MODEL_PRICING } from "../utils/pricing.js";
import { c, hr, header, nl, pad } from "./render.js";

export async function runModels() {
  nl();
  console.log(`${c.orange}${c.bold}  ⬡ token-tracker${c.reset}  ${c.muted}Model Pricing (per 1M tokens)${c.reset}`);
  console.log(hr());
  nl();

  // Header
  console.log(`  ${c.muted}${pad("Model", 28)}${pad("Input", 12, "right")}${pad("Output", 12, "right")}${pad("Cache Read", 14, "right")}${c.reset}`);
  console.log(`  ${c.muted2}${"─".repeat(66)}${c.reset}`);

  const providers: Record<string, string[]> = {
    "Anthropic": ["claude-opus-4-6","claude-sonnet-4-6","claude-haiku-4-5"],
    "OpenAI":    ["gpt-4o","gpt-4o-mini","o3"],
    "Google":    ["gemini-2.0-flash","gemini-1.5-pro"],
  };

  for (const [provider, models] of Object.entries(providers)) {
    nl();
    console.log(`  ${c.bold}${c.orange}${provider}${c.reset}`);
    for (const m of models) {
      const p = MODEL_PRICING[m];
      if (!p) continue;
      console.log(
        `  ${c.white}${pad(m.replace("claude-","").replace("gemini-","").replace("gpt-",""), 28)}` +
        `${c.amber}${pad("$" + p.input.toFixed(2), 12, "right")}` +
        `${c.orange}${pad("$" + p.output.toFixed(2), 12, "right")}` +
        `${c.teal}${p.cacheRead ? pad("$" + p.cacheRead.toFixed(2), 14, "right") : pad("—", 14, "right")}` +
        c.reset
      );
    }
  }

  nl();
  console.log(`  ${c.muted}Prices are per 1M tokens (USD). Cache write is typically 1.25× input price.${c.reset}`);
  nl();
}
