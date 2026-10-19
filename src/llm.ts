import { createAnthropicClient, type Generation } from "./anthropic.js";
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
  generate(request: GenerateRequest): Promise<Generation>;
}

function ollamaProvider(): LlmProvider {
  const ollamaUrl = requireEnv("OLLAMA_URL");
  const model = requireEnv("CHAT_MODEL");
  const temperature = requireNumberEnv("LLM_TEMPERATURE");
  const maxOutputTokens = requireNumberEnv("LLM_MAX_OUTPUT_TOKENS");

  return {
    info: { provider: "ollama", chat_model: model, temperature, max_output_tokens: maxOutputTokens },
    async generate({ prompt }) {
      const data = await postToOllama<{ message: { content: string }; prompt_eval_count?: number; eval_count?: number }>(ollamaUrl, "/api/chat", {
        model,
        messages: [{ role: "user", content: prompt }],
        stream: false,
        options: { temperature, num_predict: maxOutputTokens },
      });
      return {
        text: data.message.content.trim(),
        usage: { input_tokens: data.prompt_eval_count ?? 0, output_tokens: data.eval_count ?? 0 },
      };
    },
  };
}

// Claude via the Anthropic Messages API. Embeddings stay on EMBED_PROVIDER (Ollama).
// LLM_TEMPERATURE=model-default sends no temperature, for models that reject the parameter.
function anthropicProvider(): LlmProvider {
  const model = requireEnv("CHAT_MODEL");
  const temperature = requireEnv("LLM_TEMPERATURE") === "model-default" ? null : requireNumberEnv("LLM_TEMPERATURE");
  const maxOutputTokens = requireNumberEnv("LLM_MAX_OUTPUT_TOKENS");
  const thinking = process.env.ANTHROPIC_THINKING || null;
  if (thinking !== null && thinking !== "disabled" && thinking !== "adaptive") {
    throw new Error(`ANTHROPIC_THINKING must be "disabled" or "adaptive", or unset for the model's default.`);
  }
  const generate = createAnthropicClient({ apiKey: requireEnv("ANTHROPIC_API_KEY"), model, temperature, maxOutputTokens, thinking });

  return {
    info: { provider: "anthropic", chat_model: model, temperature, max_output_tokens: maxOutputTokens },
    generate: ({ prompt }) => generate(prompt),
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
      return { text: `Stub answer for: ${question}`, usage: null };
    },
  };
}

function createProvider(): LlmProvider {
  const provider = requireEnv("LLM_PROVIDER");
  switch (provider) {
    case "ollama":
      return ollamaProvider();
    case "anthropic":
      return anthropicProvider();
    case "stub":
      return stubProvider();
    default:
      throw new Error(`Unsupported LLM_PROVIDER "${provider}". Supported: ollama, anthropic, stub.`);
  }
}

export const llm = createProvider();
