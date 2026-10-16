import "server-only";
import { db } from "@/services";
import { createNotificationService } from "./notification-service";

export const notificationService = createNotificationService(db);
export const notify = notificationService.notify;
