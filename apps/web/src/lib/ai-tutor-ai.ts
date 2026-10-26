import { generateText, Output, streamText } from "ai";
import { getLlmProvider } from "./ai";
import { tutorHintOutput } from "./ai-tutor-contract";

type Call = { system: string; prompt: string; signal: AbortSignal };
export type TutorUsage = {
  promptTokens: number | null;
  completionTokens: number | null;
};

/** Streams an answer as text chunks; provider failures are thrown from the iterator, not swallowed. */
export function streamTutorAnswer({ system, prompt, signal }: Call) {
  const model = getLlmProvider().getModel();
  const result = streamText({
    model,
    system,
    prompt,
    abortSignal: signal,
    maxRetries: 0,
    maxOutputTokens: 1200,
  });
  async function* chunks() {
    for await (const part of result.fullStream) {
      if (part.type === "text-delta") yield part.text;
      else if (part.type === "error") throw part.error;
    }
  }
  return {
    model: model.modelId,
    chunks: chunks(),
    usage: async (): Promise<TutorUsage> => {
      const usage = await Promise.resolve(result.totalUsage).catch(() => null);
      return {
        promptTokens: usage?.inputTokens ?? null,
        completionTokens: usage?.outputTokens ?? null,
      };
    },
  };
}

/** One hint step as structured output: text, referenced lines and (step 3 only) a ≤ 3-line diff. */
export async function generateTutorHint({ system, prompt, signal }: Call) {
  const model = getLlmProvider().getModel();
  const result = await generateText({
    model,
    system,
    prompt,
    abortSignal: signal,
    maxRetries: 0,
    maxOutputTokens: 1200,
    output: Output.object({ schema: tutorHintOutput }),
  });
  return {
    model: model.modelId,
    hint: tutorHintOutput.parse(result.output),
    usage: {
      promptTokens: result.usage.inputTokens ?? null,
      completionTokens: result.usage.outputTokens ?? null,
    } satisfies TutorUsage,
  };
}
