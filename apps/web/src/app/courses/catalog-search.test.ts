// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CoursesPage from "./page";

const navigation = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => navigation }));
vi.mock("@/lib/auth-client", () => ({ authClient: { useSession: () => ({ data: null }) } }));
vi.mock("@/components/auth/auth-modal", () => ({ default: () => null }));
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const catalog = [
  { id: "react-free", slug: "react-free", title: "React Basics", category: "Frontend", level: "Beginner", description: "Build interfaces", price: 0, enrollmentCount: 20, rating: 4.4, topics: ["React", "Hooks"] },
  { id: "react-paid", slug: "react-paid", title: "React Advanced", category: "Frontend", level: "Advanced", description: "Production interfaces", price: 300000, enrollmentCount: 30, rating: 4.8, topics: ["React", "Architecture"] },
  { id: "react-api", slug: "react-api", title: "React API integration", category: "Backend", level: "Beginner", description: "Build services", price: 0, enrollmentCount: 10, rating: 4.2, topics: ["API", "Services"] },
  { id: "view-layout", slug: "view-layout", title: "Interfaces", category: "Frontend", level: "Beginner", description: "Build views", price: 0, enrollmentCount: 5, rating: 4.1, topics: ["Layout"] },
  { id: "dev-path-internal", slug: "dev-path-internal", title: "React internal fixture", category: "Frontend", level: "Beginner", description: "Internal", price: 0, enrollmentCount: 100, rating: 5, topics: [] },
].map((course) => ({ ...course, status: "published", createdAt: "2026-10-01T00:00:00Z", duration: "1 giờ", instructorId: "lecturer", instructorName: "Lecturer", reviewCount: 0, coverImageUrl: null }));

let root: Root | undefined;
const search = () => document.querySelector<HTMLInputElement>('[role="combobox"]')!;
const cards = () => [...document.querySelectorAll("article[data-testid]")].map((el) => el.getAttribute("data-testid"));
const footer = () => [...document.querySelectorAll<HTMLButtonElement>('[role="option"]')].find((el) => el.textContent?.includes("Xem tất cả kết quả"))!;
async function render(url = "/courses") {
  window.history.replaceState(null, "", url);
  const host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => { root!.render(createElement(CoursesPage)); });
}
async function type(value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(search(), value);
    search().dispatchEvent(new Event("input", { bubbles: true }));
  });
}
async function key(value: string) {
  await act(async () => {
    search().dispatchEvent(new KeyboardEvent("keydown", { key: value, bubbles: true, cancelable: true }));
  });
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", vi.fn(async (url: unknown) => {
    if (url !== "/api/courses") throw new Error(`Unexpected request: ${String(url)}`);
    return Response.json({ courses: catalog });
  }));
});
afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
  document.body.innerHTML = "";
  window.history.replaceState(null, "", "/courses");
  vi.unstubAllGlobals();
});

