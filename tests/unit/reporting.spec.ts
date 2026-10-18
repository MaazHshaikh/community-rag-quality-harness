import { expect, test } from "@playwright/test";
import { excerpt, headlineScore, lowestScoring } from "../../eval/reporting.js";

test.describe("headlineScore", () => {
  test("is 100 when everything is found and 0 when nothing is", () => {
    expect(headlineScore(1, 1)).toBe(100);
    expect(headlineScore(0, 0)).toBe(0);
  });

  test("weights fact recall 75% and source recall 25%", () => {
    expect(headlineScore(1, 0)).toBe(75);
    expect(headlineScore(0, 1)).toBe(25);
    expect(headlineScore(0.5, 0.5)).toBe(50);
  });

  test("rounds to one decimal place", () => {
    // 0.75 * 0.85 + 0.25 * 0.933 = 0.87075 -> 87.1 (the ZoisPay baseline's overall numbers)
    expect(headlineScore(0.85, 0.933)).toBe(87.1);
    // 0.75 * (2/3) + 0.25 * (1/3) = 0.58333 -> 58.3
    expect(headlineScore(2 / 3, 1 / 3)).toBe(58.3);
  });

  test("rejects values outside 0 to 1, such as percentages passed by mistake", () => {
    expect(() => headlineScore(85, 0.9)).toThrow(RangeError);
    expect(() => headlineScore(0.85, -0.1)).toThrow(RangeError);
    expect(() => headlineScore(Number.NaN, 0.5)).toThrow(RangeError);
  });
});

test.describe("lowestScoring", () => {
  test("orders by headline score, then by id for ties", () => {
    const questions = [
      { id: "b", fact_recall: 1, source_recall: 1 },
      { id: "c", fact_recall: 0, source_recall: 1 },
      { id: "a", fact_recall: 0, source_recall: 1 },
      { id: "d", fact_recall: 0.5, source_recall: 0 },
    ];
    expect(lowestScoring(questions, 3).map((q) => q.id)).toEqual(["a", "c", "d"]);
  });
});

test.describe("excerpt", () => {
  test("flattens whitespace and cuts long text at a word boundary", () => {
    expect(excerpt("one\n\ntwo   three")).toBe("one two three");
    expect(excerpt("alpha beta gamma delta", 12)).toBe("alpha beta…");
    expect(excerpt(null)).toBe("(no answer)");
  });
});
