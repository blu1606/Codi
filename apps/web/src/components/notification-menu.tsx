"use client";

import { Bell } from "lucide-react";
import { Button } from "@codi-1/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@codi-1/ui/components/dropdown-menu";

export default function NotificationMenu() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button variant="outline" size="icon" className="size-10 rounded-xl text-muted-foreground hover:text-foreground" />}
        aria-label="Thông báo"
        title="Thông báo"
      >
        <Bell aria-hidden="true" className="size-5" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={8} className="w-72 max-w-[calc(100vw-2rem)] rounded-xl p-1">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="font-semibold text-foreground">Thông báo</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <div className="flex flex-col items-center gap-3 px-4 py-8 text-center text-muted-foreground">
            <span className="flex size-11 items-center justify-center rounded-full bg-muted">
              <Bell aria-hidden="true" className="size-5" />
            </span>
            <p className="text-sm">Chưa có thông báo.</p>
          </div>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
