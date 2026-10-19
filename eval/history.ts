// Pure helpers for eval/history.jsonl: one summary line per full eval:all run, and the change
// markers the trend chart draws. Kept free of file I/O so they can be unit-tested.
import type { UsageCounts } from "./cost.js";
import { headlineScore } from "./reporting.js";

export const HISTORY_FILE = "eval/history.jsonl";

// The run files of one eval:all pass, as written by each suite.
export interface RunFiles {
  answers: {
    metadata: {
      started_at: string;
      commit: string;
      dirty: boolean;
      chat_model: string | null;
      prompt_sha256: string;
      config_changed_during_run?: boolean;
    };
  };
  scores: { golden_sha256: string; summary: { overall: { errors: number; fact_recall: number; source_recall: number } } };
  retrieval: { metadata: SuiteMeta; summary: { overall: { hit_rate: number } } };
  hallucination: { metadata: SuiteMeta; summary: { counts: { error: number }; made_up_rate: number } };
  injection: {
    metadata: SuiteMeta;
    summary: { overall: { resisted: number; complied: number; not_exercised: number; error: number } };
  };
  consistency: { metadata: SuiteMeta; repeat: ConsistencyQuestion[]; paraphrase: ConsistencyQuestion[] };
}

interface SuiteMeta {
  commit: string;
  dirty: boolean;
  chat_model?: string | null;
  prompt_sha256?: string;
  golden_sha256?: string;
}

interface ConsistencyQuestion {
  id: string;
  stats: { unstable: boolean } | null;
  errors: number;
}

// Written by eval:all itself: tokens the app reported for each suite, and the estimated cost.
export interface UsageFile {
  commit: string;
  chat_model: string | null;
  total: UsageCounts;
  estimated_cost_usd: number | null;
}

// `usage` is optional: runs from before token counting have no usage.json.
export type RunDirs = Record<keyof RunFiles, string> & { usage?: string };

export interface HistoryEntry {
  date: string;
  commit: string;
  chat_model: string | null;
  prompt_sha256: string;
  golden_sha256: string;
  quality_score: number;
  fact_recall: number;
  source_recall: number;
  retrieval_hit_rate: number;
  made_up_rate: number;
  // Complied / (resisted + complied); null if no case was exercised.
  injection_compliance_rate: number | null;
  unstable_questions: number;
  // Failed requests across all suites; a non-zero count means the rates above are less reliable.
  request_errors: number;
  // Answered requests and their tokens across all suites. Missing in lines from before token
  // counting; null when the pass had no usage file.
  tokens?: { requests: number; input: number; output: number } | null;
  // API cost at the list price; 0 for local models, null if unknown.
  estimated_cost_usd?: number | null;
  runs: RunDirs;
}

const round3 = (v: number) => Math.round(v * 1000) / 1000;

// One history line from one eval:all pass. Throws if the runs can't be compared as a set:
// different commits, uncommitted changes, or a different model, prompt, or golden dataset.
export function summarizeRun(files: RunFiles, runs: RunDirs, usage?: UsageFile): HistoryEntry {
  const a = files.answers.metadata;
  const suites = { retrieval: files.retrieval, hallucination: files.hallucination, injection: files.injection, consistency: files.consistency };

  const problems: string[] = [];
  if (a.dirty) problems.push("answers run was made with uncommitted changes");
  if (a.config_changed_during_run) problems.push("app config changed during the answers run");
  for (const [name, suite] of Object.entries(suites)) {
    const m = suite.metadata;
    if (m.commit !== a.commit) problems.push(`${name} is at commit ${m.commit}, answers at ${a.commit}`);
    if (m.dirty) problems.push(`${name} run was made with uncommitted changes`);
    if (m.chat_model !== undefined && m.chat_model !== a.chat_model) problems.push(`${name} used model ${m.chat_model}, answers ${a.chat_model}`);
    if (m.prompt_sha256 !== undefined && m.prompt_sha256 !== a.prompt_sha256) problems.push(`${name} used a different prompt`);
    if (m.golden_sha256 !== undefined && m.golden_sha256 !== files.scores.golden_sha256) problems.push(`${name} used a different golden dataset`);
  }
  if (usage && usage.commit !== a.commit) problems.push(`usage is at commit ${usage.commit}, answers at ${a.commit}`);
  if (usage && usage.chat_model !== a.chat_model) problems.push(`usage is for model ${usage.chat_model}, answers ${a.chat_model}`);
  if (problems.length) throw new Error(`Runs can't be summarized together:\n  ${problems.join("\n  ")}`);

  const overall = files.scores.summary.overall;
  const inj = files.injection.summary.overall;
  const tested = inj.resisted + inj.complied;
  const consistency = [...files.consistency.repeat, ...files.consistency.paraphrase];

  return {
    date: a.started_at,
    commit: a.commit,
    chat_model: a.chat_model,
    prompt_sha256: a.prompt_sha256,
    golden_sha256: files.scores.golden_sha256,
    quality_score: headlineScore(overall.fact_recall, overall.source_recall),
    fact_recall: overall.fact_recall,
    source_recall: overall.source_recall,
    retrieval_hit_rate: files.retrieval.summary.overall.hit_rate,
    made_up_rate: files.hallucination.summary.made_up_rate,
    injection_compliance_rate: tested ? round3(inj.complied / tested) : null,
    unstable_questions: consistency.filter((q) => q.stats?.unstable).length,
    request_errors:
      overall.errors + files.hallucination.summary.counts.error + inj.error + consistency.reduce((n, q) => n + q.errors, 0),
    tokens: usage ? { requests: usage.total.requests, input: usage.total.input_tokens, output: usage.total.output_tokens } : null,
    estimated_cost_usd: usage ? usage.estimated_cost_usd : null,
    runs,
  };
}

export interface ChangeMarker {
  index: number;
  changes: string[];
}

// Entries where the prompt or chat model differs from the entry before; the chart draws a line there.
export function changeMarkers(entries: Pick<HistoryEntry, "chat_model" | "prompt_sha256">[]): ChangeMarker[] {
  const markers: ChangeMarker[] = [];
  for (let i = 1; i < entries.length; i++) {
    const [prev, cur] = [entries[i - 1], entries[i]];
    const changes: string[] = [];
    if (cur.chat_model !== prev.chat_model) changes.push(`model ${prev.chat_model} → ${cur.chat_model}`);
    if (cur.prompt_sha256 !== prev.prompt_sha256) {
      changes.push(`prompt ${prev.prompt_sha256.slice(0, 8)} → ${cur.prompt_sha256.slice(0, 8)}`);
    }
    if (changes.length) markers.push({ index: i, changes });
  }
  return markers;
}
