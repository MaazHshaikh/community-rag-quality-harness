// Pure statistics for the consistency eval: how much the answers to one question vary.

// Fact recall varying by more than this across attempts flags a question as unstable.
export const UNSTABLE_RANGE = 0.5;

const round = (value: number) => Math.round(value * 1000) / 1000;

export function mean(values: number[]): number {
  if (values.length === 0) throw new RangeError("mean of an empty list");
  return values.reduce((a, b) => a + b, 0) / values.length;
}

// Population standard deviation: the attempts are the whole set being described, not a sample.
export function stdev(values: number[]): number {
  const m = mean(values);
  return Math.sqrt(mean(values.map((v) => (v - m) ** 2)));
}

// Max minus min: the "varies by more than 0.5" measure.
export function range(values: number[]): number {
  if (values.length === 0) throw new RangeError("range of an empty list");
  return Math.max(...values) - Math.min(...values);
}

// For an answerable question, a refusal is a refusal or hedge that gives none of the expected
// facts. A partial answer ("60 days; the fee isn't specified") or a conflict answer that hedges
// one detail is still an answer, even though the hedge phrase would mark it "hedged" on its own.
export function isRefusal(classification: string, factRecall: number): boolean {
  return (classification === "exact_refusal" || classification === "hedged") && factRecall === 0;
}

// How many times consecutive attempts flip between answered and refused.
export function countSwitches(refused: boolean[]): number {
  let switches = 0;
  for (let i = 1; i < refused.length; i++) if (refused[i] !== refused[i - 1]) switches++;
  return switches;
}

// Number of different source sets returned. Order and duplicates are ignored, since /ask
// returns unique filenames and a reordering is not a different retrieval outcome.
export function distinctSourceSets(sourceLists: string[][]): number {
  return new Set(sourceLists.map((sources) => [...new Set(sources)].sort().join("|"))).size;
}

export interface AttemptSummary {
  fact_recall: number;
  refused: boolean;
  sources: string[];
}

export interface ConsistencyStats {
  attempts: number;
  fact_recall_mean: number;
  fact_recall_stdev: number;
  fact_recall_range: number;
  answered: number;
  refused: number;
  switches: number;
  distinct_source_sets: number;
  sources_changed: boolean;
  unstable: boolean;
}

export function consistencyStats(attempts: AttemptSummary[]): ConsistencyStats {
  const recalls = attempts.map((a) => a.fact_recall);
  const refusedCount = attempts.filter((a) => a.refused).length;
  const sets = distinctSourceSets(attempts.map((a) => a.sources));
  const spread = range(recalls);
  return {
    attempts: attempts.length,
    fact_recall_mean: round(mean(recalls)),
    fact_recall_stdev: round(stdev(recalls)),
    fact_recall_range: round(spread),
    answered: attempts.length - refusedCount,
    refused: refusedCount,
    switches: countSwitches(attempts.map((a) => a.refused)),
    distinct_source_sets: sets,
    sources_changed: sets > 1,
    unstable: spread > UNSTABLE_RANGE,
  };
}
