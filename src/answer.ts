import { readFile } from "node:fs/promises";
import { llm } from "./llm.js";
import { search } from "./vectorStore.js";

export interface AskResult {
  answer: string;
  sources: string[];
}

const template = await readFile("prompts/answer.txt", "utf8");

function buildPrompt(question: string, context: string): string {
  // Function replacers stop "$" in doc text (e.g. "$49") being read as a replacement pattern.
  return template.replace("{{context}}", () => context).replace("{{question}}", () => question);
}

export async function ask(question: string): Promise<AskResult> {
  const chunks = await search(question);
  const context = chunks.map((c) => `[source: ${c.source}]\n${c.text}`).join("\n\n---\n\n");
  const answer = await llm.generate(buildPrompt(question, context));
  const sources = [...new Set(chunks.map((c) => c.source))];
  return { answer, sources };
}
