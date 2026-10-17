import { requireEnv, requireNumberEnv } from "./env.js";

export interface LlmProvider {
  generate(prompt: string): Promise<string>;
}

interface GenerationOptions {
  model: string;
  temperature: number;
  maxOutputTokens: number;
}

function ollamaProvider(options: GenerationOptions): LlmProvider {
  const ollamaUrl = requireEnv("OLLAMA_URL");

  return {
    async generate(prompt) {
      const response = await fetch(`${ollamaUrl}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: options.model,
          messages: [{ role: "user", content: prompt }],
          stream: false,
          options: { temperature: options.temperature, num_predict: options.maxOutputTokens },
        }),
      });
      if (!response.ok) {
        throw new Error(`Ollama chat failed (${response.status}): ${await response.text()}`);
      }
      const data = (await response.json()) as { message: { content: string } };
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
