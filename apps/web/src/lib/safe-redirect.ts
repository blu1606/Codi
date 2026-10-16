/**
 * Validates and sanitizes a 'next' redirect URL parameter to prevent open redirect vulnerabilities.
 * Only allows relative paths starting with '/' and rejects protocol-relative ('//')
 * or backslash-prefixed ('/\') paths, external domains, or non-string inputs.
 */
export function safeNext(next?: string | null, fallback: string = "/dashboard"): string {
  if (!next || typeof next !== "string") {
    return fallback;
  }

  const trimmed = next.trim();

  // Must start with '/'
  if (!trimmed.startsWith("/")) {
    return fallback;
  }

  // Reject protocol-relative '//', backslash escape '/\', or '\'
  if (trimmed.startsWith("//") || trimmed.startsWith("/\\") || trimmed.includes("\\")) {
    return fallback;
  }

  // Additional safety check: ensure parsing as URL with dummy base doesn't result in external origin
  try {
    const parsed = new URL(trimmed, "http://codi.local");
    if (parsed.origin !== "http://codi.local") {
      return fallback;
    }
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return fallback;
  }
}
