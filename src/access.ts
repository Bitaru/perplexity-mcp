export type AccessIdentity = { email?: unknown };
export type AccessContext = { access?: { getIdentity(): Promise<AccessIdentity | undefined> } };
export async function principalFromAccess(ctx: AccessContext): Promise<string | null> {
  try { const identity = await ctx.access?.getIdentity(); const email = identity?.email; return typeof email === "string" && email.includes("@") ? email.trim().toLowerCase() : null; } catch { return null; }
}
export async function requireOwner(ctx: AccessContext, ownerEmail: string): Promise<string> {
  const principal = await principalFromAccess(ctx); const expected = ownerEmail.trim().toLowerCase(); if (!principal || !expected || principal !== expected) throw new Error("ACCESS_DENIED"); return principal;
}
