import { expect, test } from "@playwright/test";
import { z } from "zod";
import { API_TOKEN, authHeaders, expectError, expectJson } from "./support.js";

const count = z.number().int().min(0);
const UsageSchema = z
  .object({
    llm_provider: z.enum(["ollama", "anthropic", "stub"]),
    chat_model: z.string().min(1).nullable(),
    requests: count,
    requests_without_usage: count,
    input_tokens: count,
    output_tokens: count,
  })
  .strict();

test.describe("GET /usage", () => {
  test("rejects a missing token with 401", async ({ request }) => {
    await expectError(await request.get("/usage"), 401);
  });

  test("rejects a wrong token with 401", async ({ request }) => {
    await expectError(await request.get("/usage", { headers: { Authorization: "Bearer wrong-token" } }), 401);
  });

  test("rejects the Basic scheme with 401", async ({ request }) => {
    await expectError(await request.get("/usage", { headers: { Authorization: `Basic ${API_TOKEN}` } }), 401);
  });

  test("counts each answered question; the stub model reports no tokens", async ({ request }) => {
    const before = await expectJson(await request.get("/usage", { headers: authHeaders }), 200, UsageSchema);
    expect(before.llm_provider).toBe("stub");
    await request.post("/ask", { data: { question: "How long do card payments take to settle?" }, headers: authHeaders });
    const after = await expectJson(await request.get("/usage", { headers: authHeaders }), 200, UsageSchema);
    // Other tests may ask in parallel, so the counts can rise by more than one.
    expect(after.requests).toBeGreaterThan(before.requests);
    expect(after.requests_without_usage).toBe(after.requests);
    expect(after.input_tokens).toBe(0);
    expect(after.output_tokens).toBe(0);
  });

  test("POST is not a route and returns a JSON 404", async ({ request }) => {
    await expectError(await request.post("/usage", { data: {}, headers: authHeaders }), 404);
  });
});
