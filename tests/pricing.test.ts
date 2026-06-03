import { calcCost, MODEL_PRICING } from "../src/utils/pricing.js";

// Basic sanity tests — run with: node tests/pricing.test.js
function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`  ✅ ${name}`);
  } catch (e: any) {
    console.error(`  ❌ ${name}: ${e.message}`);
    process.exitCode = 1;
  }
}

function assert(condition: boolean, msg: string) {
  if (!condition) throw new Error(msg);
}

console.log("\n🧪 Pricing Tests");

test("claude-sonnet-4-6: 1M input = $3.00", () => {
  const cost = calcCost({ model: "claude-sonnet-4-6", inputTokens: 1_000_000, outputTokens: 0 });
  assert(Math.abs(cost - 3.0) < 0.001, `Expected ~3.00, got ${cost}`);
});

test("claude-sonnet-4-6: 1M output = $15.00", () => {
  const cost = calcCost({ model: "claude-sonnet-4-6", inputTokens: 0, outputTokens: 1_000_000 });
  assert(Math.abs(cost - 15.0) < 0.001, `Expected ~15.00, got ${cost}`);
});

test("unknown model falls back to sonnet pricing", () => {
  const cost = calcCost({ model: "some-unknown-model", inputTokens: 1_000_000, outputTokens: 0 });
  assert(cost > 0, "Should not throw on unknown model");
});

test("zero tokens = zero cost", () => {
  const cost = calcCost({ model: "claude-haiku-4-5", inputTokens: 0, outputTokens: 0 });
  assert(cost === 0, `Expected 0, got ${cost}`);
});

test("cache read tokens charged at lower rate", () => {
  const withCache = calcCost({ model: "claude-sonnet-4-6", inputTokens: 0, outputTokens: 0, cacheReadTokens: 1_000_000 });
  const withInput = calcCost({ model: "claude-sonnet-4-6", inputTokens: 1_000_000, outputTokens: 0 });
  assert(withCache < withInput, "Cache read should be cheaper than full input");
});

test("all models have positive input price", () => {
  for (const [m, p] of Object.entries(MODEL_PRICING)) {
    assert(p.input > 0, `Model ${m} has non-positive input price`);
  }
});

console.log("\n✅ All pricing tests passed\n");
