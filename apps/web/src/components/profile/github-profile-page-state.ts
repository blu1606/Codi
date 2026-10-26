import {
  projectGithubProfile,
  type GithubProfileProjection,
} from "@/lib/github-profile-analysis-contract";
import type { GithubProfileStore } from "@/lib/github-profile-store";

export type GithubLinkError = "denied" | "already_linked" | "failed" | null;

/** Server-loaded state for the GitHub profile panel. Holds no account identifiers. */
export interface GithubProfilePageState {
  initialProfile: GithubProfileProjection | null;
  initialLinked: boolean | null;
  initialLinkError: GithubLinkError;
  readFailed: boolean;
}

/** Link state shown in Settings → Tài khoản liên kết. Read-only. */
export interface GithubConnectionState {
  connected: boolean;
  username: string | null;
}

/** Only known callback codes map to local copy; provider descriptions are never rendered. */
export function githubLinkErrorFrom(error: unknown): GithubLinkError {
  if (typeof error !== "string") return null;
  if (error === "access_denied") return "denied";
  if (error === "account_already_linked_to_different_user") return "already_linked";
  return "failed";
}

export async function loadGithubProfilePageState(
  store: GithubProfileStore,
  userId: string,
  callbackError: unknown,
): Promise<GithubProfilePageState> {
  let initialProfile: GithubProfileProjection | null = null;
  let readFailed = false;
  let initialLinked: boolean | null = null;
  try {
    const stored = await store.read(userId);
    if (stored)
      initialProfile = projectGithubProfile(
        stored.snapshot,
        stored.analysis,
        stored.corrections,
      );
  } catch {
    readFailed = true;
  }
  try {
    initialLinked = Boolean(await store.getLinkedAccount(userId));
  } catch {
    // Unknown is not the same as unlinked; keep any independently loaded profile.
  }
  return {
    initialProfile,
    initialLinked,
    initialLinkError: githubLinkErrorFrom(callbackError),
    readFailed,
  };
}

/** Returns undefined when the link lookup fails, so the UI can stay neutral instead of claiming "unlinked". */
export async function loadGithubConnectionState(
  store: GithubProfileStore,
  userId: string,
): Promise<GithubConnectionState | undefined> {
  let linked: boolean;
  try {
    linked = Boolean(await store.getLinkedAccount(userId));
  } catch {
    return undefined;
  }
  if (!linked) return { connected: false, username: null };
  try {
    const stored = await store.read(userId);
    return { connected: true, username: stored?.snapshot.identity?.login ?? null };
  } catch {
    return { connected: true, username: null };
  }
}
