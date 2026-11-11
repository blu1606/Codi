// Test-data scripts write and delete rows, so they only accept a local database.
// The VPS runs the production app and its database on one host, so only a local database is accepted.
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "host.docker.internal"]);

export function assertTestDatabase() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is not set");
  const host = new URL(databaseUrl).hostname.replace(/^\[|\]$/g, "");
  if (!LOCAL_HOSTS.has(host) || process.env.NODE_ENV === "production") {
    throw new Error(`Refusing to touch database host "${host}": test data belongs in a local test database only.`);
  }
  return databaseUrl;
}
