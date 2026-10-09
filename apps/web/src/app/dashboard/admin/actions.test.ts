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
import { updateUserRole, toggleUserBan } from "./actions";

function createMockTx(
  activeAdmins: any[],
  currentRoles: any[] = []
) {
  const mockWhere = vi.fn().mockResolvedValue(undefined);
  const mockSet = vi.fn().mockReturnValue({ where: mockWhere });
  const mockValues = vi.fn().mockResolvedValue(undefined);
  const mockDeleteWhere = vi.fn().mockResolvedValue(undefined);
  
  const mockTx = {
    select: vi.fn().mockImplementation((arg: any) => {
      if (arg?.userId) {
        // activeAdminRolesQuery
        const chain = {
          orderBy: vi.fn().mockReturnValue({
            for: vi.fn().mockResolvedValue(activeAdmins),
          }),
          for: vi.fn().mockResolvedValue(activeAdmins),
        };
        return {
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue(chain),
          }),
        };
      }
      // currentActiveQuery (updateUserRole)
      const chain2 = {
        for: vi.fn().mockResolvedValue(currentRoles),
      };
      return {
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue(chain2),
        }),
      };
    }),
    update: vi.fn().mockReturnValue({ set: mockSet }),
    insert: vi.fn().mockReturnValue({ values: mockValues }),
    delete: vi.fn().mockReturnValue({ where: mockDeleteWhere }),
  };

  return { mockTx, mockSet, mockValues, mockWhere, mockDeleteWhere };
}

