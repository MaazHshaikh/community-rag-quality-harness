// Sends every golden question to a running app (npm run dev, Ollama mode) and saves the raw
// answers for later scoring. Run with: npm run eval:run
import { execSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

interface GoldenEntry {
  id: string;
  question: string;
}

interface AnswerRecord {
  id: string;
  status: number | null; // null when no HTTP response arrived (network error or timeout)
  latency_ms: number;
  answer: string | null;
  sources: string[];
  error: string | null;
}

const BASE_URL = process.env.EVAL_BASE_URL ?? `http://localhost:${process.env.PORT ?? 3000}`;
const REQUEST_TIMEOUT_MS = 120_000;

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env var ${name} in .env`);
  return value;
}

function git(command: string): string {
  return execSync(`git ${command}`, { encoding: "utf8" }).trim();
}

interface Meta {
  llm_provider: string;
  chat_model: string | null;
  temperature: number | null;
  max_output_tokens: number | null;
  embed_provider: string;
  embed_model: string | null;
  prompt_file: string;
  prompt_sha256: string;
}

// The app reports its own configuration, so the run records what actually answered.
async function fetchMeta(token: string): Promise<Meta> {
  const response = await fetch(`${BASE_URL}/meta`, { headers: { Authorization: `Bearer ${token}` } });
  if (response.status === 401) {
    console.error("401 Unauthorized: the app's API_TOKEN differs from .env. Is it running with npm run dev?");
    process.exit(1);
  }
  if (!response.ok) throw new Error(`GET /meta failed with HTTP ${response.status}`);
  return (await response.json()) as Meta;
}

async function ask(question: string, token: string): Promise<Omit<AnswerRecord, "id">> {
  const started = performance.now();
  const elapsed = () => Math.round(performance.now() - started);
  try {
    const response = await fetch(`${BASE_URL}/ask`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ question }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const body = (await response.json().catch(() => ({}))) as {
      answer?: string;
      sources?: string[];
      error?: string;
    };
    if (!response.ok) {
      return {
        status: response.status,
        latency_ms: elapsed(),
        answer: null,
        sources: [],
        error: body.error ?? `HTTP ${response.status}`,
      };
    }
    return {
      status: response.status,
      latency_ms: elapsed(),
      answer: body.answer ?? null,
      sources: body.sources ?? [],
      error: null,
    };
  } catch (err) {
    return { status: null, latency_ms: elapsed(), answer: null, sources: [], error: String(err) };
  }
}

const RESTART_WAIT_MS = 60_000;

async function waitForHealth(): Promise<boolean> {
  const deadline = Date.now() + RESTART_WAIT_MS;
  while (Date.now() < deadline) {
    const health = await fetch(`${BASE_URL}/health`).catch(() => null);
    if (health?.ok) return true;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  return false;
}

function percentile(sorted: number[], p: number): number {
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)];
}

async function main() {
  const token = requireEnv("API_TOKEN");
  const golden = JSON.parse(readFileSync("eval/golden.json", "utf8")) as GoldenEntry[];

  // Fail fast if the app is down, uses a different token, or is in stub mode.
  const health = await fetch(`${BASE_URL}/health`).catch(() => null);
  if (!health?.ok) {
    console.error(`App not reachable at ${BASE_URL}. Start it with: npm run dev`);
    process.exit(1);
  }
  const meta = await fetchMeta(token);
  if (meta.llm_provider === "stub" || meta.embed_provider === "stub") {
    console.error("The app is in stub mode; stub answers can't be evaluated. Start it with: npm run dev");
    process.exit(1);
  }

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
    let record = { id: entry.id, ...(await ask(entry.question, token)) };

    // A network error usually means npm run dev is restarting (it watches src/ and prompts/).
    // Wait for the app, note its config, and retry once. Timeouts and HTTP errors aren't retried.
    if (record.status === null && !record.error?.startsWith("TimeoutError") && (await waitForHealth())) {
      console.log(`[${i + 1}/${golden.length}] ${entry.id} app restarted; retrying`);
      const snapshot = await fetchMeta(token).catch(() => null);
      if (snapshot) metaSnapshots.push(snapshot);
      record = { id: entry.id, ...(await ask(entry.question, token)) };
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
  const runId = startedAt.toISOString().replace(/[:.]/g, "-");
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
