// Scores one run's answers.json against eval/golden.json and writes scores.json next to it.
// Shared by npm run eval:score and npm run eval:rescore.
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { type AnswerRecord, type Category, type CategorySummary, type GoldenEntry, scoreAnswer, summarize } from "./scoring.js";

export const CATEGORIES: Category[] = ["single_fact", "multi_doc", "conflict"];

export interface ScoredRun {
  file: string;
  overall: CategorySummary;
  byCategory: Record<Category, CategorySummary>;
}

export function scoreRun(runDir: string): ScoredRun {
  const answersFile = path.join(runDir, "answers.json");
  if (!existsSync(answersFile)) throw new Error(`No answers.json in ${runDir}`);

  const goldenText = readFileSync("eval/golden.json", "utf8");
  const golden = JSON.parse(goldenText) as GoldenEntry[];
  const run = JSON.parse(readFileSync(answersFile, "utf8")) as { metadata: object; results: AnswerRecord[] };
  const byId = new Map(run.results.map((r) => [r.id, r]));

  const questions = golden.map((entry) => scoreAnswer(entry, byId.get(entry.id)));
  const byCategory = Object.fromEntries(
    CATEGORIES.map((category) => [category, summarize(questions.filter((q) => q.category === category))]),
  ) as Record<Category, CategorySummary>;
  const overall = summarize(questions);

  const file = path.join(runDir, "scores.json");
  writeFileSync(
    file,
    JSON.stringify(
      {
        scored_at: new Date().toISOString(),
        run_dir: runDir.replace(/\\/g, "/"),
        // The golden file can change after a run; this pins which version produced these scores.
        golden_sha256: createHash("sha256").update(goldenText).digest("hex"),
        run_metadata: run.metadata,
        summary: { overall, by_category: byCategory },
        questions,
      },
      null,
      2,
    ) + "\n",
  );
  return { file, overall, byCategory };
}
