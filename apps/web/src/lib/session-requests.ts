// Requests owned by a session must stop before its logout POST revokes it.
// Keep successful logouts blocked even while Better Auth still exposes its cached
// session during navigation. A new login has a different session ID.
const endingSessions = new Set<string>();
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
  endingSessions.add(sessionId);
  notify();
  try {
    const result = await signOut();
    if (result.error) {
      endingSessions.delete(sessionId);
      notify();
    }
    return result;
  } catch (error) {
    endingSessions.delete(sessionId);
    notify();
    throw error;
  }
}
