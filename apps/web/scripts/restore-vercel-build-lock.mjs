import { writeFileSync } from "node:fs";

// Vercel CLI's post-build tracer expects this path after Next's webpack build
// has removed its transient build lock. The empty marker is not used at runtime.
writeFileSync(new URL("../.next/lock", import.meta.url), "");
