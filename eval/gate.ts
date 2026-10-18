// CI quality gate: compares a scored run with eval/baseline.json and fails if the quality score
// dropped more than the allowed tolerance. Writes a Markdown summary to $GITHUB_STEP_SUMMARY when set.
// Usage: npm run eval:gate [-- eval/runs/<timestamp>]   (defaults to the latest run)
// GATE_ENFORCE=false reports the result without failing (for calibrating the baseline).
import { createHash } from "node:crypto";
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { type Baseline, checkGate } from "./gateCheck.js";
import { headlineScore } from "./reporting.js";
import { resolveRunDir } from "./runDir.js";

const BASELINE_FILE = "eval/baseline.json";

interface Summary {
  count: number;
  errors: number;
  fact_recall: number;
  source_recall: number;
}

const runDir = resolveRunDir(process.argv[2]);
const scoresFile = path.join(runDir, "scores.json");
if (!existsSync(scoresFile)) {
  console.error(`No scores.json in ${runDir}. Score it first with: npm run eval:score`);
  process.exit(1);
}
const scores = JSON.parse(readFileSync(scoresFile, "utf8")) as {
  golden_sha256: string;
  run_metadata: { commit: string; chat_model: string | null; embed_model: string | null; prompt_sha256: string; duration_ms?: number };
  summary: { overall: Summary; by_category: Record<string, Summary> };
};
const baseline = JSON.parse(readFileSync(BASELINE_FILE, "utf8")) as Baseline;
const goldenNow = createHash("sha256").update(readFileSync("eval/golden.json", "utf8")).digest("hex");
if (goldenNow !== scores.golden_sha256) {
  console.error(`${scoresFile} was scored against a different eval/golden.json. Re-score it first.`);
  process.exit(1);
}

const meta = scores.run_metadata;
const overall = scores.summary.overall;
const quality = headlineScore(overall.fact_recall, overall.source_recall);
const result = checkGate(baseline, {
  quality_score: quality,
  chat_model: meta.chat_model,
  embed_model: meta.embed_model,
  prompt_sha256: meta.prompt_sha256,
  golden_sha256: scores.golden_sha256,
  errors: overall.errors,
});
const enforce = process.env.GATE_ENFORCE !== "false";

const pct = (v: number) => `${(v * 100).toFixed(1)}%`;
const sign = (v: number) => (v > 0 ? `+${v}` : String(v));
const verdict = result.pass ? "✅ Passed" : enforce ? "❌ Failed" : "⚠️ Would fail (not enforced)";
const lines = [
  `## Quality gate: ${verdict}`,
  "",
  `| | Score |`,
  `|---|---|`,
  `| This run | **${quality}** |`,
  `| Baseline | ${baseline.quality_score} |`,
  `| Change | ${sign(result.delta)} |`,
  `| Fails below | ${result.threshold} (baseline − ${baseline.tolerance}) |`,
  "",
  ...(result.failures.length ? ["**Why it failed**", "", ...result.failures.map((f) => `- ${f}`), ""] : []),
  ...(result.notes.length ? ["**Notes**", "", ...result.notes.map((n) => `- ${n}`), ""] : []),
  "| Category | Questions | Errors | Fact recall | Source recall | Quality |",
  "|---|---|---|---|---|---|",
  ...[...Object.entries(scores.summary.by_category), ["overall", overall] as const].map(
    ([name, s]) =>
      `| ${name} | ${s.count} | ${s.errors} | ${pct(s.fact_recall)} | ${pct(s.source_recall)} | ${headlineScore(s.fact_recall, s.source_recall)} |`,
  ),
  "",
  `Run \`${runDir.replace(/\\/g, "/")}\` at commit \`${meta.commit}\`, ${meta.chat_model}, prompt \`${meta.prompt_sha256.slice(0, 12)}\`` +
    `${meta.duration_ms ? `, ${(meta.duration_ms / 60000).toFixed(1)} min` : ""}. Baseline: ${baseline.source}.`,
  "",
];
const markdown = lines.join("\n");

console.log(markdown);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, markdown + "\n");
if (!result.pass && enforce) process.exit(1);
