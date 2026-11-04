import { describe, expect, it, vi } from "vitest";
import {
  countActiveHolders,
  forgetActiveRoles,
  ForbiddenError,
  getActiveRoles,
  requireRole,
  ROLE,
  withRoleCache,
} from "./rbac";

function createMockDb(selectResult: any) {
  const queryBuilder = {
    from: vi.fn().mockReturnThis(),
    leftJoin: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue(selectResult),
  };
  return {
    select: vi.fn().mockReturnValue(queryBuilder),
    _builder: queryBuilder,
  } as any;
}

describe("RBAC module", () => {
  describe("getActiveRoles", () => {
    it("trả về danh sách roleId đang hoạt động của người dùng", async () => {
      // Arrange
      const mockDb = createMockDb([{ roleId: ROLE.ADMIN }, { roleId: ROLE.LECTURER }]);

      // Act
      const roles = await getActiveRoles(mockDb, "user-123");

      // Assert
      expect(roles).toEqual([ROLE.ADMIN, ROLE.LECTURER]);
      expect(mockDb.select).toHaveBeenCalled();
      expect(mockDb._builder.from).toHaveBeenCalled();
      expect(mockDb._builder.where).toHaveBeenCalled();
    });

    it("trả về mảng rỗng khi người dùng không có role đang hoạt động", async () => {
      // Arrange
      const mockDb = createMockDb([]);

      // Act
      const roles = await getActiveRoles(mockDb, "user-guest");

      // Assert
      expect(roles).toEqual([]);
    });

    it("trả về mảng rỗng khi người dùng tồn tại nhưng chưa có role nào", async () => {
      const mockDb = createMockDb([{ banned: false, roleId: null }]);
      expect(await getActiveRoles(mockDb, "user-new")).toEqual([]);
    });

    it("trả về mảng rỗng khi tài khoản bị khoá dù còn role", async () => {
      const mockDb = createMockDb([{ banned: true, roleId: ROLE.ADMIN }]);
      expect(await getActiveRoles(mockDb, "user-banned")).toEqual([]);
    });

    it("dùng một truy vấn duy nhất (kèm trạng thái khoá)", async () => {
      const mockDb = createMockDb([{ banned: false, roleId: ROLE.LEARNER }]);
      await getActiveRoles(mockDb, "user-1");
      expect(mockDb.select).toHaveBeenCalledTimes(1);
    });

    it("trong withRoleCache, hỏi lại cùng người dùng không truy vấn lại", async () => {
      const mockDb = createMockDb([{ banned: false, roleId: ROLE.LEARNER }]);
      await withRoleCache(async () => {
        expect(await getActiveRoles(mockDb, "user-1")).toEqual([ROLE.LEARNER]);
        expect(await getActiveRoles(mockDb, "user-1")).toEqual([ROLE.LEARNER]);
        await getActiveRoles(mockDb, "user-2");
      });
      expect(mockDb.select).toHaveBeenCalledTimes(2);
    });

    it("forgetActiveRoles buộc truy vấn lại sau khi đổi role trong cùng request", async () => {
      const mockDb = createMockDb([{ banned: false, roleId: ROLE.LEARNER }]);
      await withRoleCache(async () => {
        await getActiveRoles(mockDb, "user-1");
        forgetActiveRoles("user-1");
        await getActiveRoles(mockDb, "user-1");
      });
      expect(mockDb.select).toHaveBeenCalledTimes(2);
    });

    it("ngoài withRoleCache, mỗi lần gọi là một truy vấn mới", async () => {
      const mockDb = createMockDb([{ banned: false, roleId: ROLE.LEARNER }]);
      await getActiveRoles(mockDb, "user-1");
      await getActiveRoles(mockDb, "user-1");
      expect(mockDb.select).toHaveBeenCalledTimes(2);
    });

    it("không giữ lại kết quả lỗi trong cache", async () => {
      const mockDb = createMockDb([{ banned: false, roleId: ROLE.LEARNER }]);
      mockDb._builder.where.mockRejectedValueOnce(new Error("db down"));
      await withRoleCache(async () => {
        await expect(getActiveRoles(mockDb, "user-1")).rejects.toThrow("db down");
        expect(await getActiveRoles(mockDb, "user-1")).toEqual([ROLE.LEARNER]);
      });
    });
  });

  describe("countActiveHolders", () => {
    it("trả về số lượng người dùng đang giữ role", async () => {
      // Arrange
      const mockDb = createMockDb([{ userId: "1", id: "1" }, { userId: "2", id: "2" }, { userId: "3", id: "3" }]);

      // Act
      const count = await countActiveHolders(mockDb, ROLE.ADMIN);

      // Assert
      expect(count).toBe(3);
    });

    it("trả về fallback 0 khi kết quả query rỗng hoặc không có bản ghi", async () => {
      // Arrange
      const mockDb = createMockDb([]);

      // Act
      const count = await countActiveHolders(mockDb, ROLE.ADMIN);

      // Assert
      expect(count).toBe(0);
    });
  });

  describe("requireRole", () => {
    it("thành công khi người dùng có ít nhất một trong các role được phép", async () => {
      // Arrange
      const mockDb = createMockDb([{ roleId: ROLE.LECTURER }]);

      // Act & Assert
      await expect(
        requireRole(mockDb, "user-teacher", ROLE.ADMIN, ROLE.LECTURER)
      ).resolves.toBeUndefined();
    });

    it("throw ForbiddenError khi người dùng không có bất kỳ role nào được phép", async () => {
      // Arrange
      const mockDb = createMockDb([{ roleId: ROLE.LEARNER }]);

      // Act & Assert
      await expect(
        requireRole(mockDb, "user-student", ROLE.ADMIN, ROLE.LECTURER)
      ).rejects.toThrow(ForbiddenError);
    });

    it("throw ForbiddenError khi người dùng không có role nào trong DB", async () => {
      // Arrange
      const mockDb = createMockDb([]);

      // Act & Assert
      await expect(
        requireRole(mockDb, "user-no-role", ROLE.ADMIN)
      ).rejects.toThrow(ForbiddenError);
    });

    it("throw ForbiddenError khi danh sách allowedRoles rỗng", async () => {
      // Arrange
      const mockDb = createMockDb([{ roleId: ROLE.ADMIN }]);

      // Act & Assert
      await expect(requireRole(mockDb, "user-admin")).rejects.toThrow(ForbiddenError);
    });
  });
});
