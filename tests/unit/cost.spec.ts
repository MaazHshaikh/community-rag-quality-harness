import { expect, test } from "@playwright/test";
import { addUsage, estimateCostUsd, subtractUsage, type UsageCounts } from "../../eval/cost.js";

const usage = (input_tokens: number, output_tokens: number, requests = 1, requests_without_usage = 0): UsageCounts => ({
  requests,
  requests_without_usage,
  input_tokens,
  output_tokens,
});

test.describe("estimateCostUsd", () => {
  test("prices Haiku 5.5 input and output tokens separately", () => {
    // 1M input at $0.10 + 1M output at $0.50
    expect(estimateCostUsd("claude-haiku-5-5", usage(1_000_000, 1_000_000))).toBe(0.6);
    expect(estimateCostUsd("claude-haiku-5-5", usage(150_000, 10_000, 100))).toBe(0.02);
  });

  test("rounds to a millionth of a dollar", () => {
    expect(estimateCostUsd("claude-haiku-5-5", usage(1, 1))).toBe(0.000001);
    expect(estimateCostUsd("claude-haiku-5-5", usage(3, 0))).toBe(0);
  });

  test("local models cost nothing", () => {
    expect(estimateCostUsd("llama3.2:3b", usage(500_000, 50_000))).toBe(0);
  });

  test("is null for an unknown model, no model, or requests without token counts", () => {
    expect(estimateCostUsd("some-other-model", usage(10, 10))).toBeNull();
    expect(estimateCostUsd(null, usage(10, 10))).toBeNull();
    expect(estimateCostUsd("claude-haiku-5-5", usage(10, 10, 2, 1))).toBeNull();
  });
});

test.describe("usage arithmetic", () => {
  test("adds and subtracts every counter", () => {
    expect(addUsage(usage(10, 2, 1, 0), usage(5, 1, 2, 1))).toEqual(usage(15, 3, 3, 1));
    expect(subtractUsage(usage(15, 3, 3, 1), usage(10, 2, 1, 0))).toEqual(usage(5, 1, 2, 1));
  });
});
