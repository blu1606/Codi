import { z } from "zod";

export const intakeStateSchema = z.object({
  goal: z.string().nullable().optional(),
  level: z.string().nullable().optional(),
  hoursPerWeek: z.string().nullable().optional(),
  skipped: z.array(z.string()).optional().default([]),
});

export type IntakeState = z.infer<typeof intakeStateSchema>;

export function formatVnd(price: number): string {
  if (price === 0) return "Miễn phí";
  return `${price.toLocaleString("vi-VN")} ₫`;
}

export function levelLabel(level: string): string {
  if (level === "Beginner" || level === "Cơ bản") return "Cơ bản";
  if (level === "Intermediate" || level === "Trung cấp") return "Trung cấp";
  if (level === "Advanced" || level === "Nâng cao") return "Nâng cao";
  return level;
}
