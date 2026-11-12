// Fetches a learner-submitted link as text for the grading assistant, with SSRF protection: http(s) only, every host
// is resolved and refused when any address is private, loopback, link-local (cloud metadata), multicast or reserved,
// redirects are followed by hand (max 3) and re-checked, and the body is capped by time, size and content type.
// GitHub repository / file pages are read from raw.githubusercontent.com instead of their HTML.
import { lookup as dnsLookup } from "node:dns/promises";
import { lookup as dnsLookupCallback, type LookupAddress } from "node:dns";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { isIP, type LookupFunction } from "node:net";
import { Readable } from "node:stream";

export const LINK_TIMEOUT_MS = 10_000;
export const LINK_MAX_BYTES = 1_500_000;
const MAX_REDIRECTS = 3;
const ALLOWED_TYPES = ["text/html", "text/plain", "text/markdown", "application/json", "text/x-markdown"];

export type LinkFetchResult =
  | { ok: true; url: string; finalUrl: string; contentType: string; text: string }
  | { ok: false; url: string; reason: string; /** Refused by the SSRF guard (not just unreachable). */ blocked?: true };

export type LookupFn = (host: string) => Promise<{ address: string; family: number }[]>;
export type FetchFn = (url: string, init: RequestInit) => Promise<Response>;

const defaultLookup: LookupFn = (host) => dnsLookup(host, { all: true, verbatim: true });

// The socket's own DNS lookup refuses blocked addresses, so the address that was checked is the one connected to
// (no DNS-rebinding window between the check and the connection).
const pinnedLookup: LookupFunction = (hostname, options, callback) => {
  dnsLookupCallback(hostname, { ...options, all: true, verbatim: true }, (error, addresses) => {
    if (error) return callback(error, "", 0);
    const list = addresses as unknown as LookupAddress[];
    if (!list.length || list.some((a) => isBlockedAddress(a.address))) {
      return callback(Object.assign(new Error("blocked address"), { code: "EBLOCKED" }), "", 0);
    }
    if ((options as { all?: boolean }).all) return (callback as unknown as (e: null, a: LookupAddress[]) => void)(null, list);
    return callback(null, list[0]!.address, list[0]!.family);
  });
};

/** fetch() look-alike over node:http(s) with pinnedLookup; never follows redirects (the caller re-checks them). */
const guardedFetch: FetchFn = (url, init) => new Promise((resolve, reject) => {
  const target = new URL(url);
  const send = target.protocol === "https:" ? httpsRequest : httpRequest;
  const req = send(target, { method: "GET", headers: init.headers as Record<string, string>, lookup: pinnedLookup, signal: init.signal ?? undefined }, (res) => {
    const headers = new Headers();
    for (const [key, value] of Object.entries(res.headers)) if (value !== undefined) headers.set(key, Array.isArray(value) ? value.join(", ") : value);
    const status = res.statusCode ?? 502;
    const body = status === 204 || status === 304 ? null : (Readable.toWeb(res) as ReadableStream<Uint8Array>);
    resolve(new Response(body, { status, headers }));
  });
  req.on("error", reject);
  req.end();
});

function ipv4Parts(ip: string) {
  const parts = ip.split(".").map(Number);
  return parts.length === 4 && parts.every((n) => Number.isInteger(n) && n >= 0 && n <= 255) ? parts : null;
}

function blockedIpv4(ip: string) {
  const p = ipv4Parts(ip);
  if (!p) return true;
  const [a, b] = p as [number, number, number, number];
  return a === 0 || a === 10 || a === 127 || a >= 224 // this network, private, loopback, multicast + reserved
    || (a === 100 && b >= 64 && b <= 127) // carrier-grade NAT
    || (a === 169 && b === 254) // link-local, cloud metadata 169.254.169.254
    || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)
    || (a === 192 && b === 0 && (p[2] === 0 || p[2] === 2)) || (a === 198 && (b === 18 || b === 19))
    || (a === 198 && b === 51 && p[2] === 100) || (a === 203 && b === 0 && p[2] === 113);
}

