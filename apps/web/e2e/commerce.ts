import { expect, type APIRequestContext, type Page } from "@playwright/test";

import { getSepayConfig } from "../src/lib/sepay-config";
import type { Health } from "./fixtures";

export interface CatalogCourse {
  id: string;
  slug: string;
  title: string;
  price: number;
}

type Ownership = "owned" | "pending-payment" | "in-cart" | "free" | "not-owned";

async function okJson<T>(res: Awaited<ReturnType<APIRequestContext["get"]>>, what: string): Promise<T> {
  if (!res.ok()) throw new Error(`${what} failed with HTTP ${res.status()}`);
  return (await res.json()) as T;
}

export async function publishedCourses(request: APIRequestContext): Promise<CatalogCourse[]> {
  const body = await okJson<{ courses: CatalogCourse[] }>(await request.get("/api/courses"), "GET /api/courses");
  return body.courses;
}

/**
 * Paid published courses the signed-in learner (owner of `request`'s cookies) neither owns, has in the cart, nor
 * has in a pending order. Tests pick from these so they never touch the learner's existing cart lines.
 */
export async function purchasableCourses(request: APIRequestContext, count: number): Promise<CatalogCourse[]> {
  const courses = (await publishedCourses(request)).filter((c) => c.price > 0);
  const body = await okJson<{ ownership: Record<string, { ownership: Ownership }> }>(
    await request.post("/api/courses/ownership", { data: { courses: courses.map((c) => c.id) } }),
    "POST /api/courses/ownership",
  );
  const free = courses.filter((c) => body.ownership[c.id]?.ownership === "not-owned");
  if (free.length < count) {
    throw new Error(`Need ${count} paid courses the learner does not own or have in cart; found ${free.length}.`);
  }
  return free.slice(0, count);
}

export async function addToCart(request: APIRequestContext, courseId: string): Promise<void> {
  await okJson(await request.post("/api/student/cart", { data: { courseId } }), "POST /api/student/cart");
}

/** Removes a course from the learner cart; a course that is not in the cart is not an error. */
export async function removeFromCart(request: APIRequestContext, courseId: string): Promise<void> {
  const res = await request.delete("/api/student/cart", { data: { courseId } });
  if (!res.ok() && res.status() !== 404) throw new Error(`DELETE /api/student/cart failed with HTTP ${res.status()}`);
}

export async function cartCourseIds(request: APIRequestContext): Promise<string[]> {
  const body = await okJson<{ items: { id: string }[] }>(await request.get("/api/student/cart"), "GET /api/student/cart");
  return body.items.map((i) => i.id);
}

export async function buyNow(request: APIRequestContext, courseId: string): Promise<{ orderCode: string; courseSlug?: string }> {
  return okJson(await request.post("/api/orders/buy-now", { data: { courseId } }), "POST /api/orders/buy-now");
}

/** Cancels a pending order created by a test. Cancelling an already cancelled order is tolerated. */
export async function cancelOrder(request: APIRequestContext, orderCode: string): Promise<void> {
  const res = await request.post("/api/orders/cancel", { data: { orderCode } });
  if (!res.ok() && res.status() !== 404) {
    throw new Error(`POST /api/orders/cancel failed with HTTP ${res.status()}`);
  }
}

export const orderCodeFromUrl = (url: string): string | null => new URL(url).searchParams.get("order");

/** Attempt every owned cleanup, including cart restoration after cancellation, and preserve all failures. */
export async function cleanupOrderAndCart(request: APIRequestContext, orderCode: string | null, courseIds: string[]): Promise<void> {
  const errors: unknown[] = [];
  if (orderCode) {
    try { await cancelOrder(request, orderCode); } catch (error) { errors.push(error); }
  }
  for (const courseId of courseIds) {
    try { await removeFromCart(request, courseId); } catch (error) { errors.push(error); }
  }
  if (errors.length) throw new AggregateError(errors, "Owned order/cart cleanup failed");
}

/**
 * Waits for the course checkout screen. Returns false when the payment endpoint fails closed because SePay is not
 * configured in the suite-owned local server: the page then shows "Thanh toán tạm thời chưa khả dụng.".
 * An unavailable screen on a configured or externally managed server is a failure, not a prerequisite skip.
 */
export async function paymentScreenAvailable(page: Page, health: Health): Promise<boolean> {
  const heading = page.getByRole("heading", { name: "Thanh toán khóa học" });
  const unavailable = page.getByText("Thanh toán tạm thời chưa khả dụng.");
  await expect(heading.or(unavailable)).toBeVisible();
  if (await heading.isVisible()) return true;
  if (new URL(page.url()).origin !== "http://localhost:3002" || getSepayConfig()) {
    throw new Error("Payment screen unavailable on a configured or external server; verify the server configuration.");
  }
  health.allow(/^http 503 POST \/api\/payments\/create-transaction$/);
  return false;
}

export const PAYMENTS_UNAVAILABLE = "Payment screen unavailable: local SEPAY_* configuration is missing or invalid (endpoint fails closed).";
