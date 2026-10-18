import { test } from "@playwright/test";
import { authHeaders, expectError, expectJson, SearchSchema, SIMULATE_LLM_DOWN } from "./support.js";

test.describe("unknown routes", () => {
  test("GET returns a JSON 404", async ({ request }) => {
    await expectError(await request.get("/does-not-exist"), 404);
  });

  test("POST returns a JSON 404", async ({ request }) => {
    await expectError(await request.post("/does-not-exist", { data: {} }), 404);
  });

  test("POST with a token returns a JSON 404", async ({ request }) => {
    await expectError(await request.post("/does-not-exist", { data: {}, headers: authHeaders }), 404);
  });
});

test.describe("LLM outage", () => {
  test("/ask returns a JSON 503 when the LLM is down", async ({ request }) => {
    const response = await request.post("/ask", {
      data: { question: `When is the Summit? ${SIMULATE_LLM_DOWN}` },
      headers: authHeaders,
    });
    await expectError(response, 503);
  });

  test("/search does not call the LLM, so the trigger has no effect", async ({ request }) => {
    const response = await request.post("/search", {
      data: { query: `When is the Summit? ${SIMULATE_LLM_DOWN}` },
      headers: authHeaders,
    });
    await expectJson(response, 200, SearchSchema);
  });
});
