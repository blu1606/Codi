import { beforeEach, describe, expect, it, vi } from "vitest";
import { ForbiddenError } from "@codi-1/auth";
import { createBuyNowOrder, BuyNowError } from "./buy-now";

const mocks = vi.hoisted(() => ({
  requireRole: vi.fn(),
  select: vi.fn(),
  insert: vi.fn(),
  courseFrom: vi.fn(),
  courseWhere: vi.fn(),
  courseLimit: vi.fn(),
  enrollmentFrom: vi.fn(),
  enrollmentWhere: vi.fn(),
  enrollmentLimit: vi.fn(),
  pendingFrom: vi.fn(),
  pendingJoin: vi.fn(),
  pendingWhere: vi.fn(),
  pendingLimit: vi.fn(),
  orderValues: vi.fn(),
  orderReturning: vi.fn(),
  orderItemsValues: vi.fn(),
  orderEventsValues: vi.fn(),
  studentTxValues: vi.fn(),
}));

vi.mock("@codi-1/auth", () => ({
  ROLE: { LEARNER: "learner", LECTURER: "lecturer", ADMIN: "admin" },
  requireRole: mocks.requireRole,
  ForbiddenError: class extends Error {
    constructor(msg = "Forbidden") {
      super(msg);
      this.name = "ForbiddenError";
    }
  },
}));

const mockDb = {
  select: mocks.select,
  insert: mocks.insert,
  transaction: async (fn: any) => fn(mockDb),
} as any;

const sampleCourse = {
  id: "course-react-001",
  slug: "react-tu-co-ban-den-du-an-thuc-te",
  title: "React từ cơ bản đến nâng cao",
  price: 1290000,
  status: "published",
};

beforeEach(() => {
  vi.resetAllMocks();
  mocks.requireRole.mockResolvedValue(undefined);

  mocks.select.mockImplementation(() => ({
    from: (table: any) => {
      // Course query
      return {
        where: () => ({
          limit: mocks.courseLimit,
        }),
        innerJoin: () => ({
          where: () => ({
            limit: mocks.pendingLimit,
          }),
        }),
        leftJoin: () => ({
          where: () => ({
            limit: mocks.pendingLimit,
          }),
        }),
      };
    },
  }));

  mocks.courseLimit.mockResolvedValue([sampleCourse]);
  mocks.enrollmentLimit.mockResolvedValue([]);
  mocks.pendingLimit.mockResolvedValue([]);

  mocks.insert.mockImplementation(() => ({
    values: (...args: any[]) => ({
      returning: mocks.orderReturning,
      catch: () => Promise.resolve(),
    }),
  }));
  mocks.orderReturning.mockResolvedValue([{ id: 101, code: "CODI99999" }]);
});

