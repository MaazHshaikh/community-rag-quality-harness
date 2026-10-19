import { expect, test } from "@playwright/test";
import { ANTHROPIC_VERSION, type AnthropicOptions, createAnthropicClient, retryDelayMs } from "../../src/anthropic.js";
import { HttpError } from "../../src/errors.js";

// No real API calls: every test passes its own fetch, and sleeps are recorded instead of waited.
const API_KEY = "sk-ant-test-key-never-logged";

const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
const apiError = (status: number, type: string, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify({ type: "error", error: { type, message: `${type} happened` } }), { status, headers });
const answer = (text: string, usage: unknown = { input_tokens: 1200, output_tokens: 80 }) =>
  ok({ type: "message", role: "assistant", content: [{ type: "text", text }], stop_reason: "end_turn", usage });

interface Harness {
  generate: ReturnType<typeof createAnthropicClient>;
  calls: { url: string; init: RequestInit }[];
  sleeps: number[];
  logs: string[];
}

// `responses` are returned in order; an Error is thrown instead of returned.
function harness(responses: (Response | Error)[], options: Partial<AnthropicOptions> = {}): Harness {
  const calls: Harness["calls"] = [];
  const sleeps: number[] = [];
  const fakeFetch = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    const next = responses.shift();
    if (!next) throw new Error("unexpected extra request");
    if (next instanceof Error) throw next;
    return next;
  }) as typeof fetch;
  const generate = createAnthropicClient({
    apiKey: API_KEY,
    model: "claude-haiku-5-5",
    temperature: 0.2,
    maxOutputTokens: 300,
    fetch: fakeFetch,
    sleep: async (ms) => void sleeps.push(ms),
    ...options,
  });
  return { generate, calls, sleeps, logs };
}

const logs: string[] = [];
let originalError: typeof console.error;
test.beforeEach(() => {
  logs.length = 0;
  originalError = console.error;
  console.error = (...args: unknown[]) => void logs.push(args.map(String).join(" "));
});
test.afterEach(() => {
  console.error = originalError;
});

async function expect503(promise: Promise<unknown>) {
  const err = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(HttpError);
  expect((err as HttpError).status).toBe(503);
  expect((err as HttpError).message).toBe("LLM service is unavailable");
  expect((err as HttpError).message).not.toContain(API_KEY);
}

