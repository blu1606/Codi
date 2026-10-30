import type { ReactNode } from "react";

type LoadingRegionProps = {
  children: ReactNode;
  label?: string;
  className?: string;
};

// Wraps a client-side loading placeholder so screen readers announce the busy state.
export function LoadingRegion({ children, label = "Đang tải…", className }: LoadingRegionProps) {
  return (
    <div role="status" aria-busy="true" aria-live="polite" className={className}>
      <span className="sr-only">{label}</span>
      {children}
    </div>
  );
}
