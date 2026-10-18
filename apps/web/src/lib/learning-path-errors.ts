import { ZodError } from "zod";
import { LearningPathError } from "./learning-path-contract";

export type PathGenerationFailure =
  | "provider_error"
  | "timeout"
  | "invalid_output"
  | "provider_unavailable";

// Persist only a fixed category, never provider messages, response bodies or credentials.
export function pathGenerationFailure(error: unknown): PathGenerationFailure {
  if (error instanceof ZodError || error instanceof LearningPathError)
    return "invalid_output";
  if (error instanceof Error) {
    if (["TimeoutError", "AbortError"].includes(error.name)) return "timeout";
    if (
      [
        "AI_NoObjectGeneratedError",
        "AI_NoOutputGeneratedError",
        "AI_TypeValidationError",
        "AI_JSONParseError",
      ].includes(error.name)
    )
      return "invalid_output";
  }
  return "provider_error";
}
