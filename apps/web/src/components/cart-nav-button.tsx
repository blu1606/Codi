"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ShoppingCart } from "lucide-react";
import { authClient } from "@/lib/auth-client";

export default function CartNavButton({ mobile }: { mobile?: boolean } = {}) {
  const { data: session } = authClient.useSession();
  const [count, setCount] = useState(0);

  const fetchCart = () => {
    if (!session?.user) {
      setCount(0);
      return;
    }
    fetch("/api/student/cart")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data && typeof data.count === "number") {
          setCount(data.count);
        }
      })
      .catch(() => {});
  };

  useEffect(() => {
    fetchCart();
    const handleUpdate = () => fetchCart();
    window.addEventListener("codi:cart-updated", handleUpdate);
    return () => window.removeEventListener("codi:cart-updated", handleUpdate);
  }, [session?.user]);

  if (!session?.user) return null;

  const userRole = (session.user as { role?: string }).role;
  if (userRole === "lecturer" || userRole === "admin") return null;

  return (
    <Link
      href={"/cart" as any}
      aria-label={`Giỏ hàng, ${count} khoá học`}
      className="relative flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-background text-foreground hover:bg-accent transition-colors"
    >
      <ShoppingCart className="h-4 w-4" />
      {count > 0 && (
        <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground leading-none">
          {count}
        </span>
      )}
    </Link>
  );
}
