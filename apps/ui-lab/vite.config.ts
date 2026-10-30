import { readFileSync, existsSync, statSync, createReadStream } from "node:fs";
import { fileURLToPath } from "node:url";
import { extname, join, resolve } from "node:path";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const here = fileURLToPath(new URL(".", import.meta.url));
const web = resolve(here, "../web/src");
const ui = resolve(here, "../../packages/ui/src");
const mockup = resolve(here, "../../docs/mockup");
const shims = resolve(here, "src/shims");

/**
 * A "use server" module would drag the DB and auth into the browser bundle.
 * Replace it with stubs that keep the export names and route every call to
 * the lab, so a screen state decides whether the action succeeds or fails.
 */
function stubServerActions(): Plugin {
  return {
    name: "ui-lab:stub-server-actions",
    enforce: "pre",
    load(id) {
      const file = id.split("?")[0];
      if (!/\.(ts|tsx)$/.test(file) || !file.startsWith(web.replaceAll("\\", "/"))) return null;
      const code = readFileSync(file, "utf8");
      if (!/^\s*["']use server["']/.test(code)) return null;
      const names = new Set<string>();
      for (const m of code.matchAll(/export\s+(?:async\s+)?(?:function|const|let)\s+(\w+)/g)) names.add(m[1]);
      return [
        `import { callLabAction } from "${shims.replaceAll("\\", "/")}/server-action";`,
        ...[...names].map((n) => `export const ${n} = (...args) => callLabAction(${JSON.stringify(n)}, args);`),
      ].join("\n");
    },
  };
}

const MIME: Record<string, string> = {
  ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml",
  ".png": "image/png", ".jpg": "image/jpeg", ".json": "application/json", ".woff2": "font/woff2",
};

/** Serve docs/mockup at /mockup/ so the lab can show it side by side. */
function serveMockup(): Plugin {
  return {
    name: "ui-lab:serve-mockup",
    configureServer(server) {
      server.middlewares.use("/mockup", (req, res, next) => {
        const path = decodeURIComponent((req.url ?? "/").split("?")[0]);
        const file = join(mockup, path === "/" ? "index.html" : path);
        if (!file.startsWith(mockup) || !existsSync(file) || !statSync(file).isFile()) return next();
        res.setHeader("Content-Type", MIME[extname(file)] ?? "application/octet-stream");
        createReadStream(file).pipe(res);
      });
    },
  };
}

export default defineConfig({
  plugins: [stubServerActions(), serveMockup(), react(), tailwindcss()],
  resolve: {
    alias: [
      { find: /^next\/link$/, replacement: `${shims}/next-link.tsx` },
      { find: /^next\/image$/, replacement: `${shims}/next-image.tsx` },
      { find: /^next\/navigation$/, replacement: `${shims}/next-navigation.ts` },
      { find: /^@codi-1\/ui\/globals\.css$/, replacement: `${ui}/styles/globals.css` },
      { find: /^@codi-1\/ui\/(.*)$/, replacement: `${ui}/$1` },
      { find: /^@\/(.*)$/, replacement: `${web}/$1` },
    ],
    dedupe: ["react", "react-dom", "sonner", "next-themes"],
  },
  server: {
    port: 5180,
    strictPort: true,
    fs: { allow: [resolve(here, "../..")] },
  },
  build: {
    rollupOptions: { input: { lab: resolve(here, "index.html"), frame: resolve(here, "frame.html") } },
  },
});
