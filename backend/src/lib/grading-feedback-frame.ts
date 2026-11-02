/** Shared wire framing; payload validation belongs to the grading mutation, never a learner DTO. */
const markers = {
  record: "<!--grading_record_v2:",
  base64: "<!--grading_meta_b64:",
  legacy: "<!--grading_history:",
} as const;
type Format = keyof typeof markers;

export function splitGradingFeedback(raw: string) {
  // Match the frozen writer/parser: final v2 suffix wins; otherwise final legacy suffix wins.
  let format: Format = "record";
  let index = raw.lastIndexOf("\n\n" + markers.record);
  let canonical = index >= 0;
  if (index < 0) {
    const base64 = raw.lastIndexOf("\n\n" + markers.base64);
    const legacy = raw.lastIndexOf("\n\n" + markers.legacy);
    format = base64 > legacy ? "base64" : "legacy";
    index = Math.max(base64, legacy);
    canonical = index >= 0;
  }
  if (index < 0) {
    // Ambiguous unframed historical data: omit a reserved metadata tail, even if malformed.
    // A grading mutation must reject this rather than silently rebuilding audit history.
    for (const kind of Object.keys(markers) as Format[]) {
      const found = raw.indexOf(markers[kind]);
      if (found >= 0 && (index < 0 || found < index)) {
        index = found;
        format = kind;
      }
    }
  }
  if (index < 0) return null;
  const markerIndex = index + (canonical ? 2 : 0);
  const tail = raw.slice(markerIndex + markers[format].length).trimEnd();
  const closed = tail.endsWith("-->");
  return {
    format,
    canonical,
    closed,
    feedback: raw.slice(0, index).trim(),
    payload: closed ? tail.slice(0, -3) : tail,
  };
}

/** The caller supplies already encoded JSON. This does not encrypt or validate audit metadata. */
export function frameGradingFeedback(feedback: string, encodedMetadata: string): string {
  return `${feedback.trim()}\n\n${markers.record}${encodedMetadata}-->`;
}

/** Display-only projection: never decode metadata into learner-visible feedback or return it on error. */
export function learnerVisibleFeedback(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  return splitGradingFeedback(raw)?.feedback ?? raw;
}
