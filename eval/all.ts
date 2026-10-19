// Runs every eval suite end to end against an app it starts itself, from a clean git tree, so
// the results are reproducible from the commit hash. Run with: npm run eval:all
// To answer with another model, layer an env file over .env: npm run eval:all -- --layer .env.claude
// (or npm run eval:all:claude). Records the tokens the app reports for each suite in usage.json,
// then appends one summary line to eval/history.jsonl.
// The LLM judge is not included (about 50 minutes); run npm run eval:judge separately.
import { type ChildProcess, execSync, spawn } from "node:child_process";
import { createWriteStream, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { parseEnv } from "node:util";
import { isDirty, runIdFor } from "./appClient.js";
import { addUsage, estimateCostUsd, PRICES, subtractUsage, type UsageCounts, ZERO_USAGE } from "./cost.js";
import { RUNS_DIR } from "./runDir.js";

const PORT = 3100;
const BASE_URL = `http://localhost:${PORT}`;
const STARTUP_TIMEOUT_MS = 180_000;

type Mode = "standard" | "injection";

// Optional env files layered over .env (later files win), e.g. .env.claude to answer with Claude.
function parseLayers(argv: string[]): string[] {
  const layers: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--layer" && argv[i + 1]) layers.push(argv[++i]);
    else {
      console.error(`Unknown argument ${argv[i]}. Usage: npm run eval:all [-- --layer <env file>]...`);
      process.exit(1);
    }
  }
  return layers;
}
const LAYERS = parseLayers(process.argv.slice(2));

const ENV_FILES: Record<Mode, string[]> = {
  standard: [".env", ...LAYERS],
  injection: [".env", ...LAYERS, ".env.injection"],
};

// The ordered plan. Each step is an npm script run against the app in the given mode.
const PLAN: { mode: Mode; scripts: string[] }[] = [
  { mode: "standard", scripts: ["eval:run", "eval", "eval:retrieval", "eval:hallucination", "eval:consistency"] },
  { mode: "injection", scripts: ["eval:injection"] },
];

class StepError extends Error {}

// The app's API token as the app sees it, for GET /usage. Parsed here rather than loaded into
// process.env, because the app inherits this process's environment and an inherited variable
// would override the layered env files.
function appToken(mode: Mode): string {
  const merged = Object.assign({}, ...ENV_FILES[mode].map((f) => parseEnv(readFileSync(f, "utf8")))) as Record<string, string>;
  if (!merged.API_TOKEN) throw new StepError(`API_TOKEN is not set in ${ENV_FILES[mode].join(" + ")}`);
  return merged.API_TOKEN;
}

interface AppUsage extends UsageCounts {
  llm_provider: string;
  chat_model: string | null;
}

