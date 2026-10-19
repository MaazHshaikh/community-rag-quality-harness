// Deterministic scoring: no AI calls. Shared by the scorer CLI, its unit tests, and the
// golden dataset check, so all three match text the same way.

export type Category = "single_fact" | "multi_doc" | "conflict";

// One phrase, or a list of acceptable variants where any one counts.
export type Fact = string | string[];

export interface GoldenEntry {
  id: string;
  question: string;
  category: Category;
  expected_facts: Fact[];
  expected_sources: string[];
  forbidden_facts: string[];
}

export interface AnswerRecord {
  id: string;
  status: number | null;
  answer: string | null;
  sources: string[];
  error: string | null;
}

export const REFUSAL = "I don't know based on the community docs.";

const UNITS: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
  ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16,
  seventeen: 17, eighteen: 18, nineteen: 19,
};
const TENS: Record<string, number> = {
  twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90,
};

// "three" -> "3", "twenty five" -> "25". Runs after hyphens become spaces ("twenty-five").
function numberWordsToDigits(text: string): string {
  return text.replace(
    /\b(twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)(?: (one|two|three|four|five|six|seven|eight|nine))?\b|\b(zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen)\b/g,
    (_match, tens?: string, unit?: string, single?: string) =>
      String(tens ? TENS[tens] + (unit ? UNITS[unit] : 0) : UNITS[single!]),
  );
}

// Lowercase, straighten apostrophes, treat hyphens/dashes as spaces ("7-day" -> "7 day"),
// collapse whitespace, and turn number words into digits ("three seats" -> "3 seats").
export function normalize(text: string): string {
  const basic = text
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[-‐-―]/g, " ")
    .replace(/\s+/g, " ");
  return numberWordsToDigits(basic);
}

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// A quantity phrase ("30 days", "6 settlement currencies") also matches its singular form, the
// adjective use: "a 30-day window" normalizes to "30 day". Only phrases that start with a number,
// so names ("Tobias", "Lukas") and plain words ("webhooks") stay exact.
function phrasePattern(normalized: string): string {
  const plural = /^\S*\d\S* .*?(\w+?)(ies|s)$/.exec(normalized);
  if (!plural) return escapeRegExp(normalized);
  const stem = normalized.slice(0, normalized.length - plural[2].length);
  return `${escapeRegExp(stem)}(?:${plural[2]}|${plural[2] === "ies" ? "y" : ""})`;
}

// Whole-phrase match: "$99" must not match inside "$990", and "300" not inside "3000".
// A trailing plural "s" is allowed, so "7 day" matches "7 days"; and see phrasePattern.
export function containsPhrase(text: string, phrase: string): boolean {
  const pattern = new RegExp(`(?<![a-z0-9])${phrasePattern(normalize(phrase))}s?(?![a-z0-9])`);
  return pattern.test(normalize(text));
}

export const variantsOf = (fact: Fact): string[] => (Array.isArray(fact) ? fact : [fact]);
export const factLabel = (fact: Fact): string => variantsOf(fact).join(" | ");

// Returns the variant that matched, or null.
export function findFact(text: string, fact: Fact): string | null {
  return variantsOf(fact).find((variant) => containsPhrase(text, variant)) ?? null;
}

export interface QuestionScore {
  id: string;
  category: Category;
  status: number | null;
  error: string | null;
  fact_recall: number;
  facts: { fact: string; matched: string | null }[];
  source_recall: number;
  missing_sources: string[];
  refusal_detected: boolean;
  refusal_only: boolean;
  // Flags for the LLM judge, not failures: a correct answer can mention a wrong value to contrast it.
  forbidden_found: string[];
}

export function scoreAnswer(golden: GoldenEntry, record: AnswerRecord | undefined): QuestionScore {
  const answer = record?.answer ?? null;
  const base = {
    id: golden.id,
    category: golden.category,
    status: record?.status ?? null,
    error: record ? record.error : "no answer recorded",
  };

  // A failed request scores 0, so failures lower the averages instead of disappearing.
  if (answer === null) {
    return {
      ...base,
      error: base.error ?? "empty answer",
      fact_recall: 0,
      facts: golden.expected_facts.map((fact) => ({ fact: factLabel(fact), matched: null })),
      source_recall: 0,
      missing_sources: [...golden.expected_sources],
      refusal_detected: false,
      refusal_only: false,
      forbidden_found: [],
    };
  }

  const facts = golden.expected_facts.map((fact) => ({ fact: factLabel(fact), matched: findFact(answer, fact) }));
  const returned = new Set(record?.sources ?? []);
  const missing = golden.expected_sources.filter((source) => !returned.has(source));
  const refusal = normalize(REFUSAL).replace(/\.$/, "");
  const normalizedAnswer = normalize(answer).trim();

  return {
    ...base,
    fact_recall: facts.filter((f) => f.matched !== null).length / facts.length,
    facts,
    source_recall: (golden.expected_sources.length - missing.length) / golden.expected_sources.length,
    missing_sources: missing,
    refusal_detected: normalizedAnswer.includes(refusal),
    refusal_only: normalizedAnswer.replace(/\.$/, "") === refusal,
    forbidden_found: golden.forbidden_facts.filter((phrase) => containsPhrase(answer, phrase)),
  };
}

export interface CategorySummary {
  count: number;
  errors: number;
  fact_recall: number;
  source_recall: number;
  refusal_rate: number;
  forbidden_flagged: number;
}

const round = (value: number) => Math.round(value * 1000) / 1000;
const mean = (values: number[]) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0);

export function summarize(scores: QuestionScore[]): CategorySummary {
  return {
    count: scores.length,
    errors: scores.filter((s) => s.error !== null).length,
    fact_recall: round(mean(scores.map((s) => s.fact_recall))),
    source_recall: round(mean(scores.map((s) => s.source_recall))),
    refusal_rate: round(mean(scores.map((s) => (s.refusal_detected ? 1 : 0)))),
    forbidden_flagged: scores.filter((s) => s.forbidden_found.length > 0).length,
  };
}
