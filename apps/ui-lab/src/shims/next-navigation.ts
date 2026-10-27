import { lab, reportNavigation } from "./lab-runtime";

const router = {
  push: (href: string) => reportNavigation("router.push", href),
  replace: (href: string) => reportNavigation("router.replace", href),
  prefetch: () => {},
  refresh: () => reportNavigation("router.refresh"),
  back: () => reportNavigation("router.back"),
  forward: () => reportNavigation("router.forward"),
};

export function useRouter() {
  return router;
}

export function usePathname() {
  return lab.route.pathname;
}

export function useParams<T extends Record<string, string>>() {
  return (lab.route.params ?? {}) as T;
}

export function useSearchParams() {
  return new URLSearchParams(lab.route.search ?? {});
}

export function useSelectedLayoutSegment() {
  return null;
}

export function redirect(href: string): never {
  reportNavigation("redirect", href);
  throw new Error(`[lab] redirect(${href})`);
}

export function notFound(): never {
  throw new Error("[lab] notFound()");
}
