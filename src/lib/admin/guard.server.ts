import { UnauthorizedError } from "@/lib/auth/verify.server";
import { dbSource, getSql } from "@/lib/db";
import { adminConfigured, isAdminEmail } from "./allowlist";

export class ForbiddenError extends Error {
  readonly status = 403;
  constructor(message = "Forbidden") {
    super(message);
    this.name = "ForbiddenError";
  }
}

/**
 * Admin = signed-in account whose email is on ADMIN_EMAILS. Fails closed on a
 * real database. On the local PGLite preview with no ADMIN_EMAILS set, any
 * signed-in account may open the desk so the pricing and wallet tools can be tried.
 */
export async function requireAdmin(userId: string): Promise<{ id: string; email: string }> {
  if (!userId) throw new UnauthorizedError();
  const sql = await getSql();
  const rows = await sql<{ email: string | null }>`
    select email from "user" where id = ${userId} limit 1
  `;
  const email = (rows[0]?.email ?? "").trim().toLowerCase();
  if (!adminConfigured()) {
    if (dbSource === "pglite") return { id: userId, email: email || "preview" };
    throw new ForbiddenError("Admin is not configured.");
  }
  if (!isAdminEmail(email)) throw new ForbiddenError("Not an admin.");
  return { id: userId, email };
}
