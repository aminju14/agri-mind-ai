import { createId as cuid2 } from "@paralleldrive/cuid2";

/**
 * App-side id generator for the rare rows we insert via raw SQL (e.g. the query
 * embedding cache, whose vector column bypasses the Prisma model). Prisma models
 * default to `cuid()`; this produces a compatible collision-resistant string id.
 */
export function createId(): string {
  return cuid2();
}
