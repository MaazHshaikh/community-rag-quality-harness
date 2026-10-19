// Estimated API cost of a run from its token counts. Pure, so it can be unit-tested.
// Prices in US dollars per million tokens, standard (non-batch, no caching) rates.

export interface ModelPrice {
  input_per_mtok: number;
  output_per_mtok: number;
  source: string;
}

export const PRICES: Record<string, ModelPrice> = {
  // Prompts up to 100K tokens; ours are about 1-2K. Longer prompts cost 5x.
  "claude-haiku-5-5": { input_per_mtok: 0.1, output_per_mtok: 0.5, source: "platform.claude.com/docs/en/about-claude/pricing, checked 2026-10-19" },
  // Local models: no API bill (hardware and electricity aren't counted).
  "llama3.2:3b": { input_per_mtok: 0, output_per_mtok: 0, source: "local Ollama, no API cost" },
};

export interface UsageCounts {
  requests: number;
  requests_without_usage: number;
  input_tokens: number;
  output_tokens: number;
  // Answers cut off by the output limit. Missing in usage files written before it was counted.
  truncated?: number;
}

// Rounded to 6 decimals (a millionth of a dollar). null when the model has no known price, or when
// some requests reported no token counts, since the estimate would then be too low.
export function estimateCostUsd(model: string | null, usage: UsageCounts): number | null {
  const price = model === null ? undefined : PRICES[model];
  if (!price || usage.requests_without_usage > 0) return null;
  const cost = (usage.input_tokens * price.input_per_mtok + usage.output_tokens * price.output_per_mtok) / 1_000_000;
  return Math.round(cost * 1e6) / 1e6;
}

export const ZERO_USAGE: UsageCounts = { requests: 0, requests_without_usage: 0, input_tokens: 0, output_tokens: 0, truncated: 0 };

export function addUsage(a: UsageCounts, b: UsageCounts): UsageCounts {
  return {
    requests: a.requests + b.requests,
    requests_without_usage: a.requests_without_usage + b.requests_without_usage,
    input_tokens: a.input_tokens + b.input_tokens,
    output_tokens: a.output_tokens + b.output_tokens,
    truncated: (a.truncated ?? 0) + (b.truncated ?? 0),
  };
}

export function subtractUsage(after: UsageCounts, before: UsageCounts): UsageCounts {
  return {
    requests: after.requests - before.requests,
    requests_without_usage: after.requests_without_usage - before.requests_without_usage,
    input_tokens: after.input_tokens - before.input_tokens,
    output_tokens: after.output_tokens - before.output_tokens,
    truncated: (after.truncated ?? 0) - (before.truncated ?? 0),
  };
}
