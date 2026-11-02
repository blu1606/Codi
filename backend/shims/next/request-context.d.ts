export interface RequestStore { request: Request; setCookies: string[] }
export function runWithRequest<T>(request: Request, fn: () => T): T;
export function currentRequestStore(): RequestStore | undefined;
export function applyResponseCookies(response: Response, store?: RequestStore): Response;
export function parseCookieHeader(header: string | null): Map<string, string>;
export function serializeCookie(name: string, value: string, options?: Record<string, unknown>): string;
