import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ verify: vi.fn(), insights: vi.fn() }));
vi.mock("@/lib/lecturer-auth", () => ({ verifyLecturerSession: mocks.verify }));
vi.mock("@/services", () => ({ db: {} }));
vi.mock("@/lib/revenue-analytics-service", () => ({ getLecturerInsights: mocks.insights }));
import { getLecturerInsightsData } from "./actions";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.verify.mockResolvedValue({ id: "teacher" });
  mocks.insights.mockResolvedValue({ state: "no-courses" });
});

it("scopes revenue to the verified lecturer, not to any caller-supplied identity", async () => {
  expect(await getLecturerInsightsData("30")).toEqual({ state: "no-courses" });
  expect(mocks.insights).toHaveBeenCalledWith({}, "teacher", "30");
});

it("does not expose revenue to a forbidden caller", async () => {
  mocks.verify.mockRejectedValueOnce(new Error("Forbidden"));
  await expect(getLecturerInsightsData("30")).rejects.toThrow("Forbidden");
  expect(mocks.insights).not.toHaveBeenCalled();
});

it("accepts only the S29b period options", async () => {
  await expect(getLecturerInsightsData("365")).rejects.toThrow("Invalid analytics period");
  expect(mocks.insights).not.toHaveBeenCalled();
});
