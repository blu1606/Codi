"use server";

import { and, desc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { feedbackSnippets } from "@codi-1/db";
import { db } from "@/services";
import { verifyLecturerSession } from "@/lib/lecturer-auth";

export interface FeedbackSnippetDto {
  id: number;
  title: string;
  body: string;
  createdAt: string;
}

export type FeedbackSnippetItem = FeedbackSnippetDto;

export interface SnippetInput {
  title: string;
  body: string;
}

export interface SnippetActionResult {
  success: boolean;
  snippet?: FeedbackSnippetDto;
  errors?: Record<string, string>;
  error?: string;
  message?: string;
}

/**
 * Lấy danh sách mẫu nhận xét của giảng viên hiện tại.
 */
export async function getFeedbackSnippets(): Promise<FeedbackSnippetDto[]> {
  const user = await verifyLecturerSession();

  const list = await db
    .select({
      id: feedbackSnippets.id,
      title: feedbackSnippets.title,
      body: feedbackSnippets.body,
      createdAt: feedbackSnippets.createdAt,
    })
    .from(feedbackSnippets)
    .where(eq(feedbackSnippets.lecturerId, user.id))
    .orderBy(desc(feedbackSnippets.createdAt));

  return list.map((item) => ({
    id: item.id,
    title: item.title,
    body: item.body,
    createdAt: item.createdAt.toISOString(),
  }));
}

/**
 * Tạo một mẫu nhận xét mới cho giảng viên.
 */
export async function createFeedbackSnippet(
  input: SnippetInput
): Promise<SnippetActionResult> {
  const user = await verifyLecturerSession();

  const title = input.title?.trim() || "";
  const body = input.body?.trim() || "";
  const errors: Record<string, string> = {};

  if (!title) {
    errors.title = "Tiêu đề mẫu không được để trống.";
  } else if (title.length > 100) {
    errors.title = "Tiêu đề mẫu tối đa 100 ký tự.";
  }

  if (!body) {
    errors.body = "Nội dung mẫu không được để trống.";
  } else if (body.length > 2000) {
    errors.body = "Nội dung mẫu tối đa 2000 ký tự.";
  }

  if (Object.keys(errors).length > 0) {
    return { success: false, errors };
  }

  const [inserted] = await db
    .insert(feedbackSnippets)
    .values({
      lecturerId: user.id,
      title,
      body,
    })
    .returning();

  revalidatePath("/dashboard/lecturer/snippets");
  revalidatePath("/dashboard/lecturer/grading");

  return {
    success: true,
    snippet: {
      id: inserted.id,
      title: inserted.title,
      body: inserted.body,
      createdAt: inserted.createdAt.toISOString(),
    },
  };
}

/**
 * Cập nhật một mẫu nhận xét hiện có.
 */
export async function updateFeedbackSnippet(
  id: number,
  input: SnippetInput
): Promise<SnippetActionResult> {
  const user = await verifyLecturerSession();

  const title = input.title?.trim() || "";
  const body = input.body?.trim() || "";
  const errors: Record<string, string> = {};

  if (!title) {
    errors.title = "Tiêu đề mẫu không được để trống.";
  } else if (title.length > 100) {
    errors.title = "Tiêu đề mẫu tối đa 100 ký tự.";
  }

  if (!body) {
    errors.body = "Nội dung mẫu không được để trống.";
  } else if (body.length > 2000) {
    errors.body = "Nội dung mẫu tối đa 2000 ký tự.";
  }

  if (Object.keys(errors).length > 0) {
    return { success: false, errors };
  }

  const [updated] = await db
    .update(feedbackSnippets)
    .set({
      title,
      body,
    })
    .where(
      and(
        eq(feedbackSnippets.id, id),
        eq(feedbackSnippets.lecturerId, user.id)
      )
    )
    .returning();

  if (!updated) {
    throw new Error("Mẫu nhận xét không tồn tại hoặc không thuộc quyền quản lý của bạn.");
  }

  revalidatePath("/dashboard/lecturer/snippets");
  revalidatePath("/dashboard/lecturer/grading");

  return {
    success: true,
    snippet: {
      id: updated.id,
      title: updated.title,
      body: updated.body,
      createdAt: updated.createdAt.toISOString(),
    },
  };
}

/**
 * Xoá một mẫu nhận xét (trả về dữ liệu để hỗ trợ hoàn tác theo STATE-MACHINES §20).
 */
export async function deleteFeedbackSnippet(
  id: number
): Promise<{ success: boolean; deletedSnippet?: { id: number; title: string; body: string } }> {
  const user = await verifyLecturerSession();

  const [deleted] = await db
    .delete(feedbackSnippets)
    .where(
      and(
        eq(feedbackSnippets.id, id),
        eq(feedbackSnippets.lecturerId, user.id)
      )
    )
    .returning();

  if (!deleted) {
    throw new Error("Mẫu nhận xét không tồn tại hoặc không thuộc quyền quản lý của bạn.");
  }

  revalidatePath("/dashboard/lecturer/snippets");
  revalidatePath("/dashboard/lecturer/grading");

  return {
    success: true,
    deletedSnippet: {
      id: deleted.id,
      title: deleted.title,
      body: deleted.body,
    },
  };
}

/**
 * Khôi phục / hoàn tác mẫu nhận xét vừa xoá (STATE-MACHINES G1 & §20).
 */
export async function restoreFeedbackSnippet(snippet: {
  title: string;
  body: string;
}): Promise<{ success: boolean; snippet: FeedbackSnippetDto }> {
  const user = await verifyLecturerSession();

  const title = typeof snippet?.title === "string" ? snippet.title.trim() : "";
  const body = typeof snippet?.body === "string" ? snippet.body.trim() : "";
  if (!title || title.length > 100 || !body || body.length > 2000) {
    throw new Error("Mẫu nhận xét không hợp lệ.");
  }
  const [inserted] = await db
    .insert(feedbackSnippets)
    .values({
      lecturerId: user.id,
      title,
      body,
    })
    .returning();

  revalidatePath("/dashboard/lecturer/snippets");
  revalidatePath("/dashboard/lecturer/grading");

  return {
    success: true,
    snippet: {
      id: inserted.id,
      title: inserted.title,
      body: inserted.body,
      createdAt: inserted.createdAt.toISOString(),
    },
  };
}
