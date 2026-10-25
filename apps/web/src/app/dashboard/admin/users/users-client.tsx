"use client";

import { useMemo, useState } from "react";
import { Search, UserX } from "lucide-react";
import { Button } from "@codi-1/ui/components/button";
import { Input } from "@codi-1/ui/components/input";
import { ROLE, type RoleId } from "@codi-1/auth/roles";

import RoleSelect from "./role-select";
import BanToggle from "./ban-toggle";

export type AdminUserRow = {
  id: string;
  name: string;
  email: string;
  createdAt: string;
  banned: boolean;
  banReason?: string | null;
  roleId: RoleId;
};

export default function UsersClient({
  users,
  currentUserId,
  initialStatus,
  initialRole,
  initialQuery,
}: {
  users: AdminUserRow[];
  currentUserId: string;
  initialStatus?: string;
  initialRole?: string;
  initialQuery?: string;
}) {
  const [searchTerm, setSearchTerm] = useState(initialQuery ?? "");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">(
    initialStatus === "active" || initialStatus === "inactive" ? initialStatus : "all"
  );
  const [roleFilter, setRoleFilter] = useState<"all" | RoleId>(
    initialRole === ROLE.LEARNER || initialRole === ROLE.LECTURER || initialRole === ROLE.ADMIN
      ? (initialRole as RoleId)
      : "all"
  );

  const countsByRole = useMemo(() => {
    return {
      all: users.length,
      LEARNER: users.filter((u) => u.roleId === ROLE.LEARNER).length,
      LECTURER: users.filter((u) => u.roleId === ROLE.LECTURER).length,
      ADMIN: users.filter((u) => u.roleId === ROLE.ADMIN).length,
    };
  }, [users]);

  const countsByStatus = useMemo(() => ({
    all: users.length,
    active: users.filter((user) => !user.banned).length,
    inactive: users.filter((user) => user.banned).length,
  }), [users]);

  const filteredUsers = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return users.filter((u) => {
      // Role filter
      if (roleFilter !== "all" && u.roleId !== roleFilter) return false;

      // Status filter
      if (statusFilter === "active" && u.banned) return false;
      if (statusFilter === "inactive" && !u.banned) return false;

      // Search term
      if (term) {
        const matchName = u.name.toLowerCase().includes(term);
        const matchEmail = u.email.toLowerCase().includes(term);
        if (!matchName && !matchEmail) return false;
      }

      return true;
    });
  }, [users, roleFilter, statusFilter, searchTerm]);

  const handleResetFilters = () => {
    setSearchTerm("");
    setStatusFilter("all");
    setRoleFilter("all");
  };

  const hasActiveFilters = searchTerm !== "" || statusFilter !== "all" || roleFilter !== "all";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Lọc theo trạng thái">
        {([
          { key: "all", label: "Tất cả" },
          { key: "active", label: "Đang hoạt động" },
          { key: "inactive", label: "Đã vô hiệu hoá" },
        ] as const).map((item) => (
          <Button key={item.key} type="button" size="sm"
            variant={statusFilter === item.key ? "secondary" : "outline"}
            aria-pressed={statusFilter === item.key}
            onClick={() => setStatusFilter(item.key)}>
            {item.label} ({countsByStatus[item.key]})
          </Button>
        ))}
      </div>
      {/* Search and Filters Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 items-end">
        <div className="space-y-1.5">
          <label htmlFor="user-search-input" className="text-xs font-medium text-muted-foreground">
            Tìm theo tên hoặc email
          </label>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              id="user-search-input"
              type="text"
              placeholder="Nhập tên hoặc email..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-8 text-sm"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="user-status-filter" className="text-xs font-medium text-muted-foreground">
            Trạng thái
          </label>
          <select
            id="user-status-filter"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as "all" | "active" | "inactive")}
            className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            <option value="all">Tất cả</option>
            <option value="active">Đang hoạt động</option>
            <option value="inactive">Đã vô hiệu hoá</option>
          </select>
        </div>

        {hasActiveFilters && (
          <div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleResetFilters}
              className="h-9 text-xs"
            >
              Xoá bộ lọc
            </Button>
          </div>
        )}
      </div>

      {/* Role Filter Chips */}
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Lọc theo vai trò">
        {[
          { key: "all", label: "Tất cả", count: countsByRole.all },
          { key: ROLE.LEARNER, label: "Học viên", count: countsByRole.LEARNER },
          { key: ROLE.LECTURER, label: "Giảng viên", count: countsByRole.LECTURER },
          { key: ROLE.ADMIN, label: "Quản trị viên", count: countsByRole.ADMIN },
        ].map((item) => {
          const isActive = roleFilter === item.key;
          return (
            <button
              key={item.key}
              type="button"
              aria-pressed={isActive}
              onClick={() => setRoleFilter(item.key as "all" | RoleId)}
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium border transition-colors cursor-pointer ${
                isActive
                  ? "border-primary bg-primary/10 text-primary font-semibold"
                  : "border-border bg-background text-muted-foreground hover:bg-muted/50"
              }`}
            >
              <span>{item.label}</span>
              <span className="rounded-full bg-muted px-1.5 py-0.2 text-[10px] text-muted-foreground">
                {item.count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Table */}
      {filteredUsers.length > 0 ? (
        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left">
              <tr>
                <th className="px-4 py-3 font-medium">Họ và tên</th>
                <th className="px-4 py-3 font-medium">Email</th>
                <th className="px-4 py-3 font-medium">Ngày tham gia</th>
                <th className="px-4 py-3 font-medium">Vai trò</th>
                <th className="px-4 py-3 font-medium">Trạng thái</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.map((u) => {
                const isSelf = u.id === currentUserId;
                const formattedDate = new Date(u.createdAt).toLocaleDateString("vi-VN");

                return (
                  <tr key={u.id} className="border-t border-border hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="size-8 rounded-full bg-primary/10 text-primary flex items-center justify-center font-semibold text-xs shrink-0">
                          {u.name?.slice(0, 1)?.toUpperCase() || "U"}
                        </div>
                        <span className="font-medium text-foreground">
                          {u.name}
                          {isSelf && <span className="ml-1 text-xs text-muted-foreground font-normal">(bạn)</span>}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{u.email}</td>
                    <td className="px-4 py-3 text-muted-foreground">{formattedDate}</td>
                    <td className="px-4 py-3">
                      <RoleSelect
                        userId={u.id}
                        userName={u.name}
                        currentRoleId={u.roleId}
                        disabled={isSelf}
                      />
                    </td>
                    <td className="px-4 py-3">
                      <BanToggle
                        userId={u.id}
                        userName={u.name}
                        userEmail={u.email}
                        isBanned={u.banned}
                        banReason={u.banReason ?? undefined}
                        isSelf={isSelf}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-border p-12 text-center space-y-3 bg-card">
          <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-muted">
            <UserX className="size-6 text-muted-foreground" />
          </div>
          <div className="space-y-1">
            <h3 className="font-medium text-foreground">Không có người dùng phù hợp</h3>
            <p className="text-xs text-muted-foreground">
              Thử thay đổi từ khoá tìm kiếm hoặc bỏ bớt các bộ lọc đang chọn.
            </p>
          </div>
          {hasActiveFilters && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleResetFilters}
              className="text-xs"
            >
              Xoá bộ lọc
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
