import { expect, test } from "@playwright/test";
import { SIMULATE_LLM_DOWN } from "../stubEnv.js";
import { API_TOKEN, askQuestion, holdAskRequests } from "./support.js";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
});

test.describe("happy path", () => {
  test("shows the answer and 1-3 source items", async ({ page }) => {
    await askQuestion(page, "How long do card payments take to settle?");

    await expect(page.getByTestId("answer")).toBeVisible();
    await expect(page.getByTestId("answer")).not.toBeEmpty();
    const sources = page.getByTestId("source-item");
    await expect(sources.first()).toBeVisible();
    const names = await sources.allTextContents();
    expect(names.length).toBeGreaterThanOrEqual(1);
    expect(names.length).toBeLessThanOrEqual(3);
    for (const name of names) expect(name).toMatch(/^[\w-]+\.md$/);
    await expect(page.getByTestId("error")).toBeHidden();
  });
});

test.describe("loading state", () => {
  // Stub mode answers in milliseconds, so the request is held to make the state observable.
  test("shows Thinking… and disables the button until the answer arrives", async ({ page }) => {
    const release = await holdAskRequests(page);
    await askQuestion(page, "How long do card payments take to settle?");

    await expect(page.getByTestId("loading")).toBeVisible();
    await expect(page.getByTestId("loading")).toHaveText("Thinking…");
    await expect(page.getByTestId("ask-button")).toBeDisabled();

    release();
    await expect(page.getByTestId("answer")).toBeVisible();
    await expect(page.getByTestId("loading")).toBeHidden();
    await expect(page.getByTestId("ask-button")).toBeEnabled();
  });
});

test.describe("error messages", () => {
  test("401: wrong token asks the user to check the token", async ({ page }) => {
    await askQuestion(page, "How long do card payments take to settle?", "wrong-token");
    await expect(page.getByTestId("error")).toBeVisible();
    await expect(page.getByTestId("error")).toContainText("Check that your API token is correct");
    await expect(page.getByTestId("result")).toBeHidden();
  });

  test("empty question is blocked in the browser and never sent", async ({ page }) => {
    let askRequests = 0;
    page.on("request", (request) => {
      if (request.url().endsWith("/ask")) askRequests++;
    });

    await askQuestion(page, "");

    const valueMissing = await page
      .getByTestId("question-input")
      .evaluate((el) => (el as HTMLTextAreaElement).validity.valueMissing);
    expect(valueMissing).toBe(true);
    await expect(page.getByTestId("error")).toBeHidden();
    expect(askRequests).toBe(0);
  });

  test("400: whitespace-only question asks the user to check it", async ({ page }) => {
    await askQuestion(page, "   ");
    await expect(page.getByTestId("error")).toBeVisible();
    await expect(page.getByTestId("error")).toContainText("Please check your question");
  });

  test("400: 1,001-character question shows the length limit", async ({ page }) => {
    await askQuestion(page, "a".repeat(1001));
    await expect(page.getByTestId("error")).toBeVisible();
    await expect(page.getByTestId("error")).toContainText("at most 1000 characters");
  });

  test("503: LLM outage asks the user to start Ollama", async ({ page }) => {
    await askQuestion(page, `How long do card payments take to settle? ${SIMULATE_LLM_DOWN}`);
    await expect(page.getByTestId("error")).toBeVisible();
    await expect(page.getByTestId("error")).toContainText("Make sure Ollama is running");
  });

  // Stub mode can't make the server disappear mid-test, so the network call is aborted.
  test("server unreachable shows a connection message", async ({ page }) => {
    await page.route("**/ask", (route) => route.abort("connectionrefused"));
    await askQuestion(page, "How long do card payments take to settle?");
    await expect(page.getByTestId("error")).toBeVisible();
    await expect(page.getByTestId("error")).toContainText("Could not reach the server");
    await expect(page.getByTestId("loading")).toBeHidden();
    await expect(page.getByTestId("ask-button")).toBeEnabled();
  });
});

test.describe("request handling", () => {
  // The request is held so the second click lands while the first is still in flight;
  // otherwise a fast stub response could legitimately allow a second request.
  test("double-click sends exactly one /ask request", async ({ page }) => {
    let askRequests = 0;
    page.on("request", (request) => {
      if (request.url().endsWith("/ask")) askRequests++;
    });
    const release = await holdAskRequests(page);

    await page.getByTestId("token-input").fill(API_TOKEN);
    await page.getByTestId("question-input").fill("How long do card payments take to settle?");
    await page.getByTestId("ask-button").dblclick();

    release();
    await expect(page.getByTestId("answer")).toBeVisible();
    expect(askRequests).toBe(1);
  });

  test("token field is empty after reload", async ({ page }) => {
    await page.getByTestId("token-input").fill(API_TOKEN);
    await page.reload();
    await expect(page.getByTestId("token-input")).toHaveValue("");
  });
});

test.describe("output safety", () => {
  // Stub mode never returns HTML, so the response is mocked to simulate a hostile answer.
  test("HTML in the answer and sources renders as plain text", async ({ page }) => {
    const hostileAnswer = '<img src=x onerror="window.__xss = 1"><b>bold</b>';
    const hostileSource = "<script>window.__xss = 2</script>.md";
    await page.route("**/ask", (route) =>
      route.fulfill({ json: { answer: hostileAnswer, sources: [hostileSource] } }),
    );

    await askQuestion(page, "How long do card payments take to settle?");

    await expect(page.getByTestId("answer")).toHaveText(hostileAnswer);
    await expect(page.getByTestId("source-item")).toHaveText(hostileSource);
    await expect(page.getByTestId("result").locator("img, b, script")).toHaveCount(0);
    expect(await page.evaluate(() => (window as { __xss?: number }).__xss)).toBeUndefined();
  });
});
