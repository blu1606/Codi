// Requests owned by a session must stop before its logout POST revokes it.
// Keep successful logouts blocked even while Better Auth still exposes its cached
// session during navigation. A new login has a different session ID.
const endingSessions = new Map<string, { pending: number; succeeded: boolean }>();
const listeners = new Set<() => void>();

export function canRequestForSession(sessionId: string) {
  return !endingSessions.has(sessionId);
}

export function subscribeToSessionRequests(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

function notify() {
  for (const listener of listeners) listener();
}

export async function endSession<T extends { error: unknown }>(
  sessionId: string,
  signOut: () => Promise<T>,
): Promise<T> {
  const ending = endingSessions.get(sessionId) ?? { pending: 0, succeeded: false };
  ending.pending += 1;
  endingSessions.set(sessionId, ending);
  notify();
  try {
    const result = await signOut();
    if (!result.error) ending.succeeded = true;
    return result;
  } finally {
    // A failure releases only its own attempt, never another pending or
    // successful logout of the same cached session.
    ending.pending -= 1;
    if (ending.pending === 0 && !ending.succeeded) {
      endingSessions.delete(sessionId);
      notify();
    }
  }
}
