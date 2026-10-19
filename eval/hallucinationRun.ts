// Asks questions the docs don't answer and checks whether the app refuses.
// Run with: npm run eval:hallucination   (app must be running with npm run dev)
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { askQuestion, type AskOutcome, BASE_URL, connectToOllamaApp, git, isDirty, requireEnv, runIdFor } from "./appClient.js";
import { classifyAnswer, type HallucinationClass } from "./hallucinationClassifier.js";
import { containsPhrase } from "./scoring.js";

interface HallucinationCase {
  id: string;
  question: string;
  why_unanswerable: string;
  nearby_facts: string[];
}

const QUESTIONS_FILE = "eval/hallucination.json";
const CLASSES: HallucinationClass[] = ["exact_refusal", "hedged", "made_up", "error"];

async function main() {
  const token = requireEnv("API_TOKEN");
  const casesText = readFileSync(QUESTIONS_FILE, "utf8");
  const cases = JSON.parse(casesText) as HallucinationCase[];
  const meta = await connectToOllamaApp(token);
  const startedAt = new Date();

  console.log(`Asking ${cases.length} unanswerable questions at ${BASE_URL} (${meta.chat_model})\n`);

  const results: (AskOutcome & { id: string; classification: HallucinationClass; nearby_facts_used: string[] })[] = [];
  for (const [i, c] of cases.entries()) {
    const outcome = await askQuestion(c.question, token);
    const classification = classifyAnswer(outcome.error ? null : outcome.answer);
    // Which nearby (wrong) facts the answer borrowed, to help explain a made-up answer.
    const nearbyUsed = outcome.answer ? c.nearby_facts.filter((f) => containsPhrase(outcome.answer!, f)) : [];
    results.push({ id: c.id, classification, ...outcome, nearby_facts_used: nearbyUsed });
    console.log(
      `[${i + 1}/${cases.length}] ${c.id} ${classification}${outcome.truncated ? ` CUT OFF (${outcome.stop_reason})` : ""}` +
        `${outcome.error ? `: ${outcome.error}` : ""}`,
    );
  }

  const count = (cls: HallucinationClass) => results.filter((r) => r.classification === cls).length;
  const answered = results.length - count("error");
  const rate = (n: number) => (answered ? Math.round((n / answered) * 1000) / 1000 : 0);
  const summary = {
    questions: results.length,
    counts: Object.fromEntries(CLASSES.map((c) => [c, count(c)])),
    // Rates are over answered questions; request errors are reported separately.
    refusal_rate: rate(count("exact_refusal")),
    hedged_rate: rate(count("hedged")),
    made_up_rate: rate(count("made_up")),
  };

  const runDir = path.join("eval", "runs", runIdFor(startedAt));
  mkdirSync(runDir, { recursive: true });
  const outFile = path.join(runDir, "hallucination.json");
  writeFileSync(
    outFile,
    JSON.stringify(
      {
        metadata: {
          kind: "hallucination",
          started_at: startedAt.toISOString(),
          base_url: BASE_URL,
          commit: git("rev-parse --short HEAD"),
          dirty: isDirty(),
          ...meta,
          questions_file: QUESTIONS_FILE,
          questions_sha256: createHash("sha256").update(casesText).digest("hex"),
        },
        summary,
        results,
      },
      null,
      2,
    ) + "\n",
  );

  const pct = (v: number) => `${(v * 100).toFixed(1)}%`;
  console.log(`\nExact refusals: ${count("exact_refusal")}/${answered} (refusal rate ${pct(summary.refusal_rate)})`);
  console.log(`Hedged:         ${count("hedged")}/${answered} (${pct(summary.hedged_rate)})`);
  console.log(`Made up:        ${count("made_up")}/${answered} (${pct(summary.made_up_rate)})`);
  if (count("error")) console.log(`Errors:         ${count("error")}`);

  const byId = new Map(cases.map((c) => [c.id, c]));
  const madeUp = results.filter((r) => r.classification === "made_up");
  if (madeUp.length) console.log("\nMade-up answers:");
  for (const r of madeUp) {
    console.log(`\n  ${r.id}: ${byId.get(r.id)!.question}`);
    console.log(`    answer: ${(r.answer ?? "").replace(/\s+/g, " ").trim()}`);
    if (r.nearby_facts_used.length) console.log(`    borrowed nearby facts: ${r.nearby_facts_used.join(", ")}`);
    console.log(`    why unanswerable: ${byId.get(r.id)!.why_unanswerable}`);
  }
  console.log(`\nSaved ${outFile}`);
}

await main();
