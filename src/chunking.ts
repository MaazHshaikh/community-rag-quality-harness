import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

export interface Chunk {
  source: string;
  text: string;
}

const MAX_CHUNK_CHARS = 500;

// Merges consecutive paragraphs until adding the next one would pass the max size.
// A single paragraph longer than the max becomes its own chunk.
export function chunkText(text: string, source: string): Chunk[] {
  const paragraphs = text
    .split(/\r?\n\s*\r?\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  const chunks: Chunk[] = [];
  let current = "";

  for (const paragraph of paragraphs) {
    if (current && current.length + paragraph.length + 2 > MAX_CHUNK_CHARS) {
      chunks.push({ source, text: current });
      current = paragraph;
    } else {
      current = current ? `${current}\n\n${paragraph}` : paragraph;
    }
  }
  if (current) chunks.push({ source, text: current });

  return chunks;
}

export async function loadChunks(docsDir: string): Promise<Chunk[]> {
  const files = (await readdir(docsDir)).filter((f) => f.endsWith(".md")).sort();
  const chunks: Chunk[] = [];
  for (const file of files) {
    const text = await readFile(path.join(docsDir, file), "utf8");
    chunks.push(...chunkText(text, file));
  }
  return chunks;
}
