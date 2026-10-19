import { expect, type APIResponse } from "@playwright/test";
import { z } from "zod";
import { API_TOKEN, SIMULATE_LLM_DOWN } from "../stubEnv.js";

export { API_TOKEN, SIMULATE_LLM_DOWN };

export const authHeaders = { Authorization: `Bearer ${API_TOKEN}` };

// Contracts. `.strict()` fails on unexpected extra fields, so additions to a response are deliberate.
export const ErrorSchema = z.object({ error: z.string().min(1) }).strict();

const SourceFile = z.string().regex(/^[\w-]+\.md$/);

export const AskSchema = z
  .object({
    answer: z.string().min(1),
    sources: z.array(SourceFile).min(1).max(3),
    // The model's stop reason (null in stub mode) and whether the output limit cut the answer off.
    stop_reason: z.string().min(1).nullable(),
    truncated: z.boolean(),
  })
  .strict();

export const SearchSchema = z
  .object({
    results: z
      .array(
        z
          .object({
            source: SourceFile,
            text: z.string().min(1),
            score: z.number().min(-1).max(1),
          })
          .strict(),
      )
      .length(3),
  })
  .strict();

export async function expectJson<T extends z.ZodType>(
  response: APIResponse,
  status: number,
  schema: T,
): Promise<z.infer<T>> {
  expect(response.status()).toBe(status);
  expect(response.headers()["content-type"]).toContain("application/json");
  const parsed = schema.safeParse(await response.json());
  expect(parsed.success, parsed.error ? z.prettifyError(parsed.error) : "").toBe(true);
  return parsed.data!;
}

export function expectError(response: APIResponse, status: number) {
  return expectJson(response, status, ErrorSchema);
}
