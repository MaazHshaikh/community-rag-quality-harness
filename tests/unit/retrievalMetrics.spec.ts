import { expect, test } from "@playwright/test";
import { firstExpectedRank, hasFullRecall, isHit, summarizeRetrieval } from "../../eval/retrievalMetrics.js";

const PRICING = "fact-pricing-and-fees.md";
const REFUNDS = "fact-refunds-and-disputes.md";
const THREAD = "thread-carrier-billing-worth-it.md";
const API = "fact-api-and-integration.md";

test.describe("firstExpectedRank", () => {
  test("returns the 1-based position of the first expected source", () => {
    expect(firstExpectedRank([PRICING], [PRICING, THREAD, API])).toBe(1);
    expect(firstExpectedRank([PRICING], [THREAD, API, PRICING])).toBe(3);
    expect(firstExpectedRank([PRICING, REFUNDS], [THREAD, REFUNDS, PRICING])).toBe(2);
  });

  test("returns null when no expected source is in the top 3", () => {
    expect(firstExpectedRank([PRICING], [THREAD, API, REFUNDS])).toBeNull();
    expect(firstExpectedRank([PRICING], [])).toBeNull();
  });

  test("ignores results beyond the top 3", () => {
    expect(firstExpectedRank([PRICING], [THREAD, API, REFUNDS, PRICING])).toBeNull();
  });
});

test.describe("isHit", () => {
  test("is true when at least one expected source is in the top 3", () => {
    expect(isHit([PRICING, REFUNDS], [THREAD, REFUNDS, API])).toBe(true);
    expect(isHit([PRICING], [THREAD, API, REFUNDS])).toBe(false);
  });
});

test.describe("hasFullRecall", () => {
  test("requires every expected source in the top 3", () => {
    expect(hasFullRecall([PRICING, REFUNDS], [REFUNDS, THREAD, PRICING])).toBe(true);
    expect(hasFullRecall([PRICING, REFUNDS], [PRICING, PRICING, THREAD])).toBe(false);
  });

  test("counts a doc once even when several of its chunks are returned", () => {
    expect(hasFullRecall([PRICING], [PRICING, PRICING, PRICING])).toBe(true);
  });

  test("ignores results beyond the top 3", () => {
    expect(hasFullRecall([PRICING, REFUNDS], [PRICING, THREAD, API, REFUNDS])).toBe(false);
  });
});

test.describe("summarizeRetrieval", () => {
  test("computes hit rate, full recall, mean first rank over hits, and MRR", () => {
    const summary = summarizeRetrieval([
      { hit: true, full_recall: true, first_rank: 1 },
      { hit: true, full_recall: false, first_rank: 2 },
      { hit: true, full_recall: true, first_rank: 3 },
      { hit: false, full_recall: false, first_rank: null },
    ]);
    expect(summary).toEqual({
      count: 4,
      hit_rate: 0.75,
      full_recall_rate: 0.5,
      mean_first_rank: 2,
      // (1 + 1/2 + 1/3 + 0) / 4 = 0.4583
      mrr: 0.458,
    });
  });

  test("handles no hits and an empty list", () => {
    expect(summarizeRetrieval([{ hit: false, full_recall: false, first_rank: null }])).toMatchObject({
      hit_rate: 0,
      mean_first_rank: null,
      mrr: 0,
    });
    expect(summarizeRetrieval([])).toEqual({
      count: 0,
      hit_rate: 0,
      full_recall_rate: 0,
      mean_first_rank: null,
      mrr: 0,
    });
  });
});