describe("catalog typeahead destination consistency", () => {
  it("shows the active-filter grid count and preserves filters when see-all is clicked", async () => {
    await render("/courses?cat=Frontend&level=Beginner&price=free&sort=price-asc");
    await type("React");
    expect(cards()).toEqual(["course-card-react-free"]);
    expect(footer().textContent).toContain("1 kết quả");
    const options = document.querySelector('[role="listbox"]')!.textContent!;
    expect(options).not.toContain("React Advanced");
    expect(options).not.toContain("React API integration");
    expect(options).not.toContain("React internal fixture");
    await act(async () => footer().click());
    expect(document.querySelector('[role="listbox"]')).toBeNull();
    expect(search().value).toBe("React");
    expect(cards()).toEqual(["course-card-react-free"]);
    expect(document.querySelector('[role="status"]')!.textContent).toBe("1 khoá học");
    expect(new URLSearchParams(window.location.search).get("cat")).toBe("Frontend");
    expect(new URLSearchParams(window.location.search).get("level")).toBe("Beginner");
    expect(new URLSearchParams(window.location.search).get("price")).toBe("free");
    // Legacy sort option (price-asc) is normalized to 'popular' (Phù hợp nhất), so sort param is not written to URL
    expect(new URLSearchParams(window.location.search).get("sort")).toBeNull();
    expect(navigation.push).not.toHaveBeenCalled();
  });

  it("shows the advertised category-only courses in the catalog destination", async () => {
    await render();
    await type("Frontend");
    expect(cards()).toEqual(["course-card-react-paid", "course-card-react-free", "course-card-view-layout"]);
    expect(footer().textContent).toContain("3 kết quả");
    await act(async () => footer().click());
    expect(document.querySelector('[role="status"]')!.textContent).toBe("3 khoá học");
  });

  it("does not offer see-all or hidden-by-filter suggestions for zero matching results", async () => {
    await render("/courses?cat=Backend&level=Advanced");
    await type("React");
    expect(cards()).toEqual([]);
    expect(footer()).toBeUndefined();
    expect(document.querySelectorAll('[role="option"]')).toHaveLength(0);
  });

  it("uses the same destination for keyboard see-all and clears the active descendant", async () => {
    await render("/courses?cat=Frontend&level=Beginner&price=free");
    await type("React");
    await key("ArrowUp");
    expect(search().getAttribute("aria-activedescendant")).toBe(footer().id);
    expect(footer().getAttribute("aria-selected")).toBe("true");
    expect(footer().textContent).toContain("1 kết quả");
    await key("Enter");
    expect(document.querySelector('[role="listbox"]')).toBeNull();
    expect(search().getAttribute("aria-activedescendant")).toBeNull();
    expect(cards()).toEqual(["course-card-react-free"]);
    expect(navigation.push).not.toHaveBeenCalled();
  });

  it("clears a keyboard selection when active filters change the suggestions", async () => {
    await render("/courses?level=Advanced");
    await type("React");
    await key("ArrowUp");
    expect(search().getAttribute("aria-activedescendant")).not.toBeNull();
    await act(async () => {
      const category = document.querySelector<HTMLSelectElement>("#f-category")!;
      category.value = "Backend";
      category.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(cards()).toEqual([]);
    expect(footer()).toBeUndefined();
    expect(search().getAttribute("aria-activedescendant")).toBeNull();
  });

  it("keeps course navigation, query selection, Escape and sorted grid behavior", async () => {
    await render("/courses?sort=price-desc");
    await type("React");
    expect(cards()).toEqual(["course-card-react-paid", "course-card-react-free", "course-card-react-api"]);
    expect(footer().textContent).toContain("3 kết quả");
    const queryGroup = document.querySelector('[role="group"][aria-label="Gợi ý tìm kiếm"]')!;
    await act(async () => queryGroup.querySelector<HTMLButtonElement>("button")!.click());
    expect(search().value).toContain("React");
    expect(document.querySelector('[role="listbox"]')).toBeNull();
    await type("React");
    await key("ArrowDown");
    await key("Escape");
    expect(search().getAttribute("aria-activedescendant")).toBeNull();
    await act(async () => search().focus());
    const result = document.querySelector<HTMLButtonElement>('[role="group"][aria-label="Kết quả hàng đầu"] button')!;
    const slug = result.textContent!.includes("Advanced") ? "react-paid" : "react-free";
    await act(async () => result.click());
    expect(navigation.push).toHaveBeenCalledWith(`/courses/${slug}`);
  });

  it("keeps filters and the destination count through a catalog failure and retry", async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error("Catalog unavailable"));
    await render("/courses?cat=Frontend&level=Beginner&price=free");
    await type("React");
    expect(document.querySelector('[role="alert"]')!.textContent).toContain("Không thể tải khóa học");
    expect(footer()).toBeUndefined();
    const retry = [...document.querySelectorAll("button")].find((el) => el.textContent?.trim() === "Thử lại")!;
    await act(async () => retry.click());
    expect(document.querySelector('[role="alert"]')).toBeNull();
    expect(cards()).toEqual(["course-card-react-free"]);
    expect(footer().textContent).toContain("1 kết quả");
    expect(new URLSearchParams(window.location.search).get("price")).toBe("free");
  });

  it("renders the 4 Flow L1 sort options in dropdown and normalizes legacy price-desc/price-asc to popular", async () => {
    await render("/courses?sort=price-desc");
    const sortSelect = document.querySelector<HTMLSelectElement>("#f-sort")!;
    expect(sortSelect).not.toBeNull();
    const options = [...sortSelect.querySelectorAll("option")].map((o) => o.textContent);
    // Flow L1 defines exactly 4 sort options
    expect(options).toEqual([
      "Phù hợp nhất",
      "Mới nhất",
      "Đánh giá cao nhất",
      "Học nhiều nhất",
    ]);
    // Legacy price-desc is normalized to popular
    expect(sortSelect.value).toBe("popular");
    expect(new URLSearchParams(window.location.search).get("sort")).toBeNull();

    // Changing to a standard option updates dropdown and URL
    await act(async () => {
      sortSelect.value = "enrollment";
      sortSelect.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(sortSelect.value).toBe("enrollment");
    expect(new URLSearchParams(window.location.search).get("sort")).toBe("enrollment");
  });

  it("normalizes legacy sort URLs (price-asc & price-desc) to popular and renders distinctive order [B, A, C]", async () => {
    // Dữ liệu phân biệt rõ theo yêu cầu review:
    // A: giá 100k, 50 học viên (id: "course-A")
    // B: giá 300k, 100 học viên (id: "course-B")
    // C: giá 200k, 1 học viên (id: "course-C")
    // Dưới chế độ sắp xếp theo giá:
    // - price-asc: A (100k) -> C (200k) -> B (300k)
    // - price-desc: B (300k) -> C (200k) -> A (100k)
    // Khi chuẩn hóa về "popular" (mặc định):
    // - Không có query search -> sắp xếp theo enrollmentCount giảm dần -> B (100) -> A (50) -> C (1)
    const distinctCatalog = [
      { id: "A", slug: "course-a", title: "Khóa học A", category: "Frontend", level: "Beginner", description: "", price: 100000, enrollmentCount: 50, rating: 4.5, topics: [] },
      { id: "B", slug: "course-b", title: "Khóa học B", category: "Frontend", level: "Beginner", description: "", price: 300000, enrollmentCount: 100, rating: 4.8, topics: [] },
      { id: "C", slug: "course-c", title: "Khóa học C", category: "Frontend", level: "Beginner", description: "", price: 200000, enrollmentCount: 1, rating: 4.0, topics: [] },
    ].map((c) => ({ ...c, status: "published", createdAt: "2026-10-01T00:00:00Z", duration: "1 giờ", instructorId: "lecturer", instructorName: "Lecturer", reviewCount: 0, coverImageUrl: null }));

    const mockDistinctFetch = vi.fn(async (url: unknown) => {
      if (url === "/api/courses") return Response.json({ courses: distinctCatalog });
      if (url === "/api/courses/ownership") return Response.json({ ownership: {} });
      throw new Error(`Unexpected request: ${String(url)}`);
    });
    vi.stubGlobal("fetch", mockDistinctFetch);

    // 1. Kiểm tra với URL price-asc kèm theo bộ lọc cat và level để kiểm tra bảo lưu filter khác
    await render("/courses?cat=Frontend&level=Beginner&sort=price-asc");
    const sortSelectAsc = document.querySelector<HTMLSelectElement>("#f-sort")!;
    expect(sortSelectAsc.value).toBe("popular");
    // URL đã bỏ sort param, nhưng bảo lưu các filter khác
    const searchParamsAsc = new URLSearchParams(window.location.search);
    expect(searchParamsAsc.get("sort")).toBeNull();
    expect(searchParamsAsc.get("cat")).toBe("Frontend");
    expect(searchParamsAsc.get("level")).toBe("Beginner");
    // Không còn chip "Sắp xếp" trong activeChips
    const chipsAsc = [...document.querySelectorAll("span")].map((el) => el.textContent);
    expect(chipsAsc.some((text) => text?.includes("Sắp xếp:"))).toBe(false);
    // Thứ tự grid phải là B, A, C (popular/enrollment) chứ KHÔNG PHẢI A, C, B (price-asc)
    expect(cards()).toEqual(["course-card-B", "course-card-A", "course-card-C"]);

    // Dọn dẹp DOM trước lần render tiếp theo
    await act(async () => root?.unmount());
    root = undefined;
    document.body.innerHTML = "";

    // 2. Mở lại đúng URL vừa được chuẩn hóa (simulate reload trang sau khi URL đã được replaceState sạch)
    const normalizedUrl = window.location.pathname + window.location.search;
    expect(normalizedUrl).toBe("/courses?cat=Frontend&level=Beginner");
    await render(normalizedUrl);
    const sortSelectReload = document.querySelector<HTMLSelectElement>("#f-sort")!;
    expect(sortSelectReload.value).toBe("popular");
    expect(cards()).toEqual(["course-card-B", "course-card-A", "course-card-C"]);

    await act(async () => root?.unmount());
    root = undefined;
    document.body.innerHTML = "";

    // 3. Kiểm tra với URL price-desc
    await render("/courses?cat=Frontend&level=Beginner&sort=price-desc");
    const sortSelectDesc = document.querySelector<HTMLSelectElement>("#f-sort")!;
    expect(sortSelectDesc.value).toBe("popular");
    const searchParamsDesc = new URLSearchParams(window.location.search);
    expect(searchParamsDesc.get("sort")).toBeNull();
    expect(searchParamsDesc.get("cat")).toBe("Frontend");
    expect(searchParamsDesc.get("level")).toBe("Beginner");
    const chipsDesc = [...document.querySelectorAll("span")].map((el) => el.textContent);
    expect(chipsDesc.some((text) => text?.includes("Sắp xếp:"))).toBe(false);
    // Thứ tự grid phải là B, A, C (popular/enrollment) chứ KHÔNG PHẢI B, C, A (price-desc)
    expect(cards()).toEqual(["course-card-B", "course-card-A", "course-card-C"]);
  });

  it("renders topics with 'Chủ đề' badge in typeahead topResults and clicking pre-fills search", async () => {
    await render();
    await type("Hooks");
    const listbox = document.querySelector('[role="listbox"]')!;
    expect(listbox).not.toBeNull();
    const topicButton = [...listbox.querySelectorAll<HTMLButtonElement>('[role="option"]')].find((btn) => btn.textContent?.includes("Chủ đề") && btn.textContent?.includes("Hooks"));
    expect(topicButton).toBeDefined();
    await act(async () => topicButton!.click());
    expect(search().value).toBe("Hooks");
    expect(document.querySelector('[role="listbox"]')).toBeNull();
  });
});
