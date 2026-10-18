// Scores a saved run against eval/golden.json without calling any AI.
// Usage: npm run eval:score [-- eval/runs/<timestamp>]   (defaults to the latest run)
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { type AnswerRecord, type Category, type GoldenEntry, scoreAnswer, summarize } from "./scoring.js";

const RUNS_DIR = path.join("eval", "runs");
const CATEGORIES: Category[] = ["single_fact", "multi_doc", "conflict"];

function latestRunDir(): string {
  const runs = existsSync(RUNS_DIR)
    ? readdirSync(RUNS_DIR).filter((name) => existsSync(path.join(RUNS_DIR, name, "answers.json"))).sort()
    : [];
  if (runs.length === 0) {
    console.error(`No runs found in ${RUNS_DIR}. Create one with: npm run eval:run`);
    process.exit(1);
  }
  // Folder names are ISO timestamps, so the last one in sorted order is the newest.
  return path.join(RUNS_DIR, runs[runs.length - 1]);
}

const runDir = process.argv[2] ?? latestRunDir();
const answersFile = path.join(runDir, "answers.json");
if (!existsSync(answersFile)) {
  console.error(`No answers.json in ${runDir}`);
  process.exit(1);
}

const goldenText = readFileSync("eval/golden.json", "utf8");
const golden = JSON.parse(goldenText) as GoldenEntry[];
const run = JSON.parse(readFileSync(answersFile, "utf8")) as { metadata: object; results: AnswerRecord[] };
const byId = new Map(run.results.map((r) => [r.id, r]));

const questions = golden.map((entry) => scoreAnswer(entry, byId.get(entry.id)));
const byCategory = Object.fromEntries(
  CATEGORIES.map((category) => [category, summarize(questions.filter((q) => q.category === category))]),
);
const overall = summarize(questions);

const scoresFile = path.join(runDir, "scores.json");
writeFileSync(
  scoresFile,
  JSON.stringify(
    {
      scored_at: new Date().toISOString(),
      run_dir: runDir.replace(/\\/g, "/"),
      // The golden file can change after a run; this pins which version produced these scores.
      golden_sha256: createHash("sha256").update(goldenText).digest("hex"),
      run_metadata: run.metadata,
      summary: { overall, by_category: byCategory },
      questions,
    },
    null,
    2,
  ) + "\n",
);

const pct = (value: number) => `${(value * 100).toFixed(1)}%`.padStart(7);
console.log(`Scored ${runDir}\n`);
console.log("category      n  errors  fact recall  source recall  refusals  forbidden flags");
for (const [name, s] of [...Object.entries(byCategory), ["overall", overall] as const]) {
  console.log(
    `${name.padEnd(12)} ${String(s.count).padStart(2)}  ${String(s.errors).padStart(6)}  ` +
      `${pct(s.fact_recall).padStart(11)}  ${pct(s.source_recall).padStart(13)}  ` +
      `${pct(s.refusal_rate).padStart(8)}  ${String(s.forbidden_flagged).padStart(15)}`,
  );
}
console.log(`\nSaved ${scoresFile}`);
