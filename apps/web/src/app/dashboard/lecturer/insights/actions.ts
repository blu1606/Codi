"use server";

import { and, eq, gte, inArray } from "drizzle-orm";
import {
  courses,
  orderItems,
  orders,
} from "@codi-1/db";
import { db } from "@/services";
import { verifyLecturerSession } from "@/lib/lecturer-auth";
import {
  buildKpiData,
  calculatePeriodDates,
  generateChartSeries,
  INSIGHTS_PERIODS,
  type CourseRevenueItem,
  type InsightsPeriodKey,
  type LecturerInsightsDto,
} from "@/lib/lecturer-insights-service";

/**
 * Lấy dữ liệu doanh thu và phân tích tài chính cho các khoá học của giảng viên (Screen S29b).
 * Quyền truy cập: Chỉ giảng viên sở hữu khoá học mới xem được dữ liệu doanh thu của khoá mình.
 */
export async function getLecturerInsightsData(
  periodInput?: string
): Promise<LecturerInsightsDto> {
  const user = await verifyLecturerSession();

  const validPeriod: InsightsPeriodKey = INSIGHTS_PERIODS.some(
    (p) => p.key === periodInput
  )
    ? (periodInput as InsightsPeriodKey)
    : "30d";

  // 1. Lấy danh sách khoá học của giảng viên
  const myCourses = await db
    .select({
      id: courses.id,
      title: courses.title,
      status: courses.status,
    })
    .from(courses)
    .where(eq(courses.instructorId, user.id));

  // Trạng thái: Chưa có khoá học nào
  if (!myCourses.length) {
    return {
      state: "no_courses",
      period: validPeriod,
      kpiData: [],
      chartData: { series: [], currentTotal: 0, averagePerDay: 0 },
      courseRevenues: [],
      totalRevenue: 0,
      totalOrders: 0,
    };
  }

  // 2. Lọc các khoá học đã xuất bản hoặc đã ẩn (đang/từng mở bán)
  const publishedCourses = myCourses.filter((c) =>
    ["published", "hidden"].includes(c.status)
  );

  // Trạng thái: Chưa có khoá học nào được xuất bản
  if (!publishedCourses.length) {
    return {
      state: "no_published_courses",
      period: validPeriod,
      kpiData: [],
      chartData: { series: [], currentTotal: 0, averagePerDay: 0 },
      courseRevenues: [],
      totalRevenue: 0,
      totalOrders: 0,
    };
  }

  const publishedCourseIds = publishedCourses.map((c) => c.id);

  // 3. Tính toán các khoảng ngày
  const now = new Date();
  const { start, prevStart } = calculatePeriodDates(validPeriod, now);

  // 4. Lấy các mục đơn hàng đã thanh toán (paid) thuộc về các khoá học này
  const paidItems = await db
    .select({
      orderId: orderItems.orderId,
      courseId: orderItems.courseId,
      unitPrice: orderItems.unitPrice,
      orderSubtotal: orders.subtotal,
      orderDiscount: orders.discountAmount,
      orderTotal: orders.totalAmount,
      paidAt: orders.paidAt,
    })
    .from(orderItems)
    .innerJoin(orders, eq(orderItems.orderId, orders.id))
    .where(
      and(
        inArray(orderItems.courseId, publishedCourseIds),
        eq(orders.status, "paid"),
        gte(orders.paidAt, prevStart)
      )
    );

  // 5. Phân tách đơn hàng giữa kỳ hiện tại và kỳ trước
  const currentItems = paidItems.filter(
    (item) => item.paidAt && new Date(item.paidAt) >= start
  );
  const previousItems = paidItems.filter(
    (item) =>
      item.paidAt &&
      new Date(item.paidAt) >= prevStart &&
      new Date(item.paidAt) < start
  );

  // Hàm tính toán doanh thu cho từng mục (có phân bổ giảm giá theo tỉ lệ)
  const computeItemTotals = (items: typeof paidItems) => {
    let gross = 0;
    let net = 0;
    let discount = 0;
    const orderSet = new Set<number>();

    items.forEach((item) => {
      gross += item.unitPrice;
      orderSet.add(item.orderId);

      // Phân bổ voucher giảm giá theo tỉ lệ giá trị khoá trong đơn hàng
      const itemDiscount =
        item.orderSubtotal > 0
          ? Math.round((item.unitPrice / item.orderSubtotal) * item.orderDiscount)
          : 0;

      discount += itemDiscount;
      net += item.unitPrice - itemDiscount;
    });

    return {
      gross,
      net,
      discount,
      orders: orderSet.size,
    };
  };

  const currTotals = computeItemTotals(currentItems);
  const prevTotals = computeItemTotals(previousItems);

  // 6. Xây dựng 4 thẻ KPI
  const kpiData = buildKpiData(currTotals, prevTotals);

  // 7. Tạo dữ liệu biểu đồ đường (Line chart B2)
  const chartCurrentRecords = currentItems.map((item) => {
    const itemDiscount =
      item.orderSubtotal > 0
        ? Math.round((item.unitPrice / item.orderSubtotal) * item.orderDiscount)
        : 0;
    return {
      paidAt: item.paidAt!,
      amount: item.unitPrice - itemDiscount,
    };
  });

  const chartPreviousRecords = previousItems.map((item) => {
    const itemDiscount =
      item.orderSubtotal > 0
        ? Math.round((item.unitPrice / item.orderSubtotal) * item.orderDiscount)
        : 0;
    return {
      paidAt: item.paidAt!,
      amount: item.unitPrice - itemDiscount,
    };
  });

  const chartData = generateChartSeries(
    chartCurrentRecords,
    chartPreviousRecords,
    validPeriod,
    now
  );

  // 8. Bảng thống kê doanh thu theo khoá học (B3)
  const courseRevenueMap = new Map<
    string,
    { orders: Set<number>; revenue: number }
  >();

  publishedCourses.forEach((c) => {
    courseRevenueMap.set(c.id, { orders: new Set(), revenue: 0 });
  });

  currentItems.forEach((item) => {
    const cr = courseRevenueMap.get(item.courseId);
    if (cr) {
      cr.orders.add(item.orderId);
      const itemDiscount =
        item.orderSubtotal > 0
          ? Math.round((item.unitPrice / item.orderSubtotal) * item.orderDiscount)
          : 0;
      cr.revenue += item.unitPrice - itemDiscount;
    }
  });

  const totalNetRevenue = currTotals.net;

  const courseRevenues: CourseRevenueItem[] = publishedCourses
    .map((c) => {
      const data = courseRevenueMap.get(c.id) || { orders: new Set(), revenue: 0 };
      const percentage =
        totalNetRevenue > 0
          ? Math.round((data.revenue / totalNetRevenue) * 100)
          : 0;

      return {
        courseId: c.id,
        courseTitle: c.title,
        ordersCount: data.orders.size,
        revenue: data.revenue,
        percentage,
      };
    })
    .sort((a, b) => b.revenue - a.revenue);

  return {
    state: totalNetRevenue === 0 && currTotals.orders === 0 ? "no_sales" : "ready",
    period: validPeriod,
    kpiData,
    chartData,
    courseRevenues,
    totalRevenue: totalNetRevenue,
    totalOrders: currTotals.orders,
  };
}
