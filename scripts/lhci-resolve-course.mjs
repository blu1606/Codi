// Prints `LHCI_COURSE_SLUG=<slug>` for the first published course in the public catalogue,
// so the Lighthouse run can audit a real course detail page. Prints nothing when the
// catalogue is empty; lighthouserc.cjs then audits the static pages only.
//
// Usage: node scripts/lhci-resolve-course.mjs <base-url> >> "$GITHUB_ENV"

const base = process.argv[2]?.replace(/\/$/, "");
if (!base) {
  console.error("usage: node scripts/lhci-resolve-course.mjs <base-url>");
  process.exit(1);
}

const response = await fetch(`${base}/api/courses?limit=20`, { headers: { accept: "application/json" } });
if (!response.ok) {
  console.error(`catalogue request failed: HTTP ${response.status}`);
  process.exit(1);
}

const { courses = [] } = await response.json();
const course = courses.find((c) => c.status === "published" && typeof c.slug === "string");
if (course) {
  console.log(`LHCI_COURSE_SLUG=${course.slug}`);
} else {
  console.error("no published course found; auditing static pages only");
}
