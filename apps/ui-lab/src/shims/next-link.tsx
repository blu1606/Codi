import type { AnchorHTMLAttributes, ReactNode } from "react";
import { reportNavigation } from "./lab-runtime";

type Props = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & {
  href: string | { pathname?: string; query?: Record<string, string> };
  prefetch?: boolean;
  replace?: boolean;
  scroll?: boolean;
  children?: ReactNode;
};

export default function Link({ href, prefetch: _p, replace: _r, scroll: _s, onClick, ...rest }: Props) {
  const target = typeof href === "string" ? href : `${href.pathname ?? ""}?${new URLSearchParams(href.query)}`;
  return (
    <a
      {...rest}
      href={target}
      onClick={(event) => {
        onClick?.(event);
        if (event.defaultPrevented) return;
        event.preventDefault();
        reportNavigation("link", target);
      }}
    />
  );
}
