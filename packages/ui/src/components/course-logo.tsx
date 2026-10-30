import { Code2 } from "lucide-react";
import { COURSE_LOGO_ART, COURSE_SLUG_LOGO } from "@codi-1/ui/lib/course-logo-art";
import { cn } from "@codi-1/ui/lib/utils";

// Technology named in a course title, for courses whose slug has no seeded logo.
const TITLE_LOGO: [RegExp, string][] = [
  [/next\.?js/i, "Next.js"],
  [/typescript/i, "TypeScript"],
  [/node(\.?js)?/i, "Node.js"],
  [/react/i, "React"],
  [/javascript|\bjs\b/i, "JavaScript"],
  [/python/i, "Python"],
  [/\bgit(hub)?\b/i, "Git"],
  [/\bjest\b|kiểm thử/i, "Jest"],
];

/**
 * Course art: the technology's brand mark on its brand colour (mockup thumb).
 * Keyed by course slug, then by the technology named in the title. Anything else
 * gets a neutral code mark on the primary token.
 */
export function CourseLogo({ slug, title, size = "md", className }: {
  slug: string;
  title?: string;
  size?: "sm" | "md";
  className?: string;
}) {
  const logoName = COURSE_SLUG_LOGO[slug] ?? (title ? TITLE_LOGO.find(([re]) => re.test(title))?.[1] : undefined);
  const art = logoName ? COURSE_LOGO_ART[logoName] : undefined;
  const frame = cn(
    "grid place-items-center overflow-hidden",
    size === "md" ? "aspect-video w-full rounded-md" : "size-16 shrink-0 rounded-sm",
    className
  );
  if (!art) {
    return (
      <span aria-hidden="true" className={cn(frame, "bg-primary text-primary-foreground")}>
        <Code2 className={size === "md" ? "size-1/4" : "size-6"} />
      </span>
    );
  }
  return (
    <span aria-hidden="true" className={frame} style={{ background: art.bg, color: art.fg }}>
      <svg viewBox="0 0 24 24" fill="currentColor" focusable="false" className={cn("aspect-square w-auto", size === "md" ? "h-[38%]" : "h-1/2")}>
        <path d={art.d} />
      </svg>
    </span>
  );
}
