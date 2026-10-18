import { requireEnv } from "./env.js";
import { postToOllama } from "./ollama.js";

// nomic-embed-text expects a task prefix: documents and queries are embedded differently.
export type EmbedTask = "search_document" | "search_query";

interface EmbeddingProvider {
  embed(texts: string[], task: EmbedTask): Promise<number[][]>;
}

function ollamaEmbeddings(): EmbeddingProvider {
  const ollamaUrl = requireEnv("OLLAMA_URL");
  const model = requireEnv("EMBED_MODEL");

  return {
    async embed(texts, task) {
      const data = await postToOllama<{ embeddings: number[][] }>(ollamaUrl, "/api/embed", {
        model,
        input: texts.map((t) => `${task}: ${t}`),
      });
      return data.embeddings;
    },
  };
}

const STUB_DIMENSIONS = 256;

// FNV-1a: a tiny, stable string hash. Same word always lands in the same slot.
function hashWord(word: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < word.length; i++) {
    hash ^= word.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0) % STUB_DIMENSIONS;
}

// Bag-of-words vectors: each word adds 1 to its hashed slot. Texts sharing words score higher,
// so retrieval still returns plausible sources, with no model and no network.
function stubEmbeddings(): EmbeddingProvider {
  return {
    async embed(texts) {
      return texts.map((text) => {
        const vector = new Array<number>(STUB_DIMENSIONS).fill(0);
        for (const word of text.toLowerCase().match(/[a-z0-9]+/g) ?? []) {
          vector[hashWord(word)] += 1;
        }
        return vector;
      });
    },
  };
}

function createProvider(): EmbeddingProvider {
  const provider = requireEnv("EMBED_PROVIDER");
  switch (provider) {
    case "ollama":
      return ollamaEmbeddings();
    case "stub":
      return stubEmbeddings();
    default:
      throw new Error(`Unsupported EMBED_PROVIDER "${provider}". Supported: ollama, stub.`);
  }
}

const embeddings = createProvider();

export function embed(texts: string[], task: EmbedTask): Promise<number[][]> {
  return embeddings.embed(texts, task);
}
