import { expect, test } from "@playwright/test";
import { type Baseline, checkGate, type GateRun } from "../../eval/gateCheck.js";

const BASELINE: Baseline = {
  quality_score: 88.4,
  tolerance: 2,
  chat_model: "llama3.2:3b",
  embed_model: "nomic-embed-text",
  prompt_sha256: "prompt-a",
  golden_sha256: "golden-a",
  source: "test",
};

const run = (overrides: Partial<GateRun> = {}): GateRun => ({
  quality_score: 88.4,
  chat_model: "llama3.2:3b",
  embed_model: "nomic-embed-text",
  prompt_sha256: "prompt-a",
  golden_sha256: "golden-a",
  errors: 0,
  ...overrides,
});

test.describe("checkGate", () => {
  test("passes at, above, or slightly below the baseline", () => {
    for (const score of [88.4, 95, 87.0]) {
      const result = checkGate(BASELINE, run({ quality_score: score }));
      expect(result.pass, `score ${score}`).toBe(true);
      expect(result.failures).toEqual([]);
    }
  });

  test("passes exactly at the threshold despite floating-point noise", () => {
    expect(checkGate(BASELINE, run({ quality_score: 86.4 })).pass).toBe(true);
    // 64.4 - 2 is 62.4 in decimal but 62.400000000000006 in floating point.
    const result = checkGate({ ...BASELINE, quality_score: 64.4 }, run({ quality_score: 62.4 }));
    expect(result.threshold).toBe(62.4);
    expect(result.pass).toBe(true);
  });

  test("fails one tenth of a point below the threshold", () => {
    const result = checkGate(BASELINE, run({ quality_score: 86.3 }));
    expect(result.pass).toBe(false);
    expect(result.delta).toBe(-2.1);
    expect(result.failures).toEqual(["Quality score 86.3 is 2.1 points below the baseline 88.4 (allowed: 2)."]);
  });

  test("reports the change from the baseline rounded to one decimal", () => {
    expect(checkGate(BASELINE, run({ quality_score: 89.0 })).delta).toBe(0.6);
    expect(checkGate(BASELINE, run({ quality_score: 88.1 })).delta).toBe(-0.3);
  });

  test("fails when any request errored, even if the score is high enough", () => {
    const result = checkGate(BASELINE, run({ quality_score: 90, errors: 2 }));
    expect(result.pass).toBe(false);
    expect(result.failures).toEqual(["2 request(s) failed, so the score is incomplete."]);
  });

  test("fails when the chat or embedding model differs from the baseline's", () => {
    const chat = checkGate(BASELINE, run({ chat_model: "claude-haiku-5-5", quality_score: 99 }));
    expect(chat.pass).toBe(false);
    expect(chat.failures[0]).toMatch(/Chat model claude-haiku-5-5 differs.*recalibrate/);

    const embed = checkGate(BASELINE, run({ embed_model: "other-embed" }));
    expect(embed.pass).toBe(false);
    expect(embed.failures[0]).toMatch(/Embedding model other-embed differs/);
  });

  test("a different prompt or golden dataset is a note, not a failure", () => {
    const result = checkGate(BASELINE, run({ prompt_sha256: "prompt-b", golden_sha256: "golden-b" }));
    expect(result.pass).toBe(true);
    expect(result.notes).toHaveLength(2);
    expect(result.notes[0]).toMatch(/prompt differs/);
    expect(result.notes[1]).toMatch(/golden\.json differs/);
  });

  test("lists every failure reason together", () => {
    const result = checkGate(BASELINE, run({ quality_score: 50, errors: 30, chat_model: null }));
    expect(result.failures).toHaveLength(3);
  });

  test("uses the baseline's tolerance", () => {
    const strict = { ...BASELINE, tolerance: 0.5 };
    expect(checkGate(strict, run({ quality_score: 87.9 })).pass).toBe(true);
    expect(checkGate(strict, run({ quality_score: 87.8 })).pass).toBe(false);
  });
});
