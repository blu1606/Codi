"use client";

import { useState } from "react";
import type { Route } from "next";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, ShoppingCart } from "lucide-react";
import { getRoleHome, ROLE } from "@codi-1/auth/roles";
import { Button } from "@codi-1/ui/components/button";
import { Sheet } from "@codi-1/ui/components/sheet";
import { cn } from "@codi-1/ui/lib/utils";
import { authClient } from "@/lib/auth-client";
import { useActiveRole } from "@/hooks/use-active-role";
import { ModeToggle } from "./mode-toggle";
import UserMenu from "./user-menu";
import NotificationMenu from "./notification-menu";
import BrandLogo from "./brand-logo";
import CartNavButton from "./cart-nav-button";

export default function Header() {
  const pathname = usePathname();
  const { data: session, isPending } = authClient.useSession();
  const { role, loading, error, retry } = useActiveRole(session?.user.id);
  const [mobileOpen, setMobileOpen] = useState(false);
  if (pathname === "/settings") return null;

  const links: { href: Route; label: string }[] = role === ROLE.ADMIN
    ? [{ href: "/dashboard/admin", label: "Quản trị" }, { href: "/courses", label: "Khoá học" }]
    : role === ROLE.LECTURER
      ? [{ href: "/dashboard/lecturer", label: "Giảng dạy" }, { href: "/courses", label: "Khoá học" }]
      : [{ href: "/courses", label: "Khoá học" }, ...(role === ROLE.LEARNER ? [{ href: "/dashboard" as const, label: "Học tập của tôi" }] : []), { href: "/ai", label: "AI" }];
  const nav = (mobile: boolean) => <nav aria-label={mobile ? "Điều hướng di động" : "Điều hướng chính"} className={cn(mobile ? "flex flex-col gap-2" : "hidden items-center gap-1 md:flex")}>
    {links.map(({ href, label }) => {
      const active = pathname === href || pathname.startsWith(`${href}/`) || (href === "/dashboard" && (pathname.startsWith("/learn/") || pathname === "/progress"));
      return <Link key={href} href={href} aria-current={active ? "page" : undefined} onClick={() => setMobileOpen(false)} className={cn("flex min-h-11 items-center rounded-md px-3 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground", active ? "bg-accent text-accent-foreground" : "text-muted-foreground")}>{label}</Link>;
    })}
  </nav>;

  return <header className="sticky top-0 z-40 w-full border-b bg-background/95 backdrop-blur-md">
    <div className="mx-auto flex h-16 max-w-[1200px] items-center justify-between gap-2 px-4 sm:px-6">
      <div className="flex min-w-0 items-center gap-2 md:gap-8">
        <Button variant="ghost" size="icon" className="md:hidden" aria-label="Mở menu" onClick={() => setMobileOpen(true)}><Menu aria-hidden="true" /></Button>
        <Link href={getRoleHome(role)} data-codi-logo aria-label="Codi — Trang chính" className="flex min-h-11 shrink-0 items-center font-display text-xl font-semibold"><BrandLogo /></Link>
        <div data-codi-intro-nav aria-busy={isPending || loading}>{nav(false)}</div>
      </div>
      <div data-codi-intro-account className="flex shrink-0 items-center gap-1 sm:gap-2">
        {role === ROLE.LEARNER && <CartNavButton />}
        <ModeToggle />
        <NotificationMenu />
        <UserMenu role={role} />
      </div>
    </div>
    {error && <div role="status" className="mx-auto flex max-w-[1200px] items-center gap-2 px-4 pb-2 text-xs text-destructive">Không thể tải menu theo vai trò.<Button variant="link" size="sm" onClick={retry}>Thử lại</Button></div>}
    <Sheet open={mobileOpen} onOpenChange={setMobileOpen} title="Menu Codi">
      {nav(true)}
      {role === ROLE.LEARNER && <Link className="mt-2 flex min-h-11 items-center gap-2 rounded-md px-3 text-sm hover:bg-accent" href={{ pathname: "/cart" }} onClick={() => setMobileOpen(false)}><ShoppingCart aria-hidden="true" className="size-4" />Giỏ hàng</Link>}
    </Sheet>
  </header>;
}