test.describe("Anthropic client", () => {
  test("sends a Messages API request with the configured model and settings", async () => {
    const h = harness([answer("  Card payments settle in 2 business days.  ")]);
    await h.generate("PROMPT TEXT");

    expect(h.calls).toHaveLength(1);
    const { url, init } = h.calls[0];
    expect(url).toBe("https://api.anthropic.com/v1/messages");
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({ "content-type": "application/json", "x-api-key": API_KEY, "anthropic-version": ANTHROPIC_VERSION });
    expect(JSON.parse(init.body as string)).toEqual({
      model: "claude-haiku-5-5",
      max_tokens: 300,
      temperature: 0.2,
      messages: [{ role: "user", content: "PROMPT TEXT" }],
    });
  });

  test("returns the trimmed text and the token usage", async () => {
    const h = harness([answer("  Card payments settle in 2 business days.  ")]);
    expect(await h.generate("p")).toEqual({
      text: "Card payments settle in 2 business days.",
      usage: { input_tokens: 1200, output_tokens: 80 },
    });
  });

  test("joins text blocks and ignores other block types", async () => {
    const h = harness([ok({ content: [{ type: "thinking", thinking: "x" }, { type: "text", text: "Part one. " }, { type: "text", text: "Part two." }] })]);
    expect((await h.generate("p")).text).toBe("Part one. Part two.");
  });

  test("returns null usage when the response has none", async () => {
    const h = harness([ok({ content: [{ type: "text", text: "Answer" }] })]);
    expect((await h.generate("p")).usage).toBeNull();
  });

  test("retries a rate limit after the server's retry-after, then succeeds", async () => {
    const h = harness([apiError(429, "rate_limit_error", { "retry-after": "3" }), answer("Answer")]);
    expect((await h.generate("p")).text).toBe("Answer");
    expect(h.calls).toHaveLength(2);
    expect(h.sleeps).toEqual([3000]);
  });

  test("retries an overloaded API (529) too", async () => {
    const h = harness([apiError(529, "overloaded_error"), answer("Answer")]);
    expect((await h.generate("p")).text).toBe("Answer");
    expect(h.calls).toHaveLength(2);
  });

  test("backs off exponentially when there is no retry-after", async () => {
    const h = harness([...Array.from({ length: 3 }, () => apiError(429, "rate_limit_error")), answer("Answer")], { baseDelayMs: 1000 });
    await h.generate("p");
    expect(h.sleeps).toHaveLength(3);
    // Each wait is between half and all of base * 2^attempt.
    h.sleeps.forEach((ms, attempt) => {
      expect(ms).toBeGreaterThanOrEqual(500 * 2 ** attempt);
      expect(ms).toBeLessThanOrEqual(1000 * 2 ** attempt);
    });
  });

  test("gives up after the retry limit with a 503", async () => {
    const h = harness(Array.from({ length: 3 }, () => apiError(429, "rate_limit_error", { "retry-after": "1" })), { maxRetries: 2 });
    await expect503(h.generate("p"));
    expect(h.calls).toHaveLength(3);
    expect(h.sleeps).toEqual([1000, 1000]);
  });

  for (const [status, type] of [
    [401, "authentication_error"],
    [400, "invalid_request_error"],
    [403, "permission_error"],
    [500, "api_error"],
  ] as const) {
    test(`maps ${status} ${type} to a 503 without retrying`, async () => {
      const h = harness([apiError(status, type)]);
      await expect503(h.generate("p"));
      expect(h.calls).toHaveLength(1);
      expect(h.sleeps).toEqual([]);
      expect(logs.join("\n")).toContain(`(${status}): ${type}`);
    });
  }

  test("maps a network failure to a 503", async () => {
    const h = harness([new TypeError("fetch failed")]);
    await expect503(h.generate("p"));
  });

  test("maps a timeout to a 503 without retrying", async () => {
    const h = harness([new DOMException("The operation was aborted due to timeout", "TimeoutError")]);
    await expect503(h.generate("p"));
    expect(h.calls).toHaveLength(1);
  });

  test("maps a response with no text to a 503", async () => {
    const h = harness([ok({ content: [] })]);
    await expect503(h.generate("p"));
  });

  test("maps a non-JSON error body to a 503", async () => {
    const h = harness([new Response("<html>bad gateway</html>", { status: 502 })]);
    await expect503(h.generate("p"));
  });

  test("never logs the API key", async () => {
    const scenarios: (Response | Error)[][] = [
      [apiError(401, "authentication_error")],
      [apiError(429, "rate_limit_error"), apiError(429, "rate_limit_error"), apiError(429, "rate_limit_error")],
      [new TypeError(`fetch failed for ${API_KEY}`)],
      [ok({ content: [] })],
    ];
    for (const responses of scenarios) {
      await harness(responses, { maxRetries: 2 }).generate("p").catch(() => null);
    }
    expect(logs.length).toBeGreaterThan(0);
    expect(logs.join("\n")).not.toContain(API_KEY);
  });
});

test.describe("retryDelayMs", () => {
  test("uses retry-after seconds, capped at the maximum", () => {
    expect(retryDelayMs(0, "2", 1000, 20_000)).toBe(2000);
    expect(retryDelayMs(0, "0", 1000, 20_000)).toBe(0);
    expect(retryDelayMs(0, "120", 1000, 20_000)).toBe(20_000);
  });

  test("falls back to exponential backoff for a missing or unreadable retry-after", () => {
    expect(retryDelayMs(0, null, 1000, 20_000, () => 0)).toBe(500);
    expect(retryDelayMs(2, null, 1000, 20_000, () => 1)).toBe(4000);
    expect(retryDelayMs(1, "Wed, 21 Oct 2026 07:28:00 GMT", 1000, 20_000, () => 0.5)).toBe(1500);
    expect(retryDelayMs(10, null, 1000, 20_000, () => 1)).toBe(20_000);
  });
});
