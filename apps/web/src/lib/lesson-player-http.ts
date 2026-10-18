// A gateway may return HTML/plain text for 5xx. Never show parser errors to learners.
export async function readLessonResponse<T>(
  response: Response,
  fallback: string,
): Promise<T> {
  const body = await response.json().catch(() => null);
  if (!response.ok || !body)
    throw new Error(typeof body?.error === "string" ? body.error : fallback);
  return body as T;
}
