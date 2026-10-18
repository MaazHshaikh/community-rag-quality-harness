import { test } from "@playwright/test";
import { AskSchema, authHeaders, expectError, expectJson, SearchSchema } from "./support.js";

const MAX_INPUT_CHARS = 1000;

const endpoints = [
  { path: "/ask", field: "question", schema: AskSchema },
  { path: "/search", field: "query", schema: SearchSchema },
];

for (const { path, field, schema } of endpoints) {
  test.describe(`POST ${path} validation`, () => {
    test(`rejects a missing '${field}' with 400`, async ({ request }) => {
      const response = await request.post(path, { data: {}, headers: authHeaders });
      await expectError(response, 400);
    });

    test(`rejects an empty '${field}' with 400`, async ({ request }) => {
      const response = await request.post(path, { data: { [field]: "" }, headers: authHeaders });
      await expectError(response, 400);
    });

    test(`rejects a whitespace-only '${field}' with 400`, async ({ request }) => {
      const response = await request.post(path, { data: { [field]: "   \n\t " }, headers: authHeaders });
      await expectError(response, 400);
    });

    test(`rejects a non-string '${field}' with 400`, async ({ request }) => {
      const response = await request.post(path, { data: { [field]: 42 }, headers: authHeaders });
      await expectError(response, 400);
    });

    test(`accepts exactly ${MAX_INPUT_CHARS} characters`, async ({ request }) => {
      const response = await request.post(path, {
        data: { [field]: "a".repeat(MAX_INPUT_CHARS) },
        headers: authHeaders,
      });
      await expectJson(response, 200, schema);
    });

    test(`rejects ${MAX_INPUT_CHARS + 1} characters with 400`, async ({ request }) => {
      const response = await request.post(path, {
        data: { [field]: "a".repeat(MAX_INPUT_CHARS + 1) },
        headers: authHeaders,
      });
      await expectError(response, 400);
    });

    test("rejects malformed JSON with 400", async ({ request }) => {
      const response = await request.post(path, {
        data: "{bad json",
        headers: { ...authHeaders, "Content-Type": "application/json" },
      });
      await expectError(response, 400);
    });

    test("rejects a body over 100 KB with 413", async ({ request }) => {
      const response = await request.post(path, {
        data: { [field]: "a".repeat(120_000) },
        headers: authHeaders,
      });
      await expectError(response, 413);
    });
  });
}
