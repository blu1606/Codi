// Preserve course onboarding intent after password sign-in; only this app route is accepted.
export function onboardingReturnPath(value: string | null): string {
  if (!value || /[\\\u0000-\u0020]/.test(value)) return "/dashboard";
  if (!/^\/learn\/[^/?#]+\/onboarding$/.test(value)) return "/dashboard";
  return new URL(value, "https://codi.invalid").pathname === value ? value : "/dashboard";
}
