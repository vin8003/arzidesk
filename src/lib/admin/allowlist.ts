/** Comma/space-separated emails that may open /admin. Fail closed when empty. */
export function adminEmails(): string[] {
  const raw = [
    process.env.ADMIN_EMAILS ?? "",
    process.env.ADMIN_EMAIL ?? "",
  ].join(",");
  return raw
    .split(/[\s,]+/)
    .map((v) => v.trim().toLowerCase())
    .filter((v) => v.includes("@"));
}

export function isAdminEmail(email: string | null | undefined): boolean {
  const needle = (email ?? "").trim().toLowerCase();
  if (!needle) return false;
  return adminEmails().includes(needle);
}

export function adminConfigured(): boolean {
  return adminEmails().length > 0;
}
