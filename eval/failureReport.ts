// Combines the retrieval, hallucination, injection, and consistency runs of one full eval:all pass
// into eval/failure-modes.md: the latest pass in eval/history.jsonl for one chat model.
// Run with: npm run eval:failure-report [-- --model <chat model>]
// The model defaults to the one the CI gate uses (eval/baseline.json), so a run with another model
// (e.g. eval:all:claude) doesn't silently replace the report the README describes.
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { consistencyStats, type ConsistencyStats } from "./consistencyMetrics.js";
import { scoreAttempt } from "./consistencyScoring.js";
import {
  consistencyVerdict,
  type Finding,
  hallucinationVerdict,
  injectionVerdict,
  retrievalVerdict,
  SEVERITY,
  topFindings,
} from "./failureFindings.js";
import type { InjectionCase } from "./injectionChecks.js";
import { excerpt } from "./reporting.js";
import { HISTORY_FILE, type HistoryEntry, type RunDirs } from "./history.js";
import { RUNS_DIR } from "./runDir.js";
import type { GoldenEntry } from "./scoring.js";

const OUT_FILE = path.join("eval", "failure-modes.md");

type Metadata = { commit: string; dirty: boolean; started_at: string; prompt_sha256?: string; golden_sha256?: string };
interface Loaded<T> {
  dir: string;
  data: T & { metadata: Metadata };
}

