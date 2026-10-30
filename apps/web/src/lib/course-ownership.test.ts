import { describe, expect, it } from "vitest";
import { resolveCourseOwnership } from "./course-ownership";

describe("Course Ownership State Machine (STATE-MACHINES.md §2)", () => {
  describe("Guest / Not signed in", () => {
    it("returns 'free' when price is 0", () => {
      const result = resolveCourseOwnership({
        signedIn: false,
        price: 0,
        isEnrolled: false,
        isInCart: false,
      });
      expect(result).toEqual({ ownership: "free" });
    });

    it("returns 'not-owned' when price is greater than 0", () => {
      const result = resolveCourseOwnership({
        signedIn: false,
        price: 150000,
        isEnrolled: false,
        isInCart: false,
      });
      expect(result).toEqual({ ownership: "not-owned" });
    });
  });

  describe("Signed-in user evaluation order precedence", () => {
    it("precedence 1: 'owned' wins when user is enrolled", () => {
      const result = resolveCourseOwnership({
        signedIn: true,
        isEnrolled: true,
        pendingOrderId: "CODI12345",
        isInCart: true,
        price: 150000,
      });
      expect(result).toEqual({ ownership: "owned" });
    });

    it("precedence 2: 'pending-payment' wins when not enrolled and order is pending", () => {
      const result = resolveCourseOwnership({
        signedIn: true,
        isEnrolled: false,
        pendingOrderId: "CODI99999",
        isInCart: true,
        price: 200000,
      });
      expect(result).toEqual({
        ownership: "pending-payment",
        pendingOrderId: "CODI99999",
      });
    });

    it("precedence 3: 'in-cart' wins when not enrolled, not pending, but in cart", () => {
      const result = resolveCourseOwnership({
        signedIn: true,
        isEnrolled: false,
        pendingOrderId: null,
        isInCart: true,
        price: 200000,
      });
      expect(result).toEqual({ ownership: "in-cart" });
    });

    it("precedence 4: 'free' wins when not enrolled, not pending, not in cart, and price is 0", () => {
      const result = resolveCourseOwnership({
        signedIn: true,
        isEnrolled: false,
        pendingOrderId: null,
        isInCart: false,
        price: 0,
      });
      expect(result).toEqual({ ownership: "free" });
    });

    it("precedence 5: 'not-owned' when not enrolled, not pending, not in cart, and price > 0", () => {
      const result = resolveCourseOwnership({
        signedIn: true,
        isEnrolled: false,
        pendingOrderId: null,
        isInCart: false,
        price: 500000,
      });
      expect(result).toEqual({ ownership: "not-owned" });
    });

    it("resolves to 'not-owned' or 'in-cart' when pendingOrderId is null (e.g. order cancelled/expired)", () => {
      // When an order is cancelled or expired, pendingOrderId is null
      const notInCartResult = resolveCourseOwnership({
        signedIn: true,
        isEnrolled: false,
        pendingOrderId: null,
        isInCart: false,
        price: 590000,
      });
      expect(notInCartResult).toEqual({ ownership: "not-owned" });

      const inCartResult = resolveCourseOwnership({
        signedIn: true,
        isEnrolled: false,
        pendingOrderId: null,
        isInCart: true,
        price: 590000,
      });
      expect(inCartResult).toEqual({ ownership: "in-cart" });
    });
  });
});
