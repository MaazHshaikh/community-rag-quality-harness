import express, { type ErrorRequestHandler } from "express";
import { ask } from "./answer.js";
import { loadChunks } from "./chunking.js";
import { buildIndex, indexSize, search } from "./vectorStore.js";

const app = express();
const port = Number(process.env.PORT) || 3000;

app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.post("/search", async (req, res) => {
  const query = typeof req.body?.query === "string" ? req.body.query.trim() : "";
  if (!query) {
    res.status(400).json({ error: "Field 'query' is required and must be a non-empty string" });
    return;
  }
  res.json({ results: await search(query) });
});

app.post("/ask", async (req, res) => {
  const question = typeof req.body?.question === "string" ? req.body.question.trim() : "";
  if (!question) {
    res.status(400).json({ error: "Field 'question' is required and must be a non-empty string" });
    return;
  }
  res.json(await ask(question));
});

// Malformed JSON bodies get a JSON error instead of Express's default HTML page.
const jsonErrorHandler: ErrorRequestHandler = (err, _req, res, next) => {
  if (err.type === "entity.parse.failed") {
    res.status(400).json({ error: "Request body must be valid JSON" });
    return;
  }
  next(err);
};
app.use(jsonErrorHandler);

const chunks = await loadChunks("docs");
await buildIndex(chunks);
console.log(`Indexed ${indexSize()} chunks from docs/`);

app.listen(port, () => {
  console.log(`Server listening on http://localhost:${port}`);
});
