// Shared helpers for eval scripts that talk to a running app (npm run dev, Ollama mode).
import { execSync } from "node:child_process";

export const BASE_URL = process.env.EVAL_BASE_URL ?? `http://localhost:${process.env.PORT ?? 3000}`;

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env var ${name} in .env`);
  return value;
}

export function git(command: string): string {
  return execSync(`git ${command}`, { encoding: "utf8" }).trim();
}

// Eval outputs written into the repo. They don't change behaviour, so they don't make a run dirty;
// otherwise every suite after the first in `npm run eval:all` would be marked dirty.
export const EVAL_OUTPUTS = ["eval/runs", "eval/failure-modes.md"];

// True when code, config, docs, or prompts have uncommitted changes.
export function isDirty(): boolean {
  const excludes = EVAL_OUTPUTS.map((p) => `":(exclude)${p}"`).join(" ");
  return git(`status --porcelain -- . ${excludes}`) !== "";
}

export interface Meta {
  llm_provider: string;
  chat_model: string | null;
  temperature: number | null;
  max_output_tokens: number | null;
  embed_provider: string;
  embed_model: string | null;
  prompt_file: string;
  prompt_sha256: string;
  extra_docs_dir: string | null;
}

// The app reports its own configuration, so a run records what actually answered.
export async function fetchMeta(token: string): Promise<Meta> {
  const response = await fetch(`${BASE_URL}/meta`, { headers: { Authorization: `Bearer ${token}` } });
  if (response.status === 401) {
    console.error("401 Unauthorized: the app's API_TOKEN differs from .env. Is it running with npm run dev?");
    process.exit(1);
  }
  if (!response.ok) throw new Error(`GET /meta failed with HTTP ${response.status}`);
  return (await response.json()) as Meta;
}

// Fail fast if the app is down, uses a different token, is in stub mode, or has the wrong
// corpus: baseline evals need the standard docs only; the injection eval needs the extra docs.
export async function connectToOllamaApp(token: string, { extraDocs = false } = {}): Promise<Meta> {
  const health = await fetch(`${BASE_URL}/health`).catch(() => null);
  if (!health?.ok) {
    console.error(`App not reachable at ${BASE_URL}. Start it with: npm run dev`);
    process.exit(1);
  }
  const meta = await fetchMeta(token);
  if (meta.llm_provider === "stub" || meta.embed_provider === "stub") {
    console.error("The app is in stub mode; stub results can't be evaluated. Start it with: npm run dev");
    process.exit(1);
  }
  if (extraDocs && !meta.extra_docs_dir) {
    console.error("This eval needs the injection docs loaded. Start the app with: npm run dev:injection");
    process.exit(1);
  }
  if (!extraDocs && meta.extra_docs_dir) {
    console.error(`The app has extra docs loaded (${meta.extra_docs_dir}), which would skew this eval. Start it with: npm run dev`);
    process.exit(1);
  }
  return meta;
}

const RESTART_WAIT_MS = 60_000;

export async function waitForHealth(): Promise<boolean> {
  const deadline = Date.now() + RESTART_WAIT_MS;
  while (Date.now() < deadline) {
    const health = await fetch(`${BASE_URL}/health`).catch(() => null);
    if (health?.ok) return true;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  return false;
}

export interface AskOutcome {
  status: number | null; // null when no HTTP response arrived (network error or timeout)
  latency_ms: number;
  answer: string | null;
  sources: string[];
  error: string | null;
}

const ASK_TIMEOUT_MS = 120_000;

export async function askQuestion(question: string, token: string): Promise<AskOutcome> {
  const started = performance.now();
  const elapsed = () => Math.round(performance.now() - started);
  try {
    const response = await fetch(`${BASE_URL}/ask`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ question }),
      signal: AbortSignal.timeout(ASK_TIMEOUT_MS),
    });
    const body = (await response.json().catch(() => ({}))) as { answer?: string; sources?: string[]; error?: string };
    if (!response.ok) {
      return { status: response.status, latency_ms: elapsed(), answer: null, sources: [], error: body.error ?? `HTTP ${response.status}` };
    }
    return { status: response.status, latency_ms: elapsed(), answer: body.answer ?? null, sources: body.sources ?? [], error: null };
  } catch (err) {
    return { status: null, latency_ms: elapsed(), answer: null, sources: [], error: String(err) };
  }
}

// Folder name for a new run: the ISO start time with characters Windows paths can't hold replaced.
export const runIdFor = (startedAt: Date) => startedAt.toISOString().replace(/[:.]/g, "-");
