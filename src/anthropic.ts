import { llmUnavailable } from "./errors.js";

// Anthropic Messages API client for the "anthropic" LLM provider. Kept free of env reading so
// it can be unit-tested with a mocked fetch. The API key goes in a request header only: it is
// never logged, and never part of an error message.

export const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
export const ANTHROPIC_VERSION = "2023-06-01";

export interface TokenUsage {
  input_tokens: number;
  output_tokens: number;
}

export interface Generation {
  text: string;
  usage: TokenUsage | null;
}

export interface AnthropicOptions {
  apiKey: string;
  model: string;
  // null leaves the field out: newer models (e.g. claude-haiku-5-5) reject `temperature`.
  temperature: number | null;
  maxOutputTokens: number;
  // "disabled" turns thinking off; null leaves the model's default (adaptive thinking on newer
  // models, whose thinking tokens count against maxOutputTokens and can leave no answer).
  thinking?: "disabled" | "adaptive" | null;
  url?: string;
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  maxRetries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  timeoutMs?: number;
}

// 429 is a rate limit; 529 means the API is overloaded. Both clear with time, so they're retried.
// Everything else (bad key, bad request, server error) fails straight away.
const RETRYABLE = new Set([429, 529]);

const realSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

// Wait before retry `attempt` (0-based): the server's retry-after if it sent one, otherwise
// exponential backoff with jitter. Capped either way so one request stays under the eval timeout.
export function retryDelayMs(attempt: number, retryAfter: string | null, baseDelayMs: number, maxDelayMs: number, random = Math.random): number {
  const seconds = retryAfter === null ? NaN : Number(retryAfter);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.min(seconds * 1000, maxDelayMs);
  const exponential = baseDelayMs * 2 ** attempt;
  return Math.min(exponential / 2 + random() * (exponential / 2), maxDelayMs);
}

// Logs the API's own error type and message (never request headers).
async function describeError(response: Response): Promise<string> {
  const body = (await response.json().catch(() => null)) as { error?: { type?: string; message?: string } } | null;
  return body?.error ? `${body.error.type ?? "error"}: ${body.error.message ?? ""}` : "no error body";
}

export function createAnthropicClient(options: AnthropicOptions) {
  const {
    apiKey,
    model,
    temperature,
    maxOutputTokens,
    thinking = null,
    url = ANTHROPIC_URL,
    fetch: doFetch = fetch,
    sleep = realSleep,
    maxRetries = 4,
    baseDelayMs = 1000,
    maxDelayMs = 20_000,
    timeoutMs = 60_000,
  } = options;

  return async function generate(prompt: string): Promise<Generation> {
    const body = JSON.stringify({
      model,
      max_tokens: maxOutputTokens,
      ...(temperature === null ? {} : { temperature }),
      ...(thinking === null ? {} : { thinking: { type: thinking } }),
      messages: [{ role: "user", content: prompt }],
    });

    for (let attempt = 0; ; attempt++) {
      let response: Response;
      try {
        response = await doFetch(url, {
          method: "POST",
          headers: { "content-type": "application/json", "x-api-key": apiKey, "anthropic-version": ANTHROPIC_VERSION },
          body,
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch (err) {
        console.error(`Anthropic API unreachable: ${err instanceof Error ? err.name : "error"}`);
        throw llmUnavailable();
      }

      if (response.ok) {
        const data = (await response.json().catch(() => null)) as {
          content?: { type: string; text?: string }[];
          stop_reason?: string | null;
          usage?: { input_tokens?: number; output_tokens?: number };
        } | null;
        const text = data?.content?.filter((block) => block.type === "text").map((block) => block.text ?? "").join("");
        if (!text) {
          const blocks = data?.content?.map((block) => block.type).join(", ") || "none";
          console.error(`Anthropic API returned no text content (stop_reason: ${data?.stop_reason ?? "none"}, blocks: ${blocks})`);
          throw llmUnavailable();
        }
        const usage = data?.usage
          ? { input_tokens: data.usage.input_tokens ?? 0, output_tokens: data.usage.output_tokens ?? 0 }
          : null;
        return { text: text.trim(), usage };
      }

      const reason = await describeError(response);
      if (RETRYABLE.has(response.status) && attempt < maxRetries) {
        const wait = retryDelayMs(attempt, response.headers.get("retry-after"), baseDelayMs, maxDelayMs);
        console.error(`Anthropic API ${response.status} (${reason}); retry ${attempt + 1}/${maxRetries} in ${Math.round(wait)}ms`);
        await sleep(wait);
        continue;
      }
      console.error(`Anthropic API failed (${response.status}): ${reason}`);
      throw llmUnavailable();
    }
  };
}
