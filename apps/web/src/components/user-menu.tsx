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
import { ChevronDown } from "lucide-react";
import { toast } from "sonner";

import { authClient, signOutSession } from "@/lib/auth-client";
import { ThemeMenuGroup } from "./mode-toggle";
import { getRoleHome, ROLE_LABEL, type RoleId } from "@codi-1/auth/roles";

export default function UserMenu({ role = null }: { role?: RoleId | null }) {
  const router = useRouter();
  const { data: session, isPending } = authClient.useSession();
  const [profileOverride, setProfileOverride] = useState<{
    userId: string;
    name: string;
  } | null>(null);
  const [avatarOverride, setAvatarOverride] = useState<{
    userId: string;
    imageUrl: string;
  } | null>(null);
  const [failedAvatar, setFailedAvatar] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState(false);

  const handleSignOut = async () => {
    if (!session || signingOut) return;
    setSigningOut(true);
    try {
      const result = await signOutSession(session.session.id);
      if (result.error) {
        toast.error("Không thể đăng xuất. Vui lòng thử lại.");
        return;
      }
      setProfileOverride(null);
      setAvatarOverride(null);
      setFailedAvatar(null);
      router.push("/");
    } catch {
      toast.error("Không thể đăng xuất. Vui lòng thử lại.");
    } finally {
      setSigningOut(false);
    }
  };

  useEffect(() => {
    const handleProfileNameUpdated = (event: Event) => {
      const detail = (
        event as CustomEvent<{ name?: string; userId?: string }>
      ).detail;
      if (detail?.name) {
        setProfileOverride({
          userId: detail.userId || session?.user?.id || "",
          name: detail.name,
        });
      }
    };
    const handleAvatarUpdated = (event: Event) => {
      const detail = (event as CustomEvent<{ userId?: string; imageUrl?: string }>).detail;
      if (detail?.userId && detail.imageUrl) {
        setAvatarOverride({ userId: detail.userId, imageUrl: detail.imageUrl });
        setFailedAvatar(null);
      }
    };

    window.addEventListener("profile-name-updated", handleProfileNameUpdated);
    window.addEventListener("profile-avatar-updated", handleAvatarUpdated);
    return () => {
      window.removeEventListener(
        "profile-name-updated",
        handleProfileNameUpdated
      );
      window.removeEventListener("profile-avatar-updated", handleAvatarUpdated);
    };
  }, [session?.user?.id]);

  if (isPending) {
    return <Skeleton className="size-11 rounded-full" aria-label="Đang tải tài khoản" />;
  }

  if (!session) {
    return (
      <Button nativeButton={false} render={<Link href="/login" />}>Đăng nhập</Button>
    );
  }

  const currentDisplayName =
    (profileOverride && profileOverride.userId === session.user.id
      ? profileOverride.name
      : session.user.name) || "Tài khoản";
  const avatarUrl = avatarOverride?.userId === session.user.id
    ? avatarOverride.imageUrl
    : session.user.image;
  const initials = currentDisplayName.trim().split(/\s+/).slice(-2).map((part) => part[0]).join("").toUpperCase();
  // Vietnamese names put the given name last, so the header label uses the last word (as in the mockup).
  const firstName = currentDisplayName.trim().split(/\s+/).slice(-1)[0];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button variant="ghost" className="h-11 gap-2 rounded-md px-2" />}
        aria-label={`Mở menu tài khoản của ${currentDisplayName}`}
        title={currentDisplayName}
      >
        <span className="flex size-7 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted text-xs font-semibold text-muted-foreground">
          {avatarUrl && failedAvatar !== avatarUrl ? (
            <img
              src={avatarUrl}
              alt=""
              className="size-full object-cover"
              onError={() => setFailedAvatar(avatarUrl)}
            />
          ) : (
            <span aria-hidden="true">{initials}</span>
          )}
        </span>
        <span aria-hidden="true" className="hidden max-w-24 truncate text-sm font-medium text-foreground sm:inline">{firstName}</span>
        <ChevronDown aria-hidden="true" className="size-4 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={8} className="w-64 max-w-[calc(100vw-2rem)] rounded-xl bg-card p-1">
        <DropdownMenuGroup>
          <DropdownMenuLabel>
            <span className="block truncate text-sm font-semibold text-foreground">{currentDisplayName}</span>
            <span className="mt-1 block truncate font-normal">{session.user.email}</span>
            {role && <span className="mt-2 inline-flex rounded-pill bg-accent px-2 py-1 text-xs text-accent-foreground">{ROLE_LABEL[role]}</span>}
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => router.push(getRoleHome(role))}>
            {role === "ADMIN" ? "Bảng quản trị" : role === "LECTURER" ? "Khu vực giảng dạy" : "Bàn làm việc"}
          </DropdownMenuItem>
          {role === "LEARNER" && <DropdownMenuItem onClick={() => router.push("/progress")}>Tiến độ & kết quả</DropdownMenuItem>}
          <DropdownMenuItem onClick={() => router.push("/profile")}>
            Hồ sơ cá nhân (Profile)
          </DropdownMenuItem>
          {role === "LEARNER" && <DropdownMenuItem onClick={() => router.push("/profile?tab=nang-luc")}>Hồ sơ năng lực</DropdownMenuItem>}
          <DropdownMenuItem onClick={() => router.push("/settings")}>
            Cài đặt (Setting)
          </DropdownMenuItem>
          <ThemeMenuGroup />
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            disabled={signingOut}
            onClick={handleSignOut}
          >
            Đăng xuất
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
