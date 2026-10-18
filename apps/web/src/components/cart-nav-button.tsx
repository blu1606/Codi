"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ShoppingCart } from "lucide-react";
import { authClient } from "@/lib/auth-client";

export default function CartNavButton({ mobile = false }: { mobile?: boolean }) {
  const { data: session } = authClient.useSession();
  const [count, setCount] = useState<number>(0);

  const fetchCartCount = () => {
    if (!session?.user) {
      setCount(0);
      return;
    }
    fetch("/api/student/cart")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data && Array.isArray(data.items)) {
          setCount(data.items.length);
        } else if (data && typeof data.count === "number") {
          setCount(data.count);
        }
      })
      .catch(() => {});
  };

  useEffect(() => {
    fetchCartCount();
    const handleUpdate = () => fetchCartCount();
    window.addEventListener("codi:cart-updated", handleUpdate);
    return () => window.removeEventListener("codi:cart-updated", handleUpdate);
  }, [session?.user]);

  if (mobile) {
    return (
      <Link
        className="mt-2 flex min-h-11 items-center justify-between rounded-md px-3 text-sm hover:bg-accent"
        href={{ pathname: "/cart" }}
      >
        <span className="flex items-center gap-2">
          <ShoppingCart aria-hidden="true" className="size-4" />
          Giỏ hàng
        </span>
        {count > 0 && (
          <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-bold text-primary-foreground leading-none">
            {count}
          </span>
        )}
      </Link>
    );
  }

  return (
    <Link
      href={{ pathname: "/cart" }}
      aria-label={`Giỏ hàng${count > 0 ? `, ${count} khoá học` : ""}`}
      className="relative hidden size-11 items-center justify-center rounded-md hover:bg-muted sm:flex"
    >
      <ShoppingCart aria-hidden="true" className="size-5" />
      {count > 0 && (
        <span className="absolute top-1.5 right-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground leading-none">
          {count > 99 ? "99+" : count}
        </span>
      )}
    </Link>
  );
}
