import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { parseEnv } from "node:util";

const DEFAULT_ENVIRONMENT = "preview";
const VALID_ENVIRONMENTS = new Set(["development", "preview", "production"]);
const VERCEL_COMMAND = ["pnpm", "exec", "vercel"] as const;
const DEFAULT_FILES = ["apps/web/.env"];
const SKIP_KEYS = new Set(["CORS_ORIGIN", "NODE_ENV"]);

// BETTER_AUTH_URL's schema fallback ($VERCEL_ORIGIN, from VERCEL_URL/VERCEL_ENV)
// only resolves during a build that Vercel's own infra runs — `vercel build` in
// GitHub Actions (this project's deploy.yml) is an external build, so those
// System Environment Variables come back empty there too. Set it explicitly per
// environment instead. Preview doesn't have one fixed URL per deploy; reusing
// the production domain keeps the build/app working, at the cost of Google
// OAuth's redirect_uri not matching on preview deploys (email/password auth is
// unaffected).
const PRODUCTION_URL = "https://codi.hoangblue.dev";
const OVERRIDE_KEYS_BY_ENVIRONMENT: Record<string, Map<string, string>> = {
  production: new Map([["BETTER_AUTH_URL", PRODUCTION_URL]]),
  preview: new Map([["BETTER_AUTH_URL", PRODUCTION_URL]]),
  development: new Map(),
};

const args = process.argv.slice(2);
const separatorIndex = args.indexOf("--");
const scriptArgs = separatorIndex === -1 ? args : args.slice(0, separatorIndex);
const forwardedArgs = separatorIndex === -1 ? [] : args.slice(separatorIndex + 1);

const environment =
  scriptArgs[0] && VALID_ENVIRONMENTS.has(scriptArgs[0]) ? scriptArgs[0] : DEFAULT_ENVIRONMENT;
const remainingArgs = scriptArgs.slice(VALID_ENVIRONMENTS.has(scriptArgs[0] ?? "") ? 1 : 0);
// Split remaining args into env-file paths and passthrough Vercel CLI flags.
// A bare token counts as a file only when it exists on disk, so flags and their
// values (e.g. `--scope my-team`) forward correctly regardless of argument order.
const files: string[] = [];
const passthroughArgs: string[] = [];
for (const arg of remainingArgs) {
  if (!arg.startsWith("-") && existsSync(arg)) {
    files.push(arg);
  } else {
    passthroughArgs.push(arg);
  }
}
const vercelArgs = [...passthroughArgs, ...forwardedArgs];
const envFiles = files.length > 0 ? files : DEFAULT_FILES;

const overrideKeys = OVERRIDE_KEYS_BY_ENVIRONMENT[environment] ?? new Map<string, string>();
const env = new Map<string, string>();

for (const file of envFiles) {
  if (!existsSync(file)) {
    console.warn(`Skipping missing env file: ${file}`);
    continue;
  }

  for (const [key, value] of Object.entries(parseEnv(readFileSync(file, "utf8")))) {
    if (SKIP_KEYS.has(key)) continue;
    env.set(key, overrideKeys.get(key) ?? value);
  }
}

if (env.size === 0) {
  console.log("No Vercel env vars found to sync.");
  process.exit(0);
}

const LOCAL_VALUE_PATTERN = /localhost|127\.0\.0\.1|0\.0\.0\.0|^file:/i;
const localKeys = [...env.entries()]
  .filter(([, value]) => LOCAL_VALUE_PATTERN.test(value))
  .map(([key]) => key);
if (localKeys.length > 0) {
  console.warn(
    `Warning: ${localKeys.join(", ")} look${localKeys.length === 1 ? "s" : ""} like local-only value(s). Update them in your .env file(s) and re-run this sync if your deployed app should not point at local endpoints.`,
  );
}

console.log(`Syncing ${env.size} env var(s) to Vercel ${environment}.`);
for (const [key, value] of env.entries()) {
  const result = spawnSync(
    VERCEL_COMMAND[0],
    [
      ...VERCEL_COMMAND.slice(1),
      "env",
      "add",
      key,
      environment,
      "--force",
      "--yes",
      "--non-interactive",
      // Vercel's CLI defaults env vars to type "Secret" (sensitive), which is
      // write-only outside Vercel's own build infra — `vercel pull`/`vercel
      // build` (what the GitHub Actions deploy job runs) gets a "[SENSITIVE]"
      // placeholder instead of the real value. Store as Config so a prebuilt,
      // externally-built deploy actually has real values to build/run with.
      "--no-sensitive",
      ...vercelArgs,
    ],
    {
      input: `${value}\n`,
      stdio: ["pipe", "inherit", "inherit"],
      encoding: "utf8",
      // Windows resolves bunx/npx/pnpm via .cmd shims, which need a shell
      shell: process.platform === "win32",
    },
  );

  if (result.error) {
    console.error(`Failed to sync ${key}: ${result.error.message}`);
    process.exit(1);
  }

  if (result.status !== 0) {
    console.error(`Failed to sync ${key}`);
    process.exit(result.status ?? 1);
  }
}

console.log("Vercel env sync complete. Redeploy for changes to take effect.");
