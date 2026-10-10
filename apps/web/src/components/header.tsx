"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpen, Compass, LayoutDashboard, Sparkles, User } from "lucide-react";
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
  navigationMenuTriggerStyle,
} from "@codi-1/ui/components/navigation-menu";
import { ModeToggle } from "./mode-toggle";
import UserMenu from "./user-menu";
import NotificationMenu from "./notification-menu";
import { cn } from "@codi-1/ui/lib/utils";
import BrandLogo from "./brand-logo";

export default function Header() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur-md supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
        {/* Brand Logo & Left Section */}
        <div className="flex items-center gap-8">
          <Link href="/" data-codi-logo className="flex items-center gap-2 font-bold text-xl tracking-tight text-foreground hover:opacity-90 transition-opacity">
            <BrandLogo />
          </Link>

          {/* Navigation Menu Primitives */}
          <NavigationMenu data-codi-intro-nav className="hidden md:flex">
            <NavigationMenuList className="gap-1">
              {/* Home Link */}
              <NavigationMenuItem>
                <NavigationMenuLink asChild data-active={pathname === "/"} className={cn(navigationMenuTriggerStyle(), "h-9 px-3.5")}>
                  <Link href="/">
                    Trang chủ
                  </Link>
                </NavigationMenuLink>
              </NavigationMenuItem>

              {/* Courses & Training Dropdown */}
              <NavigationMenuItem>
                <NavigationMenuTrigger
                  data-active={pathname === "/courses" || pathname.startsWith("/courses/")}
                  className="h-9 px-3.5"
                >
                  Khoá học
                </NavigationMenuTrigger>
                <NavigationMenuContent>
                  <div className="grid w-[400px] gap-2 p-3 md:w-[500px] md:grid-cols-2 lg:w-[600px]">
                    <Link
                      href="/courses"
                      className="group flex flex-col justify-between rounded-xl bg-gradient-to-b from-primary/10 to-muted/30 p-4 no-underline outline-none transition-colors hover:bg-primary/15"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 text-primary font-semibold">
                          <Compass className="h-4 w-4" />
                          <span>Tất cả khoá học</span>
                        </div>
                        <p className="text-xs text-muted-foreground leading-relaxed pt-1">
                          Tìm kiếm và khám phá các khóa học Frontend, Backend, AI, Mobile dành cho mọi cấp độ.
                        </p>
                      </div>
                      <span className="text-xs font-medium text-primary pt-3 inline-flex items-center gap-1 group-hover:translate-x-0.5 transition-transform">
                        Khám phá danh mục →
                      </span>
                    </Link>

                    <div className="space-y-1">
                      <Link
                        href="/courses"
                        className="block select-none space-y-1 rounded-lg p-3 leading-none no-underline outline-none transition-colors hover:bg-accent hover:text-accent-foreground"
                      >
                        <div className="flex items-center gap-2 text-sm font-medium">
                          <BookOpen className="h-4 w-4 text-primary" />
                          <span>Tìm kiếm khoá học</span>
                        </div>
                        <p className="line-clamp-2 text-xs leading-snug text-muted-foreground pt-1">
                          Lọc theo chủ đề, cấp độ và công nghệ phù hợp.
                        </p>
                      </Link>

                      <Link
                        href="/ai"
                        className="block select-none space-y-1 rounded-lg p-3 leading-none no-underline outline-none transition-colors hover:bg-accent hover:text-accent-foreground"
                      >
                        <div className="flex items-center gap-2 text-sm font-medium">
                          <Sparkles className="h-4 w-4 text-primary" />
                          <span>Lộ trình AI Mentor</span>
                        </div>
                        <p className="line-clamp-2 text-xs leading-snug text-muted-foreground pt-1">
                          Tư vấn lộ trình học tập cá nhân hóa 24/7.
                        </p>
                      </Link>
                    </div>
                  </div>
                </NavigationMenuContent>
              </NavigationMenuItem>

              {/* Dashboard Link */}
              <NavigationMenuItem>
                <NavigationMenuLink asChild data-active={pathname.startsWith("/dashboard")} className={cn(navigationMenuTriggerStyle(), "h-9 px-3.5 flex items-center gap-1.5")}>
                  <Link href="/dashboard">
                    <LayoutDashboard className="h-4 w-4 text-muted-foreground" />
                    <span>Bàn làm việc</span>
                  </Link>
                </NavigationMenuLink>
              </NavigationMenuItem>

              {/* AI Chat Link */}
              <NavigationMenuItem>
                <NavigationMenuLink asChild data-active={pathname === "/ai"} className={cn(navigationMenuTriggerStyle(), "h-9 px-3.5 flex items-center gap-1.5 text-primary font-semibold")}>
                  <Link href="/ai">
                    <Sparkles className="h-4 w-4 text-primary" />
                    <span>AI Chat</span>
                  </Link>
                </NavigationMenuLink>
              </NavigationMenuItem>

              {/* Profile Link */}
              <NavigationMenuItem>
                <NavigationMenuLink asChild data-active={pathname === "/profile"} className={cn(navigationMenuTriggerStyle(), "h-9 px-3.5 flex items-center gap-1.5")}>
                  <Link href="/profile">
                    <User className="h-4 w-4 text-muted-foreground" />
                    <span>Hồ sơ (Profile)</span>
                  </Link>
                </NavigationMenuLink>
              </NavigationMenuItem>
            </NavigationMenuList>
          </NavigationMenu>
        </div>

        {/* Right Section: Theme, notifications, and account avatar */}
        <div data-codi-intro-account className="flex shrink-0 items-center gap-2.5">
          <ModeToggle />
          <NotificationMenu />
          <UserMenu />
        </div>
      </div>
    </header>
  );
}
