import { expect, test } from "@playwright/test";
import {
  consistencyStats,
  countSwitches,
  distinctSourceSets,
  isRefusal,
  mean,
  range,
  stdev,
} from "../../eval/consistencyMetrics.js";

const A = "fact-pricing-and-fees.md";
const B = "fact-refunds-and-disputes.md";
const C = "thread-wallet-refunds.md";

test.describe("mean, stdev, range", () => {
  test("identical values have zero spread", () => {
    expect(mean([0.5, 0.5, 0.5])).toBe(0.5);
    expect(stdev([0.5, 0.5, 0.5])).toBe(0);
    expect(range([0.5, 0.5, 0.5])).toBe(0);
  });

  test("population standard deviation", () => {
    // mean 0.5, deviations ±0.5 -> stdev 0.5
    expect(stdev([0, 1])).toBe(0.5);
    // mean 0.8; squared deviations 0.64, 0.04, 0.04, 0.04, 0.04 -> variance 0.16
    expect(stdev([0, 1, 1, 1, 1])).toBeCloseTo(0.4, 10);
    // mean 0.8; squared deviations 0.04, 0.04, 0.09, 0.09, 0.04 -> variance 0.06
    expect(stdev([1, 1, 0.5, 0.5, 1])).toBeCloseTo(Math.sqrt(0.06), 10);
  });

  test("range is max minus min", () => {
    expect(range([0.25, 1, 0.5])).toBe(0.75);
  });

  test("an empty list is an error, not NaN", () => {
    expect(() => mean([])).toThrow(RangeError);
    expect(() => range([])).toThrow(RangeError);
  });
});

test.describe("isRefusal", () => {
  test("a refusal or hedge with no expected facts is a refusal", () => {
    expect(isRefusal("exact_refusal", 0)).toBe(true);
    expect(isRefusal("hedged", 0)).toBe(true);
  });

  test("a hedge that still gives some expected facts is a partial answer, not a refusal", () => {
    // e.g. "60 days; the instant payout fee is not explicitly stated"
    expect(isRefusal("hedged", 0.5)).toBe(false);
    // e.g. a conflict answer naming both sides that says one person "doesn't specify" a detail
    expect(isRefusal("hedged", 0.67)).toBe(false);
  });

  test("a confident answer is never a refusal, even when wrong", () => {
    expect(isRefusal("made_up", 0)).toBe(false);
  });
});

test.describe("countSwitches", () => {
  test("counts flips between answered and refused, in order", () => {
    expect(countSwitches([false, false, false])).toBe(0);
    expect(countSwitches([false, true, false, true])).toBe(3);
    expect(countSwitches([false, false, true, true])).toBe(1);
    expect(countSwitches([])).toBe(0);
  });
});

test.describe("distinctSourceSets", () => {
  test("ignores order and duplicates", () => {
    expect(distinctSourceSets([[A, B], [B, A], [A, B, A]])).toBe(1);
  });

  test("counts different sets", () => {
    expect(distinctSourceSets([[A, B], [A, C], [A]])).toBe(3);
  });
});

test.describe("consistencyStats", () => {
  const attempt = (fact_recall: number, refused = false, sources = [A]) => ({ fact_recall, refused, sources });

  test("a stable question", () => {
    expect(consistencyStats([attempt(1), attempt(1), attempt(1)])).toEqual({
      attempts: 3,
      fact_recall_mean: 1,
      fact_recall_stdev: 0,
      fact_recall_range: 0,
      answered: 3,
      refused: 0,
      switches: 0,
      distinct_source_sets: 1,
      sources_changed: false,
      unstable: false,
    });
  });

  test("flags a range above 0.5 as unstable", () => {
    const stats = consistencyStats([attempt(1), attempt(0, true, [B]), attempt(1)]);
    expect(stats).toMatchObject({
      fact_recall_mean: 0.667,
      fact_recall_range: 1,
      answered: 2,
      refused: 1,
      switches: 2,
      sources_changed: true,
      unstable: true,
    });
  });

  test("a range of exactly 0.5 is not flagged", () => {
    expect(consistencyStats([attempt(1), attempt(0.5)]).unstable).toBe(false);
  });

  test("a 0.5 range between real recall fractions is not flagged", () => {
    // 5/6 of facts found vs 1/3: a realistic boundary case from questions with 6 and 3 facts
    expect(consistencyStats([attempt(5 / 6), attempt(1 / 3)]).unstable).toBe(false);
  });

  test("a range just above 0.5 is flagged", () => {
    expect(consistencyStats([attempt(1), attempt(0.49)]).unstable).toBe(true);
  });
});
