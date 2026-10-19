// Scores consistency attempts against the golden facts. Shared by the consistency run, the failure
// report, and npm run eval:rescore, so all three count an answer the same way.
import { consistencyStats, type ConsistencyStats, isRefusal } from "./consistencyMetrics.js";
import { classifyAnswer } from "./hallucinationClassifier.js";
import { type AnswerRecord, type GoldenEntry, scoreAnswer } from "./scoring.js";

export type AttemptOutcome = Omit<AnswerRecord, "id">;

export function scoreAttempt(entry: GoldenEntry, outcome: AttemptOutcome): { fact_recall: number; refused: boolean } {
  const fact_recall = scoreAnswer(entry, { id: entry.id, ...outcome }).fact_recall;
  return { fact_recall, refused: isRefusal(classifyAnswer(outcome.error ? null : outcome.answer), fact_recall) };
}

export interface ScoredAttempt extends AttemptOutcome {
  fact_recall: number;
  refused: boolean;
}

export interface QuestionResult<A extends ScoredAttempt = ScoredAttempt> {
  id: string;
  category: string;
  attempts: A[];
  stats: ConsistencyStats | null;
  errors: number;
}

export function summarizeQuestion<A extends ScoredAttempt>(entry: GoldenEntry, attempts: A[]): QuestionResult<A> {
  // Failed requests are counted but left out of the statistics; they measure uptime, not consistency.
  const ok = attempts.filter((a) => a.error === null);
  return {
    id: entry.id,
    category: entry.category,
    attempts,
    stats: ok.length ? consistencyStats(ok) : null,
    errors: attempts.length - ok.length,
  };
}
