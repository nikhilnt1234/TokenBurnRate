/**
 * tests/hints.test.ts
 * Tests for the deterministic optimization hints engine.
 * Run: npx tsx tests/hints.test.ts
 */

import { generateHints, formatHintsText, totalEstimatedSaving } from "../src/utils/hints.js";
import type { UsageStats } from "../src/utils/hints.js";

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void) {
  try { fn(); console.log(`  ✅ ${name}`); passed++; }
  catch (e: any) { console.error(`  ❌ ${name}\n     ${e.message}`); failed++; }
}

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function assertHasHint(hints: ReturnType<typeof generateHints>, id: string) {
  assert(hints.some(h => h.id === id),
    `Expected hint "${id}" — got: [${hints.map(h => h.id).join(", ")}]`);
}

function assertNoHint(hints: ReturnType<typeof generateHints>, id: string) {
  assert(!hints.some(h => h.id === id),
    `Expected NO hint "${id}" but it was present`);
}

function makeStats(overrides: Partial<UsageStats> = {}): UsageStats {
  return {
    period: "week",
    totalCost: 20,
    totalInputTokens: 2_000_000,
    totalOutputTokens: 400_000,
    totalCacheReadTokens: 100_000,
    totalCacheWriteTokens: 50_000,
    totalCalls: 100,
    avgTokensPerCall: 24_000,
    avgCostPerCall: 0.20,
    outputToInputRatio: 0.20,
    cacheHitPct: 5,
    sessions: [
      { id: "sess-a", model: "claude-sonnet-4-6", calls: 20, tokens: 500_000, cost: 4 },
      { id: "sess-b", model: "claude-sonnet-4-6", calls: 80, tokens: 1_900_000, cost: 16 },
    ],
    byModel: [{ model: "claude-sonnet-4-6", calls: 100, tokens: 2_400_000, cost: 20 }],
    byTask: [],
    ...overrides,
  };
}

console.log("\n🔍 Cache Utilization");
test("fires when cacheHitPct < 30", () => assertHasHint(generateHints(makeStats({ cacheHitPct: 5 })), "cache-utilization"));
test("does NOT fire when cacheHitPct >= 30", () => assertNoHint(generateHints(makeStats({ cacheHitPct: 35 })), "cache-utilization"));
test("does NOT fire with < 50K input tokens", () => assertNoHint(generateHints(makeStats({ totalInputTokens: 40_000, cacheHitPct: 0 })), "cache-utilization"));
test("is CRITICAL when cacheHitPct < 5", () => {
  const h = generateHints(makeStats({ cacheHitPct: 2 })).find(h => h.id === "cache-utilization");
  assert(h?.severity === "critical", `Expected critical, got ${h?.severity}`);
});
test("has a positive monthly saving estimate", () => {
  const h = generateHints(makeStats({ cacheHitPct: 5 })).find(h => h.id === "cache-utilization")!;
  assert(h.estimatedMonthlySaving > 0, "Saving should be > 0");
});

console.log("\n🔄 Model Swap — Testing");
test("fires when testing tasks on expensive model", () => {
  assertHasHint(generateHints(makeStats({ byTask: [{ taskType: "testing", model: "claude-opus-4-6", calls: 30, cost: 5 }] })), "model-swap-testing");
});
test("does NOT fire when testing is on haiku", () => {
  assertNoHint(generateHints(makeStats({ byTask: [{ taskType: "testing", model: "claude-haiku-4-5", calls: 30, cost: 1 }] })), "model-swap-testing");
});
test("does NOT fire when testing cost < $0.50", () => {
  assertNoHint(generateHints(makeStats({ byTask: [{ taskType: "testing", model: "claude-opus-4-6", calls: 5, cost: 0.30 }] })), "model-swap-testing");
});

console.log("\n📝 Verbose Outputs");
test("fires when output/input ratio > 0.35", () => assertHasHint(generateHints(makeStats({ outputToInputRatio: 0.5, totalCalls: 20 })), "verbose-outputs"));
test("does NOT fire when ratio < 0.35", () => assertNoHint(generateHints(makeStats({ outputToInputRatio: 0.20, totalCalls: 20 })), "verbose-outputs"));
test("does NOT fire with < 10 calls", () => assertNoHint(generateHints(makeStats({ outputToInputRatio: 0.6, totalCalls: 5 })), "verbose-outputs"));

