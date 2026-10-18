// Summarises a scored run (and its judge results, if any) into report.md.
// Usage: npm run eval:report [-- eval/runs/<timestamp>]   (defaults to the latest run)
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { excerpt, headlineScore, lowestScoring } from "./reporting.js";
import { resolveRunDir } from "./runDir.js";
import type { CategorySummary, GoldenEntry, QuestionScore } from "./scoring.js";

interface ScoresFile {
  scored_at: string;
  golden_sha256: string;
  run_metadata: Record<string, unknown>;
  summary: { overall: CategorySummary; by_category: Record<string, CategorySummary> };
  questions: QuestionScore[];
}

interface JudgeAverages {
  judged: number;
  correctness: number | null;
  groundedness: number | null;
  completeness: number | null;
}

interface JudgeFile {
  judged_at: string;
  judge_model: string;
  judge_prompt_sha256: string;
  golden_sha256: string;
  summary: { overall: JudgeAverages; by_category: Record<string, JudgeAverages> };
}

const readJson = <T>(file: string): T => JSON.parse(readFileSync(file, "utf8")) as T;
const short = (hash: unknown) => (typeof hash === "string" ? hash.slice(0, 12) : "n/a");
const pct = (value: number) => `${(value * 100).toFixed(1)}%`;
const avg = (value: number | null) => (value === null ? "n/a" : value.toFixed(2));

const runDir = resolveRunDir(process.argv[2]);
const scoresFile = path.join(runDir, "scores.json");
if (!existsSync(scoresFile)) {
  console.error(`No scores.json in ${runDir}. Score it first with: npm run eval:score`);
  process.exit(1);
}

const scores = readJson<ScoresFile>(scoresFile);
const answers = readJson<{ results: { id: string; answer: string | null }[] }>(path.join(runDir, "answers.json"));
const judgeFile = path.join(runDir, "judge.json");
const judge = existsSync(judgeFile) ? readJson<JudgeFile>(judgeFile) : null;
const goldenText = readFileSync("eval/golden.json", "utf8");
const golden = JSON.parse(goldenText) as GoldenEntry[];
const questionText = new Map(golden.map((g) => [g.id, g.question]));
const answerText = new Map(answers.results.map((r) => [r.id, r.answer]));
const meta = scores.run_metadata;

// Each artifact records the golden file it used; mismatches mean the numbers aren't comparable.
const currentGolden = createHash("sha256").update(goldenText).digest("hex");
const warnings: string[] = [];
if (scores.golden_sha256 !== currentGolden) {
  warnings.push("eval/golden.json changed since scoring; re-run `npm run eval:score`.");
}
if (judge && judge.golden_sha256 !== scores.golden_sha256) {
  warnings.push("judge.json was produced with a different golden file than scores.json.");
}
if (meta.dirty) warnings.push("The run was made with uncommitted changes; the commit hash alone won't reproduce it.");
if (meta.config_changed_during_run) warnings.push("The app's configuration changed during the run.");

const overall = scores.summary.overall;
const headline = headlineScore(overall.fact_recall, overall.source_recall);
const categories = Object.entries(scores.summary.by_category);
const flagged = scores.questions.filter((q) => q.forbidden_found.length > 0);
const lowest = lowestScoring(scores.questions, 5);

const lines: string[] = [];
lines.push(`# Eval Report: ${path.basename(runDir)}`, "");
lines.push(`**Quality score: ${headline} / 100** (75% fact recall + 25% source recall)`, "");
if (warnings.length) lines.push(...warnings.map((w) => `> **Warning:** ${w}`), "");

lines.push("## Run", "");
lines.push("| Field | Value |", "|---|---|");
for (const [field, value] of [
  ["Commit", `${meta.commit}${meta.dirty ? " (dirty)" : ""}`],
  ["Chat model", `${meta.chat_model}, temperature ${meta.temperature}`],
  ["Embedding model", meta.embed_model],
  ["Answer prompt", short(meta.prompt_sha256)],
  ["Golden dataset", short(scores.golden_sha256)],
  ["Judge prompt", judge ? `${short(judge.judge_prompt_sha256)} (${judge.judge_model})` : "not judged"],
  ["Started", meta.started_at],
  ["Questions", meta.question_count],
] as const) {
  lines.push(`| ${field} | ${value} |`);
}
lines.push("");

