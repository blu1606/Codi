import { pathGenerationFailure, type PathGenerationFailure } from "./learning-path-errors";

/** A crashed, previously claimed attempt is ambiguous: never repeat its provider call. */
export async function attemptLearningPathGeneration<T>(
  recover: boolean,
  generate?: () => Promise<T>,
): Promise<{ result?: T; failure: PathGenerationFailure | null }> {
  if (recover) return { failure: "timeout" };
  if (!generate) return { failure: "provider_unavailable" };
  try {
    return { result: await generate(), failure: null };
  } catch (error) {
    return { failure: pathGenerationFailure(error) };
  }
}
