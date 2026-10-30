import { varlockNextConfigPlugin } from "@varlock/nextjs-integration/plugin";

const withVarlock = varlockNextConfigPlugin();
import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  typedRoutes: true,
  outputFileTracingExcludes: { "/*": ["./dev-fixtures/**/*"] },
  outputFileTracingRoot: path.resolve(process.cwd(), "../.."),
  outputFileTracingIncludes: {
    "/api/learn/*/lessons/*/assessments/*/{coding,tutorial}": [
      "../../packages/coding-runner/*.mjs",
      "../../packages/coding-runner/package.json",
      "../../node_modules/.pnpm/quickjs-emscripten@*/node_modules/quickjs-emscripten/{package.json,dist/**/*.{js,cjs,mjs,wasm}}",
      "../../node_modules/.pnpm/quickjs-emscripten-core@*/node_modules/quickjs-emscripten-core/{package.json,dist/**/*.{js,cjs,mjs,wasm}}",
      "../../node_modules/.pnpm/@jitl+quickjs-*/node_modules/@jitl/quickjs-*/{package.json,dist/**/*.{js,cjs,mjs,wasm}}",
    ],
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "img.vietqr.io",
        pathname: "/**",
      },
    ],
  },
  reactCompiler: true,
  transpilePackages: ["shiki"],
  serverExternalPackages: [
    "@codi-1/coding-runner",
    "quickjs-emscripten",
    "quickjs-emscripten-core",
    "@jitl/quickjs-wasmfile-debug-asyncify",
    "@jitl/quickjs-wasmfile-debug-sync",
    "@jitl/quickjs-wasmfile-release-asyncify",
    "@jitl/quickjs-wasmfile-release-sync",
  ],
};

export default withVarlock(nextConfig);
