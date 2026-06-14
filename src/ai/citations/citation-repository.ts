/**
 * TASK 7 — Citation repository.
 *
 * Citations are persisted ATOMICALLY as children of their assistant message (via
 * persistence/messages.insertAiMessage), so the Message → Citations relationship is
 * always consistent and lossless. This repository owns citation-specific READS for
 * auditing (TASK 7 §Citation Persistence "allows future auditing") and is tenant-scoped
 * via withTenant + RLS like the rest of the data layer.
 */

import { withTenant } from "@/server/persistence/tenant";

export interface StoredCitation {
  id: string;
  ordinal: number;
  title: string;
  category: string;
  source: string;
  url: string | null;
  documentId: string | null;
  chunkId: string | null;
  similarityScore: number | null;
}

/** Load the citations stored for an assistant message, in render order (auditing). */
export async function getCitationsForMessage(
  userId: string,
  messageId: string,
): Promise<StoredCitation[]> {
  return withTenant(userId, async (tx) => {
    const rows = await tx.citation.findMany({
      where: { messageId },
      orderBy: { ordinal: "asc" },
      select: {
        id: true,
        ordinal: true,
        title: true,
        category: true,
        source: true,
        url: true,
        documentId: true,
        chunkId: true,
        similarityScore: true,
      },
    });
    return rows;
  });
}

/** Count citations on a message (analytics/auditing). */
export async function countCitationsForMessage(userId: string, messageId: string): Promise<number> {
  return withTenant(userId, async (tx) => tx.citation.count({ where: { messageId } }));
}
