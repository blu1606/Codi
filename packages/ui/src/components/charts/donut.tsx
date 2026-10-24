"use client";

import { formatNum, formatPct } from "./chart-utils";

export interface DonutProps {
  correct?: number;
  wrong?: number;
  unknown?: number;
  value?: number;
  total?: number;
  label?: string;
  className?: string;
}

export function Donut({
  correct: explicitCorrect,
  wrong: explicitWrong,
  unknown = 0,
  value,
  total: explicitTotal,
  label = "Kết quả quiz",
  className,
}: DonutProps) {
  let correct = explicitCorrect;
  let wrong = explicitWrong;

  if (correct == null) {
    correct = value || 0;
    wrong = Math.max(0, (explicitTotal || 0) - correct);
  } else if (wrong == null) {
    wrong = Math.max(0, (explicitTotal || 0) - correct);
  }

  const total = correct + wrong + unknown;

  if (!total) {
    return (
      <div className="grid place-items-center min-h-[120px] p-4 border border-dashed border-border rounded-md text-muted-foreground text-sm text-center">
        Chưa có câu trả lời.
      </div>
    );
  }

  const r = 42;
  const c2 = 2 * Math.PI * r;
  const gap = total > 1 ? 1.2 : 0;

  const parts = [
    { label: "Đúng", val: correct, color: "var(--viz-1)" },
    { label: "Sai", val: wrong, color: "var(--viz-2)" },
    { label: "Chưa biết", val: unknown, color: "var(--viz-neutral)" },
  ].filter((p) => p.val > 0);

  let offset = 0;
  const arcs = parts.map((p) => {
    const len = (p.val / total) * c2;
    const dash = Math.max(0, len - gap);
    const space = c2 - dash;
    const strokeDashoffset = -offset;
    offset += len;

    return {
      stroke: p.color,
      strokeDasharray: `${dash.toFixed(2)} ${space.toFixed(2)}`,
      strokeDashoffset: strokeDashoffset.toFixed(2),
    };
  });

  return (
    <div
      className={
        "flex flex-wrap items-center gap-6 select-none" +
        (className ? ` ${className}` : "")
      }
    >
      <div className="relative w-32 h-32 shrink-0">
        <svg
          viewBox="0 0 100 100"
          className="w-full h-full"
          role="img"
          aria-label={`${label}: ${correct} đúng, ${wrong} sai, ${unknown} chưa biết`}
        >
          <g transform="rotate(-90 50 50)">
            {arcs.map((a, i) => (
              <circle
                key={i}
                cx="50"
                cy="50"
                r={r}
                fill="none"
                stroke={a.stroke}
                strokeWidth="12"
                strokeDasharray={a.strokeDasharray}
                strokeDashoffset={a.strokeDashoffset}
                strokeLinecap="round"
              />
            ))}
          </g>
          <text
            x="50"
            y="49"
            textAnchor="middle"
            className="text-lg font-bold fill-foreground"
            dominantBaseline="middle"
          >
            {formatPct((correct / total) * 100)}
          </text>
          <text
            x="50"
            y="63"
            textAnchor="middle"
            className="text-[10px] fill-muted-foreground"
          >
            đúng
          </text>
        </svg>
      </div>

      <ul className="list-none m-0 p-0 grid gap-2 text-sm flex-1 min-w-[180px]">
        {parts.map((p) => (
          <li
            key={p.label}
            className="grid grid-cols-[auto_minmax(0,1fr)_auto_auto] items-center gap-2"
          >
            <span
              className="w-3 h-3 rounded-xs shrink-0"
              style={{ backgroundColor: p.color }}
              aria-hidden="true"
            />
            <span className="font-medium">{p.label}</span>
            <strong className="tabular-nums font-semibold">{formatNum(p.val)}</strong>
            <span className="text-xs text-muted-foreground tabular-nums">
              {formatPct((p.val / total) * 100)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
