import { openai } from "@ai-sdk/openai";

import { LlmProvider, type ResolvedLanguageModel } from "../provider";

const DEFAULT_MODEL = "gpt-4o-mini";

export class OpenAiProvider extends LlmProvider {
  readonly id = "openai";

  constructor(private readonly modelName: string = DEFAULT_MODEL) {
    super();
  }

  getModel(): ResolvedLanguageModel {
    return openai(this.modelName);
  }
}
