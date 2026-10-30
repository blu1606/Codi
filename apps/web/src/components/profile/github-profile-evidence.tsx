"use client";

import { useState } from "react";
import { Info } from "lucide-react";
import { Button } from "@codi-1/ui/components/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@codi-1/ui/components/dialog";
import type { GithubProfileCitation } from "@/lib/github-profile-analysis-contract";

export function dateLabel(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.valueOf())
    ? value
    : new Intl.DateTimeFormat("vi-VN", {
        dateStyle: "short",
        timeStyle: "short",
        timeZone: "Asia/Ho_Chi_Minh",
      }).format(date);
}

// Only retained GitHub citation metadata becomes a link; prose/quotes never do.
export function citationHref(source: GithubProfileCitation): string | undefined {
  try {
    const url = new URL(source.sourceUrl);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.port ||
      url.search ||
      url.hash
    )
      return;
    if (
      source.kind === "file" &&
      url.hostname === "github.com" &&
      /^\/[A-Za-z0-9-]+\/[A-Za-z0-9_.-]+\/blob\/[a-f0-9]{40}\/[^/]+$/.test(
        url.pathname,
      )
    )
      return url.href;
    if (
      source.kind === "languages" &&
      url.hostname === "api.github.com" &&
      /^\/repos\/[A-Za-z0-9-]+\/[A-Za-z0-9_.-]+\/languages$/.test(url.pathname)
    )
      return url.href;
  } catch {
    /* Invalid metadata remains non-clickable text. */
  }
}

export function mergeCitations(
  ...groups: GithubProfileCitation[][]
): GithubProfileCitation[] {
  const merged = new Map<string, GithubProfileCitation>();
  for (const source of groups.flat()) {
    const current = merged.get(source.evidenceId);
    if (!current || (!current.quote && source.quote))
      merged.set(source.evidenceId, source);
  }
  return [...merged.values()];
}

export function Citations({ sources }: { sources: GithubProfileCitation[] }) {
  return (
    <ul className="space-y-2 text-xs text-muted-foreground">
      {mergeCitations(sources).map((source, index) => {
        const href = citationHref(source);
        const label = `Repo #${source.repositoryId} · ${source.path ?? "Ngôn ngữ (quan sát API)"}`;
        return (
          <li
            key={`${source.evidenceId}:${index}`}
            className="min-w-0 space-y-1 break-words [overflow-wrap:anywhere]"
          >
            {href ? (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary underline underline-offset-4"
              >
                {label}
              </a>
            ) : (
              <span>{label} · Liên kết không hợp lệ</span>
            )}
            <p>
              Thu thập lúc {dateLabel(source.collectedAt)}
              {source.commitSha
                ? ` · Commit ${source.commitSha}`
                : " · Không phải dữ liệu ghim theo commit"}
            </p>
            {source.quote && (
              <blockquote className="whitespace-pre-wrap border-l-2 border-border pl-3">
                {source.quote}
              </blockquote>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export function EvidenceButton({
  label,
  sources,
}: {
  label: string;
  sources: GithubProfileCitation[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="size-11 shrink-0"
        aria-label={`Xem bằng chứng: ${label}`}
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
      >
        <Info aria-hidden="true" />
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[80dvh] min-w-0 overflow-y-auto [overflow-wrap:anywhere]">
          <DialogHeader>
            <DialogTitle>Bằng chứng: {label}</DialogTitle>
            <DialogDescription>
              Nguồn được giữ lại từ lần thu thập này. Suy luận chưa được kiểm
              chứng về ý nghĩa.
            </DialogDescription>
          </DialogHeader>
          {sources.length ? (
            <Citations sources={sources} />
          ) : (
            <p>Chưa đủ bằng chứng.</p>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
