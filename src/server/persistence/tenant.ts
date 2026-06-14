import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "./prisma";

/**
 * Transaction client passed to repository methods. It is the interactive-tx client,
 * not the root PrismaClient — every user-scoped query MUST go through here so that
 * `app.user_id` is set and RLS (docs/DATABASE.md §13) is enforced.
 */
export type Tx = Prisma.TransactionClient;

/**
 * Run `fn` inside a transaction with `app.user_id` set to `userId`, so Postgres RLS
 * tenant-isolation policies apply (docs/DATABASE.md §13.2). This is the ONLY sanctioned
 * way to read/write user-owned tables.
 *
 * `set_config(key, value, is_local=true)` scopes the setting to the current tx.
 */
export async function withTenant<T>(
  userId: string,
  fn: (tx: Tx) => Promise<T>,
): Promise<T> {
  if (!userId) {
    // Fail closed: never run a user-scoped query without a tenant.
    throw new Error("withTenant: userId is required (tenancy isolation, DATABASE §13)");
  }
  return prisma.$transaction(async (tx) => {
    // Parameterized to avoid injection; set_config is tx-local.
    await tx.$executeRaw`SELECT set_config('app.user_id', ${userId}, true)`;
    return fn(tx);
  });
}

/**
 * For global (non-user-owned) data — the KB tables documents/chunks/embeddings, which
 * have no RLS. Exposed explicitly so call sites are honest about not being tenant-scoped.
 */
export function globalDb(): PrismaClient {
  return prisma;
}
