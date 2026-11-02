export interface RateLimitOptions {
  windowMs?: number; // Time window in milliseconds (default: 60,000ms = 1 min)
  max?: number; // Max requests allowed per window (default: 10)
}

interface ClientRecord {
  count: number;
  resetAt: number;
}

// In-memory store for rate limiting (zero dependencies)
const rateLimitMap = new Map<string, ClientRecord>();

// Clean up expired keys periodically to prevent memory leaks
if (typeof setInterval !== "undefined") {
  const timer = setInterval(() => {
    const now = Date.now();
    for (const [key, record] of rateLimitMap.entries()) {
      if (now > record.resetAt) {
        rateLimitMap.delete(key);
      }
    }
  }, 5 * 60 * 1000);

  // Do not block Node.js process from exiting
  if (timer.unref) {
    timer.unref();
  }
}

/**
 * Checks if the identifier has exceeded the allowed request limit.
 */
export function checkRateLimit(
  identifier: string,
  options: RateLimitOptions = {}
): { success: boolean; remaining: number; reset: number } {
  const windowMs = options.windowMs ?? 60 * 1000;
  const max = options.max ?? 10;
  const now = Date.now();

  const record = rateLimitMap.get(identifier);

  // If no record or expired window, reset count
  if (!record || now > record.resetAt) {
    const resetAt = now + windowMs;
    rateLimitMap.set(identifier, { count: 1, resetAt });
    return { success: true, remaining: max - 1, reset: resetAt };
  }

  // If already reached limit
  if (record.count >= max) {
    return { success: false, remaining: 0, reset: record.resetAt };
  }

  // Increment count
  record.count += 1;
  return { success: true, remaining: max - record.count, reset: record.resetAt };
}

/**
 * Extracts the client IP address from request headers.
 */
export function getClientIp(req: Request): string {
  const forwardedFor = req.headers.get("x-forwarded-for");
  if (forwardedFor) {
    return forwardedFor.split(",")[0].trim();
  }
  const realIp = req.headers.get("x-real-ip");
  if (realIp) {
    return realIp.trim();
  }
  return "127.0.0.1";
}
