// Appends one summary line to eval/history.jsonl from the run folders of one eval:all pass.
// eval:all calls this itself; to backfill by hand: npm run eval:history -- <run folder>...
// Each suite's file must appear in exactly one of the given folders.
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import path from "node:path";
import {
  HISTORY_FILE,
  type HistoryEntry,
  RUN_FILE_NAMES,
  type RunDirs,
  type RunFiles,
  summarizeRun,
  USAGE_FILE_NAME,
  type UsageFile,
} from "./history.js";
import { RUNS_DIR } from "./runDir.js";

const FILES: Record<keyof RunFiles, string> = RUN_FILE_NAMES;

const dirs = process.argv.slice(2).map((d) => path.basename(d));
if (!dirs.length) {
  console.error("Usage: npm run eval:history -- <run folder>...");
  process.exit(1);
}

const files = {} as Record<keyof RunFiles, unknown>;
const runs = {} as RunDirs;
for (const [suite, file] of Object.entries(FILES) as [keyof RunFiles, string][]) {
  const found = dirs.filter((d) => existsSync(path.join(RUNS_DIR, d, file)));
  if (found.length !== 1) {
    console.error(`Expected ${file} in exactly one of the given folders, found ${found.length ? found.join(", ") : "none"}`);
    process.exit(1);
  }
  runs[suite] = found[0];
  files[suite] = JSON.parse(readFileSync(path.join(RUNS_DIR, found[0], file), "utf8"));
}

// Optional: eval:all writes usage.json since token counting was added; older passes have none.
const USAGE_FILE = USAGE_FILE_NAME;
const usageDirs = dirs.filter((d) => existsSync(path.join(RUNS_DIR, d, USAGE_FILE)));
if (usageDirs.length > 1) {
  console.error(`Expected ${USAGE_FILE} in at most one of the given folders, found ${usageDirs.join(", ")}`);
  process.exit(1);
}
let usage: UsageFile | undefined;
if (usageDirs.length) {
  runs.usage = usageDirs[0];
  usage = JSON.parse(readFileSync(path.join(RUNS_DIR, usageDirs[0], USAGE_FILE), "utf8"));
}

const existing: HistoryEntry[] = existsSync(HISTORY_FILE)
  ? readFileSync(HISTORY_FILE, "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line))
  : [];
if (existing.some((e) => e.runs.answers === runs.answers)) {
  console.error(`${HISTORY_FILE} already has an entry for ${runs.answers}`);
  process.exit(1);
}

let entry: HistoryEntry;
try {
  entry = summarizeRun(files as RunFiles, runs, usage);
} catch (err) {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
}
appendFileSync(HISTORY_FILE, JSON.stringify(entry) + "\n");
const pct = (v: number | null) => (v === null ? "n/a" : `${(v * 100).toFixed(1)}%`);
console.log(
  `Appended to ${HISTORY_FILE}: ${entry.date} ${entry.commit} quality ${entry.quality_score}, ` +
    `hit rate ${pct(entry.retrieval_hit_rate)}, made up ${pct(entry.made_up_rate)}, ` +
    `injection complied ${pct(entry.injection_compliance_rate)}, unstable ${entry.unstable_questions}` +
    `${entry.request_errors ? `, request errors ${entry.request_errors}` : ""}` +
    `${entry.tokens ? `, tokens ${entry.tokens.input} in / ${entry.tokens.output} out` : ""}` +
    `${entry.truncated_answers != null ? `, cut off ${entry.truncated_answers}` : ""}` +
    `${entry.estimated_cost_usd != null ? `, estimated cost $${entry.estimated_cost_usd.toFixed(4)}` : ""}`,
);
