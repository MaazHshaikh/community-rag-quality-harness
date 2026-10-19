import type { TokenUsage } from "./anthropic.js";

// Token counts summed over every /ask since this process started. Eval scripts read GET /usage
// before and after a suite; the difference is that suite's usage.
const totals = { requests: 0, requests_without_usage: 0, input_tokens: 0, output_tokens: 0, truncated: 0 };

export function recordUsage(usage: TokenUsage | null, truncated: boolean) {
  totals.requests += 1;
  if (truncated) totals.truncated += 1;
  if (!usage) {
    totals.requests_without_usage += 1;
    return;
  }
  totals.input_tokens += usage.input_tokens;
  totals.output_tokens += usage.output_tokens;
}

export const usageTotals = () => ({ ...totals });
