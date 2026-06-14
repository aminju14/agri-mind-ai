/**
 * Session resolution (Phase 2 dev stub).
 *
 * The full Auth.js v5 sign-in is the Phase 1 auth slice (ARCHITECTURE §2). For now we
 * resolve a FIXED dev user so the tenant-scoped persistence path (withTenant + RLS) and
 * lossless history work end-to-end. This is intentionally the only place that fakes a
 * session, and it is clearly marked so the real Auth.js handler drops in here later.
 */

/** Stable dev user id/email. Seeded by ensureDevUser(). */
export const DEV_USER_ID = "dev_user_tani";

export interface Session {
  userId: string;
}

/**
 * Resolve the current session. TODO(Phase 1 auth): replace with Auth.js getServerSession.
 * Returns null when unauthenticated (the route returns 401).
 *
 * Dev stub: always the fixed user. Database seeding is attempted but non-fatal so the
 * app can run without PostgreSQL (e.g. for testing AI connectivity).
 */
export async function getSession(): Promise<Session | null> {
  await ensureDevUser();
  return { userId: DEV_USER_ID };
}

let ensured = false;
/** Idempotently create the dev user (mirrors the seed "Aminju" — DATABASE §9.2). */
export async function ensureDevUser(): Promise<void> {
  if (ensured) return;
  try {
    const { prisma } = await import("@/server/persistence/prisma");
    await prisma.user.upsert({
      where: { id: DEV_USER_ID },
      create: { id: DEV_USER_ID, email: "aminju@agrimind.dev", name: "Aminju", plan: "pro", locale: "en" },
      update: {},
    });
  } catch (e) {
    console.warn("[session] DB unavailable, skipping user seed:", e instanceof Error ? e.message : e);
  }
  ensured = true;
}

