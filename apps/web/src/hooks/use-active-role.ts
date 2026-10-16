"use client";

import { useEffect, useState } from "react";
import { getPrimaryRole, ROLE, type RoleId } from "@codi-1/auth/roles";

export function useActiveRole(userId: string | undefined) {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{ userId: string; role: RoleId | null; error: boolean } | null>(null);
  useEffect(() => {
    if (!userId) return;
    const controller = new AbortController();
    fetch("/api/user/roles", { signal: controller.signal, cache: "no-store" }).then(async (response) => {
      if (!response.ok) throw new Error("roles");
      const body = await response.json();
      if (!Array.isArray(body.roles)) throw new Error("roles");
      const roles = body.roles.filter((role: unknown): role is RoleId => Object.values(ROLE).includes(role as RoleId));
      if (!controller.signal.aborted) setResult({ userId, role: getPrimaryRole(roles), error: false });
    }).catch(() => { if (!controller.signal.aborted) setResult({ userId, role: null, error: true }); });
    return () => controller.abort();
  }, [userId, attempt]);
  return {
    role: result?.userId === userId ? result?.role ?? null : null,
    loading: !!userId && result?.userId !== userId,
    error: result?.userId === userId && result?.error,
    retry: () => setAttempt((value) => value + 1),
  };
}
