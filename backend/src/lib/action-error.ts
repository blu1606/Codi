// A domain refusal from a server action: the request was understood but the rules say no (for example a lesson that
// still has learner data). The action bridge (host/server-actions.ts) answers it with its 4xx status and the message
// as written, instead of the 500 "server failed" reply that plain errors get.
export type ActionRefusalStatus = 400 | 404 | 409 | 422;

export class ActionRefusedError extends Error {
  readonly status: ActionRefusalStatus;

  constructor(message: string, status: ActionRefusalStatus = 409) {
    super(message);
    this.name = "ActionRefusedError";
    this.status = status;
  }
}

/** The JSON reply for a refusal, or null when the error is not one (the caller then treats it as a server failure). */
export function refusalResponse(error: unknown): Response | null {
  if (!(error instanceof ActionRefusedError)) return null;
  return Response.json({ error: error.message }, { status: error.status });
}
