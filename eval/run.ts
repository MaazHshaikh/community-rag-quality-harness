// Sends every golden question to a running app (npm run dev, Ollama mode) and saves the raw
// answers for later scoring. Run with: npm run eval:run
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { askQuestion, type AskOutcome, BASE_URL, connectToOllamaApp, fetchMeta, git, type Meta, requireEnv, runIdFor, waitForHealth } from "./appClient.js";

interface GoldenEntry {
  id: string;
  question: string;
}

type AnswerRecord = { id: string } & AskOutcome;

function percentile(sorted: number[], p: number): number {
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)];
}

async function main() {
  const token = requireEnv("API_TOKEN");
  const golden = JSON.parse(readFileSync("eval/golden.json", "utf8")) as GoldenEntry[];

  const meta = await connectToOllamaApp(token);

  const startedAt = new Date();
  const metadata = {
    started_at: startedAt.toISOString(),
    base_url: BASE_URL,
    commit: git("rev-parse --short HEAD"),
    dirty: git("status --porcelain") !== "",
    ...meta,
    question_count: golden.length,
  };

  console.log(
    `Running ${golden.length} questions against ${BASE_URL} ` +
      `(${meta.chat_model}, temp ${meta.temperature}, prompt ${meta.prompt_sha256.slice(0, 12)})`,
  );

  const results: AnswerRecord[] = [];
  const metaSnapshots: Meta[] = [];
  for (const [i, entry] of golden.entries()) {
    let record = { id: entry.id, ...(await askQuestion(entry.question, token)) };

    // A network error usually means npm run dev is restarting (it watches src/ and prompts/).
    // Wait for the app, note its config, and retry once. Timeouts and HTTP errors aren't retried.
    if (record.status === null && !record.error?.startsWith("TimeoutError") && (await waitForHealth())) {
      console.log(`[${i + 1}/${golden.length}] ${entry.id} app restarted; retrying`);
      const snapshot = await fetchMeta(token).catch(() => null);
      if (snapshot) metaSnapshots.push(snapshot);
      record = { id: entry.id, ...(await askQuestion(entry.question, token)) };
    }
    results.push(record);
    const outcome = record.error ? `FAIL ${record.status ?? "network"}: ${record.error}` : "ok";
    console.log(`[${i + 1}/${golden.length}] ${entry.id} ${record.latency_ms}ms ${outcome}`);

    if (record.status === 401) {
      console.error("401 Unauthorized: the app's API_TOKEN differs from .env. Is it running with npm run dev?");
      process.exit(1);
    }
  }

  // npm run dev restarts when prompts/ or src/ change; a restart mid-run can mix two configurations.
  // Compare every config seen (after restarts and at the end) with the one at the start.
  // null means the app couldn't be asked at the end, so a change can't be ruled out.
  const metaAtEnd = await fetchMeta(token).catch(() => null);
  if (metaAtEnd) metaSnapshots.push(metaAtEnd);
  const changed = metaSnapshots.find((m) => JSON.stringify(m) !== JSON.stringify(meta));
  const configChanged: boolean | null = changed ? true : metaAtEnd ? false : null;

  const finishedAt = new Date();
  const runId = runIdFor(startedAt);
  const runDir = path.join("eval", "runs", runId);
  mkdirSync(runDir, { recursive: true });
  const outFile = path.join(runDir, "answers.json");
  writeFileSync(
    outFile,
    JSON.stringify(
      {
        metadata: {
          ...metadata,
          finished_at: finishedAt.toISOString(),
          duration_ms: finishedAt.getTime() - startedAt.getTime(),
          config_changed_during_run: configChanged,
          ...(changed ? { changed_meta: changed } : {}),
        },
        results,
      },
      null,
      2,
    ) + "\n",
  );

  const failed = results.filter((r) => r.error);
  const latencies = results.filter((r) => !r.error).map((r) => r.latency_ms).sort((a, b) => a - b);
  console.log("\nSummary");
  console.log(`  succeeded: ${results.length - failed.length}/${results.length}`);
  if (failed.length) console.log(`  failed:    ${failed.map((r) => `${r.id} (${r.status ?? "network"})`).join(", ")}`);
  if (latencies.length) {
    console.log(
      `  latency:   median ${percentile(latencies, 50)}ms, p95 ${percentile(latencies, 95)}ms, ` +
        `max ${latencies[latencies.length - 1]}ms`,
    );
  }
  console.log(`  duration:  ${((finishedAt.getTime() - startedAt.getTime()) / 1000).toFixed(1)}s`);
  console.log(`  saved:     ${outFile}`);
  if (metadata.dirty) console.log("  note:      working tree has uncommitted changes; commit hash alone won't reproduce this run");
  if (configChanged) console.log("  WARNING:   app configuration changed during the run (see changed_meta); results mix two setups");
  if (configChanged === null) console.log("  WARNING:   app unreachable at the end; can't confirm the configuration stayed the same");
}

await main();
