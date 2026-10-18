import { describe, expect, it, vi } from "vitest";
import { CheckoutError, createOrderFromCart } from "./checkout-cart";
import * as cartService from "./cart-service";
import type { CartCourse } from "./cart-contract";

const dummyCourse: CartCourse = {
  id: "c1",
  title: "Khóa 1",
  price: 500000,
  slug: "k1",
  level: "beginner",
  category: "Web Development",
  coverImageUrl: null,
  lecturerName: "Giảng viên A",
};

describe("createOrderFromCart unit tests", () => {
  it("throws 400 when cart is empty", async () => {
    vi.spyOn(cartService, "getCartSummary").mockResolvedValueOnce({
      items: [],
      subtotal: 0,
      discount: 0,
      total: 0,
      voucher: null,
      voucherError: null,
      removedOwnedTitles: [],
      pendingOrder: null,
    });

    const mockDb = {} as any;
    await expect(createOrderFromCart(mockDb, "user-1")).rejects.toThrow(
      "Giỏ hàng của bạn đang trống",
    );
  });

  it("throws 409 when voucherCode is provided but invalid/exhausted", async () => {
    vi.spyOn(cartService, "getCartSummary").mockResolvedValueOnce({
      items: [dummyCourse],
      subtotal: 500000,
      discount: 0,
      total: 500000,
      voucher: null,
      voucherError: "Mã giảm giá đã hết lượt sử dụng",
      removedOwnedTitles: [],
      pendingOrder: null,
    });

    const mockDb = {} as any;
    try {
      await createOrderFromCart(mockDb, "user-1", "HETLUOT");
      expect.unreachable();
    } catch (err: any) {
      expect(err).toBeInstanceOf(CheckoutError);
      expect(err.status).toBe(409);
      expect(err.message).toBe("Mã giảm giá đã hết lượt sử dụng");
    }
  });

  it("throws 409 PENDING_ORDER_EXISTS when existing pending order is found and not replaced", async () => {
    vi.spyOn(cartService, "getCartSummary").mockResolvedValueOnce({
      items: [dummyCourse],
      subtotal: 500000,
      discount: 0,
      total: 500000,
      voucher: null,
      voucherError: null,
      removedOwnedTitles: [],
      pendingOrder: {
        id: 99,
        code: "CODI99999",
        itemCount: 1,
        totalAmount: 500000,
        createdAt: new Date().toISOString(),
      },
    });

    const mockTx = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([{ id: 99, code: "CODI99999" }]),
            }),
          }),
        }),
      }),
    };

    const mockDb = {
      transaction: vi.fn().mockImplementation(async (cb) => cb(mockTx)),
    } as any;

    try {
      await createOrderFromCart(mockDb, "user-1");
      expect.unreachable();
    } catch (err: any) {
      expect(err).toBeInstanceOf(CheckoutError);
      expect(err.status).toBe(409);
      expect(err.code).toBe("PENDING_ORDER_EXISTS");
      expect(err.message).toContain("CODI99999");
    }
  });

  it("safely cancels existing pending order and creates new order when forceReplaceOrderId matches", async () => {
    vi.spyOn(cartService, "getCartSummary").mockResolvedValueOnce({
      items: [
        {
          ...dummyCourse,
          title: "Khóa học Go",
          price: 800000,
          slug: "khoa-go",
        },
      ],
      subtotal: 800000,
      discount: 0,
      total: 800000,
      voucher: null,
      voucherError: null,
      removedOwnedTitles: [],
      pendingOrder: {
        id: 101,
        code: "CODI10101",
        itemCount: 1,
        totalAmount: 800000,
        createdAt: new Date().toISOString(),
      },
    });

    const insertedOrderValues: any[] = [];
    const insertedOrderItems: any[] = [];
    const insertedEvents: any[] = [];
    const insertedTransactions: any[] = [];

    const mockTx = {
      select: vi.fn()
        // 1. existing pending check
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              orderBy: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue([{ id: 101, code: "CODI10101" }]),
              }),
            }),
          }),
        })
        // 2. unique order code check (order table)
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([]),
            }),
          }),
        })
        // 3. unique order code check (studentTransactions)
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([]),
            }),
          }),
        }),
      update: vi.fn()
        // 1. cancel orders table
        .mockReturnValueOnce({
          set: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              returning: vi.fn().mockResolvedValue([{ id: 101 }]),
            }),
          }),
        })
        // 2. cancel studentTransactions table
        .mockReturnValueOnce({
          set: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([]),
          }),
        }),
      insert: vi.fn()
        // 1. orders
        .mockReturnValueOnce({
          values: vi.fn().mockImplementation((val) => {
            insertedOrderValues.push(val);
            return {
              returning: vi.fn().mockResolvedValue([
                { id: 200, code: val.code, totalAmount: val.totalAmount },
              ]),
            };
          }),
        })
        // 2. orderEvents
        .mockReturnValueOnce({
          values: vi.fn().mockImplementation((val) => {
            insertedEvents.push(val);
            return Promise.resolve();
          }),
        })
        // 3. orderItems
        .mockReturnValueOnce({
          values: vi.fn().mockImplementation((val) => {
            insertedOrderItems.push(val);
            return Promise.resolve();
          }),
        })
        // 4. studentTransactions
        .mockReturnValueOnce({
          values: vi.fn().mockImplementation((val) => {
            insertedTransactions.push(val);
            return Promise.resolve();
          }),
        }),
      delete: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([]),
      }),
    };

    const mockDb = {
      transaction: vi.fn().mockImplementation(async (cb) => cb(mockTx)),
    } as any;

    const result = await createOrderFromCart(mockDb, "user-1", null, 101);

    expect(result.orderId).toBe(200);
    expect(result.totalAmount).toBe(800000);
    expect(result.orderCode).toMatch(/^CODI\d{5}$/);

    // Verify Point 1: orders.paymentDeadline is NOT NULL
    expect(insertedOrderValues.length).toBe(1);
    expect(insertedOrderValues[0].paymentDeadline).toBeInstanceOf(Date);
    expect(insertedOrderValues[0].paymentDeadline.getTime()).toBeGreaterThan(Date.now());
    expect(insertedOrderValues[0].replacesOrderId).toBe(101);

    // Verify Point 1: orderItems has courseTitle and unitPrice (NO price field)
    expect(insertedOrderItems.length).toBe(1);
    expect(insertedOrderItems[0]).toEqual({
      orderId: 200,
      courseId: "c1",
      courseTitle: "Khóa học Go",
      unitPrice: 800000,
    });

    // Verify Point 2: Cart cleared inside transaction
    expect(mockTx.delete).toHaveBeenCalledTimes(1);
  });

  it("successfully creates new order with voucher applied", async () => {
    vi.spyOn(cartService, "getCartSummary").mockResolvedValueOnce({
      items: [
        {
          ...dummyCourse,
          id: "c1",
          title: "Course 1",
          price: 600000,
        },
        {
          ...dummyCourse,
          id: "c2",
          title: "Course 2",
          price: 400000,
        },
      ],
      subtotal: 1000000,
      discount: 200000,
      total: 800000,
      voucher: {
        code: "SALE20",
        type: "percent",
        value: 20,
        discount: 200000,
      },
      voucherError: null,
      removedOwnedTitles: [],
      pendingOrder: null,
    });

    const insertedOrderItems: any[] = [];
    const mockTx = {
      select: vi.fn()
        // 1. existing pending check (none)
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              orderBy: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue([]),
              }),
            }),
          }),
        })
        // 2. voucher id lookup
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([{ id: 77 }]),
            }),
          }),
        })
        // 3. unique code check (orders)
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([]),
            }),
          }),
        })
        // 4. unique code check (studentTransactions)
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([]),
            }),
          }),
        }),
      insert: vi.fn()
        // 1. orders
        .mockReturnValueOnce({
          values: vi.fn().mockImplementation((val) => ({
            returning: vi.fn().mockResolvedValue([
              { id: 300, code: val.code, totalAmount: val.totalAmount },
            ]),
          })),
        })
        // 2. events
        .mockReturnValueOnce({
          values: vi.fn().mockResolvedValue([]),
        })
        // 3. order item 1
        .mockReturnValueOnce({
          values: vi.fn().mockImplementation((val) => {
            insertedOrderItems.push(val);
            return Promise.resolve();
          }),
        })
        // 4. order item 2
        .mockReturnValueOnce({
          values: vi.fn().mockImplementation((val) => {
            insertedOrderItems.push(val);
            return Promise.resolve();
          }),
        })
        // 5. studentTransactions
        .mockReturnValueOnce({
          values: vi.fn().mockResolvedValue([]),
        }),
      delete: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([]),
      }),
    };

    const mockDb = {
      transaction: vi.fn().mockImplementation(async (cb) => cb(mockTx)),
    } as any;

    const result = await createOrderFromCart(mockDb, "user-2", "SALE20");

    expect(result.orderId).toBe(300);
    expect(result.totalAmount).toBe(800000);
    expect(insertedOrderItems).toHaveLength(2);
    expect(insertedOrderItems[0].courseTitle).toBe("Course 1");
    expect(insertedOrderItems[0].unitPrice).toBe(600000);
    expect(insertedOrderItems[1].courseTitle).toBe("Course 2");
    expect(insertedOrderItems[1].unitPrice).toBe(400000);
  });
});
