import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    environment: "node",
    include: [
      "apps/web/src/**/*.test.ts",
      "packages/auth/src/**/*.test.ts",
    ],
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov", "json-summary"],
      reportsDirectory: "./coverage",
      reportOnFailure: true,
      include: [
        "packages/auth/src/rbac.ts",
        "apps/web/src/app/dashboard/admin/actions.ts",
        "apps/web/src/app/api/user/profile/route.ts",
        "apps/web/src/lib/filter-course-catalog.ts",
        "apps/web/src/lib/add-course-to-cart.ts",
        "apps/web/src/app/api/student/cart/route.ts",
      ],
      thresholds: {
        statements: 80,
        lines: 80,
        functions: 80,
        branches: 80,
      },
    },
    alias: {
      "@/": path.resolve(__dirname, "apps/web/src") + "/",
    },
  },
});
