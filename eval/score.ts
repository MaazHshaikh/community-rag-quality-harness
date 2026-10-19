// Scores a saved run against eval/golden.json without calling any AI.
// Usage: npm run eval:score [-- eval/runs/<timestamp>]   (defaults to the latest run)
import { resolveRunDir } from "./runDir.js";
import { scoreRun } from "./scoreRun.js";

const runDir = resolveRunDir(process.argv[2]);
let scored;
try {
  scored = scoreRun(runDir);
} catch (err) {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
}

const pct = (value: number) => `${(value * 100).toFixed(1)}%`.padStart(7);
console.log(`Scored ${runDir}\n`);
console.log("category      n  errors  fact recall  source recall  refusals  forbidden flags");
for (const [name, s] of [...Object.entries(scored.byCategory), ["overall", scored.overall] as const]) {
  console.log(
    `${name.padEnd(12)} ${String(s.count).padStart(2)}  ${String(s.errors).padStart(6)}  ` +
      `${pct(s.fact_recall).padStart(11)}  ${pct(s.source_recall).padStart(13)}  ` +
      `${pct(s.refusal_rate).padStart(8)}  ${String(s.forbidden_flagged).padStart(15)}`,
  );
}
console.log(`\nSaved ${scored.file}`);
