// Prices in USD per 1M tokens (as of June 2026)
export const MODEL_PRICING: Record<string, { input: number; output: number; cacheRead?: number; cacheWrite?: number }> = {
  // Anthropic
  "claude-opus-4-6":    { input: 15.00, output: 75.00, cacheRead: 1.50,  cacheWrite: 18.75 },
  "claude-sonnet-4-6":  { input:  3.00, output: 15.00, cacheRead: 0.30,  cacheWrite:  3.75 },
  "claude-haiku-4-5":   { input:  0.80, output:  4.00, cacheRead: 0.08,  cacheWrite:  1.00 },
  // OpenAI
  "gpt-4o":             { input:  5.00, output: 15.00 },
  "gpt-4o-mini":        { input:  0.15, output:  0.60 },
  "o3":                 { input: 10.00, output: 40.00 },
  // Google
  "gemini-2.0-flash":   { input:  0.10, output:  0.40 },
  "gemini-1.5-pro":     { input:  3.50, output: 10.50 },
};

export function calcCost(params: {
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
}): number {
  const pricing = MODEL_PRICING[params.model] ?? { input: 3.00, output: 15.00 };
  const M = 1_000_000;

  return (
    (params.inputTokens      / M) * pricing.input  +
    (params.outputTokens     / M) * pricing.output +
    ((params.cacheReadTokens  ?? 0) / M) * (pricing.cacheRead  ?? 0) +
    ((params.cacheWriteTokens ?? 0) / M) * (pricing.cacheWrite ?? 0)
  );
}
