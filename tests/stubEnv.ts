import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";

// Same token the stub server reads, so the two can never drift apart.
export const API_TOKEN = parseEnv(readFileSync(".env.stub", "utf8")).API_TOKEN!;

// Stub-mode trigger: the stub LLM fails with the same 503 as a real Ollama outage.
export const SIMULATE_LLM_DOWN = "[simulate-llm-down]";
