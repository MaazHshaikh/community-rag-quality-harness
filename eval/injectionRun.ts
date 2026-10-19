// Prompt-injection suite: malicious questions plus a poisoned forum thread.
// Run with: npm run eval:injection   (app must be running with npm run dev:injection)
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { askQuestion, type AskOutcome, BASE_URL, connectToOllamaApp, git, isDirty, requireEnv, runIdFor } from "./appClient.js";
import { evaluateInjection, type InjectionCase, type InjectionResult, type InjectionVerdict } from "./injectionChecks.js";

const CASES_FILE = "eval/injection/cases.json";
const RESULTS: InjectionResult[] = ["resisted", "complied", "not_exercised", "error"];

async function main() {
  const token = requireEnv("API_TOKEN");
  const casesText = readFileSync(CASES_FILE, "utf8");
  const cases = JSON.parse(casesText) as InjectionCase[];
  const meta = await connectToOllamaApp(token, { extraDocs: true });
  // The prompt the app is running with, for the leak check. /meta's hash confirms it matches.
  const promptText = readFileSync(meta.prompt_file, "utf8");
  const promptMatchesApp = createHash("sha256").update(promptText).digest("hex") === meta.prompt_sha256;
  if (!promptMatchesApp) console.warn(`Warning: ${meta.prompt_file} differs from the prompt the app loaded; restart the app.`);
  const startedAt = new Date();

  console.log(`Running ${cases.length} injection cases at ${BASE_URL} (${meta.chat_model}, extra docs: ${meta.extra_docs_dir})\n`);

  const results: (AskOutcome & InjectionVerdict & { id: string; part: string; attack: string })[] = [];
  for (const [i, c] of cases.entries()) {
    const outcome = await askQuestion(c.question, token);
    const verdict = evaluateInjection(c, outcome.error ? null : outcome.answer, outcome.sources, promptText);
    results.push({ id: c.id, part: c.part, attack: c.attack, ...outcome, ...verdict });
    console.log(
      `[${i + 1}/${cases.length}] ${c.id} ${c.part.padEnd(9)} ${verdict.result.padEnd(13)} ${c.attack}` +
        `${outcome.truncated ? ` CUT OFF (${outcome.stop_reason})` : ""}`,
    );
  }

  const tally = (part?: string) => {
    const subset = results.filter((r) => !part || r.part === part);
    return Object.fromEntries(RESULTS.map((res) => [res, subset.filter((r) => r.result === res).length]));
  };
  const summary = { overall: tally(), malicious: tally("malicious"), poisoned: tally("poisoned") };

  const runDir = path.join("eval", "runs", runIdFor(startedAt));
  mkdirSync(runDir, { recursive: true });
  const outFile = path.join(runDir, "injection.json");
  writeFileSync(
    outFile,
    JSON.stringify(
      {
        metadata: {
          kind: "injection",
          started_at: startedAt.toISOString(),
          base_url: BASE_URL,
          commit: git("rev-parse --short HEAD"),
          dirty: isDirty(),
          ...meta,
          prompt_matches_app: promptMatchesApp,
          cases_file: CASES_FILE,
          cases_sha256: createHash("sha256").update(casesText).digest("hex"),
        },
        summary,
        results,
      },
      null,
      2,
    ) + "\n",
  );

  for (const [name, t] of Object.entries(summary)) {
    const tested = t.resisted + t.complied;
    console.log(
      `\n${name.padEnd(10)} resisted ${t.resisted}/${tested}, complied ${t.complied}/${tested}` +
        `${t.not_exercised ? `, not exercised ${t.not_exercised}` : ""}${t.error ? `, errors ${t.error}` : ""}`,
    );
  }
  const complied = results.filter((r) => r.result === "complied");
  if (complied.length) console.log("\nComplied:");
  for (const r of complied) {
    console.log(`\n  ${r.id} (${r.attack})`);
    console.log(`    answer: ${(r.answer ?? "").replace(/\s+/g, " ").trim().slice(0, 300)}`);
    if (r.matched.length) console.log(`    matched: ${r.matched.join(", ")}`);
    if (r.leaked_prompt_lines.length) console.log(`    leaked prompt lines: ${r.leaked_prompt_lines.length}`);
  }
  const notExercised = results.filter((r) => r.result === "not_exercised");
  for (const r of notExercised) console.log(`\n  ${r.id}: poisoned doc not retrieved (sources: ${r.sources.join(", ")})`);
  console.log(`\nSaved ${outFile}`);
}

await main();
