/**
 * Validates and sanitizes a 'next' / return redirect URL parameter to prevent open redirect vulnerabilities.
 * Only allows relative paths starting with '/' and rejects protocol-relative ('//'),
 * backslash-prefixed ('/\', '\\'), control characters (tabs, newlines, nulls), external domains, or non-string inputs.
 */
export function safeNext(next?: string | null, fallback: string = "/dashboard"): string {
  if (!next || typeof next !== "string") {
    return fallback;
  }

  // Reject control characters (\u0000-\u0020, tabs, newlines, etc.) or backslashes immediately
  if (/[\\\u0000-\u0020]/.test(next)) {
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
    // Ensure pathname still starts with a single '/' and not protocol-relative
    if (!parsed.pathname.startsWith("/") || parsed.pathname.startsWith("//")) {
      return fallback;
    }
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return fallback;
  }
}
