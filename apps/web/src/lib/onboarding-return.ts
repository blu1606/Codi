// Preserve the owned-course / knowledge-map intent after password sign-in.
export function onboardingReturnPath(value: string | null): string {
  if (!value || /[\\\u0000-\u0020]/.test(value)) return "/dashboard";
  if (!/^\/learn\/[^/?#]+(?:\/(?:onboarding|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}))?$/.test(value) && value !== "/insights/knowledge-map") return "/dashboard";
  return new URL(value, "https://codi.invalid").pathname === value ? value : "/dashboard";
}
