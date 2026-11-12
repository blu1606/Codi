import { describe, expect, it } from "vitest";
import { fetchPublicText, htmlToText, isBlockedAddress, rawGithubUrl, urlProblem, type FetchFn, type LookupFn } from "./safe-link-fetch";

const publicDns: LookupFn = async () => [{ address: "93.184.216.34", family: 4 }];
const dns = (table: Record<string, string>): LookupFn => async (host) => {
  if (!(host in table)) throw new Error("ENOTFOUND");
  return [{ address: table[host]!, family: table[host]!.includes(":") ? 6 : 4 }];
};
const respond = (status: number, headers: Record<string, string>, body = ""): Response =>
  new Response(status >= 300 && status < 400 ? null : body, { status, headers });

describe("isBlockedAddress", () => {
  it("blocks private, loopback, link-local / metadata, CGNAT and reserved IPv4", () => {
    for (const ip of ["127.0.0.1", "10.1.2.3", "172.16.0.1", "172.31.255.255", "192.168.1.10", "169.254.169.254", "0.0.0.0", "100.64.0.1", "224.0.0.1", "255.255.255.255"]) {
      expect(isBlockedAddress(ip), ip).toBe(true);
    }
  });
  it("blocks loopback, unique-local, link-local and IPv4-mapped private IPv6", () => {
    for (const ip of ["::1", "::", "fc00::1", "fd12:3456::1", "fe80::1", "::ffff:127.0.0.1", "::ffff:169.254.169.254", "ff02::1", "[::1]"]) {
      expect(isBlockedAddress(ip), ip).toBe(true);
    }
  });
  it("blocks 6to4 and Teredo tunnelling prefixes, which embed an IPv4 address", () => {
    for (const ip of ["2002:7f00:1::", "2002:a9fe:a9fe::1", "2002::1", "2001:0:4136:e378:8000:63bf:3fff:fdd2", "2001::1"]) {
      expect(isBlockedAddress(ip), ip).toBe(true);
    }
  });
  it("allows public addresses", () => {
    for (const ip of ["93.184.216.34", "8.8.8.8", "172.32.0.1", "2606:4700::6810:85e5", "::ffff:8.8.8.8", "2001:4860:4860::8888", "2a00:1450:4001::200e"]) {
      expect(isBlockedAddress(ip), ip).toBe(false);
    }
  });
});

describe("urlProblem", () => {
  it("refuses non-http schemes, credentials, odd ports, localhost names and private DNS answers", async () => {
    expect(await urlProblem(new URL("file:///etc/passwd"), publicDns)).toMatch(/http/);
    expect(await urlProblem(new URL("ftp://example.com/a"), publicDns)).toMatch(/http/);
    expect(await urlProblem(new URL("javascript:alert(1)"), publicDns)).toMatch(/http/);
    expect(await urlProblem(new URL("http://user:pw@example.com/"), publicDns)).toMatch(/mật khẩu/);
    expect(await urlProblem(new URL("http://example.com:4100/api/health"), publicDns)).toMatch(/cổng/);
    expect(await urlProblem(new URL("http://localhost/api/health"), publicDns)).toMatch(/nội bộ/);
    expect(await urlProblem(new URL("http://169.254.169.254/latest/meta-data"), publicDns)).toMatch(/bị chặn/);
    expect(await urlProblem(new URL("http://[::1]/"), publicDns)).toMatch(/bị chặn/);
    expect(await urlProblem(new URL("http://evil.example/"), dns({ "evil.example": "10.0.0.5" }))).toMatch(/bị chặn/);
    expect(await urlProblem(new URL("https://example.com/"), publicDns)).toBeNull();
  });
});

describe("fetchPublicText", () => {
  it("never requests a blocked target", async () => {
    let calls = 0;
    const fetchImpl: FetchFn = async () => { calls += 1; return respond(200, { "content-type": "text/plain" }, "secret"); };
    for (const url of ["http://169.254.169.254/latest/meta-data", "http://localhost:4100/api/health", "gopher://example.com/"]) {
      const r = await fetchPublicText(url, { lookup: publicDns, fetchImpl });
      expect(r.ok).toBe(false);
    }
    expect(calls).toBe(0);
    const r = await fetchPublicText("http://169.254.169.254/", { lookup: publicDns, fetchImpl });
    expect(r.ok === false && r.blocked).toBe(true);
  });

  it("re-checks every redirect and stops at one that points inside the network", async () => {
    const seen: string[] = [];
    const fetchImpl: FetchFn = async (url) => {
      seen.push(url);
      return respond(302, { location: "http://internal.example/admin" });
    };
    const r = await fetchPublicText("https://example.com/start", { lookup: dns({ "example.com": "93.184.216.34", "internal.example": "192.168.0.2" }), fetchImpl });
    expect(r).toMatchObject({ ok: false });
    expect(!r.ok && r.reason).toMatch(/chuyển hướng/);
    expect(seen).toEqual(["https://example.com/start"]);
  });

  it("gives up after three redirects", async () => {
    let n = 0;
    const fetchImpl: FetchFn = async () => respond(301, { location: `https://example.com/${++n}` });
    const r = await fetchPublicText("https://example.com/0", { lookup: publicDns, fetchImpl });
    expect(!r.ok && r.reason).toMatch(/quá nhiều/);
    expect(n).toBe(4);
  });

  it("reads allowed text types, strips HTML and refuses other types and oversized bodies", async () => {
    const html = await fetchPublicText("https://example.com/", { lookup: publicDns, fetchImpl: async () =>
      respond(200, { "content-type": "text/html; charset=utf-8" }, "<html><script>x()</script><h1>Phạm vi</h1><p>let &amp; const</p></html>") });
    expect(html).toMatchObject({ ok: true, text: "Phạm vi\nlet & const" });
    const binary = await fetchPublicText("https://example.com/a.zip", { lookup: publicDns, fetchImpl: async () => respond(200, { "content-type": "application/zip" }, "PK") });
    expect(!binary.ok && binary.reason).toMatch(/application\/zip/);
    const big = await fetchPublicText("https://example.com/big", { lookup: publicDns, maxBytes: 10, fetchImpl: async () => respond(200, { "content-type": "text/plain" }, "x".repeat(50)) });
    expect(!big.ok && big.reason).toMatch(/quá lớn/);
  });
});

describe("rawGithubUrl and htmlToText", () => {
  it("maps GitHub repository, tree and blob pages to raw files", () => {
    expect(rawGithubUrl(new URL("https://github.com/acme/demo")).toString()).toBe("https://raw.githubusercontent.com/acme/demo/HEAD/README.md");
    expect(rawGithubUrl(new URL("https://github.com/acme/demo/blob/main/src/app.js")).toString()).toBe("https://raw.githubusercontent.com/acme/demo/main/src/app.js");
    expect(rawGithubUrl(new URL("https://github.com/acme/demo/tree/main/docs")).toString()).toBe("https://raw.githubusercontent.com/acme/demo/main/docs/README.md");
    expect(rawGithubUrl(new URL("https://example.com/x")).toString()).toBe("https://example.com/x");
  });
  it("drops scripts and styles", () => {
    expect(htmlToText("<style>p{}</style><p>a</p><p>b</p>")).toBe("a\nb");
  });
});
