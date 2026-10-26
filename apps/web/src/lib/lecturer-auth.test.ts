import { beforeEach, describe, expect, it, vi } from "vitest";
import { ForbiddenError, ROLE } from "@codi-1/auth";

let mockSessionUser: any = { id: "test-user-1", name: "Test User" };
const mockGetActiveRoles = vi.fn();

vi.mock("next/headers", () => ({
  headers: vi.fn().mockResolvedValue(new Headers()),
}));

vi.mock("@/services", () => ({
  auth: {
    api: {
      getSession: vi.fn().mockImplementation(async () => {
        if (!mockSessionUser) return null;
        return { user: mockSessionUser };
      }),
    },
  },
  db: {},
}));

vi.mock("@codi-1/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@codi-1/auth")>();
  return {
    ...actual,
    getActiveRoles: vi.fn().mockImplementation((_db: any, userId: string) =>
      mockGetActiveRoles(_db, userId)
    ),
    requireRole: vi
      .fn()
      .mockImplementation(
        async (_db: any, userId: string, ...allowedRoles: string[]) => {
          const active = await mockGetActiveRoles(_db, userId);
          if (!allowedRoles.some((r) => active.includes(r))) {
            throw new actual.ForbiddenError(
              `User ${userId} lacks required role(s): ${allowedRoles.join(", ")}`
            );
          }
        }
      ),
  };
});

import {
  verifyLecturerOrAdminSession,
  verifyLecturerSession,
} from "./lecturer-auth";

describe("Lecturer & Admin Session Verification (PO D9 & §14.2)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSessionUser = { id: "user-1", name: "Nguyễn Văn A" };
  });

  describe("verifyLecturerSession (Lecturer-only strict guard)", () => {
    it("throws Unauthorized if session is missing", async () => {
      mockSessionUser = null;
      await expect(verifyLecturerSession()).rejects.toThrow("Unauthorized");
    });

    it("throws ForbiddenError for learner-only user", async () => {
      mockGetActiveRoles.mockResolvedValue([ROLE.LEARNER]);
      await expect(verifyLecturerSession()).rejects.toThrow(ForbiddenError);
    });

    it("throws ForbiddenError for admin-only user (Admin does not imply Lecturer)", async () => {
      mockGetActiveRoles.mockResolvedValue([ROLE.ADMIN]);
      await expect(verifyLecturerSession()).rejects.toThrow(ForbiddenError);
    });

    it("succeeds for user with LECTURER role", async () => {
      mockGetActiveRoles.mockResolvedValue([ROLE.LECTURER]);
      const res = await verifyLecturerSession();
      expect(res.id).toBe("user-1");
    });
  });

  describe("verifyLecturerOrAdminSession (Lecturer or Admin guard)", () => {
    it("throws Unauthorized if session is missing", async () => {
      mockSessionUser = null;
      await expect(verifyLecturerOrAdminSession()).rejects.toThrow("Unauthorized");
    });

    it("throws ForbiddenError for learner-only user", async () => {
      mockGetActiveRoles.mockResolvedValue([ROLE.LEARNER]);
      await expect(verifyLecturerOrAdminSession()).rejects.toThrow(ForbiddenError);
    });

    it("succeeds for admin-only user (P2 Defect Fix for PO D9)", async () => {
      mockGetActiveRoles.mockResolvedValue([ROLE.ADMIN]);
      const res = await verifyLecturerOrAdminSession();
      expect(res.id).toBe("user-1");
    });

    it("succeeds for lecturer user", async () => {
      mockGetActiveRoles.mockResolvedValue([ROLE.LECTURER]);
      const res = await verifyLecturerOrAdminSession();
      expect(res.id).toBe("user-1");
    });

    it("succeeds for user having both LECTURER and ADMIN roles", async () => {
      mockGetActiveRoles.mockResolvedValue([ROLE.LECTURER, ROLE.ADMIN]);
      const res = await verifyLecturerOrAdminSession();
      expect(res.id).toBe("user-1");
    });
  });
});
