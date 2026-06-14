import { PrismaClient } from "@prisma/client";

/**
 * Prisma client singleton.
 *
 * In dev, Next.js hot-reload would otherwise create a new client on every reload
 * and exhaust the connection pool. We cache it on globalThis.
 *
 * Tenancy note: user-owned reads/writes must run inside a transaction that has set
 * `app.user_id` (RLS, docs/DATABASE.md §13). Use `withTenant()` in tenant.ts rather
 * than this raw client for user-scoped queries.
 */
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === "development"
        ? ["warn", "error"]
        : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
