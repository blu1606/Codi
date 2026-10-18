import { afterEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ readFile: vi.fn() }));
vi.mock("node:fs/promises", () => ({ readFile: mocks.readFile }));
import { GET } from "./route";
const context = (filename = "flower.mp4") => ({
  params: Promise.resolve({ filename }),
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetAllMocks();
});
describe("development lesson media", () => {
  it("never reads or serves fixtures in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(
      (
        await GET(
          new Request("https://codi.test/dev/lesson-player/flower.mp4"),
          context(),
        )
      ).status,
    ).toBe(404);
    expect(mocks.readFile).not.toHaveBeenCalled();
  });
  it("only serves explicitly allowed fixtures", async () => {
    vi.stubEnv("NODE_ENV", "development");
    expect(
      (await GET(new Request("http://localhost/dev"), context("../secret")))
        .status,
    ).toBe(404);
    expect(mocks.readFile).not.toHaveBeenCalled();
  });
  it("supports native video range reads without caching development data", async () => {
    vi.stubEnv("NODE_ENV", "development");
    mocks.readFile.mockResolvedValue(Buffer.from("0123456789"));
    const response = await GET(
      new Request("http://localhost/dev", { headers: { range: "bytes=2-4" } }),
      context(),
    );
    expect(response.status).toBe(206);
    expect(response.headers.get("Content-Range")).toBe("bytes 2-4/10");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.text()).toBe("234");
  });
  it("rejects invalid ranges", async () => {
    vi.stubEnv("NODE_ENV", "development");
    mocks.readFile.mockResolvedValue(Buffer.from("0123"));
    expect(
      (
        await GET(
          new Request("http://localhost/dev", {
            headers: { range: "bytes=99-" },
          }),
          context(),
        )
      ).status,
    ).toBe(416);
  });
});
