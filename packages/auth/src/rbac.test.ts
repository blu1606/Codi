import { describe, expect, it, vi } from "vitest";
import {
  countActiveHolders,
  ForbiddenError,
  getActiveRoles,
  requireRole,
  ROLE,
} from "./rbac";

function createMockDb(selectResult: any) {
  const queryBuilder = {
    from: vi.fn().mockReturnThis(),
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
