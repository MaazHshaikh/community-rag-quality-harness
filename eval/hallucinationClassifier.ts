// Classifies an answer to an unanswerable question. Deterministic: no AI calls.
import { normalize, REFUSAL } from "./scoring.js";

export type HallucinationClass = "exact_refusal" | "hedged" | "made_up" | "error";

// Phrases that say "the docs don't cover this" without using the exact refusal sentence.
// Matched after normalize(), so apostrophes are straight and text is lowercase.
const HEDGES = [
  /\bnot (explicitly |specifically |directly |clearly )?(specified|mentioned|stated|provided|included|listed|covered|documented|defined|given)\b/,
  /\b(does|do|did|is|are)( not|n't) (specify|mention|state|say|include|list|cover|provide|define|give)\b/,
  /\bno (information|mention|details?|data)\b/,
  /\b(can ?not|can't|could not|couldn't|unable to) (find|determine|answer|tell)\b/,
  /\bnot (available|found) in the (provided )?(context|docs|documents|documentation)\b/,
  /\b(unclear|not clear)\b/,
];

const refusal = normalize(REFUSAL).replace(/\.$/, "");

export const hasHedge = (text: string) => HEDGES.some((pattern) => pattern.test(normalize(text)));

// exact_refusal: contains the exact refusal sentence, and any other text is either a hedge
//   ("The context doesn't say. I don't know...") or makes no numeric claim.
// hedged: says the docs don't cover it, without the exact sentence.
// made_up: anything else, including the refusal sentence appended to a specific claim
//   ("The 15% reserve applies. I don't know...").
// Limitation: a non-numeric invented claim next to the refusal sentence counts as a refusal.
export function classifyAnswer(answer: string | null): HallucinationClass {
  if (answer === null) return "error";
  const text = normalize(answer);
  if (text.includes(refusal)) {
    const rest = text.replace(refusal, " ");
    return hasHedge(rest) || !/\d/.test(rest) ? "exact_refusal" : "made_up";
  }
  return hasHedge(answer) ? "hedged" : "made_up";
}
