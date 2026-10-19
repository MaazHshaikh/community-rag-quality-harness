import { expect, test } from "@playwright/test";
import {
  type AnswerRecord,
  containsPhrase,
  type GoldenEntry,
  normalize,
  REFUSAL,
  scoreAnswer,
  summarize,
} from "../../eval/scoring.js";

const entry = (overrides: Partial<GoldenEntry> = {}): GoldenEntry => ({
  id: "single-99",
  question: "How much does the Scale tier cost per month?",
  category: "single_fact",
  expected_facts: ["$99"],
  expected_sources: ["fact-membership-pricing.md"],
  forbidden_facts: ["$29"],
  ...overrides,
});

const answer = (text: string | null, sources: string[] = [], overrides: Partial<AnswerRecord> = {}): AnswerRecord => ({
  id: "single-99",
  status: 200,
  answer: text,
  sources,
  error: null,
  ...overrides,
});

test.describe("normalize", () => {
  test("lowercases, straightens apostrophes, and turns dashes into spaces", () => {
    expect(normalize("Don’t  7-Day March 12–13")).toBe("don't 7 day march 12 13");
  });

  test("converts number words to digits, including compounds", () => {
    expect(normalize("three seats, twenty-five founders, Twelve weeks")).toBe("3 seats, 25 founders, 12 weeks");
  });

  test("leaves words that merely contain a number word alone", () => {
    expect(normalize("someone often tone")).toBe("someone often tone");
  });
});

test.describe("containsPhrase", () => {
  test("matches whole phrases case-insensitively", () => {
    expect(containsPhrase("Scale costs $99 per month.", "$99")).toBe(true);
    expect(containsPhrase("It is held in LISBON, Portugal", "Lisbon")).toBe(true);
  });

  test("does not match a number inside a longer number", () => {
    expect(containsPhrase("Scale costs $990 per year.", "$99")).toBe(false);
    expect(containsPhrase("Capacity is 3000 people.", "300")).toBe(false);
  });

  test("does not match a word inside a longer word", () => {
    expect(containsPhrase("The Scaler plan", "Scale")).toBe(false);
  });

  test("allows a trailing plural s", () => {
    expect(containsPhrase("You have 7 days of grace.", "7 day")).toBe(true);
    expect(containsPhrase("a 7-day grace period", "7 day")).toBe(true);
  });

  test("matches the hyphenated and singular forms of a quantity", () => {
    expect(containsPhrase("Mobile wallets have a 30-day refund window.", "30 days")).toBe(true);
    expect(containsPhrase("a 30 day refund window", "30 days")).toBe(true);
    expect(containsPhrase("a 7-day refund window", "7 days")).toBe(true);
    expect(containsPhrase("a 30-calendar-day window", "30 calendar days")).toBe(true);
    expect(containsPhrase("a 24-hour payout", "24 hours")).toBe(true);
    expect(containsPhrase("in one settlement currency", "1 settlement currencies")).toBe(true);
    expect(containsPhrase("6 settlement currencies", "6 settlement currencies")).toBe(true);
  });

  test("the singular form still needs the same number and unit", () => {
    expect(containsPhrase("a 3-day window", "30 days")).toBe(false);
    expect(containsPhrase("a 300-day window", "30 days")).toBe(false);
    expect(containsPhrase("a 30-week window", "30 days")).toBe(false);
    expect(containsPhrase("a 30-dayx window", "30 days")).toBe(false);
  });

  test("only quantity phrases lose their plural; names and plain words stay exact", () => {
    expect(containsPhrase("Toby said so", "Tobias")).toBe(false);
    expect(containsPhrase("Tobia said so", "Tobias")).toBe(false);
    expect(containsPhrase("Set up a webhook", "webhooks")).toBe(false);
    expect(containsPhrase("the United State", "United States")).toBe(false);
  });

  test("matches number words against digit facts", () => {
    expect(containsPhrase("Scale includes three seats.", "3 seats")).toBe(true);
  });
});

test.describe("scoreAnswer", () => {
  test("fact recall is the share of expected facts found", () => {
    const golden = entry({ expected_facts: ["$29", "$149", "Builder"] });
    const score = scoreAnswer(golden, answer("Builder is $29 per month."));
    expect(score.fact_recall).toBeCloseTo(2 / 3);
    expect(score.facts).toEqual([
      { fact: "$29", matched: "$29" },
      { fact: "$149", matched: null },
      { fact: "Builder", matched: "Builder" },
    ]);
  });

  test("any variant of a fact counts as found", () => {
    const golden = entry({ expected_facts: [["once per week", "once a week", "weekly"]] });
    const score = scoreAnswer(golden, answer("You may post in #show-and-tell weekly."));
    expect(score.fact_recall).toBe(1);
    expect(score.facts[0].matched).toBe("weekly");
  });

  test("source recall is the share of expected sources returned", () => {
    const golden = entry({ expected_sources: ["fact-programs.md", "fact-events-calendar.md"] });
    const score = scoreAnswer(golden, answer("$99", ["fact-programs.md", "thread-pricing.md"]));
    expect(score.source_recall).toBe(0.5);
    expect(score.missing_sources).toEqual(["fact-events-calendar.md"]);
  });

  test("detects an exact refusal, including a curly apostrophe", () => {
    const score = scoreAnswer(entry(), answer("I don’t know based on the community docs."));
    expect(score.refusal_detected).toBe(true);
    expect(score.refusal_only).toBe(true);
    expect(score.fact_recall).toBe(0);
  });

  test("flags a refusal appended to a real answer (F4) as not refusal-only", () => {
    const score = scoreAnswer(entry(), answer(`Claire says raise early; Jonah says wait. ${REFUSAL}`));
    expect(score.refusal_detected).toBe(true);
    expect(score.refusal_only).toBe(false);
  });

  test("does not flag a refusal when the answer only hedges", () => {
    const score = scoreAnswer(entry(), answer("The docs do not say exactly."));
    expect(score.refusal_detected).toBe(false);
  });

  test("reports forbidden facts as flags without lowering recall", () => {
    const score = scoreAnswer(entry(), answer("Scale is $99 per month, not $29."));
    expect(score.fact_recall).toBe(1);
    expect(score.forbidden_found).toEqual(["$29"]);
  });

  test("scores a failed request as 0 and keeps the error", () => {
    const score = scoreAnswer(entry(), answer(null, [], { status: 503, error: "LLM service is unavailable" }));
    expect(score).toMatchObject({
      status: 503,
      error: "LLM service is unavailable",
      fact_recall: 0,
      source_recall: 0,
      refusal_detected: false,
    });
  });

  test("scores a question missing from the run as 0", () => {
    const score = scoreAnswer(entry(), undefined);
    expect(score.error).toBe("no answer recorded");
    expect(score.fact_recall).toBe(0);
  });
});

test.describe("summarize", () => {
  test("averages scores and counts errors and flags", () => {
    const golden = entry({ expected_facts: ["$99", "3 seats"] });
    const scores = [
      scoreAnswer(golden, answer("$99 with three seats", ["fact-membership-pricing.md"])),
      scoreAnswer(golden, answer("$99 per month, not $29", [])),
      scoreAnswer(golden, answer(null, [], { status: null, error: "fetch failed" })),
    ];
    expect(summarize(scores)).toEqual({
      count: 3,
      errors: 1,
      fact_recall: 0.5,
      source_recall: 0.333,
      refusal_rate: 0,
      forbidden_flagged: 1,
    });
  });
});
