/**
 * Persistence layer barrel (docs/DATABASE.md). Import repositories from here.
 *
 *   import { conversations, messages, documents } from "@/server/persistence";
 *
 * Tenancy: every user-owned repository method takes `userId` and runs inside
 * `withTenant` so Postgres RLS applies (docs/DATABASE.md §13). KB repositories
 * (documents/embeddings) are global and explicitly not tenant-scoped.
 */
export { prisma } from "./prisma";
export { withTenant, globalDb, type Tx } from "./tenant";
export { createId } from "./id";

export * as conversations from "./conversations";
export * as messages from "./messages";
export * as documents from "./documents";
export * as usage from "./usage";
export * as panel from "./panel";

export type * from "./types";
