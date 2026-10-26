"use client";

import {
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
} from "@codi-1/ui/components/dropdown-menu";
import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import * as React from "react";

/** Theme choice rendered inside the account menu. The mockup has no theme control in the product UI. */
export function ThemeMenuGroup() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);
  const selectedTheme = mounted ? theme ?? "system" : "system";

  return (
    <DropdownMenuGroup>
      <DropdownMenuSeparator />
      <DropdownMenuLabel>Giao diện</DropdownMenuLabel>
      <DropdownMenuRadioGroup value={selectedTheme} onValueChange={setTheme}>
        <DropdownMenuRadioItem value="light"><Sun aria-hidden="true" />Sáng</DropdownMenuRadioItem>
        <DropdownMenuRadioItem value="dark"><Moon aria-hidden="true" />Tối</DropdownMenuRadioItem>
        <DropdownMenuRadioItem value="system"><Monitor aria-hidden="true" />Theo hệ thống</DropdownMenuRadioItem>
      </DropdownMenuRadioGroup>
    </DropdownMenuGroup>
  );
}
