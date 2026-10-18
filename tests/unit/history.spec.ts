import { expect, test } from "@playwright/test";
import { changeMarkers, type RunDirs, type RunFiles, summarizeRun } from "../../eval/history.js";

const PROMPT = "2df73b108e32a6fc";
const GOLDEN = "17217ca2d167bccd";
const meta = { commit: "c69e0fb", dirty: false };
const llmMeta = { ...meta, chat_model: "llama3.2:3b", prompt_sha256: PROMPT };

// Shaped like the clean eval:all runs at c69e0fb.
function runFiles(): RunFiles {
  const q = (id: string, unstable: boolean, errors = 0) => ({ id, stats: { unstable }, errors });
  return {
    answers: {
      metadata: { started_at: "2026-10-18T15:28:57.831Z", ...llmMeta, config_changed_during_run: false },
    },
    scores: { golden_sha256: GOLDEN, summary: { overall: { errors: 0, fact_recall: 0.875, source_recall: 0.933 } } },
    retrieval: { metadata: { ...meta, golden_sha256: GOLDEN }, summary: { overall: { hit_rate: 0.967 } } },
    hallucination: { metadata: llmMeta, summary: { counts: { error: 0 }, made_up_rate: 0.5 } },
    injection: { metadata: llmMeta, summary: { overall: { resisted: 6, complied: 3, not_exercised: 0, error: 0 } } },
    consistency: {
      metadata: { ...llmMeta, golden_sha256: GOLDEN },
      repeat: [q("single-01", false), q("single-14", false)],
      paraphrase: [q("multi-01", false)],
    },
  };
}

const RUNS: RunDirs = {
  answers: "a",
  scores: "a",
  retrieval: "r",
  hallucination: "h",
  injection: "i",
  consistency: "c",
};

test.describe("summarizeRun", () => {
  test("extracts every history field from the run files", () => {
    expect(summarizeRun(runFiles(), RUNS)).toEqual({
      date: "2026-10-18T15:28:57.831Z",
      commit: "c69e0fb",
      chat_model: "llama3.2:3b",
      prompt_sha256: PROMPT,
      golden_sha256: GOLDEN,
      quality_score: 89,
      fact_recall: 0.875,
      source_recall: 0.933,
      retrieval_hit_rate: 0.967,
      made_up_rate: 0.5,
      injection_compliance_rate: 0.333,
      unstable_questions: 0,
      request_errors: 0,
      runs: RUNS,
    });
  });

  test("counts unstable questions across repeat and paraphrase", () => {
    const files = runFiles();
    files.consistency.repeat[1].stats = { unstable: true };
    files.consistency.paraphrase[0].stats = { unstable: true };
    expect(summarizeRun(files, RUNS).unstable_questions).toBe(2);
  });

  test("a consistency question whose attempts all failed is not counted as unstable", () => {
    const files = runFiles();
    files.consistency.repeat[0] = { id: "single-01", stats: null, errors: 5 };
    const entry = summarizeRun(files, RUNS);
    expect(entry.unstable_questions).toBe(0);
    expect(entry.request_errors).toBe(5);
  });

  test("injection compliance leaves out cases that weren't exercised or errored", () => {
    const files = runFiles();
    files.injection.summary.overall = { resisted: 3, complied: 1, not_exercised: 3, error: 2 };
    const entry = summarizeRun(files, RUNS);
    expect(entry.injection_compliance_rate).toBe(0.25);
    expect(entry.request_errors).toBe(2);
  });

  test("injection compliance is null when no case was exercised", () => {
    const files = runFiles();
    files.injection.summary.overall = { resisted: 0, complied: 0, not_exercised: 3, error: 0 };
    expect(summarizeRun(files, RUNS).injection_compliance_rate).toBeNull();
  });

  test("sums request errors from every suite", () => {
    const files = runFiles();
    files.scores.summary.overall.errors = 1;
    files.hallucination.summary.counts.error = 2;
    files.injection.summary.overall.error = 3;
    files.consistency.paraphrase[0].errors = 4;
    expect(summarizeRun(files, RUNS).request_errors).toBe(10);
  });

  test("rejects runs from different commits", () => {
    const files = runFiles();
    files.retrieval.metadata.commit = "abc1234";
    expect(() => summarizeRun(files, RUNS)).toThrow(/retrieval is at commit abc1234, answers at c69e0fb/);
  });

  test("rejects runs made with uncommitted changes", () => {
    const files = runFiles();
    files.hallucination.metadata = { ...llmMeta, dirty: true };
    expect(() => summarizeRun(files, RUNS)).toThrow(/hallucination run was made with uncommitted changes/);
    const answersDirty = runFiles();
    answersDirty.answers.metadata.dirty = true;
    expect(() => summarizeRun(answersDirty, RUNS)).toThrow(/answers run/);
  });

  test("rejects a config change during the answers run", () => {
    const files = runFiles();
    files.answers.metadata.config_changed_during_run = true;
    expect(() => summarizeRun(files, RUNS)).toThrow(/config changed/);
  });

  test("rejects a different model, prompt, or golden dataset in any suite", () => {
    const model = runFiles();
    model.injection.metadata = { ...llmMeta, chat_model: "claude-haiku" };
    expect(() => summarizeRun(model, RUNS)).toThrow(/injection used model claude-haiku/);

    const prompt = runFiles();
    prompt.consistency.metadata = { ...prompt.consistency.metadata, prompt_sha256: "ffff" };
    expect(() => summarizeRun(prompt, RUNS)).toThrow(/consistency used a different prompt/);

    const golden = runFiles();
    golden.retrieval.metadata.golden_sha256 = "ffff";
    expect(() => summarizeRun(golden, RUNS)).toThrow(/retrieval used a different golden dataset/);
  });

  test("lists every problem at once", () => {
    const files = runFiles();
    files.retrieval.metadata.commit = "abc1234";
    files.injection.metadata = { ...llmMeta, dirty: true };
    expect(() => summarizeRun(files, RUNS)).toThrow(/retrieval is at commit[\s\S]*injection run was made with uncommitted/);
  });
});

test.describe("changeMarkers", () => {
  const e = (chat_model: string | null, prompt_sha256: string) => ({ chat_model, prompt_sha256 });

  test("no markers when nothing changes, or for zero or one entry", () => {
    expect(changeMarkers([])).toEqual([]);
    expect(changeMarkers([e("llama", "aaaaaaaa11")])).toEqual([]);
    expect(changeMarkers([e("llama", "aaaaaaaa11"), e("llama", "aaaaaaaa11"), e("llama", "aaaaaaaa11")])).toEqual([]);
  });

  test("marks the first entry after a prompt or model change, compared with the entry before", () => {
    const entries = [
      e("llama", "aaaaaaaa11"),
      e("llama", "aaaaaaaa11"),
      e("llama", "bbbbbbbb22"),
      e("haiku", "bbbbbbbb22"),
      e("haiku", "bbbbbbbb22"),
      e("llama", "aaaaaaaa11"),
    ];
    expect(changeMarkers(entries)).toEqual([
      { index: 2, changes: ["prompt aaaaaaaa → bbbbbbbb"] },
      { index: 3, changes: ["model llama → haiku"] },
      { index: 5, changes: ["model haiku → llama", "prompt bbbbbbbb → aaaaaaaa"] },
    ]);
  });
});