async function fetchUsage(token: string): Promise<AppUsage> {
  const res = await fetch(`${BASE_URL}/usage`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new StepError(`GET /usage failed with HTTP ${res.status}`);
  return (await res.json()) as AppUsage;
}

const counts = ({ requests, requests_without_usage, input_tokens, output_tokens, truncated }: UsageCounts): UsageCounts => ({
  requests,
  requests_without_usage,
  input_tokens,
  output_tokens,
  truncated,
});

let app: ChildProcess | null = null;
let appLog = "";

const elapsed = (start: number) => `${((Date.now() - start) / 1000).toFixed(0)}s`;

async function isUp(): Promise<boolean> {
  const res = await fetch(`${BASE_URL}/health`, { signal: AbortSignal.timeout(2000) }).catch(() => null);
  return res?.ok ?? false;
}

function tail(file: string, lines = 15): string {
  return existsSync(file) ? readFileSync(file, "utf8").trim().split("\n").slice(-lines).join("\n") : "(no log)";
}

async function startApp(mode: Mode) {
  appLog = path.join(tmpdir(), `eval-all-app-${mode}-${Date.now()}.log`);
  const log = createWriteStream(appLog);
  // node directly (not npx or tsx watch): one process to stop, and no restarts mid-run.
  const args = [...ENV_FILES[mode].map((f) => `--env-file=${f}`), "--import", "tsx", "src/server.ts"];
  app = spawn(process.execPath, args, { env: { ...process.env, PORT: String(PORT) }, stdio: ["ignore", "pipe", "pipe"] });
  app.stdout!.pipe(log);
  app.stderr!.pipe(log);

  let exited = false;
  app.once("exit", () => (exited = true));
  const started = Date.now();
  while (Date.now() - started < STARTUP_TIMEOUT_MS) {
    if (exited) throw new StepError(`App (${mode}) exited during startup. Log:\n${tail(appLog)}`);
    if (await isUp()) {
      console.log(`App started in ${mode} mode on port ${PORT} after ${elapsed(started)} (log: ${appLog})`);
      return;
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new StepError(`App (${mode}) didn't become healthy within ${STARTUP_TIMEOUT_MS / 1000}s. Log:\n${tail(appLog)}`);
}

async function stopApp() {
  if (!app || app.exitCode !== null) return (app = null);
  const proc = app;
  const exited = new Promise((r) => proc.once("exit", r));
  proc.kill();
  await Promise.race([exited, new Promise((r) => setTimeout(r, 5000))]);
  if (proc.exitCode === null) proc.kill("SIGKILL");
  app = null;
}

function runScript(script: string, args: string[] = []): Promise<void> {
  return new Promise((resolve, reject) => {
    console.log(`\n=== npm run ${script}${args.length ? ` -- ${args.join(" ")}` : ""} ===`);
    const started = Date.now();
    const child = spawn("npm", ["run", script, ...(args.length ? ["--", ...args] : [])], {
      shell: true,
      stdio: "inherit",
      env: { ...process.env, EVAL_BASE_URL: BASE_URL },
    });
    child.on("error", (err) => reject(new StepError(`npm run ${script} could not start: ${err.message}`)));
    child.on("exit", (code) => {
      if (code === 0) {
        console.log(`=== npm run ${script} done in ${elapsed(started)} ===`);
        resolve();
      } else {
        reject(new StepError(`npm run ${script} failed with exit code ${code}`));
      }
    });
  });
}

const listRuns = () => (existsSync(RUNS_DIR) ? new Set(readdirSync(RUNS_DIR)) : new Set<string>());

async function main() {
  // Eval outputs from an earlier pass don't count, so eval:all can run repeatedly at one commit.
  if (isDirty()) {
    const status = execSync("git status --porcelain", { encoding: "utf8" }).trim();
    console.error("eval:all needs a clean git tree so every run is reproducible from its commit. Commit or stash first:\n" + status);
    process.exit(1);
  }
  for (const file of LAYERS) {
    if (!existsSync(file)) {
      console.error(`Env file ${file} not found.`);
      process.exit(1);
    }
  }
  if (await isUp()) {
    console.error(`Port ${PORT} is already in use. Stop whatever is running there first.`);
    process.exit(1);
  }

  const commit = execSync("git rev-parse --short HEAD", { encoding: "utf8" }).trim();
  const before = listRuns();
  const started = Date.now();
  const startedAt = new Date();
  console.log(`eval:all at commit ${commit}${LAYERS.length ? ` with ${LAYERS.join(", ")} layered over .env` : ""}`);

  const suites: ({ mode: Mode; script: string } & UsageCounts)[] = [];
  let model: { llm_provider: string; chat_model: string | null } | null = null;
  for (const phase of PLAN) {
    await startApp(phase.mode);
    const token = appToken(phase.mode);
    for (const script of phase.scripts) {
      const usageBefore = await fetchUsage(token);
      await runScript(script);
      const usageAfter = await fetchUsage(token);
      model ??= { llm_provider: usageAfter.llm_provider, chat_model: usageAfter.chat_model };
      const used = subtractUsage(counts(usageAfter), counts(usageBefore));
      if (used.requests) suites.push({ mode: phase.mode, script, ...used });
    }
    await stopApp();
  }

  // Saved in its own run folder; eval:history adds the totals to the history line.
  const total = suites.reduce<UsageCounts>((sum, s) => addUsage(sum, s), ZERO_USAGE);
  const cost = estimateCostUsd(model?.chat_model ?? null, total);
  const usageDir = path.join(RUNS_DIR, runIdFor(startedAt));
  mkdirSync(usageDir, { recursive: true });
  const usageFile = {
    kind: "usage",
    started_at: startedAt.toISOString(),
    commit,
    env_files: ENV_FILES,
    ...model,
    suites,
    total,
    estimated_cost_usd: cost,
    price: model?.chat_model ? (PRICES[model.chat_model] ?? null) : null,
  };
  writeFileSync(path.join(usageDir, "usage.json"), JSON.stringify(usageFile, null, 2) + "\n");
  console.log(
    `\nTokens: ${total.input_tokens} in, ${total.output_tokens} out over ${total.requests} answers; ` +
      `estimated cost ${cost === null ? "unknown" : `$${cost.toFixed(4)}`}; ` +
      `${total.truncated ? `WARNING: ${total.truncated} answer(s) cut off at the output limit` : "no answers cut off"}`,
  );

  const created = [...listRuns()].filter((d) => !before.has(d)).sort();
  await runScript("eval:history", created);
  // After the history line, so the report can find this pass. It describes the gated model only.
  await runScript("eval:failure-report");
  console.log(`\neval:all finished in ${elapsed(started)} at commit ${commit}.`);
  console.log("New run folders:");
  for (const d of created) {
    const files = readdirSync(path.join(RUNS_DIR, d)).join(", ");
    console.log(`  ${d}: ${files}`);
  }
  console.log("Updated eval/failure-modes.md and appended to eval/history.jsonl. Chart it with: npm run eval:chart");
}

const shutdown = async (code: number) => {
  await stopApp();
  process.exit(code);
};
process.on("SIGINT", () => void shutdown(130));
process.on("SIGTERM", () => void shutdown(143));

try {
  await main();
} catch (err) {
  console.error(`\neval:all stopped: ${err instanceof Error ? err.message : String(err)}`);
  await shutdown(1);
}
