"use client";

import { Button } from "@codi-1/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@codi-1/ui/components/dropdown-menu";
import { Skeleton } from "@codi-1/ui/components/skeleton";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { UserRound } from "lucide-react";

import { authClient } from "@/lib/auth-client";

export default function UserMenu() {
  const router = useRouter();
  const { data: session, isPending } = authClient.useSession();
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [profileAvatar, setProfileAvatar] = useState<{ userId: string; imageUrl: string } | null>(null);
  const [failedAvatar, setFailedAvatar] = useState<string | null>(null);

  useEffect(() => {
    const handleProfileNameUpdated = (event: Event) => {
      const name = (event as CustomEvent<{ name?: string }>).detail?.name;
      if (name) setDisplayName(name);
    };
    const handleAvatarUpdated = (event: Event) => {
      const detail = (event as CustomEvent<{ userId: string; imageUrl: string }>).detail;
      if (detail?.userId && detail.imageUrl) setProfileAvatar(detail);
    };

    window.addEventListener("profile-name-updated", handleProfileNameUpdated);
    window.addEventListener("profile-avatar-updated", handleAvatarUpdated);
    return () => {
      window.removeEventListener("profile-name-updated", handleProfileNameUpdated);
      window.removeEventListener("profile-avatar-updated", handleAvatarUpdated);
    };
  }, []);

  if (isPending) {
    return <Skeleton className="size-10 rounded-full" aria-label="Đang tải tài khoản" />;
  }

  if (!session) {
    return (
      <Link
        href="/login"
        aria-label="Đăng nhập"
        title="Đăng nhập"
        className="flex size-10 shrink-0 items-center justify-center rounded-full border border-border bg-muted text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <UserRound aria-hidden="true" className="size-5" />
      </Link>
    );
  }

  const name = displayName || session.user.name || "Tài khoản";
  const avatarUrl = profileAvatar?.userId === session.user.id ? profileAvatar.imageUrl : session.user.image;
  const initials = name.trim().split(/\s+/).slice(-2).map((part) => part[0]).join("").toUpperCase();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button variant="ghost" size="icon" className="size-10 overflow-hidden rounded-full border border-border bg-muted p-0" />}
        aria-label={`Mở menu tài khoản của ${name}`}
        title={name}
      >
        {avatarUrl && failedAvatar !== avatarUrl ? (
          <img
            src={avatarUrl}
            alt=""
            className="size-full object-cover"
            onError={() => setFailedAvatar(avatarUrl)}
          />
        ) : (
          <span aria-hidden="true" className="text-sm font-semibold">{initials}</span>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={8} className="w-64 max-w-[calc(100vw-2rem)] rounded-xl bg-card p-1">
        <DropdownMenuGroup>
          <DropdownMenuLabel>
            <span className="block truncate text-sm font-semibold text-foreground">{name}</span>
            <span className="mt-1 block truncate font-normal">{session.user.email}</span>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => router.push("/dashboard")}>
            Bàn làm việc (Dashboard)
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => router.push("/profile")}>
            Hồ sơ cá nhân (Profile)
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            onClick={() => {
              authClient.signOut({
                fetchOptions: {
                  onSuccess: () => {
                    router.push("/");
                  },
                },
              });
            }}
          >
            Đăng xuất
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
