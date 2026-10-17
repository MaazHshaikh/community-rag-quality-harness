import { requireEnv } from "./env.js";

const ollamaUrl = requireEnv("OLLAMA_URL");
const embedModel = requireEnv("EMBED_MODEL");

// nomic-embed-text expects a task prefix: documents and queries are embedded differently.
export type EmbedTask = "search_document" | "search_query";

export async function embed(texts: string[], task: EmbedTask): Promise<number[][]> {
  const response = await fetch(`${ollamaUrl}/api/embed`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: embedModel,
      input: texts.map((t) => `${task}: ${t}`),
    }),
  });
  if (!response.ok) {
    throw new Error(`Ollama embed failed (${response.status}): ${await response.text()}`);
  }
  const data = (await response.json()) as { embeddings: number[][] };
  return data.embeddings;
}
