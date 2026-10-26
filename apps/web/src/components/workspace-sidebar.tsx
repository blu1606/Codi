"use client";

import { useState, type ReactNode } from "react";
import type { Route } from "next";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, type LucideIcon } from "lucide-react";
import { Button } from "@codi-1/ui/components/button";
import { Sheet } from "@codi-1/ui/components/sheet";
import { cn } from "@codi-1/ui/lib/utils";

export type WorkspaceNavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  count?: number;
  /** Overrides the default prefix match, e.g. to keep an overview item active only on its exact path. */
  match?: RegExp;
};

export type WorkspaceNavSection = { title: string; items: WorkspaceNavItem[] };

function isActive(pathname: string, item: WorkspaceNavItem) {
  if (item.match) return item.match.test(pathname);
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

/**
 * Left section nav for workspace areas (lecturer, admin). 240px on desktop;
 * below lg it collapses into a menu button that opens the same list in a sheet.
 */
export function WorkspaceSidebar({ label, sections, children }: {
  label: string;
  sections: WorkspaceNavSection[];
  children: ReactNode;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const nav = (onNavigate?: () => void) => (
    <nav aria-label={label} className="flex flex-col gap-1">
      {sections.map((section) => (
        <div key={section.title} className="flex flex-col gap-0.5">
          <p className="px-3 pt-3 pb-1 text-xs font-semibold text-faint">{section.title}</p>
          {section.items.map((item) => {
            const Icon = item.icon;
            const active = isActive(pathname, item);
            return (
              <Link
                key={item.href}
                href={item.href as Route}
                aria-current={active ? "page" : undefined}
                onClick={onNavigate}
                className={cn(
                  "flex min-h-11 items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors",
                  active
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                <Icon aria-hidden="true" className="size-4 shrink-0" />
                <span className="min-w-0 flex-1 truncate">{item.label}</span>
                {typeof item.count === "number" && item.count > 0 && (
                  <span className="rounded-pill bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
                    {item.count}
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );

  return (
    <div className="grid min-h-0 grid-cols-1 lg:grid-cols-[240px_minmax(0,1fr)]">
      <div className="flex items-center gap-2 border-b bg-card px-4 py-2 lg:hidden">
        <Button variant="outline" size="sm" onClick={() => setOpen(true)} aria-haspopup="dialog">
          <Menu aria-hidden="true" />
          {label}
        </Button>
      </div>
      <Sheet open={open} onOpenChange={setOpen} title={label}>
        {nav(() => setOpen(false))}
      </Sheet>
      <aside className="hidden border-r bg-card lg:block">
        <div className="sticky top-16 p-3">{nav()}</div>
      </aside>
      <div className="min-w-0 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</div>
    </div>
  );
}
