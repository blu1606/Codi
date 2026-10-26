// TODO(type): the notification inbox type lives in components/notification-menu.tsx and is not exported.
export interface DemoNotification {
  id: number;
  title: string;
  body: string | null;
  link: string | null;
  readAt: string | null;
  createdAt: string;
}

export interface DemoInbox {
  userId: string;
  unreadCount: number;
  items: DemoNotification[];
}

const now = "2026-10-26T07:00:00.000Z";

/** Inbox with one unread item (S40 default). */
export const inboxUnread: DemoInbox = {
  userId: "usr-learner-001",
  unreadCount: 1,
  items: [
    { id: 1, title: "Bài tập đã được chấm", body: "Bài “Xây dựng REST API” đạt 8.5/10.", link: null, readAt: null, createdAt: now },
    { id: 2, title: "Chào mừng đến với Codi", body: null, link: null, readAt: now, createdAt: now },
  ],
};

/** Inbox with nothing to show (S40 empty state). */
export const inboxEmpty: DemoInbox = { userId: "usr-learner-001", unreadCount: 0, items: [] };
