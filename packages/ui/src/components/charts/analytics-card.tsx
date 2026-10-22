"use client";

import * as React from "react";
import { AlertTriangle, Download } from "lucide-react";
import { cn } from "@codi-1/ui/lib/utils";
import { Button } from "@codi-1/ui/components/button";
import { Card, CardHeader, CardTitle } from "@codi-1/ui/components/card";
import { formatNum, downloadCsv } from "./chart-utils";

export interface AnalyticsCardProps {
  id?: string;
  code?: string;
  title: string;
  question?: string;
  children: React.ReactNode;
  actions?: React.ReactNode;
  detailHref?: string;
  table?: {
    headers: string[];
    rows: (string | number)[][];
    caption?: string;
  };
  sample?: number;
  minSample?: number;
  state?: "ok" | "loading" | "empty";
  emptyText?: string;
  note?: string;
  wide?: boolean;
  className?: string;
}

export function AnalyticsCard({
  id,
  code,
  title,
  question,
  children,
  actions,
  detailHref,
  table,
  sample,
  minSample = 20,
  state = "ok",
  emptyText = "Chưa có dữ liệu trong kỳ này.",
  note,
  wide = false,
  className,
}: AnalyticsCardProps) {
  const [tableOpen, setTableOpen] = React.useState(false);
  const cardId = React.useId();
  const isSmallSample = sample != null && sample < minSample;

  const handleDownloadCsv = () => {
    if (!table) return;
    downloadCsv(`codi-${id || "analytics"}.csv`, table.headers, table.rows);
  };

  return (
    <Card
      data-card={id}
      aria-labelledby={cardId}
      aria-busy={state === "loading"}
      className={cn(
        "flex flex-col gap-3 min-w-0 p-5",
        wide && "col-span-full",
        className,
      )}
    >
      {/* Header */}
      <CardHeader className="p-0 flex flex-row items-start justify-between gap-3">
        <div className="grid gap-0.5 min-w-0">
          {code && (
            <span className="font-mono text-xs text-muted-foreground uppercase tracking-wider">
              {code}
            </span>
          )}
          <CardTitle id={cardId} className="text-base font-semibold leading-snug">
            {title}
          </CardTitle>
          {question && <p className="text-sm text-muted-foreground m-0">{question}</p>}
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {actions}
          {detailHref && (
            <Button variant="ghost" size="sm" onClick={() => { window.location.href = detailHref; }}>
              Xem chi tiết
              <span className="sr-only"> {title}</span>
            </Button>
          )}
        </div>
      </CardHeader>

      {/* Small sample caution */}
      {isSmallSample && state === "ok" && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-warning-soft text-foreground text-sm">
          <AlertTriangle className="size-4 text-warning shrink-0" aria-hidden="true" />
          <span>
            Mẫu nhỏ (n = {formatNum(sample)}) — đọc kết quả thận trọng.
          </span>
        </div>
      )}

      {/* Body content / skeleton / empty */}
      <div className="min-w-0 flex-1">
        {state === "loading" ? (
          <div className="h-40 rounded-md bg-muted animate-pulse" aria-hidden="true" />
        ) : state === "empty" ? (
          <div className="grid place-items-center min-h-[120px] p-4 border border-dashed border-border rounded-md text-muted-foreground text-sm text-center">
            {emptyText}
          </div>
        ) : (
          children
        )}
      </div>

      {/* Note */}
      {note && <p className="text-xs text-muted-foreground m-0">{note}</p>}

      {/* Collapsible data table view */}
      {table && state === "ok" && table.rows.length > 0 && (
        <div className="border-t border-border pt-2 mt-1">
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => setTableOpen((prev) => !prev)}
              aria-expanded={tableOpen}
              className="text-xs font-medium text-primary hover:underline cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded px-1 py-0.5"
            >
              {tableOpen ? "Ẩn bảng số liệu" : "Bảng số liệu"}
            </button>
            {tableOpen && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleDownloadCsv}
                className="h-7 text-xs text-muted-foreground hover:text-foreground"
              >
                <Download className="size-3 mr-1" aria-hidden="true" />
                Tải CSV
              </Button>
            )}
          </div>

          {tableOpen && (
            <div className="mt-2 max-h-80 overflow-auto rounded border border-border">
              <table className="w-full text-sm">
                {table.caption && <caption className="sr-only">{table.caption}</caption>}
                <thead className="bg-muted text-xs font-semibold">
                  <tr>
                    {table.headers.map((h, i) => (
                      <th
                        key={h + i}
                        scope="col"
                        className={cn(
                          "px-3 py-2 whitespace-nowrap",
                          i === 0 ? "text-left" : "text-right",
                        )}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {table.rows.map((r, ri) => (
                    <tr key={ri} className="hover:bg-muted/40 transition-colors">
                      {r.map((c, ci) => (
                        <td
                          key={ci}
                          className={cn(
                            "px-3 py-1.5 tabular-nums text-xs whitespace-nowrap",
                            ci === 0 ? "text-left font-medium" : "text-right",
                          )}
                        >
                          {String(c)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

export function AnalyticsGrid({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "grid grid-cols-1 md:grid-cols-2 gap-4",
        className,
      )}
    >
      {children}
    </div>
  );
}
