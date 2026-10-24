export type CourseOwnership =
  | "owned"
  | "pending-payment"
  | "in-cart"
  | "free"
  | "not-owned";

export interface CourseOwnershipDetail {
  ownership: CourseOwnership;
  pendingOrderId?: string;
}

/**
 * Pure function implementing the ownership state machine from docs/mockup/STATE-MACHINES.md §2.
 * Evaluation order (first match wins):
 * 1. Guest: free if price === 0, else not-owned
 * 2. Signed-in: owned -> pending-payment -> in-cart -> free (price 0) -> not-owned
 */
export function resolveCourseOwnership(params: {
  isEnrolled: boolean;
  pendingOrderId?: string | null;
  isInCart: boolean;
  price: number;
  signedIn: boolean;
}): CourseOwnershipDetail {
  if (!params.signedIn) {
    return {
      ownership: params.price === 0 ? "free" : "not-owned",
    };
  }

  if (params.isEnrolled) {
    return { ownership: "owned" };
  }

  if (params.pendingOrderId) {
    return {
      ownership: "pending-payment",
      pendingOrderId: params.pendingOrderId,
    };
  }

  if (params.isInCart) {
    return { ownership: "in-cart" };
  }

  if (params.price === 0) {
    return { ownership: "free" };
  }

  return { ownership: "not-owned" };
}
