import { beforeEach, expect, it, vi } from "vitest";
import { FINANCE_UNAVAILABLE } from "@/lib/analytics-contract";
const mocks = vi.hoisted(() => ({ verify: vi.fn(), select: vi.fn() }));
vi.mock("@/lib/lecturer-auth", () => ({ verifyLecturerSession: mocks.verify }));
vi.mock("@/services", () => ({ db: { select: mocks.select } }));
import { getLecturerInsightsData } from "./actions";
beforeEach(() => {
  vi.clearAllMocks();
  mocks.verify.mockResolvedValue({ id: "teacher" });
  mocks.select.mockReturnValue({ from: () => ({ where: async () => [] }) });
});
it("authenticates but never queries or estimates money", async () => {
  expect(await getLecturerInsightsData()).toEqual({
    state: "unavailable",
    message: FINANCE_UNAVAILABLE,
  });
  expect(mocks.select).not.toHaveBeenCalled();
});
it("does not expose even unavailable lecturer data to a forbidden caller", async () => {
  mocks.verify.mockRejectedValueOnce(new Error("Forbidden"));
  await expect(getLecturerInsightsData()).rejects.toThrow("Forbidden");
  expect(mocks.select).not.toHaveBeenCalled();
});
