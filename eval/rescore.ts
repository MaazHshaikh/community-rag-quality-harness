// Re-scores every full eval:all pass in eval/history.jsonl after a scoring change, without asking
// any model again: rewrites each pass's scores.json, report.md, and consistency scores from the
// saved answers, then rebuilds its history line. Run with: npm run eval:rescore
// Passes scored against a different eval/golden.json are left as they are.
// Not re-scored: hallucination and injection verdicts (they don't use fact matching), and run
// folders that aren't part of a history line.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { scoreAttempt, summarizeQuestion } from "./consistencyScoring.js";
import {
  HISTORY_FILE,
  type HistoryEntry,
  RUN_FILE_NAMES,
  type RunFiles,
  summarizeRun,
  USAGE_FILE_NAME,
  type UsageFile,
} from "./history.js";
import { RUNS_DIR } from "./runDir.js";
import { scoreRun } from "./scoreRun.js";
import type { GoldenEntry } from "./scoring.js";

const goldenText = readFileSync("eval/golden.json", "utf8");
const goldenSha = createHash("sha256").update(goldenText).digest("hex");
const goldenById = new Map((JSON.parse(goldenText) as GoldenEntry[]).map((g) => [g.id, g]));

const read = (dir: string, file: string) => JSON.parse(readFileSync(path.join(RUNS_DIR, dir, file), "utf8"));
const write = (dir: string, file: string, data: unknown) =>
  writeFileSync(path.join(RUNS_DIR, dir, file), JSON.stringify(data, null, 2) + "\n");

type ConsistencyFile = {
  metadata: { golden_sha256?: string };
  rescored_at?: string;
  repeat: { id: string; attempts: Parameters<typeof scoreAttempt>[1][] }[];
  paraphrase: { id: string; attempts: Parameters<typeof scoreAttempt>[1][] }[];
};

function rescoreConsistency(dir: string) {
  const data = read(dir, RUN_FILE_NAMES.consistency) as ConsistencyFile;
  const rescore = (q: ConsistencyFile["repeat"][number]) => {
    const entry = goldenById.get(q.id)!;
    return summarizeQuestion(entry, q.attempts.map((a) => ({ ...a, ...scoreAttempt(entry, a) })));
  };
  write(dir, RUN_FILE_NAMES.consistency, {
    ...data,
    rescored_at: new Date().toISOString(),
    repeat: data.repeat.map(rescore),
    paraphrase: data.paraphrase.map(rescore),
  });
}

const entries: HistoryEntry[] = readFileSync(HISTORY_FILE, "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line));
const rebuilt: HistoryEntry[] = [];
console.log("pass                       model             quality        unstable");
for (const old of entries) {
  const runs = old.runs;
  const scoredWith = read(runs.scores, RUN_FILE_NAMES.scores).golden_sha256;
  const consistencyGolden = (read(runs.consistency, RUN_FILE_NAMES.consistency) as ConsistencyFile).metadata.golden_sha256;
  if (scoredWith !== goldenSha || consistencyGolden !== goldenSha) {
    console.log(`${runs.answers}  skipped: scored against a different eval/golden.json`);
    rebuilt.push(old);
    continue;
  }

  scoreRun(path.join(RUNS_DIR, runs.answers));
  const report = spawnSync(process.execPath, ["--import", "tsx", "eval/report.ts", path.join(RUNS_DIR, runs.answers)], { encoding: "utf8" });
  if (report.status !== 0) throw new Error(`eval/report.ts failed for ${runs.answers}:\n${report.stderr}`);
  rescoreConsistency(runs.consistency);

  const files = Object.fromEntries(
    Object.entries(RUN_FILE_NAMES).map(([suite, file]) => [suite, read(runs[suite as keyof RunFiles], file)]),
  ) as unknown as RunFiles;
  const usage: UsageFile | undefined =
    runs.usage && existsSync(path.join(RUNS_DIR, runs.usage, USAGE_FILE_NAME)) ? read(runs.usage, USAGE_FILE_NAME) : undefined;
  const entry = summarizeRun(files, runs, usage);
  rebuilt.push(entry);
  console.log(
    `${runs.answers}  ${String(entry.chat_model).padEnd(16)}  ${old.quality_score.toFixed(1)} -> ${entry.quality_score.toFixed(1)}` +
      `   ${old.unstable_questions} -> ${entry.unstable_questions}`,
  );
}

writeFileSync(HISTORY_FILE, rebuilt.map((e) => JSON.stringify(e)).join("\n") + "\n");
console.log(`\nRewrote ${HISTORY_FILE}. Next: npm run eval:failure-report and npm run eval:chart`);
