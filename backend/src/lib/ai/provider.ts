import type { LanguageModel } from "ai";

// Excludes the AI SDK's bare-string GlobalProviderModelId form — a provider
// here always returns an already-resolved model instance, which is what
// wrapLanguageModel's `model` option actually requires.
export type ResolvedLanguageModel = Exclude<LanguageModel, string>;

export abstract class LlmProvider {
  abstract readonly id: string;

  abstract getModel(): ResolvedLanguageModel;
}
