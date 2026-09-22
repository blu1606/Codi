import { GeminiProvider } from "./providers/gemini-provider";
import { OpenAiProvider } from "./providers/openai-provider";
import { LlmProvider } from "./provider";

export { LlmProvider };

const PROVIDERS: Record<string, (modelName?: string) => LlmProvider> = {
  gemini: (modelName) => new GeminiProvider(modelName),
  openai: (modelName) => new OpenAiProvider(modelName),
};

// Selects the LLM provider from AI_PROVIDER (default "gemini"), optionally
// pinned to a specific model via AI_MODEL. Swapping providers is an env
// change only — callers depend on LlmProvider, never on a specific SDK.
export function getLlmProvider(): LlmProvider {
  const id = (process.env.AI_PROVIDER || "gemini").toLowerCase();
  const factory = PROVIDERS[id];

  if (!factory) {
    throw new Error(
      `Unknown AI_PROVIDER "${id}". Expected one of: ${Object.keys(PROVIDERS).join(", ")}`,
    );
  }

  return factory(process.env.AI_MODEL);
}