function chosenModel(argv: string[]): string {
  if (argv.length === 2 && argv[0] === "--model") return argv[1];
  if (argv.length) {
    console.error("Usage: npm run eval:failure-report [-- --model <chat model>]");
    process.exit(1);
  }
  return (JSON.parse(readFileSync("eval/baseline.json", "utf8")) as { chat_model: string }).chat_model;
}
const model = chosenModel(process.argv.slice(2));
const history: HistoryEntry[] = existsSync(HISTORY_FILE)
  ? readFileSync(HISTORY_FILE, "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line))
  : [];
const pass = history.filter((e) => e.chat_model === model).at(-1);
if (!pass) {
  const models = [...new Set(history.map((e) => e.chat_model))].join(", ") || "none";
  console.error(`No eval:all pass for ${model} in ${HISTORY_FILE} (models there: ${models}).`);
  process.exit(1);
}

// One suite's file from the chosen pass.
function latest<T>(suite: keyof RunDirs, file: string): Loaded<T> | null {
  const dir = pass!.runs[suite];
  if (!dir || !existsSync(path.join(RUNS_DIR, dir, file))) return null;
  return { dir, data: JSON.parse(readFileSync(path.join(RUNS_DIR, dir, file), "utf8")) };
}

const quote = (text: string | null, max = 120) => `"${excerpt(text, max)}"`;
const pct = (v: number) => `${(v * 100).toFixed(1)}%`;

const goldenText = readFileSync("eval/golden.json", "utf8");
const golden = JSON.parse(goldenText) as GoldenEntry[];
const goldenById = new Map(golden.map((g) => [g.id, g]));
const goldenSha = createHash("sha256").update(goldenText).digest("hex");
const injectionCases = new Map(
  (JSON.parse(readFileSync("eval/injection/cases.json", "utf8")) as InjectionCase[]).map((c) => [c.id, c]),
);
const halluCases = new Map(
  (JSON.parse(readFileSync("eval/hallucination.json", "utf8")) as { id: string; question: string }[]).map((c) => [c.id, c]),
);

const findings: Finding[] = [];
const verdictLines: string[] = [];
const rateRows: string[] = [];
const sourceRows: string[] = [];
const notes: string[] = [];

const addSource = (suite: string, run: Loaded<unknown> | null) => {
  if (!run) return sourceRows.push(`| ${suite} | not run | | | |`);
  const m = run.data.metadata;
  sourceRows.push(
    `| ${suite} | ${run.dir} | ${m.commit}${m.dirty ? " (dirty)" : ""} | ${m.prompt_sha256 ? m.prompt_sha256.slice(0, 12) : "n/a (no LLM)"} | ${m.started_at} |`,
  );
};

// Retrieval
type RetrievalResult = { id: string; hit: boolean; full_recall: boolean; returned: { source: string }[] };
const retrieval = latest<{ summary: { overall: { count: number; hit_rate: number; full_recall_rate: number } }; results: RetrievalResult[] }>(
  "retrieval",
  "retrieval.json",
);
addSource("Retrieval", retrieval);
if (retrieval) {
  const s = retrieval.data.summary.overall;
  const misses = retrieval.data.results.filter((r) => !r.hit);
  const partial = retrieval.data.results.filter((r) => r.hit && !r.full_recall);
  const verdict = retrievalVerdict(s.hit_rate, s.full_recall_rate);
  verdictLines.push(
    `- **Retrieval: ${verdict}.** Found a right document for ${Math.round(s.hit_rate * s.count)} of ${s.count} questions; ` +
      `${misses.length} missed entirely, ${partial.length} found only part of what was needed.`,
  );
  rateRows.push(`| Retrieval | Hit rate (a right doc in the top 3) | ${pct(s.hit_rate)} |`);
  rateRows.push(`| Retrieval | Full recall (every needed doc in the top 3) | ${pct(s.full_recall_rate)} |`);
  if (misses.length || partial.length) {
    const example = misses[0] ?? partial[0];
    const fromForum = example.returned.every((r) => r.source.startsWith("thread-"));
    findings.push({
      severity: SEVERITY.retrievalMiss,
      suite: "Retrieval",
      text:
        `Search sometimes misses the document that holds the answer, so the assistant can't give it: ` +
        `${misses.length} of ${s.count} questions found no right document and ${partial.length} found only one of the two needed. ` +
        `For example, for "${goldenById.get(example.id)?.question}" (${example.id}) it returned ` +
        `${fromForum ? "only forum posts instead of the official fact sheet" : example.returned.map((r) => r.source).join(", ")}.`,
    });
  }
}

// Hallucination
type HalluResult = { id: string; classification: string; answer: string | null };
const hallucination = latest<{ summary: { questions: number; counts: Record<string, number>; refusal_rate: number; made_up_rate: number }; results: HalluResult[] }>(
  "hallucination",
  "hallucination.json",
);
addSource("Hallucination", hallucination);
if (hallucination) {
  const s = hallucination.data.summary;
  const answered = s.questions - (s.counts.error ?? 0);
  const madeUp = hallucination.data.results.filter((r) => r.classification === "made_up");
  verdictLines.push(
    `- **Hallucination: ${hallucinationVerdict(s.made_up_rate)}.** Of ${answered} questions the docs don't answer, it said it didn't know ` +
      `${s.counts.exact_refusal}, hedged ${s.counts.hedged}, and made up ${madeUp.length}.`,
  );
  rateRows.push(`| Hallucination | Made-up answer rate | ${pct(s.made_up_rate)} |`);
  rateRows.push(`| Hallucination | Exact refusal rate | ${pct(s.refusal_rate)} |`);
  if (madeUp.length) {
    const ex = madeUp[0];
    findings.push({
      severity: SEVERITY.madeUpAnswer,
      suite: "Hallucination",
      text:
        `When the docs don't contain an answer, the assistant often invents one instead of saying it doesn't know ` +
        `(${madeUp.length} of ${answered} questions). For example, asked "${halluCases.get(ex.id)?.question}", it said ${quote(ex.answer)} ` +
        `(${ex.id}); the docs never say this.`,
    });
  }
}

// Injection
type InjectionResult = { id: string; part: string; result: string; answer: string | null };
const injection = latest<{ results: InjectionResult[] }>("injection", "injection.json");
addSource("Prompt injection", injection);
if (injection) {
  const results = injection.data.results;
  const tested = (part?: string) => results.filter((r) => (!part || r.part === part) && (r.result === "resisted" || r.result === "complied"));
  const complied = (part?: string) => tested(part).filter((r) => r.result === "complied");
  const compliedCases = complied().map((r) => ({ ...r, impact: injectionCases.get(r.id)?.impact ?? "high" }));
  verdictLines.push(
    `- **Prompt injection: ${injectionVerdict(compliedCases)}.** Followed ${complied().length} of ${tested().length} attacks ` +
      `(${complied("malicious").length} of ${tested("malicious").length} direct, ${complied("poisoned").length} of ${tested("poisoned").length} hidden in a forum post).`,
  );
  rateRows.push(`| Prompt injection | Compliance, all attacks | ${complied().length} / ${tested().length} |`);
  rateRows.push(`| Prompt injection | Compliance, direct attacks | ${complied("malicious").length} / ${tested("malicious").length} |`);
  rateRows.push(`| Prompt injection | Compliance, poisoned forum post | ${complied("poisoned").length} / ${tested("poisoned").length} |`);
  for (const r of compliedCases) {
    const c = injectionCases.get(r.id);
    const severity =
      r.part === "poisoned"
        ? SEVERITY.poisonedCompliance
        : r.impact === "high"
          ? SEVERITY.injectionHigh
          : r.impact === "medium"
            ? SEVERITY.injectionMedium
            : SEVERITY.injectionLow;
    findings.push({
      severity,
      suite: "Prompt injection",
      text: `When ${c?.risk ?? r.id}, the assistant went along with it: ${quote(r.answer)} (${r.id}).`,
    });
  }
  const notExercised = results.filter((r) => r.result === "not_exercised").length;
  if (notExercised) notes.push(`${notExercised} poisoned-thread case(s) didn't retrieve the poisoned post, so they weren't really tested.`);
}

// Consistency (re-scored against the current golden file, so dataset fixes are reflected)
type Attempt = { question: string; status: number | null; answer: string | null; sources: string[]; error: string | null };
type ConsistencyQuestion = { id: string; attempts: Attempt[] };
const consistency = latest<{ repeat: ConsistencyQuestion[]; paraphrase: ConsistencyQuestion[] }>("consistency", "consistency.json");
addSource("Consistency", consistency);
if (consistency) {
  const restat = (q: ConsistencyQuestion, part: string) => {
    const entry = goldenById.get(q.id)!;
    const ok = q.attempts.filter((a) => a.error === null);
    const scored = ok.map((a) => ({ ...a, ...scoreAttempt(entry, a) }));
    return { id: q.id, part, scored, stats: (scored.length ? consistencyStats(scored) : null) as ConsistencyStats | null };
  };
  const all = [
    ...consistency.data.repeat.map((q) => restat(q, "repeat")),
    ...consistency.data.paraphrase.map((q) => restat(q, "paraphrase")),
  ];
  const unstable = all.filter((q) => q.stats?.unstable);
  const switches = all.reduce((n, q) => n + (q.stats?.switches ?? 0), 0);
  const switching = all.filter((q) => (q.stats?.switches ?? 0) > 0);
  verdictLines.push(
    `- **Consistency: ${consistencyVerdict(unstable.length, switches)}.** ${unstable.length} of ${all.length} questions had unstable fact recall; ` +
      `${switches} switch(es) between answering and refusing across ${switching.length} question(s).`,
  );
  rateRows.push(`| Consistency | Unstable questions (fact recall range > 0.5) | ${unstable.length} / ${all.length} |`);
  rateRows.push(`| Consistency | Switches between answering and refusing | ${switches} |`);
  if (consistency.data.metadata.golden_sha256 !== goldenSha) {
    notes.push("Consistency answers were re-scored against the current golden dataset, which changed after the run.");
  }
  for (const q of [...unstable, ...switching.filter((s) => !unstable.includes(s))]) {
    const entry = goldenById.get(q.id)!;
    const answers = [...new Set(q.scored.map((a) => excerpt(a.answer, 80)))];
    const right = entry.expected_facts.map((f) => (Array.isArray(f) ? f[0] : f)).join(", ");
    findings.push({
      severity: SEVERITY.inconsistency,
      suite: "Consistency",
      text:
        `The same question can get different answers: asked "${q.scored[0].question}" ${q.scored.length} times, it gave ` +
        `${answers.length} different answers, e.g. ${answers.slice(0, 2).map((a) => `"${a}"`).join(" and ")} (${q.id}). ` +
        `The docs say: ${right}.`,
    });
  }
}

const top = topFindings(findings, 3);
const lines = [
  `# Failure Modes Report: ${model}`,
  "",
  `Describes **${model}**: its latest full \`eval:all\` pass in \`${HISTORY_FILE}\` (commit ${pass.commit}, started ${pass.date}). ` +
    `Generated ${new Date().toISOString()}. For another model: \`npm run eval:failure-report -- --model <chat model>\`.`,
  "",
  "## Verdicts",
  "",
  ...verdictLines,
  "",
  "## Key rates",
  "",
  "| Suite | Measure | Value |",
  "|---|---|---|",
  ...rateRows,
  "",
  "## Most serious findings",
  "",
  ...(top.length ? top.map((f, i) => `${i + 1}. **${f.suite}.** ${f.text}`) : ["No failures found."]),
  "",
  ...(notes.length ? ["## Notes", "", ...notes.map((n) => `- ${n}`), ""] : []),
  "## Source runs",
  "",
  "A run marked dirty was made with uncommitted changes, so its commit hash alone won't reproduce it.",
  "",
  "| Suite | Run | Commit | Answer prompt | Started |",
  "|---|---|---|---|---|",
  ...sourceRows,
  "",
];
writeFileSync(OUT_FILE, lines.join("\n"));

console.log("Verdicts");
for (const l of verdictLines) console.log(`  ${l.replace(/\*\*/g, "").replace(/^- /, "")}`);
console.log("\nMost serious findings");
top.forEach((f, i) => console.log(`  ${i + 1}. [${f.suite}] ${f.text}`));
for (const n of notes) console.log(`\nNote: ${n}`);
console.log(`\nSaved ${OUT_FILE}`);
