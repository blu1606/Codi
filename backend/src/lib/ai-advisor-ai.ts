import { generateText, Output } from "ai";
import { z } from "zod";
import { getLlmProvider } from "./ai";
import type { AdvisorModelOutput } from "./ai-advisor-service";

// Lengths and counts are trimmed by toAdvisorAnswer, so a verbose model never fails the whole answer.
const pickSchema = z.object({ id: z.string(), reason: z.string() });
export const advisorModelOutput = z.object({
  text: z.string().min(1),
  courses: z.array(pickSchema),
  compare: z.boolean(),
  order: z.array(pickSchema),
  followups: z.array(z.string()),
  noMatch: z.boolean(),
}) satisfies z.ZodType<AdvisorModelOutput>;

/** One advisor answer from the configured provider (AI_PROVIDER / AI_MODEL). */
export async function generateAdvisorAnswer(
  input: { system: string; prompt: string },
  signal?: AbortSignal,
) {
  const model = getLlmProvider().getModel();
  const result = await generateText({
    model,
    system: input.system,
    prompt: input.prompt,
    abortSignal: signal,
    maxRetries: 0,
    maxOutputTokens: 1500,
    output: Output.object({ schema: advisorModelOutput }),
  });
  return {
    output: advisorModelOutput.parse(result.output),
    model: model.modelId,
    promptTokens: result.usage.inputTokens ?? null,
    completionTokens: result.usage.outputTokens ?? null,
  };
}
