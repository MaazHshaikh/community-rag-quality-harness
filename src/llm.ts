import { requireEnv, requireNumberEnv } from "./env.js";
import { postToOllama } from "./ollama.js";

export interface LlmProvider {
  generate(prompt: string): Promise<string>;
}

interface GenerationOptions {
  model: string;
  temperature: number;
  maxOutputTokens: number;
}

function ollamaProvider(options: GenerationOptions): LlmProvider {
  return {
    async generate(prompt) {
      const data = await postToOllama<{ message: { content: string } }>("/api/chat", {
        model: options.model,
        messages: [{ role: "user", content: prompt }],
        stream: false,
        options: { temperature: options.temperature, num_predict: options.maxOutputTokens },
      });
      return data.message.content.trim();
    },
  };
}

function createProvider(): LlmProvider {
  const provider = requireEnv("LLM_PROVIDER");
  const options: GenerationOptions = {
    model: requireEnv("CHAT_MODEL"),
    temperature: requireNumberEnv("LLM_TEMPERATURE"),
    maxOutputTokens: requireNumberEnv("LLM_MAX_OUTPUT_TOKENS"),
  };

  switch (provider) {
    case "ollama":
      return ollamaProvider(options);
    default:
      throw new Error(`Unsupported LLM_PROVIDER "${provider}". Supported: ollama.`);
  }
}

export const llm = createProvider();
