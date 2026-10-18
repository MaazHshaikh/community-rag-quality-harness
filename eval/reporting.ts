// Pure helpers for the eval report, kept separate from file I/O so they can be unit-tested.

export const FACT_WEIGHT = 0.75;
export const SOURCE_WEIGHT = 0.25;

// Headline quality score, 0-100: 75% fact recall + 25% source recall, rounded to 1 decimal.
// Both inputs are fractions from 0 to 1. Because the formula is linear, the score of averaged
// recalls equals the average of per-question scores.
export function headlineScore(factRecall: number, sourceRecall: number): number {
  for (const [name, value] of [
    ["factRecall", factRecall],
    ["sourceRecall", sourceRecall],
  ] as const) {
    if (!Number.isFinite(value) || value < 0 || value > 1) {
      throw new RangeError(`${name} must be between 0 and 1, got ${value}`);
    }
  }
  return Math.round((FACT_WEIGHT * factRecall + SOURCE_WEIGHT * sourceRecall) * 1000) / 10;
}

export interface RankableQuestion {
  id: string;
  fact_recall: number;
  source_recall: number;
}

// Lowest headline score first; ties broken by id so the report is stable between runs.
export function lowestScoring<T extends RankableQuestion>(questions: T[], count: number): T[] {
  return [...questions]
    .sort(
      (a, b) =>
        headlineScore(a.fact_recall, a.source_recall) - headlineScore(b.fact_recall, b.source_recall) ||
        a.id.localeCompare(b.id),
    )
    .slice(0, count);
}

// One line, at most `max` characters, cut at a word boundary.
export function excerpt(text: string | null, max = 160): string {
  if (!text) return "(no answer)";
  const flat = text.replace(/\s+/g, " ").trim();
  if (flat.length <= max) return flat;
  const cut = flat.slice(0, max);
  return `${cut.slice(0, cut.lastIndexOf(" ") > 0 ? cut.lastIndexOf(" ") : max)}…`;
}
