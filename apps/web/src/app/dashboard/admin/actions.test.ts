import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetSession = vi.fn();
const mockRequireRole = vi.fn();
const mockHeaders = vi.fn();

vi.mock("next/headers", () => ({
  headers: () => mockHeaders(),
}));

vi.mock("@codi-1/auth", () => ({
  ROLE: { LEARNER: "LEARNER", LECTURER: "LECTURER", ADMIN: "ADMIN" },
  requireRole: (...args: any[]) => mockRequireRole(...args),
}));

const mockTransaction = vi.fn();

vi.mock("@/services", () => ({
  auth: {
    api: {
      getSession: (...args: any[]) => mockGetSession(...args),
    },
  },
  db: {
    transaction: (cb: any) => mockTransaction(cb),
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({}),
      }),
    }),
  },
}));

import { ROLE } from "@codi-1/auth";
import { updateUserRole } from "./actions";

describe("updateUserRole action", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockHeaders.mockResolvedValue(new Headers());
  });

  it("ném lỗi Unauthorized khi không có phiên đăng nhập", async () => {
    // Arrange
    mockGetSession.mockResolvedValue(null);

    // Act & Assert
    await expect(updateUserRole("target-1", ROLE.LECTURER)).rejects.toThrow("Unauthorized");
    expect(mockRequireRole).not.toHaveBeenCalled();
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it("ném lỗi khi người thực hiện không có quyền ADMIN (requireRole thất bại)", async () => {
    // Arrange
    mockGetSession.mockResolvedValue({
      user: { id: "user-non-admin", email: "student@codi.vn" },
    });
    mockRequireRole.mockRejectedValue(new Error("Forbidden"));

    // Act & Assert
    await expect(updateUserRole("target-1", ROLE.LECTURER)).rejects.toThrow("Forbidden");
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it("chặn tự hạ quyền khi là Admin duy nhất đang hoạt động (count <= 1)", async () => {
    // Arrange
    const adminId = "admin-solo";
    mockGetSession.mockResolvedValue({
      user: { id: adminId, email: "admin@codi.vn" },
    });
    mockRequireRole.mockResolvedValue(undefined);

    const mockTx = {
      select: vi.fn().mockImplementation((arg) => {
        // activeAdminRolesQuery
        if (arg?.userId) {
          return {
            from: vi.fn().mockReturnValue({
              where: vi.fn().mockReturnValue({
                for: vi.fn().mockResolvedValue([{ id: "role-row-1", userId: adminId }]),
              }),
            }),
          };
        }
        // currentActiveQuery
        return {
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              for: vi.fn().mockResolvedValue([{ id: "role-row-1", roleId: ROLE.ADMIN, userId: adminId }]),
            }),
          }),
        };
      }),
      update: vi.fn(),
      insert: vi.fn(),
    };

    mockTransaction.mockImplementation(async (cb: any) => cb(mockTx));

    // Act & Assert
    await expect(updateUserRole(adminId, ROLE.LEARNER)).rejects.toThrow(
      "Khong the xoa quyen Admin cuoi cung dang hoat dong."
    );
    expect(mockTx.update).not.toHaveBeenCalled();
    expect(mockTx.insert).not.toHaveBeenCalled();
  });

  it("cho phép tự hạ quyền khi vẫn còn Admin khác (count > 1)", async () => {
    // Arrange
    const adminId = "admin-1";
    mockGetSession.mockResolvedValue({
      user: { id: adminId, email: "admin1@codi.vn" },
    });
    mockRequireRole.mockResolvedValue(undefined);

    const mockSet = vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) });
    const mockValues = vi.fn().mockResolvedValue(undefined);

    const mockTx = {
      select: vi.fn().mockImplementation((arg) => {
        if (arg?.userId) {
          return {
            from: vi.fn().mockReturnValue({
              where: vi.fn().mockReturnValue({
                for: vi.fn().mockResolvedValue([
                  { id: "role-row-1", userId: adminId },
                  { id: "role-row-2", userId: "other-admin-id" },
                ]),
              }),
            }),
          };
        }
        return {
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              for: vi.fn().mockResolvedValue([{ id: "role-row-1", roleId: ROLE.ADMIN, userId: adminId }]),
            }),
          }),
        };
      }),
      update: vi.fn().mockReturnValue({ set: mockSet }),
      insert: vi.fn().mockReturnValue({ values: mockValues }),
    };

    mockTransaction.mockImplementation(async (cb: any) => cb(mockTx));

    // Act
    await updateUserRole(adminId, ROLE.LECTURER);

    // Assert
    expect(mockTx.update).toHaveBeenCalled();
    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({ revokedBy: adminId })
    );
    expect(mockTx.insert).toHaveBeenCalled();
    expect(mockValues).toHaveBeenCalledWith({
      userId: adminId,
      roleId: ROLE.LECTURER,
      grantedBy: adminId,
    });
  });

  it("tự cập nhật giữ nguyên quyền ADMIN không thực hiện đếm admin", async () => {
    // Arrange
    const adminId = "admin-self";
    mockGetSession.mockResolvedValue({
      user: { id: adminId, email: "admin@codi.vn" },
    });
    mockRequireRole.mockResolvedValue(undefined);

    const mockSet = vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) });
    const mockValues = vi.fn().mockResolvedValue(undefined);

    const mockTx = {
      select: vi.fn().mockImplementation((arg) => {
        if (arg?.userId) {
          return {
            from: vi.fn().mockReturnValue({
              where: vi.fn().mockReturnValue({
                for: vi.fn().mockResolvedValue([{ id: "role-row-1", userId: adminId }]),
              }),
            }),
          };
        }
        return {
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              for: vi.fn().mockResolvedValue([{ id: "role-row-1", roleId: ROLE.ADMIN, userId: adminId }]),
            }),
          }),
        };
      }),
      update: vi.fn().mockReturnValue({ set: mockSet }),
      insert: vi.fn().mockReturnValue({ values: mockValues }),
    };

    mockTransaction.mockImplementation(async (cb: any) => cb(mockTx));

    // Act
    await updateUserRole(adminId, ROLE.ADMIN);

    // Assert: select should be called twice (active admins and current roles)
    expect(mockTx.select).toHaveBeenCalledTimes(2);
    expect(mockTx.insert).toHaveBeenCalledWith(expect.anything());
    expect(mockValues).toHaveBeenCalledWith({
      userId: adminId,
      roleId: ROLE.ADMIN,
      grantedBy: adminId,
    });
  });

  it("thu hồi tất cả các role active cũ và chèn role mới khi đổi role cho người khác", async () => {
    // Arrange
    const actorAdminId = "admin-actor";
    const targetUserId = "user-target";

    mockGetSession.mockResolvedValue({
      user: { id: actorAdminId, email: "admin@codi.vn" },
    });
    mockRequireRole.mockResolvedValue(undefined);

    const mockWhere = vi.fn().mockResolvedValue(undefined);
    const mockSet = vi.fn().mockReturnValue({ where: mockWhere });
    const mockValues = vi.fn().mockResolvedValue(undefined);

    const mockTx = {
      select: vi.fn().mockImplementation((arg) => {
        if (arg?.userId) {
          return {
            from: vi.fn().mockReturnValue({
              where: vi.fn().mockReturnValue({
                for: vi.fn().mockResolvedValue([{ id: "role-row-1", userId: actorAdminId }]),
              }),
            }),
          };
        }
        return {
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              for: vi.fn().mockResolvedValue([
                { id: "active-role-1", roleId: ROLE.LEARNER, userId: targetUserId },
                { id: "active-role-2", roleId: ROLE.LECTURER, userId: targetUserId },
              ]),
            }),
          }),
        };
      }),
      update: vi.fn().mockReturnValue({ set: mockSet }),
      insert: vi.fn().mockReturnValue({ values: mockValues }),
    };

    mockTransaction.mockImplementation(async (cb: any) => cb(mockTx));

    // Act
    await updateUserRole(targetUserId, ROLE.LECTURER);

    // Assert
    expect(mockTx.update).toHaveBeenCalledTimes(2);
    expect(mockWhere).toHaveBeenCalledWith(expect.anything());
    expect(mockTx.insert).toHaveBeenCalled();
    expect(mockValues).toHaveBeenCalledWith({
      userId: targetUserId,
      roleId: ROLE.LECTURER,
      grantedBy: actorAdminId,
    });
  });

  it("lan truyền lỗi cơ sở dữ liệu nếu transaction thất bại", async () => {
    // Arrange
    mockGetSession.mockResolvedValue({
      user: { id: "admin-1", email: "admin@codi.vn" },
    });
    mockRequireRole.mockResolvedValue(undefined);
    mockTransaction.mockRejectedValue(new Error("DB connection timeout"));

    // Act & Assert
    await expect(updateUserRole("target-user", ROLE.LEARNER)).rejects.toThrow(
      "DB connection timeout"
    );
  });
});
