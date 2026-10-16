/**
 * Connection string for the app database.
 * DATABASE_URL_MY wins when set — the platform reserves DATABASE_URL and
 * injects its own Neon project, which this app cannot rename.
 * Empty or whitespace counts as unset.
 */
export function resolveDatabaseUrl(env = process.env) {
  const mine = typeof env.DATABASE_URL_MY === "string" ? env.DATABASE_URL_MY.trim() : "";
  if (mine) return mine;
  const platform = typeof env.DATABASE_URL === "string" ? env.DATABASE_URL.trim() : "";
  return platform || undefined;
}

export function databaseUrlSource(env = process.env) {
  const mine = typeof env.DATABASE_URL_MY === "string" ? env.DATABASE_URL_MY.trim() : "";
  if (mine) return "DATABASE_URL_MY";
  const platform = typeof env.DATABASE_URL === "string" ? env.DATABASE_URL.trim() : "";
  if (platform) return "DATABASE_URL";
  return undefined;
}
