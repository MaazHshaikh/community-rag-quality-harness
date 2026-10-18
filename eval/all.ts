// Runs every eval suite end to end against an app it starts itself, from a clean git tree, so
// the results are reproducible from the commit hash. Run with: npm run eval:all
// Ends by appending one summary line to eval/history.jsonl.
// The LLM judge is not included (about 50 minutes); run npm run eval:judge separately.
import { type ChildProcess, execSync, spawn } from "node:child_process";
import { createWriteStream, existsSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { isDirty } from "./appClient.js";
import { RUNS_DIR } from "./runDir.js";

const PORT = 3100;
const BASE_URL = `http://localhost:${PORT}`;
const STARTUP_TIMEOUT_MS = 180_000;

type Mode = "ollama" | "injection";

const ENV_FILES: Record<Mode, string[]> = {
  ollama: [".env"],
  injection: [".env", ".env.injection"],
};

// The ordered plan. Each step is an npm script run against the app in the given mode.
const PLAN: { mode: Mode; scripts: string[] }[] = [
  { mode: "ollama", scripts: ["eval:run", "eval", "eval:retrieval", "eval:hallucination", "eval:consistency"] },
  { mode: "injection", scripts: ["eval:injection"] },
];

class StepError extends Error {}

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
  if (await isUp()) {
    console.error(`Port ${PORT} is already in use. Stop whatever is running there first.`);
    process.exit(1);
  }

  const commit = execSync("git rev-parse --short HEAD", { encoding: "utf8" }).trim();
  const before = listRuns();
  const started = Date.now();
  console.log(`eval:all at commit ${commit}`);

  for (const phase of PLAN) {
    await startApp(phase.mode);
    for (const script of phase.scripts) await runScript(script);
    await stopApp();
  }
  await runScript("eval:failure-report");

  const created = [...listRuns()].filter((d) => !before.has(d)).sort();
  await runScript("eval:history", created);
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