describe("createBuyNowOrder", () => {
  it("rejects non-learner roles with ForbiddenError", async () => {
    mocks.requireRole.mockRejectedValueOnce(new ForbiddenError("Chỉ tài khoản học viên mới mua được khoá học."));
    await expect(createBuyNowOrder(mockDb, "usr-lecturer", "course-react-001")).rejects.toThrow(ForbiddenError);
  });

  it("throws 404 when course is not found", async () => {
    mocks.courseLimit.mockResolvedValue([]);
    await expect(createBuyNowOrder(mockDb, "usr-learner", "unknown-course")).rejects.toThrow(BuyNowError);
    await expect(createBuyNowOrder(mockDb, "usr-learner", "unknown-course")).rejects.toMatchObject({ status: 404 });
  });

  it("throws 400 when course is not published", async () => {
    mocks.courseLimit.mockResolvedValue([{ ...sampleCourse, status: "draft" }]);
    await expect(createBuyNowOrder(mockDb, "usr-learner", "course-react-001")).rejects.toMatchObject({
      status: 400,
      message: "Khóa học hiện không mở bán.",
    });
  });

  it("throws 422 when course is free (price = 0)", async () => {
    mocks.courseLimit.mockResolvedValue([{ ...sampleCourse, price: 0 }]);
    await expect(createBuyNowOrder(mockDb, "usr-learner", "course-react-001")).rejects.toMatchObject({
      status: 422,
      message: "Khóa học miễn phí không cần mua ngay. Vui lòng bấm Đăng ký miễn phí.",
    });
  });

  it("throws 409 when user already owns the course", async () => {
    // 1st select: course -> sampleCourse
    // 2nd select: enrollment -> [ { id: 1 } ]
    let callCount = 0;
    mocks.select.mockImplementation(() => {
      callCount++;
      return {
        from: () => ({
          where: () => ({
            limit: () => (callCount === 1 ? Promise.resolve([sampleCourse]) : Promise.resolve([{ id: 1 }])),
          }),
        }),
      };
    });

    await expect(createBuyNowOrder(mockDb, "usr-learner", "course-react-001")).rejects.toMatchObject({
      status: 409,
      message: "Bạn đã sở hữu khóa học này.",
    });
  });

  it("returns existing pending order if user already has pending payment for this course", async () => {
    let callCount = 0;
    mocks.select.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return { from: () => ({ where: () => ({ limit: () => Promise.resolve([sampleCourse]) }) }) };
      }
      if (callCount === 2) {
        return { from: () => ({ where: () => ({ limit: () => Promise.resolve([]) }) }) };
      }
      return {
        from: () => ({
          innerJoin: () => ({
            where: () => ({
              limit: () => Promise.resolve([{ id: 88, code: "CODI12345" }]),
            }),
          }),
        }),
      };
    });

    const result = await createBuyNowOrder(mockDb, "usr-learner", "course-react-001");
    expect(result).toEqual({
      orderId: 88,
      orderCode: "CODI12345",
      courseId: sampleCourse.id,
      courseTitle: sampleCourse.title,
      courseSlug: sampleCourse.slug,
      price: sampleCourse.price,
      isExisting: true,
    });
    // Should NOT insert a new order
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it("creates a single-course Buy Now order with isBuyNow=true, voucherId=null, leaving cart untouched", async () => {
    let callCount = 0;
    mocks.select.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return { from: () => ({ where: () => ({ limit: () => Promise.resolve([sampleCourse]) }) }) };
      }
      if (callCount === 2) {
        return { from: () => ({ where: () => ({ limit: () => Promise.resolve([]) }) }) };
      }
      if (callCount === 3) {
        return {
          from: () => ({
            innerJoin: () => ({
              where: () => ({
                limit: () => Promise.resolve([]),
              }),
            }),
          }),
        };
      }
      if (callCount === 4) {
        return {
          from: () => ({
            leftJoin: () => ({
              where: () => ({
                limit: () => Promise.resolve([]),
              }),
            }),
            where: () => ({
              limit: () => Promise.resolve([]),
            }),
          }),
        };
      }
      return { from: () => ({ where: () => ({ limit: () => Promise.resolve([]) }) }) };
    });

    const insertedValues: any[] = [];
    mocks.insert.mockImplementation((table: any) => ({
      values: (val: any) => {
        insertedValues.push(val);
        return {
          returning: () => Promise.resolve([{ id: 101, code: "CODI99999" }]),
          catch: () => Promise.resolve(),
        };
      },
    }));

    const result = await createBuyNowOrder(mockDb, "usr-learner-001", "course-react-001");
    expect(result.orderId).toBe(101);
    expect(result.orderCode).toBe("CODI99999");
    expect(result.isExisting).toBe(false);

    // Verify order table insert
    const orderData = insertedValues[0];
    expect(orderData.userId).toBe("usr-learner-001");
    expect(orderData.isBuyNow).toBe(true);
    expect(orderData.voucherId).toBeNull();
    expect(orderData.subtotal).toBe(sampleCourse.price);
    expect(orderData.totalAmount).toBe(sampleCourse.price);
    expect(orderData.status).toBe("pending");

    // Verify orderItems table insert
    const itemData = insertedValues[1];
    expect(itemData.orderId).toBe(101);
    expect(itemData.courseId).toBe(sampleCourse.id);
    expect(itemData.unitPrice).toBe(sampleCourse.price);

    // Verify orderEvents table insert
    const eventData = insertedValues[2];
    expect(eventData.orderId).toBe(101);
    expect(eventData.label).toBe("Đã tạo đơn");
  });
});
