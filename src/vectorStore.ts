import type { Chunk } from "./chunking.js";
import { embed } from "./embeddings.js";

interface IndexedChunk extends Chunk {
  vector: number[];
}

export interface SearchResult {
  source: string;
  text: string;
  score: number;
}

let index: IndexedChunk[] = [];

export async function buildIndex(chunks: Chunk[]): Promise<void> {
  const vectors = await embed(
    chunks.map((c) => c.text),
    "search_document",
  );
  index = chunks.map((chunk, i) => ({ ...chunk, vector: vectors[i] }));
}

export function indexSize(): number {
  return index.length;
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  // An all-zero vector (e.g. a stub embedding of "???") has no direction; treat it as unrelated.
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export async function search(query: string, topK = 1): Promise<SearchResult[]> {
  const [queryVector] = await embed([query], "search_query");
  return index
    .map((c) => ({ source: c.source, text: c.text, score: cosineSimilarity(queryVector, c.vector) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}
