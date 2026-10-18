import { expect, test } from "@playwright/test";
import { authHeaders } from "./support.js";

test.describe("GET /health", () => {
  test("returns ok without a token", async ({ request }) => {
    const response = await request.get("/health");
    expect(response.status()).toBe(200);
    expect(await response.json()).toEqual({ status: "ok" });
  });

  test("returns ok with a token", async ({ request }) => {
    const response = await request.get("/health", { headers: authHeaders });
    expect(response.status()).toBe(200);
    expect(await response.json()).toEqual({ status: "ok" });
  });
});
