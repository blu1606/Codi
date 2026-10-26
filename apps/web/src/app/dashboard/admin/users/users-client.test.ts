// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import UsersClient, { type AdminUserRow } from "./users-client";
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
vi.mock("./ban-toggle", () => ({ default: () => null }));
vi.mock("./role-select", () => ({ default: () => null }));
let root: Root | undefined;
let host: HTMLDivElement;
const users: AdminUserRow[] = [
  {
    id: "a",
    name: "An",
    email: "an@example.invalid",
    banned: false,
    roleId: "LEARNER",
    createdAt: "2026-10-20",
  },
  {
    id: "b",
    name: "Bình",
    email: "binh@example.invalid",
    banned: true,
    roleId: "LEARNER",
    createdAt: "2026-10-20",
  },
  {
    id: "c",
    name: "Chi",
    email: "chi@example.invalid",
    banned: false,
    roleId: "LECTURER",
    createdAt: "2026-10-20",
  },
  {
    id: "d",
    name: "Dung",
    email: "dung@example.invalid",
    banned: false,
    roleId: "ADMIN",
    createdAt: "2026-10-20",
  },
];
const group = () =>
  host.querySelector<HTMLElement>('[aria-label="Lọc theo trạng thái"]')!;
const names = () =>
  [...host.querySelectorAll("tbody tr")].map(
    (row) => row.querySelector("td")!.textContent,
  );
function buttonContaining(text: string, node: ParentNode = host) {
  const button = [...node.querySelectorAll<HTMLButtonElement>("button")].find(
    (item) => item.textContent?.includes(text),
  );
  expect(button, text).toBeDefined();
  return button!;
}
async function click(text: string, node: ParentNode = host) {
  await act(async () => buttonContaining(text, node).click());
}
async function mount(
  overrides: Partial<Parameters<typeof UsersClient>[0]> = {},
) {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () =>
    root!.render(
      createElement(UsersClient, { users, currentUserId: "d", ...overrides }),
    ),
  );
}
afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
  host?.remove();
});
describe("status summary filters", () => {
  it("uses global counts and composes status with role/search/reset", async () => {
    await mount();
    expect(group()).not.toBeNull();
    expect(
      [...group().querySelectorAll("button")].map((item) =>
        item.textContent?.replace(/\s+/g, " ").trim(),
      ),
    ).toEqual(["Tất cả (4)", "Đang hoạt động (3)", "Đã vô hiệu hoá (1)"]);
    await click("Đã vô hiệu hoá", group());
    expect(names()).toHaveLength(1);
    expect(names()[0]).toContain("Bình");
    const roles = host.querySelector<HTMLElement>(
      '[aria-label="Lọc theo vai trò"]',
    )!;
    await click("Giảng viên", roles);
    expect(names()).toHaveLength(0);
    await click("Tất cả", group());
    expect(names()).toHaveLength(1);
    expect(names()[0]).toContain("Chi");
    const input = host.querySelector<HTMLInputElement>("#user-search-input")!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )!.set!.call(input, " AN@EXAMPLE ");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(names()).toHaveLength(0);
    await click("Tất cả", roles);
    expect(names()).toHaveLength(1);
    expect(names()[0]).toContain("An");
    expect(buttonContaining("Đã vô hiệu hoá", group()).textContent).toContain(
      "(1)",
    );
    await click("Xoá bộ lọc");
    expect(names()).toHaveLength(4);
    expect(input.value).toBe("");
    expect(
      buttonContaining("Tất cả", group()).getAttribute("aria-pressed"),
    ).toBe("true");
  });
  it("synchronizes the summary with the existing dropdown and initial filters", async () => {
    await mount({ initialStatus: "inactive", initialRole: "LEARNER" });
    expect(
      buttonContaining("Đã vô hiệu hoá", group()).getAttribute("aria-pressed"),
    ).toBe("true");
    const select = host.querySelector<HTMLSelectElement>(
      "#user-status-filter",
    )!;
    await act(async () => {
      select.value = "active";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(
      buttonContaining("Đang hoạt động", group()).getAttribute("aria-pressed"),
    ).toBe("true");
    expect(names()).toHaveLength(1);
    expect(names()[0]).toContain("An");
    await click("Tất cả", group());
    expect(select.value).toBe("all");
    expect(names()).toHaveLength(2);
  });
  it("updates actual counts on new user props and handles an empty list", async () => {
    await mount();
    await click("Đã vô hiệu hoá", group());
    await act(async () =>
      root!.render(
        createElement(UsersClient, {
          users: users.map((user) =>
            user.id === "a" ? { ...user, banned: true } : user,
          ),
          currentUserId: "d",
        }),
      ),
    );
    expect(buttonContaining("Đã vô hiệu hoá", group()).textContent).toContain(
      "(2)",
    );
    expect(names()).toHaveLength(2);
    await act(async () =>
      root!.render(
        createElement(UsersClient, { users: [], currentUserId: "d" }),
      ),
    );
    expect(
      [...group().querySelectorAll("button")].every((item) =>
        item.textContent?.includes("(0)"),
      ),
    ).toBe(true);
    expect(host.textContent).toContain("Không có người dùng phù hợp");
  });
});
