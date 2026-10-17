import { requireEnv } from "./env.js";
import { HttpError } from "./errors.js";

const ollamaUrl = requireEnv("OLLAMA_URL");
const embedModel = requireEnv("EMBED_MODEL");

// Any Ollama failure (not running, model missing, server error) becomes a 503 for the client.
// The underlying cause is logged, not returned.
export async function postToOllama<T>(path: string, body: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${ollamaUrl}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (err) {
    console.error(`Ollama unreachable at ${ollamaUrl}${path}:`, err);
    throw new HttpError(503, "LLM service is unavailable");
  }
  if (!response.ok) {
    console.error(`Ollama ${path} failed (${response.status}): ${await response.text()}`);
    throw new HttpError(503, "LLM service is unavailable");
  }
  return (await response.json()) as T;
}

// nomic-embed-text expects a task prefix: documents and queries are embedded differently.
export type EmbedTask = "search_document" | "search_query";

export async function embed(texts: string[], task: EmbedTask): Promise<number[][]> {
  const data = await postToOllama<{ embeddings: number[][] }>("/api/embed", {
    model: embedModel,
    input: texts.map((t) => `${task}: ${t}`),
  });
  return data.embeddings;
}
