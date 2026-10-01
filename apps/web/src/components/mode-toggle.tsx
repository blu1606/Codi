"use client";

import { Button } from "@codi-1/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@codi-1/ui/components/dropdown-menu";
import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import * as React from "react";

export function ModeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);
  const selectedTheme = mounted ? theme ?? "system" : "system";
  const ThemeIcon = selectedTheme === "light" ? Sun : selectedTheme === "dark" ? Moon : Monitor;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button variant="outline" size="icon" className="size-10 rounded-xl text-muted-foreground hover:text-foreground" />}
        aria-label="Chọn giao diện sáng hoặc tối"
        title="Giao diện"
      >
        <ThemeIcon aria-hidden="true" className="size-5" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={8} className="w-44 rounded-xl p-1">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Giao diện</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuRadioGroup value={selectedTheme} onValueChange={setTheme}>
            <DropdownMenuRadioItem value="light"><Sun aria-hidden="true" />Sáng</DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="dark"><Moon aria-hidden="true" />Tối</DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="system"><Monitor aria-hidden="true" />Theo hệ thống</DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
