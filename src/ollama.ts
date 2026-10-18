import { llmUnavailable } from "./errors.js";

// Any Ollama failure (not running, model missing, server error) becomes a 503 for the client.
// The underlying cause is logged, not returned.
export async function postToOllama<T>(baseUrl: string, path: string, body: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${baseUrl}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (err) {
    console.error(`Ollama unreachable at ${baseUrl}${path}:`, err);
    throw llmUnavailable();
  }
  if (!response.ok) {
    console.error(`Ollama ${path} failed (${response.status}): ${await response.text()}`);
    throw llmUnavailable();
  }
  return (await response.json()) as T;
}
