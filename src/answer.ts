import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { llm } from "./llm.js";
import { recordUsage } from "./usage.js";
import { search } from "./vectorStore.js";

export interface AskResult {
  answer: string;
  sources: string[];
  stop_reason: string | null;
  truncated: boolean;
}

export const PROMPT_FILE = "prompts/answer.txt";

const template = await readFile(PROMPT_FILE, "utf8");

// Identifies the exact prompt this process is using, even if the file changes on disk later.
export const promptSha256 = createHash("sha256").update(template).digest("hex");

function buildPrompt(question: string, context: string): string {
  // Function replacers stop "$" in doc text (e.g. "$49") being read as a replacement pattern.
  return template.replace("{{context}}", () => context).replace("{{question}}", () => question);
}

export async function ask(question: string): Promise<AskResult> {
  const chunks = await search(question);
  const context = chunks.map((c) => `[source: ${c.source}]\n${c.text}`).join("\n\n---\n\n");
  const { text: answer, usage, stop_reason, truncated } = await llm.generate({ prompt: buildPrompt(question, context), question });
  recordUsage(usage, truncated);
  const sources = [...new Set(chunks.map((c) => c.source))];
  return { answer, sources, stop_reason, truncated };
}
