import express, { type ErrorRequestHandler } from "express";
import { ask, PROMPT_FILE, promptSha256 } from "./answer.js";
import { requireBearerToken } from "./auth.js";
import { loadChunks } from "./chunking.js";
import { embeddingInfo } from "./embeddings.js";
import { HttpError } from "./errors.js";
import { llm } from "./llm.js";
import { buildIndex, indexSize, search } from "./vectorStore.js";

const app = express();
const port = Number(process.env.PORT) || 3000;

const MAX_INPUT_CHARS = 1000;

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

// Serves public/index.html at "/". The page holds no token; the user types it in.
app.use(express.static("public"));

// Auth runs before body parsing, so unauthenticated requests get 401 even with a malformed body.
app.use(["/search", "/ask", "/meta"], requireBearerToken, express.json());

// The configuration this process is actually running with, so eval runs record the truth
// rather than whatever .env says now.
app.get("/meta", (_req, res) => {
  res.json({
    llm_provider: llm.info.provider,
    chat_model: llm.info.chat_model,
    temperature: llm.info.temperature,
    max_output_tokens: llm.info.max_output_tokens,
    embed_provider: embeddingInfo.provider,
    embed_model: embeddingInfo.embed_model,
    prompt_file: PROMPT_FILE,
    prompt_sha256: promptSha256,
  });
});

app.post("/search", async (req, res) => {
  const query = typeof req.body?.query === "string" ? req.body.query.trim() : "";
  if (!query) {
    throw new HttpError(400, "Field 'query' is required and must be a non-empty string");
  }
  if (query.length > MAX_INPUT_CHARS) {
    throw new HttpError(400, `Field 'query' must be at most ${MAX_INPUT_CHARS} characters`);
  }
  res.json({ results: await search(query) });
});

app.post("/ask", async (req, res) => {
  const question = typeof req.body?.question === "string" ? req.body.question.trim() : "";
  if (!question) {
    throw new HttpError(400, "Field 'question' is required and must be a non-empty string");
  }
  if (question.length > MAX_INPUT_CHARS) {
    throw new HttpError(400, `Field 'question' must be at most ${MAX_INPUT_CHARS} characters`);
  }
  res.json(await ask(question));
});

app.use((_req, _res, next) => {
  next(new HttpError(404, "Not found"));
});

// Every error leaves the API as { "error": "..." }.
const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message });
  } else if (err.type === "entity.parse.failed") {
    res.status(400).json({ error: "Request body must be valid JSON" });
  } else if (err.type === "entity.too.large") {
    res.status(413).json({ error: "Request body is too large" });
  } else {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
};
app.use(errorHandler);

const chunks = await loadChunks("docs");
await buildIndex(chunks);
console.log(`Indexed ${indexSize()} chunks from docs/`);

app.listen(port, () => {
  console.log(`Server listening on http://localhost:${port}`);
});
