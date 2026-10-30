import { google } from "@ai-sdk/google";

import { LlmProvider, type ResolvedLanguageModel } from "../provider";

const DEFAULT_MODEL = "gemini-3.5-flash-lite";

export class GeminiProvider extends LlmProvider {
  readonly id = "gemini";

  constructor(private readonly modelName: string = DEFAULT_MODEL) {
    super();
  }

  getModel(): ResolvedLanguageModel {
    return google(this.modelName);
  }
}
