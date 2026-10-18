import type { Page, Route } from "@playwright/test";
import { API_TOKEN } from "../stubEnv.js";

export { API_TOKEN };

export async function askQuestion(page: Page, question: string, token = API_TOKEN) {
  await page.getByTestId("token-input").fill(token);
  await page.getByTestId("question-input").fill(question);
  await page.getByTestId("ask-button").click();
}

// Holds every /ask request until release() is called, so in-flight UI states can be
// asserted without sleeps or timing races.
export async function holdAskRequests(page: Page) {
  let release!: () => void;
  const released = new Promise<void>((resolve) => (release = resolve));
  await page.route("**/ask", async (route: Route) => {
    await released;
    await route.continue();
  });
  return release;
}
