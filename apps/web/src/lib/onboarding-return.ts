// Preserve the owned-course / knowledge-map intent after password sign-in.
export function onboardingReturnPath(value: string | null): string {
  if (!value || /[\\\u0000-\u0020]/.test(value)) return "/dashboard";
  if (!/^\/learn\/[^/?#]+(?:\/onboarding)?$/.test(value) && value !== "/insights/knowledge-map") return "/dashboard";
  return new URL(value, "https://codi.invalid").pathname === value ? value : "/dashboard";
}
