export interface AuthOriginConfig {
  BETTER_AUTH_URL: string;
  VERCEL_ENV?: string;
  VERCEL_URL?: string;
}

export function getAuthOriginConfig(env: AuthOriginConfig) {
  const trustedOrigins = [env.BETTER_AUTH_URL];
  let baseURL = env.BETTER_AUTH_URL;

  // Prebuilt artifacts precede the deployment URL; use the server's runtime
  // deployment identity, never an incoming Host or Origin header.
  if (env.VERCEL_ENV === "preview" && env.VERCEL_URL) {
    if (!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.vercel\.app$/i.test(env.VERCEL_URL)) {
      throw new Error("Invalid Vercel preview hostname");
    }
    baseURL = `https://${env.VERCEL_URL.toLowerCase()}`;
    if (!trustedOrigins.includes(baseURL)) trustedOrigins.push(baseURL);
  }

  return { baseURL, trustedOrigins };
}
