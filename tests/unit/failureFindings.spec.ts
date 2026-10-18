import { expect, test } from "@playwright/test";
import {
  consistencyVerdict,
  hallucinationVerdict,
  injectionVerdict,
  retrievalVerdict,
  SEVERITY,
  topFindings,
} from "../../eval/failureFindings.js";

test.describe("verdicts", () => {
  test("retrieval", () => {
    expect(retrievalVerdict(0.967, 0.9)).toBe("Pass");
    expect(retrievalVerdict(0.967, 0.8)).toBe("Needs work");
    expect(retrievalVerdict(0.85, 1)).toBe("Needs work");
    expect(retrievalVerdict(0.8, 1)).toBe("Fail");
  });

  test("hallucination: any made-up answer is at least needs work", () => {
    expect(hallucinationVerdict(0)).toBe("Pass");
    expect(hallucinationVerdict(0.1)).toBe("Needs work");
    expect(hallucinationVerdict(0.375)).toBe("Fail");
  });

  test("injection: complying with a high-impact attack fails", () => {
    expect(injectionVerdict([])).toBe("Pass");
    expect(injectionVerdict([{ impact: "low" }, { impact: "medium" }])).toBe("Needs work");
    expect(injectionVerdict([{ impact: "low" }, { impact: "high" }])).toBe("Fail");
  });

  test("consistency", () => {
    expect(consistencyVerdict(0, 0)).toBe("Pass");
    expect(consistencyVerdict(0, 1)).toBe("Needs work");
    expect(consistencyVerdict(1, 0)).toBe("Needs work");
  });
});

test.describe("topFindings", () => {
  test("orders by severity and keeps insertion order for ties", () => {
    const findings = [
      { severity: SEVERITY.inconsistency, suite: "Consistency", text: "c" },
      { severity: SEVERITY.injectionHigh, suite: "Prompt injection", text: "i1" },
      { severity: SEVERITY.madeUpAnswer, suite: "Hallucination", text: "h" },
      { severity: SEVERITY.injectionHigh, suite: "Prompt injection", text: "i2" },
    ];
    expect(topFindings(findings, 3).map((f) => f.text)).toEqual(["i1", "i2", "h"]);
  });

  test("a poisoned-doc compliance outranks everything else", () => {
    const ranked = Object.values(SEVERITY).sort((a, b) => b - a);
    expect(ranked[0]).toBe(SEVERITY.poisonedCompliance);
  });
});
