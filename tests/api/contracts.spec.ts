import { expect, test } from "@playwright/test";
import { AskSchema, authHeaders, expectJson, SearchSchema } from "./support.js";

// Structure only: these tests never assert on answer wording.
test.describe("response contracts", () => {
  test("/ask returns an answer and 1-3 unique .md sources", async ({ request }) => {
    const response = await request.post("/ask", {
      data: { question: "How much does the Scale tier cost?" },
      headers: authHeaders,
    });
    const body = await expectJson(response, 200, AskSchema);
    expect(new Set(body.sources).size).toBe(body.sources.length);
  });

  test("/search returns 3 results sorted by score, highest first", async ({ request }) => {
    const response = await request.post("/search", {
      data: { query: "How much does the Scale tier cost?" },
      headers: authHeaders,
    });
    const body = await expectJson(response, 200, SearchSchema);
    const scores = body.results.map((r) => r.score);
    expect(scores).toEqual([...scores].sort((a, b) => b - a));
  });

  test("/ask sources are a subset of /search sources for the same text", async ({ request }) => {
    const text = "Who runs fundraising office hours?";
    const ask = await expectJson(
      await request.post("/ask", { data: { question: text }, headers: authHeaders }),
      200,
      AskSchema,
    );
    const search = await expectJson(
      await request.post("/search", { data: { query: text }, headers: authHeaders }),
      200,
      SearchSchema,
    );
    const searchSources = new Set(search.results.map((r) => r.source));
    for (const source of ask.sources) expect(searchSources).toContain(source);
  });
});
