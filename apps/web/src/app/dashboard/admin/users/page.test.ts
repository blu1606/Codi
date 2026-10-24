// @vitest-environment happy-dom
import { Children, isValidElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  session: { user: { id: "admin" } } as { user: { id: string } } | null,
  roles: ["ADMIN"],
  select: vi.fn(),
}));

vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => { throw new Error(`redirect:${url}`); },
}));
vi.mock("@codi-1/auth", () => ({
  ROLE: { ADMIN: "ADMIN", LEARNER: "LEARNER", LECTURER: "LECTURER" },
  getActiveRoles: async () => state.roles,
}));
vi.mock("@/services", () => ({
  auth: { api: { getSession: async () => state.session } },
  db: { select: (...args: unknown[]) => state.select(...args) },
}));
vi.mock("./ban-toggle", () => ({ default: () => null }));
vi.mock("./role-select", () => ({ default: () => null }));

import AdminUsersPage from "./page";
import UsersClient from "./users-client";

type Query = { q?: string | string[]; status?: string | string[]; role?: string | string[] };
const rows = [
  { id: "a", name: "An", email: "an@example.invalid", banned: false, roleId: "LEARNER" },
  { id: "b", name: "Binh", email: "binh@example.invalid", banned: true, roleId: "LEARNER" },
  { id: "c", name: "Chi", email: "chi@example.invalid", banned: false, roleId: "LECTURER" },
  { id: "admin", name: "Dung", email: "dung@example.invalid", banned: false, roleId: "ADMIN" },
].map((row) => ({ ...row, createdAt: new Date("2026-10-20T00:00:00Z"), banReason: null }));

async function renderPage(query?: Query) {
  const page = await AdminUsersPage(query === undefined ? {} : { searchParams: Promise.resolve(query) });
  const host = document.createElement("div");
  host.innerHTML = renderToStaticMarkup(page);
  const client = Children.toArray(page.props.children).find(
    (child) => isValidElement(child) && child.type === UsersClient,
  );
  if (!isValidElement<Parameters<typeof UsersClient>[0]>(client)) {
    throw new Error("Users page did not render UsersClient");
  }
  return {
    host,
    props: client.props,
    names: [...host.querySelectorAll("tbody tr")].map((row) => row.querySelector("td")!.textContent),
  };
}

describe("admin users page query boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.session = { user: { id: "admin" } };
    state.roles = ["ADMIN"];
    state.select.mockReturnValue({ from: () => ({ leftJoin: async () => rows }) });
  });

  it("renders the default safe query for repeated q instead of calling trim on an array", async () => {
    const { host, props, names } = await renderPage({ q: ["An", "Binh"] });
    expect(props.initialQuery).toBe("");
    expect(host.querySelector<HTMLInputElement>("#user-search-input")!.value).toBe("");
    expect(names).toHaveLength(4);
  });

  it.each([
    { status: ["inactive", "active"], role: "LEARNER" },
    { status: "inactive", role: ["ADMIN", "LEARNER"] },
    { status: ["inactive", "active"], role: ["ADMIN", "LEARNER"] },
  ])("defaults repeated filters independently: %j", async (query) => {
    const { props, names } = await renderPage(query);
    expect(props.initialStatus).toBe(typeof query.status === "string" ? query.status : undefined);
    expect(props.initialRole).toBe(typeof query.role === "string" ? query.role : undefined);
    expect(names).toHaveLength(Array.isArray(query.status) ? (Array.isArray(query.role) ? 4 : 2) : 1);
    if (query.status === "inactive") expect(names[0]).toContain("Binh");
  });

  it("ignores repeated q without dropping scalar status and role filters", async () => {
    const { props, names } = await renderPage({ q: ["Chi", "Dung"], status: "inactive", role: "LEARNER" });
    expect(props.initialQuery).toBe("");
    expect(props.initialStatus).toBe("inactive");
    expect(props.initialRole).toBe("LEARNER");
    expect(names).toHaveLength(1);
    expect(names[0]).toContain("Binh");
  });

  it.each([
    { q: " AN@EXAMPLE ", status: "active", role: "LEARNER", name: "An" },
    { q: "Binh", status: "inactive", role: "LEARNER", name: "Binh" },
    { q: "Chi", status: "active", role: "LECTURER", name: "Chi" },
    { q: "Dung", status: "active", role: "ADMIN", name: "Dung" },
  ])("preserves scalar search and filters for $name", async ({ name, ...query }) => {
    const { host, props, names } = await renderPage(query);
    expect(props.initialQuery).toBe(query.q);
    expect(props.initialStatus).toBe(query.status);
    expect(props.initialRole).toBe(query.role);
    expect(host.querySelector<HTMLInputElement>("#user-search-input")!.value).toBe(query.q);
    expect(names).toHaveLength(1);
    expect(names[0]).toContain(name);
  });

  it.each([undefined, {}, { q: "", status: "", role: "" }])("renders all users for missing or empty query %j", async (query) => {
    const { host, props, names } = await renderPage(query);
    expect(props.initialQuery).toBe("");
    expect(host.querySelector<HTMLInputElement>("#user-search-input")!.value).toBe("");
    expect(names).toHaveLength(4);
  });

  it("retains unknown scalar values while the existing client defaults unsupported filters", async () => {
    const { props, names } = await renderPage({ q: "", status: "unknown", role: "unknown" });
    expect(props.initialStatus).toBe("unknown");
    expect(props.initialRole).toBe("unknown");
    expect(names).toHaveLength(4);
  });

  it("rejects unauthenticated and non-admin access before querying users", async () => {
    state.session = null;
    await expect(renderPage({ q: ["a", "b"] })).rejects.toThrow("redirect:/login");
    state.session = { user: { id: "learner" } };
    state.roles = ["LEARNER"];
    await expect(renderPage({ q: ["a", "b"] })).rejects.toThrow("redirect:/dashboard");
    expect(state.select).not.toHaveBeenCalled();
  });
});
