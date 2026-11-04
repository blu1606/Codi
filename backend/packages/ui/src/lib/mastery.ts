export const MASTERY_LEVELS = [0, 1, 2, 3, 4] as const;
export type MasteryLevel = (typeof MASTERY_LEVELS)[number];
export const MASTERY_LABELS = ["Chưa học", "Đang học · mới bắt đầu", "Đang học · khá", "Thành thạo", "Thành thạo · vững"] as const;

// D16: BKT probability is evidence-based. No evidence is distinct from p=0.
export function masteryLevel(probability: number | null): MasteryLevel {
  if (probability === null) return 0;
  if (!Number.isFinite(probability) || probability < 0 || probability > 1) throw new RangeError("Xác suất mastery phải nằm trong [0, 1].");
  return probability < 0.4 ? 1 : probability < 0.6 ? 2 : probability < 0.85 ? 3 : 4;
}
