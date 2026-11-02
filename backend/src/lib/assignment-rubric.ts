// Assignment rubric parsing shared by the lecturer authoring routes and the rubric normalisation script.
export type RubricItem = { id: string; name: string; desc: string; points: number };

/** Rubric stored as JSON (builder format) or as seed markdown lines "- Name (N điểm): description". */
export function parseRubric(raw: string | null): RubricItem[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed
        .filter((x): x is Record<string, unknown> => !!x && typeof x === "object")
        .map((x, i) => ({
          id: typeof x.id === "string" && x.id ? x.id : `r${i + 1}`,
          name: String(x.name ?? x.title ?? x.label ?? ""),
          desc: String(x.desc ?? x.description ?? ""),
          points: Number(x.points ?? x.maxScore ?? 0) || 0,
        }));
    }
  } catch {
    // markdown rubric below
  }
  const items: RubricItem[] = [];
  for (const line of raw.split("\n")) {
    const m = /^\s*[-*]\s*(.+?)\s*\((\d+(?:[.,]\d+)?)\s*điểm\)\s*:?\s*(.*)$/i.exec(line);
    if (m) items.push({ id: `r${items.length + 1}`, name: m[1]!.trim(), points: Number(m[2]!.replace(",", ".")), desc: m[3]!.trim() });
  }
  return items;
}
