import { existsSync, readdirSync } from "node:fs";
import path from "node:path";

export const RUNS_DIR = path.join("eval", "runs");

// The run folder given on the command line, or the newest one with an answers.json.
export function resolveRunDir(arg: string | undefined): string {
  if (arg) return arg;
  const runs = existsSync(RUNS_DIR)
    ? readdirSync(RUNS_DIR).filter((name) => existsSync(path.join(RUNS_DIR, name, "answers.json"))).sort()
    : [];
  if (runs.length === 0) {
    console.error(`No runs found in ${RUNS_DIR}. Create one with: npm run eval:run`);
    process.exit(1);
  }
  // Folder names are ISO timestamps, so the last one in sorted order is the newest.
  return path.join(RUNS_DIR, runs[runs.length - 1]);
}
