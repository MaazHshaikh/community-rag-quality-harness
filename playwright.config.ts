import { defineConfig } from "@playwright/test";

const PORT = 3100;

export default defineConfig({
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: `http://localhost:${PORT}`,
  },
  projects: [
    {
      name: "api",
      testDir: "tests/api",
    },
  ],
  // Starts the app in stub mode before tests and stops it after. Port 3100 never clashes
  // with `npm run dev` on 3000. Reuse is off so tests never hit a server in Ollama mode.
  webServer: {
    command: "npx tsx --env-file=.env.stub src/server.ts",
    env: { PORT: String(PORT) },
    url: `http://localhost:${PORT}/health`,
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
