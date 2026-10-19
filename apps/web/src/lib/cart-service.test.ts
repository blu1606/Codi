import { describe, expect, it, vi } from "vitest";
import { getCartSummary, removeFromCart } from "./cart-service";

describe("Cart service unit tests", () => {
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
