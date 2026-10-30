// Lighthouse CI configuration. Warn-only: assertions report but never fail a run until the
// baseline is recorded (see docs/performance-testing.md).
//
// Environment:
//   LHCI_BASE_URL     origin to audit, e.g. a Vercel preview URL (default: local dev server)
//   LHCI_COURSE_SLUG  optional published course slug for the course detail page
//                     (CI resolves it with scripts/lhci-resolve-course.mjs)

const base = (process.env.LHCI_BASE_URL || "http://localhost:3000").replace(/\/$/, "");
const slug = process.env.LHCI_COURSE_SLUG;

const paths = ["/", "/courses", ...(slug ? [`/courses/${encodeURIComponent(slug)}`] : []), "/login"];

module.exports = {
  ci: {
    collect: {
      url: paths.map((p) => `${base}${p}`),
      numberOfRuns: 3,
      settings: {
        formFactor: "mobile",
        throttlingMethod: "simulate",
        screenEmulation: { mobile: true, width: 390, height: 844, deviceScaleFactor: 2, disabled: false },
        onlyCategories: ["performance"],
      },
    },
    assert: {
      assertions: {
        "categories:performance": ["warn", { minScore: 0.8, aggregationMethod: "median-run" }],
        "largest-contentful-paint": ["warn", { maxNumericValue: 2500, aggregationMethod: "median-run" }],
        "total-blocking-time": ["warn", { maxNumericValue: 300, aggregationMethod: "median-run" }],
        // Bytes: 300 KiB.
        "resource-summary:script:size": ["warn", { maxNumericValue: 300 * 1024, aggregationMethod: "median-run" }],
      },
    },
    upload: {
      target: "temporary-public-storage",
    },
  },
};
