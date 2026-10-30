"use client";

import { useCallback, useEffect, useState } from "react";
import { X } from "lucide-react";
import { toast } from "sonner";
import type { GoalDraft } from "@codi-1/db/schema/onboarding-values";
import { INTAKE_QUESTIONS, INTAKE_FIELDS, intakeLabels, type IntakeField } from "@/lib/learner-intake-contract";

/** The signed-in learner's S17 intake answers, loaded once per mounted thread and saved one answer at a time. */
export function useLearnerIntake(enabled: boolean) {
  const [draft, setDraft] = useState<GoalDraft | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let live = true;
    fetch("/api/ai/intake", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((body: { draft: GoalDraft } | null) => {
        if (live && body) setDraft(body.draft);
      })
      .catch(() => {
        /* the questions simply wait; the Tutor still answers */
      });
    return () => {
      live = false;
    };
  }, [enabled]);

  const save = useCallback(async (patch: Partial<Record<IntakeField, string | number | null>>) => {
    const response = await fetch("/api/ai/intake", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    }).catch(() => null);
    if (!response?.ok) {
      toast.error("Chưa lưu được, hãy thử lại.");
      return false;
    }
    setDraft((await response.json()).draft);
    return true;
  }, []);

  return { draft, save };
}

export type IntakeAsking = { fields: IntakeField[]; pending: string | null };

/** One question at a time, with option chips and a skip; progress shows how many are left. */
export function IntakeQuestion({
  asking,
  busy,
  onAnswer,
  onSkip,
}: {
  asking: IntakeAsking;
  busy: boolean;
  onAnswer: (value: string | number) => void;
  onSkip: () => void;
}) {
  const field = asking.fields[0];
  if (!field) return null;
  const question = INTAKE_QUESTIONS[field];
  const options = question.options as { value: string | number; label: string }[];
  return (
    <div role="group" aria-label={question.text} className="space-y-2 rounded-xl border bg-muted/40 p-3 text-sm">
      <p className="flex items-center justify-between gap-2">
        <span className="font-medium">{question.text}</span>
        <span className="shrink-0 text-xs text-muted-foreground">
          {INTAKE_FIELDS.length - asking.fields.length + 1}/{INTAKE_FIELDS.length}
        </span>
      </p>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => (
          <button
            key={option.label}
            type="button"
            disabled={busy}
            onClick={() => onAnswer(option.value)}
            className="min-h-9 rounded-full border bg-background px-3 text-sm transition-colors hover:bg-muted disabled:opacity-50"
          >
            {option.label}
          </button>
        ))}
        <button
          type="button"
          disabled={busy}
          onClick={onSkip}
          className="min-h-9 rounded-full px-3 text-sm text-muted-foreground hover:bg-muted disabled:opacity-50"
        >
          Bỏ qua
        </button>
      </div>
    </div>
  );
}

/** "Codi đang hiểu về bạn": the known answers, each removable, and an edit that asks all three again. */
export function IntakeSummary({
  draft,
  onClear,
  onEdit,
}: {
  draft: GoalDraft;
  onClear: (field: IntakeField) => void;
  onEdit: () => void;
}) {
  const items = intakeLabels(draft);
  if (!items.length) return null;
  return (
    <div role="group" aria-label="Codi đang hiểu về bạn" className="flex flex-wrap items-center gap-1.5 px-1 text-xs">
      <span className="font-medium text-muted-foreground">Codi đang hiểu về bạn</span>
      {items.map((item) => (
        <span key={item.field} className="inline-flex items-center gap-1 rounded-full border bg-muted px-2 py-0.5">
          {item.label}
          <button
            type="button"
            className="rounded-full p-0.5 hover:bg-background"
            aria-label={`Bỏ “${item.label}”`}
            onClick={() => onClear(item.field)}
          >
            <X className="size-3" />
          </button>
        </span>
      ))}
      <button type="button" className="text-primary underline underline-offset-4" onClick={onEdit}>
        Sửa
      </button>
    </div>
  );
}
