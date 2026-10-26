// Preserve the owned-course / knowledge-map / ai-advisor intent after password sign-in.
export function onboardingReturnPath(value: string | null): string {
  if (!value || /[\\\u0000-\u0020]/.test(value)) return "/dashboard";
  const isLearnPath = /^\/learn\/[^/?#]+(?:\/(?:onboarding|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}))?$/.test(value);
  const isKnowledgeMap = value === "/insights/knowledge-map";
  const isAiAdvisor = /^\/ai(?:\?.*)?$/.test(value);

  if (!isLearnPath && !isKnowledgeMap && !isAiAdvisor) return "/dashboard";
  try {
    const url = new URL(value, "https://codi.invalid");
    if (url.origin !== "https://codi.invalid") return "/dashboard";
    if (`${url.pathname}${url.search}` !== value) return "/dashboard";
    return value;
  } catch {
    return "/dashboard";
  }
}
