// LLM-as-judge: grades each answer in a run with a local Ollama model.
// Usage: npm run eval:judge [-- eval/runs/<timestamp>]   (defaults to the latest run)
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { postToOllama } from "../src/ollama.js";
import { resolveRunDir } from "./runDir.js";
import { type AnswerRecord, type Category, factLabel, type GoldenEntry } from "./scoring.js";

const JUDGE_MODEL = "qwen2.5:7b";
const OPTIONS = {
  temperature: 0,
  seed: 42,
  // Ollama's default context is too small for several full documents; anything past it is
  // silently dropped, so the judge would grade without seeing all the evidence.
  num_ctx: 8192,
  num_predict: 400,
};
const PROMPT_FILE = "eval/prompts/judge.txt";
const CATEGORIES: Category[] = ["single_fact", "multi_doc", "conflict"];

const Dimension = z.object({ score: z.number().int().min(1).max(5), reason: z.string().trim().min(1) }).strict();
const Verdict = z.object({ correctness: Dimension, groundedness: Dimension, completeness: Dimension }).strict();
type Verdict = z.infer<typeof Verdict>;

interface JudgeResult {
  id: string;
  category: Category;
  verdict: Verdict | null;
  error: string | null;
  attempts: number;
  prompt_tokens?: number | null;
  context_truncated?: boolean;
  latency_ms?: number;
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface ChatResponse {
  message: { content: string };
  prompt_eval_count?: number;
}

const sha256 = (text: string) => createHash("sha256").update(text).digest("hex");

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env var ${name} in .env`);
  return value;
}

function buildPrompt(template: string, entry: GoldenEntry, record: AnswerRecord): string {
  const files = [...new Set([...entry.expected_sources, ...record.sources])].sort();
  const documents = files
    .map((file) => `=== ${file} ===\n${readFileSync(path.join("docs", file), "utf8").trim()}`)
    .join("\n\n");
  const values: Record<string, string> = {
    question: entry.question,
    expected_facts: entry.expected_facts.map((f) => `- ${factLabel(f).replace(/ \| /g, " / ")}`).join("\n"),
    forbidden_facts: entry.forbidden_facts.map((f) => `- ${f}`).join("\n"),
    documents,
    answer: record.answer ?? "",
  };
  // Function replacer: doc text contains "$" amounts that would otherwise be read as patterns.
  return template.replace(/\{\{(\w+)\}\}/g, (_m, key: string) => values[key]);
}

async function judgeOnce(ollamaUrl: string, messages: ChatMessage[]) {
  const response = await postToOllama<ChatResponse>(ollamaUrl, "/api/chat", {
    model: JUDGE_MODEL,
    messages,
    stream: false,
    format: z.toJSONSchema(Verdict),
    options: OPTIONS,
  });
  const content = response.message.content;
  let parsed: z.ZodSafeParseResult<Verdict>;
  try {
    parsed = Verdict.safeParse(JSON.parse(content));
  } catch {
    return { content, verdict: null, problem: "output is not valid JSON", promptTokens: response.prompt_eval_count };
  }
  return {
    content,
    verdict: parsed.success ? parsed.data : null,
    problem: parsed.success ? null : z.prettifyError(parsed.error),
    promptTokens: response.prompt_eval_count,
  };
}

async function judge(ollamaUrl: string, prompt: string) {
  const messages: ChatMessage[] = [{ role: "user", content: prompt }];
  let attempt = await judgeOnce(ollamaUrl, messages);
  let attempts = 1;
  // At temperature 0 an identical request gives an identical answer, so the retry shows the
  // model its invalid output and the validation error.
  if (!attempt.verdict) {
    attempts = 2;
    attempt = await judgeOnce(ollamaUrl, [
      ...messages,
      { role: "assistant", content: attempt.content },
      {
        role: "user",
        content: `That response was invalid: ${attempt.problem}\nReply again with JSON only, matching the requested shape exactly.`,
      },
    ]);
  }
  return { ...attempt, attempts };
}

const mean = (values: number[]) =>
  values.length ? Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 100) / 100 : null;

async function main() {
  const ollamaUrl = requireEnv("OLLAMA_URL");
  const runDir = resolveRunDir(process.argv[2]);
  const answersFile = path.join(runDir, "answers.json");
  if (!existsSync(answersFile)) {
    console.error(`No answers.json in ${runDir}`);
    process.exit(1);
  }

  const template = readFileSync(PROMPT_FILE, "utf8");
  const goldenText = readFileSync("eval/golden.json", "utf8");
  const golden = JSON.parse(goldenText) as GoldenEntry[];
  const run = JSON.parse(readFileSync(answersFile, "utf8")) as { results: AnswerRecord[] };
  const byId = new Map(run.results.map((r) => [r.id, r]));

  console.log(`Judging ${runDir} with ${JUDGE_MODEL} (temperature ${OPTIONS.temperature})`);
  const startedAt = Date.now();
  const results: JudgeResult[] = [];
  for (const [i, entry] of golden.entries()) {
    const record = byId.get(entry.id);
    const prefix = `[${i + 1}/${golden.length}] ${entry.id}`;
    if (!record?.answer) {
      results.push({ id: entry.id, category: entry.category, verdict: null, error: "no answer to judge", attempts: 0 });
      console.log(`${prefix} skipped: no answer`);
      continue;
    }

    const started = Date.now();
    const outcome = await judge(ollamaUrl, buildPrompt(template, entry, record)).catch((err: unknown) => ({
      verdict: null,
      problem: String(err),
      attempts: 1,
      promptTokens: undefined,
    }));
    const truncated = outcome.promptTokens !== undefined && outcome.promptTokens >= OPTIONS.num_ctx;
    results.push({
      id: entry.id,
      category: entry.category,
      verdict: outcome.verdict,
      error: outcome.verdict ? null : outcome.problem,
      attempts: outcome.attempts,
      prompt_tokens: outcome.promptTokens ?? null,
      context_truncated: truncated,
      latency_ms: Date.now() - started,
    });
    const v = outcome.verdict;
    console.log(
      `${prefix} ${v ? `C${v.correctness.score} G${v.groundedness.score} Q${v.completeness.score}` : `FAILED: ${outcome.problem}`}` +
        `${outcome.attempts > 1 ? " (retried)" : ""}${truncated ? " WARNING: context full, evidence may be cut" : ""}`,
    );
  }

  const summarize = (category?: Category) => {
    const verdicts = results.filter((r) => (!category || r.category === category) && r.verdict).map((r) => r.verdict!);
    return {
      judged: verdicts.length,
      correctness: mean(verdicts.map((v) => v.correctness.score)),
      groundedness: mean(verdicts.map((v) => v.groundedness.score)),
      completeness: mean(verdicts.map((v) => v.completeness.score)),
    };
  };
  const summary = {
    overall: summarize(),
    by_category: Object.fromEntries(CATEGORIES.map((c) => [c, summarize(c)])),
  };

  const outFile = path.join(runDir, "judge.json");
  writeFileSync(
    outFile,
    JSON.stringify(
      {
        judged_at: new Date().toISOString(),
        run_dir: runDir.replace(/\\/g, "/"),
        judge_model: JUDGE_MODEL,
        options: OPTIONS,
        judge_prompt_file: PROMPT_FILE,
        judge_prompt_sha256: sha256(template),
        golden_sha256: sha256(goldenText),
        duration_ms: Date.now() - startedAt,
        summary,
        results,
      },
      null,
      2,
    ) + "\n",
  );

  const fmt = (n: number | null) => (n === null ? "  -" : n.toFixed(2));
  console.log("\ncategory      judged  correctness  groundedness  completeness");
  for (const [name, s] of [...Object.entries(summary.by_category), ["overall", summary.overall] as const]) {
    console.log(
      `${name.padEnd(12)}  ${String(s.judged).padStart(6)}  ${fmt(s.correctness).padStart(11)}  ` +
        `${fmt(s.groundedness).padStart(12)}  ${fmt(s.completeness).padStart(12)}`,
    );
  }
  const failed = results.filter((r) => !r.verdict && r.error !== "no answer to judge").length;
  if (failed) console.log(`\n${failed} answer(s) could not be judged; see judge.json`);
  console.log(`\nSaved ${outFile}`);
}

await main();