/** Expands an IPv6 literal to 8 groups; null when it is not one. */
function ipv6Groups(ip: string): number[] | null {
  let s = ip.toLowerCase().replace(/^\[|\]$/g, "").split("%")[0]!;
  const v4 = /(\d+\.\d+\.\d+\.\d+)$/.exec(s);
  if (v4) {
    const p = ipv4Parts(v4[1]!);
    if (!p) return null;
    s = s.slice(0, -v4[1]!.length) + `${((p[0]! << 8) | p[1]!).toString(16)}:${((p[2]! << 8) | p[3]!).toString(16)}`;
  }
  const halves = s.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(":") : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const fill = halves.length === 2 ? 8 - head.length - tail.length : 0;
  const all = [...head, ...Array(Math.max(0, fill)).fill("0"), ...tail];
  if (all.length !== 8 || all.some((g) => !/^[0-9a-f]{1,4}$/.test(g))) return null;
  return all.map((g) => parseInt(g, 16));
}

function blockedIpv6(ip: string) {
  const g = ipv6Groups(ip);
  if (!g) return true;
  if (g.every((x) => x === 0)) return true; // ::
  if (g.slice(0, 7).every((x) => x === 0) && g[7] === 1) return true; // ::1
  // IPv4-mapped (::ffff:a.b.c.d) and NAT64 (64:ff9b::a.b.c.d) carry an IPv4 address: judge that instead.
  if ((g.slice(0, 5).every((x) => x === 0) && g[5] === 0xffff) || (g[0] === 0x64 && g[1] === 0xff9b && g.slice(2, 6).every((x) => x === 0))) {
    return blockedIpv4(`${g[6]! >> 8}.${g[6]! & 255}.${g[7]! >> 8}.${g[7]! & 255}`);
  }
  if (g.slice(0, 6).every((x) => x === 0)) return true; // deprecated IPv4-compatible
  const first = g[0]!;
  // Tunnelling prefixes embed an IPv4 address (6to4 2002:a.b.c.d::, Teredo 2001:0::/32) that a host with such a
  // route would reach; no legitimate submission link needs them, so they are refused outright.
  return first === 0x2002 // 6to4
    || (first === 0x2001 && g[1] === 0) // Teredo
    || (first & 0xfe00) === 0xfc00 // fc00::/7 unique local
    || (first & 0xffc0) === 0xfe80 // fe80::/10 link-local
    || (first & 0xffc0) === 0xfec0 // fec0::/10 site-local
    || (first & 0xff00) === 0xff00 // multicast
    || (first === 0x2001 && g[1] === 0x0db8) // documentation
    || first === 0x0100 && g.slice(1, 4).every((x) => x === 0); // discard-only 100::/64
}

/** True when an address must never be fetched from the server. */
export function isBlockedAddress(ip: string): boolean {
  const version = isIP(ip.replace(/^\[|\]$/g, "").split("%")[0]!);
  if (version === 4) return blockedIpv4(ip);
  if (version === 6) return blockedIpv6(ip);
  return true;
}

/** GitHub page → its raw file (blob) or README (repository root / tree); other URLs unchanged. */
export function rawGithubUrl(input: URL): URL {
  if (input.hostname !== "github.com" && input.hostname !== "www.github.com") return input;
  const [owner, repo, kind, ref, ...rest] = input.pathname.split("/").filter(Boolean);
  if (!owner || !repo) return input;
  const name = repo.replace(/\.git$/, "");
  if (kind === "blob" && ref && rest.length) return new URL(`https://raw.githubusercontent.com/${owner}/${name}/${ref}/${rest.join("/")}`);
  if (!kind) return new URL(`https://raw.githubusercontent.com/${owner}/${name}/HEAD/README.md`);
  if (kind === "tree" && ref) return new URL(`https://raw.githubusercontent.com/${owner}/${name}/${ref}/${[...rest, "README.md"].join("/")}`);
  return input;
}

/** Refuses a URL before any request: scheme, credentials, port and every resolved address. Null when it may be fetched. */
export async function urlProblem(url: URL, lookup: LookupFn = defaultLookup): Promise<string | null> {
  if (url.protocol !== "http:" && url.protocol !== "https:") return "chỉ đọc đường dẫn http hoặc https";
  if (url.username || url.password) return "đường dẫn có kèm tên đăng nhập hoặc mật khẩu";
  if (url.port && !["80", "443", "8080", "8443"].includes(url.port)) return `cổng ${url.port} không được phép`;
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (!host || /^localhost$|\.localhost$|\.local$|\.internal$/i.test(host)) return "máy chủ nội bộ";
  let addresses: { address: string }[];
  if (isIP(host)) addresses = [{ address: host }];
  else {
    try {
      addresses = await lookup(host);
    } catch {
      return "không phân giải được tên miền";
    }
  }
  if (!addresses.length) return "không phân giải được tên miền";
  if (addresses.some((a) => isBlockedAddress(a.address))) return "địa chỉ mạng nội bộ hoặc bị chặn";
  return null;
}

