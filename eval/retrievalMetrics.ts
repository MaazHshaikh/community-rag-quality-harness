// Pure retrieval metrics over /search results. `returned` is the ranked list of source
// filenames for the top results, best first; a doc can appear more than once (several chunks).

export const TOP_K = 3;

// 1-based rank of the first result whose source is expected, or null if none is in the top k.
export function firstExpectedRank(expected: string[], returned: string[], k = TOP_K): number | null {
  const index = returned.slice(0, k).findIndex((source) => expected.includes(source));
  return index === -1 ? null : index + 1;
}

// At least one expected source appears in the top k.
export function isHit(expected: string[], returned: string[], k = TOP_K): boolean {
  return firstExpectedRank(expected, returned, k) !== null;
}

// Every expected source appears in the top k.
export function hasFullRecall(expected: string[], returned: string[], k = TOP_K): boolean {
  const top = new Set(returned.slice(0, k));
  return expected.every((source) => top.has(source));
}

export interface RetrievalOutcome {
  hit: boolean;
  full_recall: boolean;
  first_rank: number | null;
}

export interface RetrievalSummary {
  count: number;
  hit_rate: number;
  full_recall_rate: number;
  // Average first rank over hits only; misses have no rank.
  mean_first_rank: number | null;
  // Mean reciprocal rank: 1/rank per question, 0 for a miss. Rewards ranking the right doc first.
  mrr: number;
}

const round = (value: number) => Math.round(value * 1000) / 1000;

export function summarizeRetrieval(outcomes: RetrievalOutcome[]): RetrievalSummary {
  const n = outcomes.length;
  const ranks = outcomes.map((o) => o.first_rank).filter((r): r is number => r !== null);
  return {
    count: n,
    hit_rate: n ? round(outcomes.filter((o) => o.hit).length / n) : 0,
    full_recall_rate: n ? round(outcomes.filter((o) => o.full_recall).length / n) : 0,
    mean_first_rank: ranks.length ? round(ranks.reduce((a, b) => a + b, 0) / ranks.length) : null,
    mrr: n ? round(outcomes.reduce((sum, o) => sum + (o.first_rank ? 1 / o.first_rank : 0), 0) / n) : 0,
  };
}
