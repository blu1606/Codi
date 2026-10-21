// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import GithubProfilePanel from "./github-profile-panel";
import { projectGithubProfile } from "@/lib/github-profile-analysis-contract";
import {
  GITHUB_PROFILE_LIMITS,
  type GithubCollectionSnapshot,
} from "@/lib/github-profile-contract";

const auth = vi.hoisted(() => ({ linkSocial: vi.fn() }));
vi.mock("@/lib/auth-client", () => ({ authClient: auth }));

// Synthetic transport responses exercise the real panel/projection, not live acceptance.
function profile() {
  const source: GithubCollectionSnapshot = {
    version: 1,
    status: "partial",
    identity: { id: "123", login: "linked-user" },
    collectedAt: "2026-10-20T00:00:00Z",
    repositories: [
      {
        id: 1,
        owner: "linked-user",
        name: "project",
        defaultBranch: "main",
        pushedAt: null,
        disposition: "selected",
        commitSha: null,
        files: [{ path: "package.json", state: "unavailable" }],
      },
    ],
    evidence: [
      {
        id: "languages-1",
        kind: "languages",
        repositoryId: 1,
        bytes: { TypeScript: 100 },
        sourceUrl: "https://api.github.com/repos/linked-user/project/languages",
        collectedAt: "2026-10-20T00:00:00Z",
      },
    ],
    issues: [
      {
        operation: "file",
        code: "request_timeout",
        repositoryId: 1,
        path: "package.json",
      },
    ],
    coverage: {
      publicAccess: "anonymous",
      listingComplete: false,
      listed: 1,
      selected: 1,
      requests: 4,
      responseBytes: 1000,
      elapsedMs: 10,
      limits: GITHUB_PROFILE_LIMITS,
    },
  };
  const supports = [
    {
      observationId: "language:TypeScript:language_bytes",
      evidenceId: "languages-1",
      repositoryId: 1,
    },
  ];
  return projectGithubProfile(source, {
    technologies: [
      {
        technologyId: "language:TypeScript",
        usage: "tried",
        confidence: "low",
        explanation: "Suy luận có giới hạn.",
        supports,
      },
    ],
    areas: [
      {
        areaId: "frontend",
        label: "Giao diện",
        confidence: "low",
        explanation: "Chưa được kiểm chứng.",
        supports,
      },
    ],
    overall: {
      level: "basic",
      confidence: "low",
      summary: "Ước tính ban đầu.",
      supports,
    },
  });
}
const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
  });
let root: Root;
let host: HTMLDivElement;
let fetcher: ReturnType<typeof vi.fn>;

