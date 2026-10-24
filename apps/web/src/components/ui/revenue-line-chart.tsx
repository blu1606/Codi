"use client";

import { useId, useState } from "react";
import { formatVnd } from "@/lib/lecturer-insights-service";
import type { ChartDataPoint } from "@/lib/lecturer-insights-service";

interface RevenueLineChartProps {
  series: ChartDataPoint[];
  currentTotal: number;
  averagePerDay: number;
}

export function RevenueLineChart({
  series,
  currentTotal,
  averagePerDay,
}: RevenueLineChartProps) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const [showTable, setShowTable] = useState(false);
  const chartId = useId();

  if (!series.length) {
    return (
      <div className="py-12 text-center text-sm text-muted-foreground">
        Chưa có dữ liệu doanh thu trong kỳ này.
      </div>
    );
  }

  // Kích thước canvas SVG
  const width = 640;
  const height = 240;
  const padding = { top: 20, right: 24, bottom: 36, left: 60 };

  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;

  // Tính giá trị lớn nhất cho trục Y
  const maxVal = Math.max(
    ...series.map((d) => Math.max(d.current, d.previous)),
    100000
  );

  // 4 bậc trục Y
  const yTicks = [
    0,
    Math.round(maxVal * 0.33),
    Math.round(maxVal * 0.66),
    maxVal,
  ];

  // Helper tính toạ độ X, Y
  const getX = (idx: number) => {
    if (series.length <= 1) return padding.left + chartW / 2;
    return padding.left + (idx / (series.length - 1)) * chartW;
  };

  const getY = (val: number) => {
    return padding.top + chartH - (val / maxVal) * chartH;
  };

  // Tạo đường dẫn path d cho SVG
  const makePath = (key: "current" | "previous") => {
    return series
      .map((d, i) => `${i === 0 ? "M" : "L"} ${getX(i).toFixed(1)} ${getY(d[key]).toFixed(1)}`)
      .join(" ");
  };

  // Tạo vùng gradient fill dưới đường kỳ này
  const makeAreaPath = () => {
    if (!series.length) return "";
    const firstX = getX(0).toFixed(1);
    const lastX = getX(series.length - 1).toFixed(1);
    const bottomY = (padding.top + chartH).toFixed(1);

    const linePart = series
      .map((d, i) => `${i === 0 ? "M" : "L"} ${getX(i).toFixed(1)} ${getY(d.current).toFixed(1)}`)
      .join(" ");

    return `${linePart} L ${lastX} ${bottomY} L ${firstX} ${bottomY} Z`;
  };

  const hoveredData = hoveredIdx !== null ? series[hoveredIdx] : null;

  return (
    <div className="space-y-4">
      {/* Header và Chú thích Legend */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <span className="inline-block h-0.5 w-4 rounded-full bg-primary" />
            <span className="font-medium text-foreground">Kỳ này</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="inline-block h-0.5 w-4 border-b border-dashed border-muted-foreground/70" />
            <span className="text-muted-foreground">Kỳ trước</span>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setShowTable(!showTable)}
          className="text-xs text-muted-foreground underline-offset-4 hover:underline"
        >
          {showTable ? "Ẩn bảng chi tiết" : "Xem bảng chi tiết"}
        </button>
      </div>

      {/* SVG Canvas Biểu Đồ */}
      <div className="relative w-full overflow-hidden rounded-md border border-border/40 bg-card p-2">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="h-auto w-full select-none overflow-visible"
          role="img"
          aria-label="Biểu đồ doanh thu theo thời gian"
        >
          <defs>
            <linearGradient id={`${chartId}-area-grad`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="currentColor" stopOpacity="0.15" className="text-primary" />
              <stop offset="100%" stopColor="currentColor" stopOpacity="0.0" className="text-primary" />
            </linearGradient>
          </defs>

          {/* Đường lưới ngang Hairline & Nhãn trục Y */}
          {yTicks.map((tickVal, i) => {
            const y = getY(tickVal);
            return (
              <g key={i}>
                <line
                  x1={padding.left}
                  y1={y}
                  x2={padding.left + chartW}
                  y2={y}
                  stroke="currentColor"
                  className="text-border/60"
                  strokeWidth="1"
                  strokeDasharray={i === 0 ? "none" : "3 3"}
                />
                <text
                  x={padding.left - 8}
                  y={y + 3}
                  textAnchor="end"
                  className="fill-muted-foreground text-[10px]"
                >
                  {tickVal >= 1000000
                    ? `${(tickVal / 1000000).toFixed(1)} tr`
                    : tickVal >= 1000
                    ? `${Math.round(tickVal / 1000)}k`
                    : tickVal}
                </text>
              </g>
            );
          })}

          {/* Vùng gradient phủ dưới đường kỳ này */}
          <path
            d={makeAreaPath()}
            fill={`url(#${chartId}-area-grad)`}
          />

          {/* Đường kỳ trước: nét đứt */}
          <path
            d={makePath("previous")}
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeDasharray="4 4"
            className="text-muted-foreground/60"
          />

          {/* Đường kỳ này: nét liền đậm */}
          <path
            d={makePath("current")}
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            className="text-primary"
          />

          {/* Nhãn trục X và các điểm tương tác */}
          {series.map((d, idx) => {
            const x = getX(idx);
            // Chỉ hiển thị nhãn trục X cách quãng để không bị đè chữ
            const step = Math.ceil(series.length / 7);
            const isLabelVisible = idx % step === 0 || idx === series.length - 1;

            return (
              <g key={idx}>
                {isLabelVisible && (
                  <text
                    x={x}
                    y={padding.top + chartH + 18}
                    textAnchor="middle"
                    className="fill-muted-foreground text-[10px]"
                  >
                    {d.label}
                  </text>
                )}

                {/* Vùng cảm ứng hover dọc theo cột */}
                <rect
                  x={x - chartW / (series.length * 2)}
                  y={padding.top}
                  width={chartW / series.length}
                  height={chartH}
                  fill="transparent"
                  className="cursor-pointer"
                  onMouseEnter={() => setHoveredIdx(idx)}
                  onMouseLeave={() => setHoveredIdx(null)}
                />

                {/* Điểm tròn nổi bật khi hover */}
                {hoveredIdx === idx && (
                  <g>
                    <line
                      x1={x}
                      y1={padding.top}
                      x2={x}
                      y2={padding.top + chartH}
                      stroke="currentColor"
                      strokeWidth="1"
                      strokeDasharray="2 2"
                      className="text-primary/70"
                    />
                    <circle
                      cx={x}
                      cy={getY(d.current)}
                      r="4.5"
                      fill="currentColor"
                      className="text-primary"
                    />
                    <circle
                      cx={x}
                      cy={getY(d.previous)}
                      r="3.5"
                      fill="currentColor"
                      className="text-muted-foreground"
                    />
                  </g>
                )}
              </g>
            );
          })}
        </svg>

        {/* Tooltip hiển thị giá trị hover */}
        {hoveredData && hoveredIdx !== null && (
          <div
            className="pointer-events-none absolute top-4 z-10 -translate-x-1/2 rounded-md border border-border bg-popover px-3 py-2 text-xs shadow-md"
            style={{
              left: `${(getX(hoveredIdx) / width) * 100}%`,
            }}
          >
            <div className="font-semibold text-popover-foreground mb-1">
              Ngày {hoveredData.label}
            </div>
            <div className="flex items-center justify-between gap-4 text-primary">
              <span>Kỳ này:</span>
              <span className="font-medium">{formatVnd(hoveredData.current)}</span>
            </div>
            <div className="flex items-center justify-between gap-4 text-muted-foreground">
              <span>Kỳ trước:</span>
              <span>{formatVnd(hoveredData.previous)}</span>
            </div>
          </div>
        )}
      </div>

      {/* Thông tin tóm tắt TB/ngày và Tổng kỳ này */}
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground pt-1">
        <div>
          <span>Trung bình: </span>
          <strong className="text-foreground">{formatVnd(averagePerDay)}</strong>
          <span> / ngày</span>
        </div>
        <div>
          <span>Tổng kỳ này: </span>
          <strong className="text-foreground">{formatVnd(currentTotal)}</strong>
        </div>
      </div>

      {/* Bảng dữ liệu chi tiết khi người dùng bật xem */}
      {showTable && (
        <div className="mt-3 overflow-x-auto rounded border border-border">
          <table className="w-full text-left text-xs">
            <thead className="bg-muted/50 text-muted-foreground">
              <tr>
                <th className="p-2 font-medium">Thời gian</th>
                <th className="p-2 text-right font-medium">Doanh thu kỳ này</th>
                <th className="p-2 text-right font-medium">Doanh thu kỳ trước</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {series.map((row, i) => (
                <tr key={i} className="hover:bg-muted/30">
                  <td className="p-2 text-muted-foreground">{row.label}</td>
                  <td className="p-2 text-right font-medium text-foreground">
                    {formatVnd(row.current)}
                  </td>
                  <td className="p-2 text-right text-muted-foreground">
                    {formatVnd(row.previous)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
