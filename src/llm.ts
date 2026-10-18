import { requireEnv, requireNumberEnv } from "./env.js";
import { llmUnavailable } from "./errors.js";
import { postToOllama } from "./ollama.js";

export interface GenerateRequest {
  prompt: string;
  question: string;
}

export interface LlmInfo {
  provider: string;
  chat_model: string | null;
  temperature: number | null;
  max_output_tokens: number | null;
}

export interface LlmProvider {
  info: LlmInfo;
  generate(request: GenerateRequest): Promise<string>;
}

function ollamaProvider(): LlmProvider {
  const ollamaUrl = requireEnv("OLLAMA_URL");
  const model = requireEnv("CHAT_MODEL");
  const temperature = requireNumberEnv("LLM_TEMPERATURE");
  const maxOutputTokens = requireNumberEnv("LLM_MAX_OUTPUT_TOKENS");

  return {
    info: { provider: "ollama", chat_model: model, temperature, max_output_tokens: maxOutputTokens },
    async generate({ prompt }) {
      const data = await postToOllama<{ message: { content: string } }>(ollamaUrl, "/api/chat", {
        model,
        messages: [{ role: "user", content: prompt }],
        stream: false,
        options: { temperature, num_predict: maxOutputTokens },
      });
      return data.message.content.trim();
    },
  };
}

export const SIMULATE_LLM_DOWN = "[simulate-llm-down]";

// Deterministic answers for tests. Only this provider honors the outage trigger.
function stubProvider(): LlmProvider {
  return {
    info: { provider: "stub", chat_model: null, temperature: null, max_output_tokens: null },
    async generate({ question }) {
      if (question.includes(SIMULATE_LLM_DOWN)) {
        console.error("Stub LLM: simulated outage");
        throw llmUnavailable();
      }
      return `Stub answer for: ${question}`;
    },
  };
}

function createProvider(): LlmProvider {
  const provider = requireEnv("LLM_PROVIDER");
  switch (provider) {
    case "ollama":
      return ollamaProvider();
    case "stub":
      return stubProvider();
    default:
      throw new Error(`Unsupported LLM_PROVIDER "${provider}". Supported: ollama, stub.`);
  }
}

export const llm = createProvider();