console.log("\n📈 Session Spikes");
test("fires when a session costs 3x the average", () => {
  // avg = (1+1+30)/3 = 10.67, spike=30 > 10.67*3=32? No — use 2 cheap sessions at $0.50
  // avg = (0.5+0.5+15)/3 = 5.33, spike=15 > 5.33*3=16? No — make spike bigger
  // avg = (1+1+20)/3 = 7.33, spike=20 > 7.33*3=22? No.
  // Fix: use only 2 cheap at $1, spike at $40: avg=(1+1+40)/3=14, 40>14*3=42? No.
  // Correct approach: make cheap sessions VERY cheap vs spike
  // avg = (0.2+0.2+10)/3 = 3.47, spike=10 > 3.47*3=10.4? No — use 12
  // avg = (0.2+0.2+12)/3 = 4.13, 12>4.13*3=12.4? No — use 15
  // avg = (0.2+0.2+15)/3 = 5.13, 15>5.13*3=15.4? No...
  // Root issue: with 3 sessions the spike IS part of avg. Use 4 sessions instead:
  // avg = (1+1+1+24)/4 = 6.75, spike=24 > 6.75*3=20.25 ✓ AND > 1.0 ✓
  assertHasHint(generateHints(makeStats({
    totalCost: 27,
    sessions: [
      { id: "a",     model: "claude-sonnet-4-6", calls: 10, tokens: 100_000, cost: 1 },
      { id: "b",     model: "claude-sonnet-4-6", calls: 10, tokens: 100_000, cost: 1 },
      { id: "c",     model: "claude-sonnet-4-6", calls: 10, tokens: 100_000, cost: 1 },
      { id: "spike", model: "claude-sonnet-4-6", calls: 80, tokens: 2_000_000, cost: 24 },
    ],
  })), "session-spike");
});
test("does NOT fire with fewer than 3 sessions", () => {
  assertNoHint(generateHints(makeStats({ sessions: [{ id: "a", model: "claude-sonnet-4-6", calls: 50, tokens: 1_000_000, cost: 20 }] })), "session-spike");
});

console.log("\n📦 Context Bloat");
test("fires when avgTokensPerCall > 8K", () => assertHasHint(generateHints(makeStats({ avgTokensPerCall: 15_000, totalCost: 10 })), "context-bloat"));
test("does NOT fire when avgTokensPerCall < 8K", () => assertNoHint(generateHints(makeStats({ avgTokensPerCall: 4_000 })), "context-bloat"));

console.log("\n🔁 Retry Loops");
test("fires when a session has 30+ calls with high tokens/call", () => {
  assertHasHint(generateHints(makeStats({
    sessions: [{ id: "loop", model: "claude-sonnet-4-6", calls: 45, tokens: 450_000, cost: 6 }],
    totalCost: 8,
  })), "retry-loops");
});

console.log("\n🔒 Single Model Dependency");
test("fires when 100% traffic on one non-cheap model", () => {
  assertHasHint(generateHints(makeStats({
    byModel: [{ model: "claude-sonnet-4-6", calls: 100, tokens: 2_000_000, cost: 20 }],
    totalCost: 20,
  })), "single-model-dependency");
});
test("does NOT fire when already on cheap model", () => {
  assertNoHint(generateHints(makeStats({
    byModel: [{ model: "claude-haiku-4-5", calls: 100, tokens: 2_000_000, cost: 5 }],
    totalCost: 5,
  })), "single-model-dependency");
});

console.log("\n📄 Format & Savings");
test("returns no-optimizations message for empty hints", () => {
  assert(formatHintsText([], 100).includes("No significant optimizations"), "Missing no-ops message");
});
test("includes total saving in formatted output", () => {
  const hints = generateHints(makeStats({ cacheHitPct: 2 }));
  assert(formatHintsText(hints, 100).includes("Estimated saving"), "Missing saving line");
});
test("totalEstimatedSaving sums all hints", () => {
  const hints = generateHints(makeStats({ cacheHitPct: 2, totalCalls: 50, outputToInputRatio: 0.5 }));
  const total = totalEstimatedSaving(hints);
  assert(total > 0, "Total saving should be > 0");
  assert(total === hints.reduce((s, h) => s + h.estimatedMonthlySaving, 0), "Sum mismatch");
});

console.log(`\n${"─".repeat(50)}`);
console.log(`  ${passed} passed  ${failed > 0 ? `/ ${failed} FAILED` : "✅ all passed"}`);
if (failed > 0) process.exit(1);
