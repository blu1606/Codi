"use client";

import type { ComponentProps } from "react";
import { defaultRehypePlugins, Streamdown } from "streamdown";
import { cn } from "@codi-1/ui/lib/utils";

function ExternalLink({ node: _node, className, ...props }: ComponentProps<"a"> & { node?: unknown }) {
  return (
    <a
      {...props}
      className={cn(
        "wrap-anywhere font-medium text-primary underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        className,
      )}
      target="_blank"
      rel="noopener noreferrer"
    />
  );
}

const components = { a: ExternalLink };
const noLinkModal = { enabled: false };
// Default pipeline minus rehype-raw: raw HTML nodes are never parsed into elements.
const rehypePlugins = [defaultRehypePlugins.sanitize, defaultRehypePlugins.harden].filter(
  (plugin) => plugin !== undefined,
);

/**
 * Lesson body authored by lecturers. Rendered as static markdown: raw HTML is
 * dropped (not sanitised-and-kept), links open in a new tab, and single line
 * breaks of plain-text bodies are preserved.
 */
export default function LessonMarkdown({ children }: { children: string }) {
  return (
    <Streamdown
      mode="static"
      skipHtml
      rehypePlugins={rehypePlugins}
      parseIncompleteMarkdown={false}
      linkSafety={noLinkModal}
      components={components}
      className="break-words leading-8 [&_li]:whitespace-pre-line [&_p]:whitespace-pre-line"
    >
      {children}
    </Streamdown>
  );
}
