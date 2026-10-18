// Consistency eval: the same question asked repeatedly, and reworded questions, scored against
// the same golden facts. Run with: npm run eval:consistency   (app running with npm run dev)
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { askQuestion, BASE_URL, connectToOllamaApp, git, requireEnv, runIdFor } from "./appClient.js";
import { consistencyStats, type ConsistencyStats, isRefusal, UNSTABLE_RANGE } from "./consistencyMetrics.js";
import { classifyAnswer } from "./hallucinationClassifier.js";
import { type GoldenEntry, normalize, scoreAnswer } from "./scoring.js";

const CONFIG_FILE = "eval/consistency.json";

interface Config {
  repeat: { times: number; ids: string[] };
  paraphrase: { id: string; wordings: string[] }[];
}

interface Attempt {
  question: string;
  status: number | null;
  answer: string | null;
  sources: string[];
  error: string | null;
  fact_recall: number;
  refused: boolean;
}

interface QuestionResult {
  id: string;
  category: string;
  attempts: Attempt[];
  stats: ConsistencyStats | null;
  errors: number;
}

function loadConfig(goldenById: Map<string, GoldenEntry>): { config: Config; text: string } {
  const text = readFileSync(CONFIG_FILE, "utf8");
  const config = JSON.parse(text) as Config;
  for (const id of [...config.repeat.ids, ...config.paraphrase.map((p) => p.id)]) {
    if (!goldenById.has(id)) throw new Error(`${CONFIG_FILE}: unknown golden id ${id}`);
  }
  for (const p of config.paraphrase) {
    const original = normalize(goldenById.get(p.id)!.question);
    if (p.wordings.some((w) => normalize(w) === original)) throw new Error(`${p.id}: a paraphrase repeats the golden wording`);
  }
  return { config, text };
}

async function attempt(entry: GoldenEntry, question: string, token: string): Promise<Attempt> {
  const outcome = await askQuestion(question, token);
  const score = scoreAnswer(entry, { id: entry.id, ...outcome });
  const cls = classifyAnswer(outcome.error ? null : outcome.answer);
  return {
    question,
    status: outcome.status,
    answer: outcome.answer,
    sources: outcome.sources,
    error: outcome.error,
    fact_recall: score.fact_recall,
    refused: isRefusal(cls, score.fact_recall),
  };
}

function summarize(entry: GoldenEntry, attempts: Attempt[]): QuestionResult {
  // Failed requests are counted but left out of the statistics; they measure uptime, not consistency.
  const ok = attempts.filter((a) => a.error === null);
  return {
    id: entry.id,
    category: entry.category,
    attempts,
    stats: ok.length ? consistencyStats(ok) : null,
    errors: attempts.length - ok.length,
  };
}

function printTable(title: string, results: QuestionResult[]) {
  console.log(`\n${title}`);
  console.log("id           n  recall mean  stdev  range  answered/refused  switches  source sets  flag");
  for (const r of results) {
    const s = r.stats;
    if (!s) {
      console.log(`${r.id.padEnd(12)} all ${r.errors} attempts failed`);
      continue;
    }
    console.log(
      `${r.id.padEnd(12)} ${String(s.attempts).padStart(1)}  ${s.fact_recall_mean.toFixed(2).padStart(11)}  ` +
        `${s.fact_recall_stdev.toFixed(2).padStart(5)}  ${s.fact_recall_range.toFixed(2).padStart(5)}  ` +
        `${`${s.answered}/${s.refused}`.padStart(16)}  ${String(s.switches).padStart(8)}  ` +
        `${String(s.distinct_source_sets).padStart(11)}  ${s.unstable ? "UNSTABLE" : ""}` +
        `${r.errors ? `  (${r.errors} errors)` : ""}`,
    );
  }
}

async function main() {
  const token = requireEnv("API_TOKEN");
  const goldenText = readFileSync("eval/golden.json", "utf8");
  const golden = JSON.parse(goldenText) as GoldenEntry[];
  const goldenById = new Map(golden.map((g) => [g.id, g]));
  const { config, text: configText } = loadConfig(goldenById);
  const meta = await connectToOllamaApp(token);
  const startedAt = new Date();
  const total = config.repeat.ids.length * config.repeat.times + config.paraphrase.reduce((n, p) => n + p.wordings.length, 0);
  console.log(`Consistency: ${total} requests to ${BASE_URL} (${meta.chat_model}, temperature ${meta.temperature})`);

  let done = 0;
  const progress = (id: string, a: Attempt) =>
    console.log(`[${++done}/${total}] ${id} recall ${a.fact_recall.toFixed(2)}${a.refused ? " refused" : ""}${a.error ? ` error: ${a.error}` : ""}`);

  const repeat: QuestionResult[] = [];
  for (const id of config.repeat.ids) {
    const entry = goldenById.get(id)!;
    const attempts: Attempt[] = [];
    for (let i = 0; i < config.repeat.times; i++) {
      const a = await attempt(entry, entry.question, token);
      attempts.push(a);
      progress(id, a);
    }
    repeat.push(summarize(entry, attempts));
  }

  const paraphrase: QuestionResult[] = [];
  for (const p of config.paraphrase) {
    const entry = goldenById.get(p.id)!;
    const attempts: Attempt[] = [];
    for (const wording of p.wordings) {
      const a = await attempt(entry, wording, token);
      attempts.push(a);
      progress(p.id, a);
    }
    paraphrase.push(summarize(entry, attempts));
  }

  const runDir = path.join("eval", "runs", runIdFor(startedAt));
  mkdirSync(runDir, { recursive: true });
  const outFile = path.join(runDir, "consistency.json");
  const sha = (text: string) => createHash("sha256").update(text).digest("hex");
  writeFileSync(
    outFile,
    JSON.stringify(
      {
        metadata: {
          kind: "consistency",
          started_at: startedAt.toISOString(),
          base_url: BASE_URL,
          commit: git("rev-parse --short HEAD"),
          dirty: git("status --porcelain") !== "",
          ...meta,
          unstable_range: UNSTABLE_RANGE,
          config_file: CONFIG_FILE,
          config_sha256: sha(configText),
          golden_sha256: sha(goldenText),
        },
        repeat,
        paraphrase,
      },
      null,
      2,
    ) + "\n",
  );

  printTable(`Repeat: same question ${config.repeat.times} times`, repeat);
  printTable("Paraphrase: 3 wordings, same expected facts", paraphrase);
  const unstable = [...repeat.map((r) => ({ ...r, part: "repeat" })), ...paraphrase.map((r) => ({ ...r, part: "paraphrase" }))].filter(
    (r) => r.stats?.unstable,
  );
  console.log(`\nUnstable (fact recall range > ${UNSTABLE_RANGE}): ${unstable.length ? "" : "none"}`);
  for (const r of unstable) {
    console.log(`  ${r.id} (${r.part}): recall per attempt ${r.attempts.map((a) => a.fact_recall.toFixed(2)).join(", ")}`);
  }
  console.log(`\nSaved ${outFile}`);
}

await main();