/** Visible text of an HTML page: scripts, styles and tags removed, entities decoded, whitespace squashed. */
export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style|noscript|svg|template)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(br|\/p|\/div|\/li|\/h[1-6]|\/tr)\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => { const c = Number(n); return c > 0 && c < 0x110000 ? String.fromCodePoint(c) : " "; })
    .replace(/&amp;/g, "&")
    .replace(/[ \t\r\f\v]+/g, " ")
    .split("\n").map((line) => line.trim()).join("\n")
    .replace(/\n{3,}/g, "\n\n").trim();
}

async function readCapped(response: Response, max: number): Promise<Uint8Array | null> {
  if (!response.body) return new Uint8Array();
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) { await reader.cancel().catch(() => {}); return null; }
    chunks.push(value);
  }
  const out = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) { out.set(c, at); at += c.byteLength; }
  return out;
}

/**
 * Fetches a public page or file as text. Never throws: every failure is a reason the lecturer sees. Every hop is
 * checked before the request, and the default transport re-checks the address it actually connects to.
 */
export async function fetchPublicText(
  raw: string,
  options: { lookup?: LookupFn; fetchImpl?: FetchFn; timeoutMs?: number; maxBytes?: number } = {},
): Promise<LinkFetchResult> {
  const lookup = options.lookup ?? defaultLookup;
  const fetchImpl = options.fetchImpl ?? guardedFetch;
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return { ok: false, url: raw, reason: "đường dẫn không hợp lệ" };
  }
  url = rawGithubUrl(url);
  const timeoutMs = options.timeoutMs ?? LINK_TIMEOUT_MS;
  const signal = AbortSignal.timeout(timeoutMs);
  try {
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      const problem = await urlProblem(url, lookup);
      if (problem) return { ok: false, url: raw, reason: hop ? `chuyển hướng tới ${problem}` : problem, blocked: true };
      const response = await fetchImpl(url.toString(), {
        redirect: "manual", signal, headers: { Accept: "text/html,text/plain,text/markdown,application/json;q=0.9", "User-Agent": "CodiGradingBot/1.0" },
      });
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        await response.body?.cancel().catch(() => {});
        if (!location) return { ok: false, url: raw, reason: "chuyển hướng không có đích" };
        url = rawGithubUrl(new URL(location, url));
        continue;
      }
      if (!response.ok) {
        await response.body?.cancel().catch(() => {});
        return { ok: false, url: raw, reason: `máy chủ trả về lỗi ${response.status}` };
      }
      const type = (response.headers.get("content-type") ?? "").split(";")[0]!.trim().toLowerCase();
      if (!ALLOWED_TYPES.includes(type)) {
        await response.body?.cancel().catch(() => {});
        return { ok: false, url: raw, reason: `loại nội dung ${type || "không rõ"} không được đọc` };
      }
      const declared = Number(response.headers.get("content-length"));
      const max = options.maxBytes ?? LINK_MAX_BYTES;
      if (Number.isFinite(declared) && declared > max) {
        await response.body?.cancel().catch(() => {});
        return { ok: false, url: raw, reason: "trang quá lớn" };
      }
      const body = await readCapped(response, max);
      if (!body) return { ok: false, url: raw, reason: "trang quá lớn" };
      const decoded = new TextDecoder("utf-8").decode(body);
      const text = type === "text/html" ? htmlToText(decoded) : decoded.trim();
      if (!text) return { ok: false, url: raw, reason: "trang không có nội dung chữ" };
      return { ok: true, url: raw, finalUrl: url.toString(), contentType: type, text };
    }
    return { ok: false, url: raw, reason: "chuyển hướng quá nhiều lần" };
  } catch (error) {
    const aborted = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
    const blocked = (error as { code?: string } | null)?.code === "EBLOCKED";
    if (blocked) return { ok: false, url: raw, reason: "địa chỉ mạng nội bộ hoặc bị chặn", blocked: true };
    return { ok: false, url: raw, reason: aborted ? `quá thời gian chờ (${Math.ceil(timeoutMs / 1000)} giây)` : "không kết nối được" };
  }
}
