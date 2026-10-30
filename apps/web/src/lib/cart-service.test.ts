import { describe, expect, it, vi } from "vitest";
import { getCartSummary, getPendingOrderBanner, removeFromCart } from "./cart-service";

function pendingBannerDb(opts: {
  deadline: Date;
  freshReceivedAmount?: number | null;
}) {
  const pending = {
    id: 7,
    code: "CODI77777",
    totalAmount: 1000000,
    paymentDeadline: opts.deadline,
    createdAt: new Date("2026-10-30T10:00:00Z"),
  };
  const tx = {
    execute: vi.fn().mockResolvedValue([]),
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue(
            opts.freshReceivedAmount === undefined
              ? []
              : [{ receivedAmount: opts.freshReceivedAmount }],
          ),
        }),
      }),
    }),
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([]),
      }),
    }),
  };
  const db = {
    select: vi
      .fn()
      .mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([pending]),
            }),
          }),
        }),
      })
      .mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      }),
    transaction: vi.fn().mockImplementation(async (cb) => cb(tx)),
  };
  return { db, tx };
}

describe("Cart service unit tests", () => {
  it("returns the pending banner without touching the order when the deadline has not passed", async () => {
    const { db, tx } = pendingBannerDb({ deadline: new Date(Date.now() + 60_000) });

    const banner = await getPendingOrderBanner(db as any, "user-1");

    expect(banner).toMatchObject({ id: 7, code: "CODI77777", itemCount: 0, totalAmount: 1000000 });
    expect(db.transaction).not.toHaveBeenCalled();
    expect(tx.update).not.toHaveBeenCalled();
  });

  it("expires a past-deadline order under the payment code lock, re-reading receivedAmount", async () => {
    const { db, tx } = pendingBannerDb({
      deadline: new Date(Date.now() - 60_000),
      freshReceivedAmount: 300000,
    });

    const banner = await getPendingOrderBanner(db as any, "user-1");

    expect(banner).toBeNull();
    expect(tx.execute.mock.invocationCallOrder[0]).toBeLessThan(
      tx.select.mock.invocationCallOrder[0],
    );
    const setArgs = tx.update.mock.results[0].value.set.mock.calls[0][0];
    expect(setArgs).toMatchObject({ status: "failed", failReason: "expired", needsReconciliation: true });
  });

  it("does not flag reconciliation when no money arrived before expiry", async () => {
    const { db, tx } = pendingBannerDb({
      deadline: new Date(Date.now() - 60_000),
      freshReceivedAmount: 0,
    });

    await getPendingOrderBanner(db as any, "user-1");

    const setArgs = tx.update.mock.results[0].value.set.mock.calls[0][0];
    expect(setArgs.status).toBe("failed");
    expect(setArgs.needsReconciliation).toBeUndefined();
  });

  it("skips the update when the order is no longer pending once the lock is held", async () => {
    const { db, tx } = pendingBannerDb({
      deadline: new Date(Date.now() - 60_000),
      freshReceivedAmount: undefined,
    });

    const banner = await getPendingOrderBanner(db as any, "user-1");

    expect(banner).toBeNull();
    expect(tx.update).not.toHaveBeenCalled();
  });

  it("returns empty cart summary when no items in cart", async () => {
    const mockSelect = vi.fn()
      // cart items
      .mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      })
      // pending order
      .mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([]),
            }),
          }),
        }),
      });

    const mockDb = {
      select: mockSelect,
      insert: vi.fn(),
      delete: vi.fn(),
      update: vi.fn(),
    };

    const summary = await getCartSummary(mockDb as any, "user-1");
    expect(summary.items).toEqual([]);
    expect(summary.subtotal).toBe(0);
    expect(summary.discount).toBe(0);
    expect(summary.total).toBe(0);
    expect(summary.voucher).toBeNull();
  });

  it("removes enrolled courses from cart and notifies", async () => {
    const mockSelect = vi.fn();
    const mockDelete = vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue([]),
    });

    // 1. cart rows: course-1, course-2
    // 2. pending order: none
    // 3. enrollments: course-1 is enrolled
    // 4. course details: course-1 & course-2
    mockSelect
      // cart items
      .mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([
            { id: 1, courseId: "course-1" },
            { id: 2, courseId: "course-2" },
          ]),
        }),
      })
      // enrollments
      .mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ courseId: "course-1" }]),
        }),
      })
      // course details
      .mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          leftJoin: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([
              {
                id: "course-1",
                title: "React Cơ Bản",
                slug: "react-co-ban",
                price: 500000,
                level: "Cơ bản",
                category: "Frontend",
                coverImageUrl: null,
                lecturerName: "Nguyễn Văn A",
              },
              {
                id: "course-2",
                title: "Next.js Nâng Cao",
                slug: "nextjs-nang-cao",
                price: 800000,
                level: "Nâng cao",
                category: "Frontend",
                coverImageUrl: null,
                lecturerName: "Trần Thị B",
              },
            ]),
          }),
        }),
      })
      // pending order
      .mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([]),
            }),
          }),
        }),
      });

    const mockDb = {
      select: mockSelect,
      insert: vi.fn(),
      delete: mockDelete,
      update: vi.fn(),
    };

    const summary = await getCartSummary(mockDb as any, "user-1");

    // Course 1 removed because already enrolled
    expect(summary.items).toHaveLength(1);
    expect(summary.items[0].id).toBe("course-2");
    expect(summary.subtotal).toBe(800000);
    expect(summary.removedOwnedTitles).toEqual(["React Cơ Bản"]);
    expect(mockDelete).toHaveBeenCalled();
  });

  it("removes a specific item via removeFromCart", async () => {
    const mockDb = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([{ title: "Node.js Backend" }]),
          }),
        }),
      }),
      delete: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([]),
      }),
      insert: vi.fn(),
      update: vi.fn(),
    };

    const result = await removeFromCart(mockDb as any, "user-1", "course-node");
    expect(result.success).toBe(true);
    expect(result.courseTitle).toBe("Node.js Backend");
    expect(mockDb.delete).toHaveBeenCalled();
  });
});
