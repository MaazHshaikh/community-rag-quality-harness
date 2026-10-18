import { expect, test } from "@playwright/test";
import { API_TOKEN, AskSchema, authHeaders, expectError, expectJson, SearchSchema } from "./support.js";

const endpoints = [
  { path: "/ask", body: { question: "How long do card payments take to settle?" } },
  { path: "/search", body: { query: "How long do card payments take to settle?" } },
];

for (const { path, body } of endpoints) {
  test.describe(`POST ${path} auth`, () => {
    test("rejects a missing token with 401", async ({ request }) => {
      const response = await request.post(path, { data: body });
      await expectError(response, 401);
      expect(response.headers()["www-authenticate"]).toBe("Bearer");
    });

    test("rejects a wrong token with 401", async ({ request }) => {
      const response = await request.post(path, {
        data: body,
        headers: { Authorization: "Bearer wrong-token" },
      });
      await expectError(response, 401);
    });

    test("rejects the Basic scheme with 401", async ({ request }) => {
      const response = await request.post(path, {
        data: body,
        headers: { Authorization: `Basic ${API_TOKEN}` },
      });
      await expectError(response, 401);
    });

    test("checks auth before parsing the body", async ({ request }) => {
      const response = await request.post(path, {
        data: "{bad json",
        headers: { "Content-Type": "application/json" },
      });
      await expectError(response, 401);
    });

    test("accepts a valid token", async ({ request }) => {
      const response = await request.post(path, { data: body, headers: authHeaders });
      await expectJson(response, 200, path === "/ask" ? AskSchema : SearchSchema);
    });
  });
}
