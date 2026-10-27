import UsersClient from "@/app/dashboard/admin/users/users-client";
import { adminUsers, ADMIN_USER_ID, deactivateImpact } from "@/demo-fixtures/commerce/s31-admin-users";
import type { Screen } from "../screen-types";
import { Scripted, clickButton, fixtureHandlers } from "./lab-support";

const actions = { getUserImpactCounts: { ok: deactivateImpact } };
const route = { pathname: "/dashboard/admin/users" };

export const adminUsersScreen: Screen = {
  id: "S31",
  title: "Người dùng",
  group: "Quản trị",
  role: "admin",
  layout: "admin",
  mockupHash: "#/admin/users",
  states: {
    default: { label: "Danh sách", route, actions, handlers: fixtureHandlers, render: () => <UsersClient users={adminUsers} currentUserId={ADMIN_USER_ID} /> },
    empty: { label: "Không có người dùng", route, actions, handlers: fixtureHandlers, render: () => <UsersClient users={[]} currentUserId={ADMIN_USER_ID} /> },
    "no-match": { label: "Không khớp bộ lọc", route, actions, handlers: fixtureHandlers, render: () => <UsersClient users={adminUsers} currentUserId={ADMIN_USER_ID} initialQuery="không-tồn-tại" /> },
    deactivate: {
      label: "Vô hiệu hoá (hộp thoại)",
      route, actions, handlers: fixtureHandlers,
      render: () => <Scripted script={() => clickButton("Vô hiệu hoá")}><UsersClient users={adminUsers} currentUserId={ADMIN_USER_ID} /></Scripted>,
    },
  },
};