async function mount() {
  await act(async () => root.render(createElement(GithubProfilePanel)));
}
function button(label: string): HTMLButtonElement {
  const found = Array.from(document.querySelectorAll("button")).find(
    (item) => item.textContent?.trim() === label,
  );
  if (!found) throw new Error(`Missing button: ${label}`);
  return found;
}
async function click(label: string) {
  await act(async () => button(label).click());
}
async function submit() {
  await act(async () =>
    document
      .querySelector("[role=dialog] form")!
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })),
  );
}
async function changeInput(value: string) {
  await act(async () => {
    const input = document.querySelector<HTMLInputElement>(
      "#github-profile-input",
    )!;
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  fetcher = vi.fn().mockResolvedValue(json({ profile: profile() }));
  vi.stubGlobal("fetch", fetcher);
  auth.linkSocial.mockResolvedValue({ data: { redirect: true }, error: null });
});
afterEach(async () => {
  await act(async () => root.unmount());
  document.body.replaceChildren();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("GitHub profile consent and request UI", () => {
  async function show(result = profile()) {
    await act(async () =>
      root.render(
        createElement<{ initialProfile: ReturnType<typeof profile> }>(
          GithubProfilePanel,
          { initialProfile: result },
        ),
      ),
    );
  }

  it("derives language shares from positive observed bytes, retaining row citations", async () => {
    const result = profile();
    const original = result.technologies[0]!.observations[0]!;
    result.technologies[0]!.observations.push({
      ...original,
      id: "other",
      technology: "Python",
      languageBytes: 300,
      citations: [
        {
          ...original.citations[0]!,
          evidenceId: "languages-2",
          repositoryId: 2,
          sourceUrl: "https://api.github.com/repos/linked-user/other/languages",
        },
      ],
    });
    await show(result);
    expect(
      host
        .querySelector('[aria-label="Tỉ lệ byte TypeScript"]')
        ?.getAttribute("aria-valuenow"),
    ).toBe("25");
    expect(
      host
        .querySelector('[aria-label="Tỉ lệ byte Python"]')
        ?.getAttribute("aria-valuenow"),
    ).toBe("75");
    expect(host.textContent).toContain("100 byte · 25%");
    const evidence = host.querySelector<HTMLButtonElement>(
      '[aria-label="Xem bằng chứng: Ngôn ngữ Python"]',
    )!;
    expect(evidence.tagName).toBe("BUTTON");
    expect(evidence.tabIndex).toBe(0);
    evidence.focus();
    expect(document.activeElement).toBe(evidence);
    await act(async () => evidence.click());
    const dialog = document.querySelector('[role="dialog"]')!;
    expect(dialog.textContent).toContain("Repo #2");
    expect(dialog.textContent).not.toContain("Repo #1");
    expect(dialog.querySelector("a")?.href).toBe(
      "https://api.github.com/repos/linked-user/other/languages",
    );
    await act(async () =>
      dialog.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      ),
    );
  });

  it.each([undefined, 0, -1])(
    "omits the language chart without positive byte observations (%s)",
    async (bytes) => {
      const result = profile();
      result.technologies[0]!.observations[0]!.languageBytes = bytes;
      await show(result);
      expect(host.querySelector('[role="meter"]')).toBeNull();
      expect(host.textContent).toContain("chưa có số byte ngôn ngữ dương");
      expect(host.textContent).toContain(
        "Không xuất hiện trên GitHub không chứng minh năng lực yếu",
      );
    },
  );

  it.each(["tried", "regular", "deep"] as const)(
    "shows categorical usage %s without a numeric mastery score",
    async (usage) => {
      const result = profile();
      result.technologies[0]!.usage = usage;
      result.technologies[0]!.inference!.confidence = "high";
      await show(result);
      const technology = host.querySelector('[aria-label="Công nghệ"]')!;
      expect(technology.textContent).toContain(
        { tried: "Đã thử", regular: "Dùng thường xuyên", deep: "Dùng sâu" }[
          usage
        ],
      );
      expect(technology.textContent).toContain("Ước tính từ GitHub");
      expect(
        technology.querySelectorAll('[aria-hidden="true"] > span.bg-primary')
          .length,
      ).toBe({ tried: 1, regular: 2, deep: 3 }[usage]);
      const signals = host.querySelector(
        '[aria-label="Tín hiệu và điều cần xác nhận"]',
      )!;
      expect(signals.textContent).toContain(
        usage === "tried"
          ? "Không phải điểm yếu đã được chứng minh"
          : "TypeScript",
      );
      expect(technology.textContent).not.toContain("%");
      expect(
        signals.querySelector("h4")!.nextElementSibling!.textContent,
      ).toContain(
        usage === "tried" ? "Chưa đủ bằng chứng cho điểm mạnh" : "TypeScript",
      );
      expect(
        host.querySelector('[aria-label="Mảng kiến thức"]')?.textContent,
      ).toContain("Độ tin cậy Thấp");
    },
  );

  it("preserves learner overrides without promoting them to inferred strengths", async () => {
    const result = profile();
    result.technologies[0]!.usage = "deep";
    result.technologies[0]!.usageSource = "learner";
    result.technologies[0]!.learnerEdited = true;
    result.technologies[0]!.inference = null;
    await show(result);
    expect(
      host.querySelector('[aria-label="Công nghệ"]')?.textContent,
    ).toContain("Bạn đã sửa");
    expect(host.textContent).toContain("Chưa đủ bằng chứng cho điểm mạnh");
  });

  it("keeps low-confidence deep usage in needs-confirmation, not strengths", async () => {
    const result = profile();
    result.technologies[0]!.usage = "deep";
    await show(result);
    const signals = host.querySelector(
      '[aria-label="Tín hiệu và điều cần xác nhận"]',
    )!;
    expect(
      signals.querySelector("h4")!.nextElementSibling!.textContent,
    ).toContain("Chưa đủ bằng chứng cho điểm mạnh");
    expect(signals.textContent).toContain(
      "Không phải điểm yếu đã được chứng minh",
    );
  });

  it.each(["Công nghệ TypeScript", "Mảng kiến thức Giao diện"])(
    "reveals retained evidence for %s",
    async (label) => {
      await show();
      const trigger = host.querySelector<HTMLButtonElement>(
        `[aria-label="Xem bằng chứng: ${label}"]`,
      )!;
      expect(trigger.tabIndex).toBe(0);
      await act(async () => trigger.click());
      const dialog = document.querySelector('[role="dialog"]')!;
      expect(dialog.textContent).toContain(`Bằng chứng: ${label}`);
      expect(dialog.querySelector("a")?.href).toBe(
        "https://api.github.com/repos/linked-user/project/languages",
      );
    },
  );

  it.each([200, 502])(
    "cycles only illustrative pending steps and cleans up after HTTP %i",
    async (status) => {
      let finish!: (value: Response) => void;
      fetcher.mockImplementation(
        () =>
          new Promise<Response>((resolve) => {
            finish = resolve;
          }),
      );
      await mount();
      await click("Phân tích GitHub");
      vi.useFakeTimers();
      const interval = vi.spyOn(globalThis, "setInterval");
      const clear = vi.spyOn(globalThis, "clearInterval");
      await submit();
      const waiting = () =>
        host.querySelector('[aria-label="Minh hoạ chờ phân tích"]')!;
      const first = waiting().textContent;
      expect(first).toContain("không phải tiến độ thực tế");
      expect(waiting().querySelectorAll("li")).toHaveLength(5);
      expect(waiting().querySelector('[role="progressbar"]')).toBeNull();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(2000);
      });
      expect(waiting().textContent).not.toBe(first);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(8000);
      });
      expect(waiting().textContent).toBe(first);
      expect(host.querySelector('[aria-label="Kết quả phân tích"]')).toBeNull();
      expect(waiting().textContent).not.toMatch(
        /%|\d+\/\d+|Đã xong|Đã hoàn tất/,
      );
      await act(async () =>
        finish(
          status === 200
            ? json({ profile: profile() })
            : json({ error: "Lỗi cuối", code: "failed" }, status),
        ),
      );
      expect(
        host.querySelector('[aria-label="Minh hoạ chờ phân tích"]'),
      ).toBeNull();
      expect(clear).toHaveBeenCalledWith(interval.mock.results[0]!.value);
      expect(
        Boolean(host.querySelector('[aria-label="Kết quả phân tích"]')),
      ).toBe(status === 200);
      const terminal = host.textContent;
      await act(async () => {
        await vi.advanceTimersByTimeAsync(10_000);
      });
      expect(host.textContent).toBe(terminal);
      interval.mockRestore();
      clear.mockRestore();
    },
  );

  it("starts no checklist timer on consent cancellation and clears it on pending unmount", async () => {
    fetcher.mockImplementation(() => new Promise(() => {}));
    await mount();
    vi.useFakeTimers();
    const interval = vi.spyOn(globalThis, "setInterval");
    const clear = vi.spyOn(globalThis, "clearInterval");
    await click("Phân tích GitHub");
    await click("Để sau");
    expect(interval).not.toHaveBeenCalled();
    await click("Phân tích GitHub");
    await submit();
    await act(async () => root.render(null));
    expect(clear).toHaveBeenCalledWith(interval.mock.results[0]!.value);
    expect(fetcher.mock.calls[0]![1].signal.aborted).toBe(true);
    interval.mockRestore();
    clear.mockRestore();
  });

  it("does not read GitHub or start analysis on mount, input, cancel or reopen", async () => {
    await mount();
    await click("Phân tích GitHub");
    expect(document.body.textContent).toContain(
      "Không đọc repo riêng tư · Không ghi gì lên GitHub · Không chia sẻ với giảng viên.",
    );
    await changeInput("https://github.com/intent-only");
    await click("Để sau");
    await click("Phân tích GitHub");
    expect(fetcher).not.toHaveBeenCalled();
    expect(auth.linkSocial).not.toHaveBeenCalled();
  });

  it("posts only explicit consent and optional intent, then shows the server-bound identity", async () => {
    await mount();
    await click("Phân tích GitHub");
    await changeInput("  intent-only  ");
    await submit();
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenCalledWith(
      "/api/github-profile",
      expect.objectContaining({
        method: "POST",
        credentials: "same-origin",
        redirect: "error",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        signal: expect.any(AbortSignal),
        body: JSON.stringify({
          consentVersion: "public-github-v1",
          githubProfileInput: "intent-only",
        }),
      }),
    );
    expect(host.textContent).toContain("@linked-user");
    expect(host.textContent).not.toContain("@intent-only");
    expect(host.textContent).toContain("100 byte");
    expect(host.textContent).toContain("Suy luận chưa kiểm chứng");
    expect(host.textContent).toContain("Chỉ thu thập được một phần");
    expect(host.textContent).toContain("chưa đọc được");
    expect(host.textContent).toContain("không phải điểm");
    expect(host.textContent).not.toContain("Đã lưu");
  });

  it("accepts an empty optional input", async () => {
    await mount();
    await click("Phân tích GitHub");
    await submit();
    expect(JSON.parse(fetcher.mock.calls[0]![1].body).githubProfileInput).toBe(
      "",
    );
  });

  it.each([401, 403, 409, 429, 502, 504])(
    "shows HTTP %i failures without automatic retries",
    async (status) => {
      fetcher.mockResolvedValue(
        json(
          {
            error: "Không thể thực hiện yêu cầu.",
            code: "typed_failure",
            retryAt: "2026-10-20T01:00:00Z",
          },
          status,
        ),
      );
      await mount();
      await click("Phân tích GitHub");
      await submit();
      expect(host.textContent).toContain("Không thể thực hiện yêu cầu.");
      expect(host.textContent).toContain("Có thể thử lại sau");
      expect(fetcher).toHaveBeenCalledTimes(1);
    },
  );

  it("retains the previous result while reanalysis is pending and after failure", async () => {
    await mount();
    await click("Phân tích GitHub");
    await submit();
    let finish!: (value: Response) => void;
    fetcher.mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) => {
          finish = resolve;
        }),
    );
    await click("Phân tích lại");
    await submit();
    expect(host.textContent).toContain("Đang phân tích GitHub…");
    expect(host.textContent).toContain("@linked-user");
    expect(button("Phân tích lại").disabled).toBe(true);
    await act(async () =>
      finish(
        json(
          { error: "GitHub đang giới hạn lượt đọc.", code: "rate_limited" },
          429,
        ),
      ),
    );
    expect(host.textContent).toContain("@linked-user");
    expect(host.textContent).toContain("chưa được thay thế");
  });

  it("clears busy state at 60 seconds even if transport ignores abort; late success cannot replace results", async () => {
    await mount();
    await click("Phân tích GitHub");
    await submit();
    let finish!: (value: Response) => void;
    fetcher.mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) => {
          finish = resolve;
        }),
    );
    await click("Phân tích lại");
    vi.useFakeTimers();
    await submit();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(host.textContent).toContain("Đã hết thời gian chờ 60 giây");
    expect(button("Phân tích lại").disabled).toBe(false);
    expect(fetcher.mock.calls[1]![1].signal.aborted).toBe(true);
    const late = profile();
    late.identity!.login = "late-result";
    await act(async () => finish(json({ profile: late })));
    expect(host.textContent).toContain("@linked-user");
    expect(host.textContent).not.toContain("@late-result");
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("bounds stalled JSON body reads too", async () => {
    fetcher.mockResolvedValue({ ok: true, json: () => new Promise(() => {}) });
    await mount();
    await click("Phân tích GitHub");
    vi.useFakeTimers();
    await submit();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(host.textContent).toContain("Đã hết thời gian chờ 60 giây");
    expect(button("Phân tích GitHub").disabled).toBe(false);
  });

  it("handles non-JSON failures without clearing an existing result", async () => {
    await mount();
    await click("Phân tích GitHub");
    await submit();
    fetcher.mockResolvedValue(new Response("not json", { status: 502 }));
    await click("Phân tích lại");
    await submit();
    expect(host.textContent).toContain("Không thể đọc phản hồi máy chủ");
    expect(host.textContent).toContain("@linked-user");
  });

  it("only opens session-owned linkSocial after a separate consent; never automatically analyses on return", async () => {
    fetcher.mockResolvedValue(
      json({ error: "Chưa liên kết.", code: "github_not_linked" }, 409),
    );
    await mount();
    await click("Phân tích GitHub");
    await submit();
    expect(host.textContent).toContain(
      "Nhập tên người dùng không chứng minh quyền sở hữu",
    );
    await click("Kết nối GitHub");
    expect(auth.linkSocial).not.toHaveBeenCalled();
    await click("Để sau");
    expect(auth.linkSocial).not.toHaveBeenCalled();
    await click("Kết nối GitHub");
    await submit();
    expect(auth.linkSocial).toHaveBeenCalledWith({
      provider: "github",
      callbackURL: "/profile/github",
      errorCallbackURL: "/profile/github",
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(host.textContent).toContain("không tự phân tích khi bạn quay lại");
  });

  it("reconnects an expired GitHub link only after consent and retains the saved profile", async () => {
    fetcher.mockResolvedValue(
      json(
        {
          error: "Kết nối GitHub đã hết hiệu lực. Vui lòng kết nối lại.",
          code: "connection_expired",
        },
        502,
      ),
    );
    await act(async () =>
      root.render(
        createElement<{ initialProfile: ReturnType<typeof profile> }>(
          GithubProfilePanel,
          { initialProfile: profile() },
        ),
      ),
    );
    expect(fetcher).not.toHaveBeenCalled();
    await click("Phân tích lại");
    await submit();
    expect(button("Kết nối lại GitHub").disabled).toBe(false);
    expect(host.textContent).toContain("@linked-user");
    expect(host.textContent).toContain("Ước tính ban đầu.");

    await click("Kết nối lại GitHub");
    expect(document.querySelector("[role=dialog]")).not.toBeNull();
    expect(auth.linkSocial).not.toHaveBeenCalled();
    expect(fetcher).toHaveBeenCalledTimes(1);
    await click("Để sau");
    expect(auth.linkSocial).not.toHaveBeenCalled();
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(host.textContent).toContain("Ước tính ban đầu.");

    let finishLink!: () => void;
    auth.linkSocial.mockImplementation(() =>
      new Promise<void>((resolve) => {
        finishLink = resolve;
      }).then(() => ({ data: { redirect: true }, error: null })),
    );
    await click("Kết nối lại GitHub");
    await submit();
    expect(auth.linkSocial).toHaveBeenCalledExactlyOnceWith({
      provider: "github",
      callbackURL: "/profile/github",
      errorCallbackURL: "/profile/github",
    });
    expect(button("Phân tích lại").disabled).toBe(true);
    expect(host.textContent).toContain("Ước tính ban đầu.");
    await act(async () => finishLink());
    expect(auth.linkSocial).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(host.textContent).toContain("không tự phân tích khi bạn quay lại");
    expect(host.textContent).toContain("@linked-user");
    expect(host.textContent).toContain("Ước tính ban đầu.");
  });

  it("shows link errors without falling back to generic social sign-in", async () => {
    fetcher.mockResolvedValue(
      json({ error: "Chưa liên kết.", code: "github_not_linked" }, 409),
    );
    auth.linkSocial.mockResolvedValue({
      error: { message: "private upstream detail" },
    });
    await mount();
    await click("Phân tích GitHub");
    await submit();
    await click("Kết nối GitHub");
    await submit();
    expect(host.textContent).toContain("Chưa kết nối được GitHub");
    expect(host.textContent).not.toContain("private upstream detail");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("renders untrusted inference as escaped text and only retained GitHub metadata as citation links", async () => {
    const result = profile();
    result.overall!.summary =
      "<img src=x onerror=alert(1)> [fake](https://attacker.invalid)";
    result.technologies[0]!.observations[0]!.citations.push({
      evidenceId: "bad",
      repositoryId: 1,
      kind: "languages",
      sourceUrl: "javascript:alert(1)",
      collectedAt: result.collectedAt,
    });
    fetcher.mockResolvedValue(json({ profile: result }));
    await mount();
    await click("Phân tích GitHub");
    await submit();
    expect(host.textContent).toContain("<img src=x onerror=alert(1)>");
    expect(host.querySelector("img")).toBeNull();
    const links = Array.from(host.querySelectorAll("a"));
    expect(links.length).toBeGreaterThan(0);
    expect(
      links.every(
        (link) =>
          link.href ===
          "https://api.github.com/repos/linked-user/project/languages",
      ),
    ).toBe(true);
    expect(host.textContent).toContain("Liên kết không hợp lệ");
  });

  it("keeps the saved initial profile visible when reanalysis finds no observations", async () => {
    const saved = profile();
    const latest = profile();
    latest.technologies = [];
    latest.areas = [];
    latest.overall = null;
    latest.factualSummary = [];
    latest.observationAvailability = "none_observed";
    latest.collectedAt = "2026-10-21T00:00:00Z";
    fetcher.mockResolvedValue(json({ profile: latest }));
    await act(async () =>
      root.render(
        createElement<{ initialProfile: ReturnType<typeof profile> }>(
          GithubProfilePanel,
          { initialProfile: saved },
        ),
      ),
    );
    expect(fetcher).not.toHaveBeenCalled();
    expect(host.textContent).toContain("Ước tính ban đầu.");
    await click("Phân tích lại");
    await submit();
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(host.textContent).toContain("Ước tính ban đầu.");
    expect(host.textContent).toContain("100 byte");
    expect(host.textContent).toContain(
      "Lượt phân tích mới chưa ghi nhận quan sát công nghệ. Kết quả trước vẫn được giữ lại.",
    );
    expect(
      host.querySelector('[aria-label="Kết quả phân tích"]')?.textContent,
    ).not.toContain("Chưa ghi nhận quan sát công nghệ.");
  });

  it("does not classify an empty partial result as proven weakness or insufficient data", async () => {
    const result = profile();
    result.technologies = [];
    result.areas = [];
    result.overall = null;
    result.factualSummary = [];
    result.observationAvailability = "none_observed";
    fetcher.mockResolvedValue(json({ profile: result }));
    await mount();
    await click("Phân tích GitHub");
    await submit();
    expect(host.textContent).toContain(
      "Thiếu dữ liệu không có nghĩa là năng lực yếu",
    );
    expect(host.textContent).not.toContain("Chưa đủ dữ liệu để ước tính");
  });

  it("aborts an in-flight request on unmount", async () => {
    fetcher.mockImplementation(() => new Promise(() => {}));
    await mount();
    await click("Phân tích GitHub");
    await submit();
    await act(async () => root.render(null));
    expect(fetcher.mock.calls[0]![1].signal.aborted).toBe(true);
  });
});