lines.push("## Scores by category", "");
lines.push("| Category | Questions | Errors | Quality | Fact recall | Source recall | Refusals |", "|---|---|---|---|---|---|---|");
for (const [name, s] of [...categories, ["**overall**", overall] as const]) {
  lines.push(
    `| ${name} | ${s.count} | ${s.errors} | ${headlineScore(s.fact_recall, s.source_recall)} | ` +
      `${pct(s.fact_recall)} | ${pct(s.source_recall)} | ${pct(s.refusal_rate)} |`,
  );
}
lines.push("");

lines.push("## Safety flags", "");
if (flagged.length === 0) {
  lines.push("No forbidden facts found in any answer.", "");
} else {
  lines.push(
    "Answers containing a forbidden phrase. These are flags to review, not automatic failures: an answer can mention a wrong value to correct it.",
    "",
  );
  lines.push("| ID | Question | Forbidden phrase |", "|---|---|---|");
  for (const q of flagged) {
    for (const phrase of q.forbidden_found) lines.push(`| ${q.id} | ${questionText.get(q.id) ?? "?"} | ${phrase} |`);
  }
  lines.push("");
}

lines.push("## 5 lowest-scoring questions", "");
lines.push("| ID | Quality | Missing facts | Missing sources | Answer excerpt |", "|---|---|---|---|---|");
for (const q of lowest) {
  const missingFacts = q.facts.filter((f) => !f.matched).map((f) => f.fact.split(" | ")[0]);
  lines.push(
    `| ${q.id} | ${headlineScore(q.fact_recall, q.source_recall)} | ${missingFacts.join(", ") || "none"} | ` +
      `${q.missing_sources.join(", ") || "none"} | ${excerpt(q.error ? `Error: ${q.error}` : answerText.get(q.id) ?? null).replace(/\|/g, "\\|")} |`,
  );
}
lines.push("");

lines.push("## Judge scores (advisory)", "");
if (!judge) {
  lines.push("Not judged. Run `npm run eval:judge` (about 50 minutes) to add LLM-judge scores.", "");
} else {
  lines.push(
    `Scores from 1 to 5 by ${judge.judge_model}. **Advisory only**: the judge agrees with hand scores on about 2 in 3 ` +
      "scores and sometimes gives wrong reasons (see Judge Calibration in findings.md). The quality score above does not use them.",
    "",
  );
  lines.push("| Category | Judged | Correctness | Groundedness | Completeness |", "|---|---|---|---|---|");
  for (const [name, j] of [...Object.entries(judge.summary.by_category), ["**overall**", judge.summary.overall] as const]) {
    lines.push(`| ${name} | ${j.judged} | ${avg(j.correctness)} | ${avg(j.groundedness)} | ${avg(j.completeness)} |`);
  }
  lines.push("");
}

const reportFile = path.join(runDir, "report.md");
writeFileSync(reportFile, lines.join("\n"));

console.log(`Report for ${runDir}\n`);
console.log(`Quality score: ${headline} / 100  (fact recall ${pct(overall.fact_recall)}, source recall ${pct(overall.source_recall)})`);
for (const [name, s] of categories) console.log(`  ${name.padEnd(12)} ${headlineScore(s.fact_recall, s.source_recall)}`);
console.log(`Safety flags: ${flagged.length ? flagged.map((q) => `${q.id} (${q.forbidden_found.join("; ")})`).join(", ") : "none"}`);
console.log(`Lowest: ${lowest.map((q) => `${q.id} ${headlineScore(q.fact_recall, q.source_recall)}`).join(", ")}`);
console.log(
  judge
    ? `Judge (advisory): correctness ${avg(judge.summary.overall.correctness)}, groundedness ${avg(judge.summary.overall.groundedness)}, completeness ${avg(judge.summary.overall.completeness)}`
    : "Judge: not run (npm run eval:judge)",
);
for (const w of warnings) console.log(`Warning: ${w}`);
console.log(`\nSaved ${reportFile}`);
