import type { Metadata } from "next";
import { CartView } from "@/components/cart/cart-view";

export const metadata: Metadata = {
  title: "Giỏ hàng | Codi",
  description: "Xem và thanh toán các khóa học lập trình trong giỏ hàng của bạn.",
};

export default function CartPage() {
  return <CartView />;
}
