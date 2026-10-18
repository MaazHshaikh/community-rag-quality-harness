// Measures retrieval alone: sends every golden question to /search on a running app
// (npm run dev, Ollama mode) and checks whether the expected docs come back in the top 3.
// Run with: npm run eval:retrieval
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { BASE_URL, connectToOllamaApp, git, isDirty, requireEnv, runIdFor } from "./appClient.js";
import {
  firstExpectedRank,
  hasFullRecall,
  isHit,
  type RetrievalOutcome,
  summarizeRetrieval,
  TOP_K,
} from "./retrievalMetrics.js";
import type { Category, GoldenEntry } from "./scoring.js";

const CATEGORIES: Category[] = ["single_fact", "multi_doc", "conflict"];

interface SearchResult {
  source: string;
  score: number;
}

interface QuestionResult extends RetrievalOutcome {
  id: string;
  category: Category;
  expected_sources: string[];
  returned: SearchResult[];
  missing_sources: string[];
  error: string | null;
}

async function search(query: string, token: string): Promise<SearchResult[]> {
  const response = await fetch(`${BASE_URL}/search`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ query }),
    signal: AbortSignal.timeout(60_000),
  });
  const body = (await response.json().catch(() => ({}))) as { results?: SearchResult[]; error?: string };
  if (!response.ok) throw new Error(body.error ?? `HTTP ${response.status}`);
  return (body.results ?? []).map((r) => ({ source: r.source, score: Math.round(r.score * 1000) / 1000 }));
}

async function main() {
  const token = requireEnv("API_TOKEN");
  const goldenText = readFileSync("eval/golden.json", "utf8");
  const golden = JSON.parse(goldenText) as GoldenEntry[];
  const meta = await connectToOllamaApp(token);
  const startedAt = new Date();

  console.log(`Checking retrieval for ${golden.length} questions against ${BASE_URL} (${meta.embed_model}, top ${TOP_K})\n`);

  const results: QuestionResult[] = [];
  for (const entry of golden) {
    let returned: SearchResult[] = [];
    let error: string | null = null;
    try {
      returned = await search(entry.question, token);
    } catch (err) {
      error = String(err instanceof Error ? err.message : err);
    }
    const sources = returned.map((r) => r.source);
    const top = new Set(sources.slice(0, TOP_K));
    results.push({
      id: entry.id,
      category: entry.category,
      expected_sources: entry.expected_sources,
      returned,
      hit: isHit(entry.expected_sources, sources),
      full_recall: hasFullRecall(entry.expected_sources, sources),
      first_rank: firstExpectedRank(entry.expected_sources, sources),
      missing_sources: entry.expected_sources.filter((s) => !top.has(s)),
      error,
    });
  }

  const summary = {
    overall: summarizeRetrieval(results),
    by_category: Object.fromEntries(
      CATEGORIES.map((c) => [c, summarizeRetrieval(results.filter((r) => r.category === c))]),
    ),
  };

  const runDir = path.join("eval", "runs", runIdFor(startedAt));
  mkdirSync(runDir, { recursive: true });
  const outFile = path.join(runDir, "retrieval.json");
  writeFileSync(
    outFile,
    JSON.stringify(
      {
        metadata: {
          kind: "retrieval",
          started_at: startedAt.toISOString(),
          base_url: BASE_URL,
          commit: git("rev-parse --short HEAD"),
          dirty: isDirty(),
          embed_provider: meta.embed_provider,
          embed_model: meta.embed_model,
          top_k: TOP_K,
          golden_sha256: createHash("sha256").update(goldenText).digest("hex"),
          question_count: golden.length,
        },
        summary,
        results,
      },
      null,
      2,
    ) + "\n",
  );

  const pct = (v: number) => `${(v * 100).toFixed(1)}%`.padStart(9);
  const num = (v: number | null) => (v === null ? "-" : v.toFixed(2)).padStart(10);
  console.log("category      n   hit rate  full recall  first rank        MRR");
  for (const [name, s] of [...Object.entries(summary.by_category), ["overall", summary.overall] as const]) {
    console.log(
      `${name.padEnd(12)} ${String(s.count).padStart(2)}  ${pct(s.hit_rate)}  ${pct(s.full_recall_rate).padStart(11)}  ` +
        `${num(s.mean_first_rank)}  ${num(s.mrr)}`,
    );
  }

  const describe = (r: QuestionResult) =>
    r.error ? `error: ${r.error}` : r.returned.map((x) => `${x.source} (${x.score})`).join(", ");
  const misses = results.filter((r) => !r.hit);
  const partial = results.filter((r) => r.hit && !r.full_recall);
  console.log(`\nMisses (no expected source in top ${TOP_K}): ${misses.length}`);
  for (const r of misses) console.log(`  ${r.id}: expected ${r.expected_sources.join(", ")}\n    got ${describe(r)}`);
  console.log(`\nPartial (some expected sources missing): ${partial.length}`);
  for (const r of partial) {
    console.log(`  ${r.id}: missing ${r.missing_sources.join(", ")} (first expected at rank ${r.first_rank})\n    got ${describe(r)}`);
  }
  console.log(`\nSaved ${outFile}`);
}

await main();
