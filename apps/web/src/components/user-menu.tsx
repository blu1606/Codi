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

import { authClient } from "@/lib/auth-client";

export default function UserMenu() {
  const router = useRouter();
  const { data: session, isPending } = authClient.useSession();
  const [profileOverride, setProfileOverride] = useState<{
    userId: string;
    name: string;
  } | null>(null);

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

    window.addEventListener("profile-name-updated", handleProfileNameUpdated);
    return () =>
      window.removeEventListener(
        "profile-name-updated",
        handleProfileNameUpdated
      );
  }, [session?.user?.id]);

  if (isPending) {
    return <Skeleton className="h-9 w-24" />;
  }

  if (!session) {
    return (
      <Link href="/login">
        <Button variant="outline">Sign In</Button>
      </Link>
    );
  }

  const currentDisplayName =
    profileOverride && profileOverride.userId === session.user.id
      ? profileOverride.name
      : session.user.name;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="outline" />}>
        {currentDisplayName}
      </DropdownMenuTrigger>
      <DropdownMenuContent className="bg-card">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Tài khoản</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem className="text-xs text-muted-foreground">
            {session.user.email}
          </DropdownMenuItem>
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
              setProfileOverride(null);
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