describe("updateUserRole action", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockHeaders.mockResolvedValue(new Headers());
  });

  it("ném lỗi Unauthorized khi không có phiên đăng nhập", async () => {
    mockGetSession.mockResolvedValue(null);
    await expect(updateUserRole("target-1", ROLE.LECTURER)).rejects.toThrow("Unauthorized");
    expect(mockRequireRole).not.toHaveBeenCalled();
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it("ném lỗi khi người thực hiện không có quyền ADMIN (requireRole thất bại)", async () => {
    mockGetSession.mockResolvedValue({
      user: { id: "user-non-admin", email: "student@codi.vn" },
    });
    mockRequireRole.mockRejectedValue(new Error("Forbidden"));
    await expect(updateUserRole("target-1", ROLE.LECTURER)).rejects.toThrow("Forbidden");
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it("ném lỗi Unauthorized or banned nếu user thực hiện không nằm trong danh sách active admins", async () => {
    const adminId = "admin-1";
    mockGetSession.mockResolvedValue({
      user: { id: adminId, email: "admin@codi.vn" },
    });
    mockRequireRole.mockResolvedValue(undefined);

    const { mockTx } = createMockTx([]); // No active admins returned

    mockTransaction.mockImplementation(async (cb: any) => cb(mockTx));

    await expect(updateUserRole("target-1", ROLE.LEARNER)).rejects.toThrow("Unauthorized or banned");
  });

  it("chặn tự hạ quyền khi là Admin duy nhất đang hoạt động (count <= 1)", async () => {
    const adminId = "admin-solo";
    mockGetSession.mockResolvedValue({
      user: { id: adminId, email: "admin@codi.vn" },
    });
    mockRequireRole.mockResolvedValue(undefined);

    const { mockTx } = createMockTx(
      [{ id: "role-row-1", userId: adminId }],
      [{ id: "role-row-1", roleId: ROLE.ADMIN, userId: adminId }]
    );

    mockTransaction.mockImplementation(async (cb: any) => cb(mockTx));

    await expect(updateUserRole(adminId, ROLE.LEARNER)).rejects.toThrow(
      "Khong the xoa quyen Admin cuoi cung dang hoat dong."
    );
    expect(mockTx.update).not.toHaveBeenCalled();
    expect(mockTx.insert).not.toHaveBeenCalled();
  });

  it("cho phép tự hạ quyền khi vẫn còn Admin khác (count > 1)", async () => {
    const adminId = "admin-1";
    mockGetSession.mockResolvedValue({
      user: { id: adminId, email: "admin1@codi.vn" },
    });
    mockRequireRole.mockResolvedValue(undefined);

    const { mockTx, mockSet, mockValues } = createMockTx(
      [
        { id: "role-row-1", userId: adminId },
        { id: "role-row-2", userId: "other-admin-id" },
      ],
      [{ id: "role-row-1", roleId: ROLE.ADMIN, userId: adminId }]
    );

    mockTransaction.mockImplementation(async (cb: any) => cb(mockTx));

    await updateUserRole(adminId, ROLE.LECTURER);

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
    const adminId = "admin-self";
    mockGetSession.mockResolvedValue({
      user: { id: adminId, email: "admin@codi.vn" },
    });
    mockRequireRole.mockResolvedValue(undefined);

    const { mockTx, mockValues } = createMockTx(
      [{ id: "role-row-1", userId: adminId }],
      [{ id: "role-row-1", roleId: ROLE.ADMIN, userId: adminId }]
    );

    mockTransaction.mockImplementation(async (cb: any) => cb(mockTx));

    await updateUserRole(adminId, ROLE.ADMIN);

    expect(mockTx.select).toHaveBeenCalledTimes(2);
    expect(mockTx.insert).toHaveBeenCalledWith(expect.anything());
    expect(mockValues).toHaveBeenCalledWith({
      userId: adminId,
      roleId: ROLE.ADMIN,
      grantedBy: adminId,
    });
  });

  it("thu hồi tất cả các role active cũ và chèn role mới khi đổi role cho người khác", async () => {
    const actorAdminId = "admin-actor";
    const targetUserId = "user-target";

    mockGetSession.mockResolvedValue({
      user: { id: actorAdminId, email: "admin@codi.vn" },
    });
    mockRequireRole.mockResolvedValue(undefined);

    const { mockTx, mockSet, mockWhere, mockValues } = createMockTx(
      [{ id: "role-row-1", userId: actorAdminId }],
      [
        { id: "active-role-1", roleId: ROLE.LEARNER, userId: targetUserId },
        { id: "active-role-2", roleId: ROLE.LECTURER, userId: targetUserId },
      ]
    );

    mockTransaction.mockImplementation(async (cb: any) => cb(mockTx));

    await updateUserRole(targetUserId, ROLE.LECTURER);

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
    mockGetSession.mockResolvedValue({
      user: { id: "admin-1", email: "admin@codi.vn" },
    });
    mockRequireRole.mockResolvedValue(undefined);
    mockTransaction.mockRejectedValue(new Error("DB connection timeout"));

    await expect(updateUserRole("target-user", ROLE.LEARNER)).rejects.toThrow(
      "DB connection timeout"
    );
  });
});

describe("toggleUserBan action", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockHeaders.mockResolvedValue(new Headers());
  });

  it("ném lỗi Unauthorized khi không có phiên đăng nhập", async () => {
    mockGetSession.mockResolvedValue(null);
    await expect(toggleUserBan("target-1", true)).rejects.toThrow("Unauthorized");
  });

  it("ném lỗi khi tự khoá tài khoản của chính mình", async () => {
    mockGetSession.mockResolvedValue({
      user: { id: "admin-self", email: "admin@codi.vn" },
    });
    mockRequireRole.mockResolvedValue(undefined);

    await expect(toggleUserBan("admin-self", true)).rejects.toThrow(
      "Khong the tu khoa tai khoan cua chinh minh."
    );
  });

  it("ném lỗi Unauthorized or banned nếu user thực hiện không nằm trong danh sách active admins", async () => {
    const adminId = "admin-1";
    mockGetSession.mockResolvedValue({
      user: { id: adminId, email: "admin@codi.vn" },
    });
    mockRequireRole.mockResolvedValue(undefined);

    const { mockTx } = createMockTx([]);

    mockTransaction.mockImplementation(async (cb: any) => cb(mockTx));

    await expect(toggleUserBan("target-1", true)).rejects.toThrow("Unauthorized or banned");
  });

  it("ném lỗi nếu khoá Admin đang hoạt động duy nhất", async () => {
    const adminId = "admin-1";
    const targetUserId = "admin-target";
    mockGetSession.mockResolvedValue({
      user: { id: adminId, email: "admin@codi.vn" },
    });
    mockRequireRole.mockResolvedValue(undefined);

    const fakeAdmins: any = [
      { id: "role-2", userId: targetUserId }
    ];
    fakeAdmins.some = () => true;
    
    const { mockTx } = createMockTx(fakeAdmins);
    mockTransaction.mockImplementation(async (cb: any) => cb(mockTx));

    await expect(toggleUserBan(targetUserId, true)).rejects.toThrow(
      "Khong the khoa Admin dang hoat dong duy nhat."
    );
  });

  it("khoá thành công một người dùng thông thường", async () => {
    const adminId = "admin-1";
    const targetUserId = "user-target";
    mockGetSession.mockResolvedValue({
      user: { id: adminId, email: "admin@codi.vn" },
    });
    mockRequireRole.mockResolvedValue(undefined);

    const { mockTx, mockSet, mockWhere, mockDeleteWhere } = createMockTx([
      { id: "role-1", userId: adminId },
    ]);

    mockTransaction.mockImplementation(async (cb: any) => cb(mockTx));

    await toggleUserBan(targetUserId, true, "Vi pham");

    expect(mockTx.update).toHaveBeenCalled();
    expect(mockSet).toHaveBeenCalledWith({
      banned: true,
      banReason: "Vi pham",
    });
    expect(mockWhere).toHaveBeenCalled();
    expect(mockTx.delete).toHaveBeenCalled();
    expect(mockDeleteWhere).toHaveBeenCalled();
  });

  it("mở khoá thành công một người dùng", async () => {
    const adminId = "admin-1";
    const targetUserId = "user-target";
    mockGetSession.mockResolvedValue({
      user: { id: adminId, email: "admin@codi.vn" },
    });
    mockRequireRole.mockResolvedValue(undefined);

    const { mockTx, mockSet } = createMockTx([
      { id: "role-1", userId: adminId },
    ]);

    mockTransaction.mockImplementation(async (cb: any) => cb(mockTx));

    await toggleUserBan(targetUserId, false);

    expect(mockTx.update).toHaveBeenCalled();
    expect(mockSet).toHaveBeenCalledWith({
      banned: false,
      banReason: null,
    });
    expect(mockTx.delete).not.toHaveBeenCalled();
  });
  
  it("khoá thành công một Admin khác", async () => {
    const adminId = "admin-1";
    const targetUserId = "admin-2";
    mockGetSession.mockResolvedValue({
      user: { id: adminId, email: "admin@codi.vn" },
    });
    mockRequireRole.mockResolvedValue(undefined);

    const { mockTx, mockSet, mockDeleteWhere } = createMockTx([
      { id: "role-1", userId: adminId },
      { id: "role-2", userId: targetUserId }
    ]);

    mockTransaction.mockImplementation(async (cb: any) => cb(mockTx));

    await toggleUserBan(targetUserId, true);

    expect(mockTx.update).toHaveBeenCalled();
    expect(mockSet).toHaveBeenCalledWith({
      banned: true,
      banReason: "Vi pham noi quy nen tang.",
    });
    expect(mockTx.delete).toHaveBeenCalled();
  });
});
