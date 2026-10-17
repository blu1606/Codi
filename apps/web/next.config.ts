import { varlockNextConfigPlugin } from "@varlock/nextjs-integration/plugin";

const withVarlock = varlockNextConfigPlugin();
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typedRoutes: true,
  outputFileTracingExcludes: { "/*": ["./dev-fixtures/**/*"] },
  reactCompiler: true,
  transpilePackages: ["shiki"],
  serverExternalPackages: ["@codi-1/coding-runner"],
};

export default withVarlock(nextConfig);
