import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { z } from "zod";
import { API_TOKEN, authHeaders, expectError, expectJson } from "./support.js";

const MetaSchema = z
  .object({
    llm_provider: z.enum(["ollama", "stub"]),
    chat_model: z.string().min(1).nullable(),
    temperature: z.number().min(0).nullable(),
    max_output_tokens: z.number().int().positive().nullable(),
    embed_provider: z.enum(["ollama", "stub"]),
    embed_model: z.string().min(1).nullable(),
    prompt_file: z.string().min(1),
    prompt_sha256: z.string().regex(/^[0-9a-f]{64}$/),
  })
  .strict();

test.describe("GET /meta", () => {
  test("rejects a missing token with 401", async ({ request }) => {
    await expectError(await request.get("/meta"), 401);
  });

  test("rejects a wrong token with 401", async ({ request }) => {
    await expectError(await request.get("/meta", { headers: { Authorization: "Bearer wrong-token" } }), 401);
  });

  test("rejects the Basic scheme with 401", async ({ request }) => {
    await expectError(await request.get("/meta", { headers: { Authorization: `Basic ${API_TOKEN}` } }), 401);
  });

  test("matches the contract", async ({ request }) => {
    await expectJson(await request.get("/meta", { headers: authHeaders }), 200, MetaSchema);
  });

  test("reports the stub configuration the test server runs with", async ({ request }) => {
    const meta = await expectJson(await request.get("/meta", { headers: authHeaders }), 200, MetaSchema);
    expect(meta).toMatchObject({
      llm_provider: "stub",
      chat_model: null,
      temperature: null,
      max_output_tokens: null,
      embed_provider: "stub",
      embed_model: null,
    });
  });

  test("prompt_sha256 is the SHA-256 of the prompt file", async ({ request }) => {
    const meta = await expectJson(await request.get("/meta", { headers: authHeaders }), 200, MetaSchema);
    const expected = createHash("sha256").update(readFileSync(meta.prompt_file, "utf8")).digest("hex");
    expect(meta.prompt_sha256).toBe(expected);
  });

  test("POST is not a route and returns a JSON 404", async ({ request }) => {
    await expectError(await request.post("/meta", { data: {}, headers: authHeaders }), 404);
  });
});
